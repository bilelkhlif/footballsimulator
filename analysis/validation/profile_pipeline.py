"""Profil d'une analyse complète : temps passé dans chaque étape, sans modifier la chaîne.

Les fonctions principales sont enveloppées pendant l'exécution par des chronomètres (patch) :
décodage, modèle des personnes, modèle du ballon, calibration (modèle et homographie), suivi,
coupures, écritures SQLite, référence des équipes, plongements SigLIP, contrôle d'identité.
Les appels CUDA d'Ultralytics se synchronisent quand les boîtes reviennent sur le processeur :
le temps d'un appel de modèle inclut donc son calcul GPU. Un seul passage, GPU partagé avec le
bureau : ordre de grandeur, pas une mesure de laboratoire.
Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

from football_analysis import identity, incremental_pipeline
from football_analysis.calibration import PitchCalibrator
from football_analysis.chunk_storage import ChunkStore
from football_analysis.detection import FootballDetector
from football_analysis.incremental_pipeline import BoundedPeopleTracker, analyse_to_store
from football_analysis.pipeline import AnalysisOptions
from football_analysis.streaming_teams import FrozenTeamModel
from football_analysis.tracking import CutDetector

import cv2

#: Vrai décodeur, gardé avant le remplacement (le module cv2 est partagé par toute la chaîne).
ORIGINAL_CAPTURE = cv2.VideoCapture

TIMES: dict[str, float] = defaultdict(float)
CALLS: dict[str, int] = defaultdict(int)


def timed(name: str, function):
    """Enveloppe une fonction : cumule sa durée et son nombre d'appels sous un nom.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Validation des performances — chronomètres
    """
    def wrapper(*args, **kwargs):
        started = time.perf_counter()
        try:
            return function(*args, **kwargs)
        finally:
            TIMES[name] += time.perf_counter() - started
            CALLS[name] += 1
    return wrapper


class TimedCapture:
    """Décodeur OpenCV dont la lecture et le décodage des images sont chronométrés.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Validation des performances — décodage vidéo
    """

    def __init__(self, *args):
        """Ouvre le vrai décodeur.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Validation des performances — décodage vidéo
        """
        self._capture = ORIGINAL_CAPTURE(*args)

    def grab(self):
        """Avance d'une image (démultiplexage et décodage partiel).

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Validation des performances — décodage vidéo
        """
        return timed("décodage (grab)", self._capture.grab)()

    def retrieve(self):
        """Termine le décodage de l'image courante.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Validation des performances — décodage vidéo
        """
        return timed("décodage (retrieve)", self._capture.retrieve)()

    def __getattr__(self, name):
        """Délègue le reste au vrai décodeur.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Validation des performances — décodage vidéo
        """
        return getattr(self._capture, name)


def main() -> int:
    """Analyse une vidéo dans une base neuve et écrit le profil.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Validation des performances — commande de profil
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("output", type=Path, help="base neuve (.sqlite) ; une base terminée ne serait pas recalculée")
    parser.add_argument("--profile", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit("Choisir une base neuve : une base existante serait réutilisée sans inférence.")
    predict = FootballDetector._predict

    def predict_by_model(detector, model, frame, confidence):
        """Sépare le modèle des personnes du modèle du ballon."""
        name = "modèle des personnes (YOLO)" if model is detector.people_model else "modèle du ballon (YOLO)"
        return timed(name, predict)(detector, model, frame, confidence)

    with ExitStack() as stack:
        stack.enter_context(patch.object(incremental_pipeline.cv2, "VideoCapture", TimedCapture))
        stack.enter_context(patch.object(FootballDetector, "_predict", predict_by_model))
        stack.enter_context(patch.object(PitchCalibrator, "calibrate", timed("calibration (modèle + homographie)", PitchCalibrator.calibrate)))
        stack.enter_context(patch.object(BoundedPeopleTracker, "update", timed("suivi ByteTrack", BoundedPeopleTracker.update)))
        stack.enter_context(patch.object(CutDetector, "is_cut", timed("coupures (PySceneDetect)", CutDetector.is_cut)))
        stack.enter_context(patch.object(ChunkStore, "commit_raw", timed("SQLite : segments bruts", ChunkStore.commit_raw)))
        stack.enter_context(patch.object(ChunkStore, "publish", timed("SQLite : publications", ChunkStore.publish)))
        stack.enter_context(patch.object(incremental_pipeline, "fit_team_reference",
                                         timed("équipes : référence (lecture, SigLIP, UMAP, KMeans)", incremental_pipeline.fit_team_reference)))
        stack.enter_context(patch.object(incremental_pipeline, "check_identities",
                                         timed("identités : contrôle complet", incremental_pipeline.check_identities)))
        stack.enter_context(patch.object(identity, "find_contacts", timed("identités : contacts", identity.find_contacts)))
        stack.enter_context(patch.object(FrozenTeamModel, "predict", timed("équipes : prédictions (SigLIP + voisins)", FrozenTeamModel.predict)))
        stack.enter_context(patch.object(incremental_pipeline, "quality_metrics_stream",
                                         timed("mesures de qualité", incremental_pipeline.quality_metrics_stream)))
        started = time.perf_counter()
        manifest = analyse_to_store(args.video, args.output, AnalysisOptions(chunk_seconds=10))
        total = time.perf_counter() - started
    processing = manifest["metrics"]["processing"]
    profile = {"video": args.video.name, "wallSeconds": round(total, 2), "pipelineSeconds": processing["seconds"],
               "identitySeconds": processing.get("identitySeconds"), "analysedFrames": processing["analysedFrames"],
               "videoSeconds": processing["videoSeconds"],
               "parts": {name: {"seconds": round(seconds, 2), "calls": CALLS[name],
                                "msPerCall": round(1000 * seconds / max(CALLS[name], 1), 2)}
                         for name, seconds in sorted(TIMES.items(), key=lambda item: -item[1])}}
    args.profile.write_bytes((json.dumps(profile, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps(profile, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
