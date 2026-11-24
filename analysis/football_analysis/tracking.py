"""Suivi des personnes d'une image à l'autre, et découpage de la vidéo en plans.

Composants réutilisés :

- ByteTrack, dans sa réécriture maintenue par Roboflow (bibliothèque trackers, Apache-2.0) :
  meilleur HOTA de ses réécritures sur SoccerNet (84,0) ;
- ContentDetector de PySceneDetect (BSD-3-Clause), image par image, pour repérer les coupures.

Adaptations :

- à chaque coupure de plan, le suiveur repart de zéro : sinon, il associerait des joueurs
  différents qui se trouvent au même endroit de l'image avant et après la coupure ;
- les identifiants sont renumérotés pour rester uniques dans toute la vidéo ;
- les trajectoires non confirmées (identifiant négatif) sont écartées : elles ne sont pas encore
  sûres.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

from typing import Any, Callable

import numpy as np
import supervision as sv


def default_tracker_factory(frame_rate: float) -> Any:
    """Crée un suiveur ByteTrack (trackers) réglé sur la cadence d'analyse.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — suivi (composant réutilisé)
    """
    from trackers import ByteTrackTracker

    return ByteTrackTracker(frame_rate=frame_rate)


class PeopleTracker:
    """Suit les personnes détectées et leur donne un identifiant unique dans la vidéo.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — suivi
    """

    def __init__(self, frame_rate: float, factory: Callable[[float], Any] = default_tracker_factory):
        """Prépare le suivi.

        Args:
            frame_rate: cadence des images analysées, en images par seconde.
            factory: fabrique du suiveur, remplaçable dans les tests.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — suivi
        """
        self._factory = factory
        self._frame_rate = frame_rate
        self._tracker = factory(frame_rate)
        self._ids: dict[tuple[int, int], int] = {}
        self.shot = 0

    def new_shot(self) -> None:
        """Commence un nouveau plan : les trajectoires en cours s'arrêtent.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — suivi
        """
        self.shot += 1
        self._tracker = self._factory(self._frame_rate)

    def update(self, detections: sv.Detections) -> sv.Detections:
        """Associe les détections d'une image aux trajectoires ; garde les trajectoires confirmées.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — suivi
        """
        tracked = self._tracker.update(detections)
        if len(tracked) == 0 or tracked.tracker_id is None:
            return tracked[np.zeros(len(tracked), dtype=bool)] if len(tracked) else tracked
        tracked = tracked[tracked.tracker_id >= 0]
        global_ids = []
        for local_id in tracked.tracker_id:
            key = (self.shot, int(local_id))
            if key not in self._ids:
                self._ids[key] = len(self._ids) + 1
            global_ids.append(self._ids[key])
        tracked.tracker_id = np.array(global_ids, dtype=int)
        return tracked


class CutDetector:
    """Repère les coupures de plan parmi les images analysées.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — découpage en plans (composant réutilisé)
    """

    def __init__(self, frame_rate: float, threshold: float = 27.0, min_scene_frames: int = 5,
                 downscale: bool = True):
        """Prépare le détecteur.

        Args:
            frame_rate: cadence des images analysées, en images par seconde.
            threshold: seuil de ContentDetector (27, sa valeur par défaut).
            min_scene_frames: durée minimale d'un plan, en images analysées.
            downscale: réduit chaque image comme le SceneManager de PySceneDetect le fait par
                défaut (largeur visée 256 px, interpolation linéaire) avant ContentDetector. Le
                24 novembre 2026, sur les huit clips de validation, les coupures trouvées sont
                identiques à celles de l'image entière, pour une fraction du temps de calcul.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — découpage en plans (composant réutilisé)
        """
        from scenedetect.detectors import ContentDetector

        self._detector = ContentDetector(threshold=threshold, min_scene_len=min_scene_frames)
        self._frame_rate = frame_rate
        self._count = 0
        self._downscale = downscale

    def is_cut(self, frame: np.ndarray) -> bool:
        """Indique si l'image commence un nouveau plan ; la première image n'en commence pas.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — découpage en plans (composant réutilisé)
        """
        from scenedetect.common import FrameTimecode

        if self._downscale:
            import cv2
            from scenedetect.scene_manager import compute_downscale_factor

            factor = compute_downscale_factor(frame.shape[1])
            if factor > 1.0:
                frame = cv2.resize(frame, (max(1, round(frame.shape[1] / factor)), max(1, round(frame.shape[0] / factor))),
                                   interpolation=cv2.INTER_LINEAR)
        cuts = self._detector.process_frame(FrameTimecode(self._count, self._frame_rate), frame)
        self._count += 1
        return self._count > 1 and bool(cuts)
