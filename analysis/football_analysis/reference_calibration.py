"""Calibration de référence : repères annotés sur des images clés, suivis par le mouvement de la caméra.

Le modèle de points clés (Roboflow Sports) a appris sur des vues de télévision. Sur une vue de
tribune basse ou en coin, il confond des lignes de même forme : ligne de but prise pour la ligne
médiane, arc de la surface pris pour le rond central. Ces confusions restent cohérentes entre elles,
si bien que l'erreur hors échantillon reste faible (1,25 m sur France–Allemagne) alors que tout le
terrain est décalé de plusieurs dizaines de mètres. Le défaut a été trouvé en superposant à l'image
les lignes du terrain projetées (docs/stabilisation-homographie.md) ; aucune mesure interne ne le
révélait.

Pour ces clips, une personne annote sur une image clé des points dont la position réglementaire est
connue : intersections de lignes, point de penalty, pieds des poteaux. L'homographie est ajustée sur
ces points avec les contrôles de la calibration automatique (5 points au moins, pas d'alignement,
pas de miroir, erreur hors échantillon publiée), puis suivie d'image en image par le mouvement de
la caméra, mesuré sur le décor par flux optique. Une image clé suivante recale le suivi et mesure sa
dérive. Une coupure de plan sans image clé arrête le suivi : aucune position plutôt qu'une fausse.

La calibration automatique reste calculée à chaque image ; son écart à la référence est enregistré :
c'est la seule mesure de sa justesse dont dispose le projet.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .calibration import CalibrationResult, _image_motion, _normalized, estimate_homography, failed

REFERENCE_FORMAT = "football-reference-calibration"
REFERENCE_VERSION = 1

#: Marge, en mètres, autour du terrain réglementaire pour un repère annoté (poteaux, drapeaux de coin).
REFERENCE_MARGIN_M = 2.0


class ReferenceError(ValueError):
    """Fichier de calibration de référence invalide ou inutilisable.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — calibration de référence
    """


def file_sha256(path: Path) -> str:
    """Empreinte SHA-256 d'un fichier, lue par blocs.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — calibration de référence
    """
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _point(value: Any, where: str) -> np.ndarray:
    """Lit un couple de nombres finis.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — calibration de référence
    """
    if (not isinstance(value, list) or len(value) != 2
            or not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in value)):
        raise ReferenceError(f"{where} : deux nombres finis attendus.")
    return np.array(value, dtype=np.float64)


def load_reference(path: Path, image_size: tuple[int, int], *, video_sha256: str | None = None,
                   stride: int = 1) -> dict[int, CalibrationResult]:
    """Lit et ajuste les images clés d'un fichier de référence ; renvoie leur calibration par indice.

    Args:
        path: fichier JSON (format football-reference-calibration, version 1).
        image_size: (largeur, hauteur) de la vidéo analysée.
        video_sha256: empreinte de la vidéo analysée ; le fichier doit porter la même.
        stride: pas d'analyse ; une image clé doit être une image analysée.

    Raises:
        ReferenceError: fichier illisible, vidéo différente, point hors limites ou ajustement refusé.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — calibration de référence
    """
    try:
        document = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ReferenceError(f"Référence illisible : {error}") from error
    if not isinstance(document, dict) or document.get("format") != REFERENCE_FORMAT or document.get("version") != REFERENCE_VERSION:
        raise ReferenceError(f"Format attendu : {REFERENCE_FORMAT} version {REFERENCE_VERSION}.")
    if video_sha256 is not None and document.get("videoSha256") != video_sha256:
        raise ReferenceError("La référence a été annotée sur une autre vidéo (empreinte SHA-256 différente).")
    keyframes = document.get("keyframes")
    if not isinstance(keyframes, list) or not keyframes:
        raise ReferenceError("Au moins une image clé est requise.")
    width, height = image_size
    half_length, half_width = 52.5 + REFERENCE_MARGIN_M, 34.0 + REFERENCE_MARGIN_M
    fitted: dict[int, CalibrationResult] = {}
    for k, keyframe in enumerate(keyframes):
        where = f"keyframes[{k}]"
        index = keyframe.get("index") if isinstance(keyframe, dict) else None
        if not isinstance(index, int) or isinstance(index, bool) or index < 0 or index % max(1, stride):
            raise ReferenceError(f"{where}.index : image analysée attendue (multiple de {stride}).")
        if index in fitted:
            raise ReferenceError(f"{where}.index : image clé en double ({index}).")
        points = keyframe.get("points")
        if not isinstance(points, list):
            raise ReferenceError(f"{where}.points : liste attendue.")
        image_points, pitch_points = [], []
        for j, point in enumerate(points):
            here = f"{where}.points[{j}]"
            if not isinstance(point, dict) or not isinstance(point.get("label"), str) or not point["label"].strip():
                raise ReferenceError(f"{here} : libellé requis.")
            image = _point(point.get("image"), f"{here}.image")
            pitch = _point(point.get("pitch"), f"{here}.pitch")
            if not (0 <= image[0] <= width and 0 <= image[1] <= height):
                raise ReferenceError(f"{here}.image : hors de l'image {width}×{height}.")
            if abs(pitch[0]) > half_length or abs(pitch[1]) > half_width:
                raise ReferenceError(f"{here}.pitch : hors du terrain réglementaire.")
            image_points.append(image)
            pitch_points.append(pitch)
        result = estimate_homography(np.array(image_points).reshape(-1, 2), np.array(pitch_points).reshape(-1, 2),
                                     (width, height))
        if not result.ok:
            raise ReferenceError(f"{where} : ajustement refusé ({result.reason}).")
        if result.inliers != len(points):
            raise ReferenceError(f"{where} : {len(points) - result.inliers} repère(s) incohérent(s) avec les autres.")
        fitted[index] = result
    return fitted


def _visible_gap(reference: np.ndarray, other: np.ndarray, anchors: np.ndarray) -> float:
    """Écart médian, en mètres, entre deux homographies, sur les ancres que la référence place sur le terrain.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — calibration de référence
    """
    first = cv2.perspectiveTransform(anchors.reshape(-1, 1, 2), reference).reshape(-1, 2)
    second = cv2.perspectiveTransform(anchors.reshape(-1, 1, 2), other).reshape(-1, 2)
    on_pitch = (np.abs(first[:, 0]) <= 57.5) & (np.abs(first[:, 1]) <= 39.0)
    if on_pitch.sum() >= 3:
        first, second = first[on_pitch], second[on_pitch]
    return float(np.median(np.linalg.norm(first - second, axis=1)))


class ReferenceCalibrator:
    """Suit la calibration de référence d'image en image ; compare la calibration automatique.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — calibration de référence
    """

    def __init__(self, keyframes: dict[int, CalibrationResult], image_size: tuple[int, int]):
        """Prépare le suivi pour des images de la taille donnée (largeur, hauteur).

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Analyse vidéo — calibration de référence
        """
        width, height = image_size
        xs, ys = np.meshgrid(np.linspace(0.05 * width, 0.95 * width, 7), np.linspace(0.3 * height, 0.95 * height, 5))
        self.anchors = np.stack([xs.ravel(), ys.ravel()], axis=1).astype(np.float64)
        self.keyframes = keyframes
        self.scale = min(1.0, 640.0 / max(width, height))
        self.previous_gray: np.ndarray | None = None
        self.current: np.ndarray | None = None
        self.reference: CalibrationResult | None = None

    def update(self, image: np.ndarray, index: int, automatic: CalibrationResult | None,
               new_shot: bool) -> CalibrationResult:
        """Calibration de référence de cette image, avec l'écart de la calibration automatique.

        Args:
            image: image analysée (BGR).
            index: indice de l'image dans la vidéo source.
            automatic: calibration par points clés de la même image, ou None lors d'une reprise.
            new_shot: vrai à une coupure de plan.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Analyse vidéo — calibration de référence
        """
        small = cv2.resize(image, None, fx=self.scale, fy=self.scale, interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY) if small.ndim == 3 else small
        if new_shot:
            # Le mouvement d'un plan à l'autre n'a pas de sens : seule une image clé relance le suivi.
            self.previous_gray, self.current, self.reference = None, None, None
        motion = None if self.previous_gray is None else _image_motion(self.previous_gray, gray, self.scale)
        self.previous_gray = gray
        tracked_without_motion = False
        if self.current is not None:
            if motion is None:
                tracked_without_motion = True
            else:
                self.current = _normalized(self.current @ np.linalg.inv(motion))
        drift = None
        keyframe = self.keyframes.get(index)
        if keyframe is not None:
            if self.current is not None:
                drift = _visible_gap(keyframe.image_to_pitch, self.current, self.anchors)
            self.current, self.reference = keyframe.image_to_pitch.copy(), keyframe
            tracked_without_motion = False
        comparison = None
        if automatic is not None:
            comparison = {"status": automatic.status, "keypoints": automatic.keypoints}
            if automatic.ok and getattr(automatic, "image_to_pitch", None) is not None:
                comparison["inliers"] = automatic.inliers
                comparison["holdoutErrorM"] = None if automatic.holdout_error_m is None else round(float(automatic.holdout_error_m), 3)
                if self.current is not None:
                    comparison["gapM"] = round(_visible_gap(self.current, automatic.image_to_pitch, self.anchors), 2)
            elif automatic.reason:
                comparison["reason"] = automatic.reason
        if self.current is None:
            result = failed("no-reference", 0)
            result.source, result.automatic = "reference", comparison
            return result
        reference = self.reference
        return CalibrationResult(status="ok", keypoints=reference.keypoints, inliers=reference.inliers,
                                 fit_error_px=reference.fit_error_px, fit_error_m=reference.fit_error_m,
                                 holdout_error_px=reference.holdout_error_px, holdout_error_m=reference.holdout_error_m,
                                 image_to_pitch=self.current.copy(), source="reference", automatic=comparison,
                                 reference_drift_m=drift, motion_lost=tracked_without_motion)
