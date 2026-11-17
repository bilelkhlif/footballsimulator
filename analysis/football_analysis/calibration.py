"""Calibration de la caméra : de l'image au repère du terrain, image par image.

Composants réutilisés :

- les 32 points clés du terrain, détectés par le modèle YOLOv8 pose de Roboflow Sports
  (football-pitch-detection.pt, AGPL-3.0), dans l'ordre de SoccerPitchConfiguration (MIT) ;
- cv2.findHomography avec RANSAC (OpenCV, Apache-2.0).

Adaptations par rapport à sports.common.view.ViewTransformer, qui fait des moindres carrés sur
tous les points et lève une exception sous 4 points :

- seuls les points sûrs (confiance ≥ 0,5) et dans l'image comptent ;
- RANSAC écarte les points aberrants ; il faut au moins 5 points cohérents, pour qu'un point de
  plus que le minimum permette de mesurer l'erreur ;
- l'erreur de reprojection est mesurée, en pixels et en mètres ; les points alignés (une seule
  ligne du terrain) et les homographies en miroir sont refusés ;
- un échec renvoie sa cause au lieu d'une position inventée ;
- le gabarit a les dimensions réglementaires (105 × 68 m, surface de réparation de
  40,32 × 16,5 m) au lieu des 120 × 70 m de la configuration par défaut.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np
from sports.configs.soccer import SoccerPitchConfiguration

from .contract import PITCH

#: Gabarit aux dimensions réglementaires, en centimètres comme SoccerPitchConfiguration.
REGULATION_PITCH = SoccerPitchConfiguration(
    width=6800, length=10500, penalty_box_width=4032, penalty_box_length=1650,
    goal_box_width=1832, goal_box_length=550, centre_circle_radius=915, penalty_spot_distance=1100,
)

#: Marge autour des lignes, en mètres, au-delà de laquelle une position est jugée hors du terrain.
OUTSIDE_MARGIN_M = 5.0


def template_points_m(config: SoccerPitchConfiguration = REGULATION_PITCH) -> np.ndarray:
    """Renvoie les 32 points du gabarit, en mètres, l'origine au point central.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — calibration (gabarit du terrain)
    """
    points = np.array(config.vertices, dtype=np.float64) / 100.0
    points[:, 0] -= config.length / 200.0
    points[:, 1] -= config.width / 200.0
    return points


TEMPLATE_M = template_points_m()


@dataclass
class CalibrationSettings:
    """Seuils de la calibration ; les distances en pixels sont relatives au plus grand côté.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — calibration (réglages)
    """

    min_keypoint_confidence: float = 0.5
    min_points: int = 5
    ransac_threshold: float = 0.006
    max_error: float = 0.005
    min_spread_m: float = 3.0


@dataclass
class CalibrationResult:
    """Résultat de la calibration d'une image.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — calibration (résultat)
    """

    status: str
    reason: str | None = None
    keypoints: int = 0
    inliers: int = 0
    error_px: float | None = None
    error_m: float | None = None
    image_to_pitch: np.ndarray | None = None

    @property
    def ok(self) -> bool:
        """Vrai si l'homographie est utilisable.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — calibration (résultat)
        """
        return self.status == "ok"

    def to_dict(self) -> dict[str, Any]:
        """Convertit le résultat en objet JSON du format de suivi.

        L'homographie (image vers terrain, 9 nombres par ligne) permet au visualiseur de situer le
        terrain dans l'image.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — calibration (résultat)
        """
        record: dict[str, Any] = {"status": self.status, "keypoints": self.keypoints}
        if self.ok:
            record.update({
                "inliers": self.inliers,
                "errorPx": round(float(self.error_px), 2),
                "errorM": round(float(self.error_m), 3),
                "homography": [float(f"{v:.6g}") for v in self.image_to_pitch.ravel()],
            })
        else:
            record["reason"] = self.reason
        return record

    def project(self, points: np.ndarray) -> np.ndarray:
        """Projette des points de l'image (pixels) sur le terrain (mètres).

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — calibration (projection)
        """
        if len(points) == 0:
            return np.zeros((0, 2))
        projected = cv2.perspectiveTransform(points.reshape(-1, 1, 2).astype(np.float64), self.image_to_pitch)
        return projected.reshape(-1, 2)


def failed(reason: str, keypoints: int = 0) -> CalibrationResult:
    """Construit un échec de calibration avec sa cause.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — calibration (résultat)
    """
    return CalibrationResult(status="failed", reason=reason, keypoints=keypoints)


def _rms(differences: np.ndarray) -> float:
    """Moyenne quadratique des longueurs d'une liste de vecteurs.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — calibration (mesure de l'erreur)
    """
    return float(np.sqrt(np.mean(np.sum(differences ** 2, axis=1))))


def _orientation(pitch_to_image: np.ndarray, point: np.ndarray) -> float:
    """Signe du jacobien de l'homographie en un point du terrain : négatif pour une image en miroir.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — calibration (contrôles)
    """
    h = pitch_to_image
    x, y = point
    w = h[2, 0] * x + h[2, 1] * y + h[2, 2]
    u = (h[0, 0] * x + h[0, 1] * y + h[0, 2]) / w
    v = (h[1, 0] * x + h[1, 1] * y + h[1, 2]) / w
    jacobian = np.array([
        [(h[0, 0] - u * h[2, 0]) / w, (h[0, 1] - u * h[2, 1]) / w],
        [(h[1, 0] - v * h[2, 0]) / w, (h[1, 1] - v * h[2, 1]) / w],
    ])
    return float(np.linalg.det(jacobian))


def estimate_homography(image_points: np.ndarray, pitch_points: np.ndarray, image_size: tuple[int, int],
                        settings: CalibrationSettings | None = None) -> CalibrationResult:
    """Estime l'homographie de l'image vers le terrain à partir de points appariés.

    L'homographie est estimée du terrain vers l'image, pour que RANSAC et l'erreur portent sur les
    pixels, où se trouve le bruit du détecteur de points ; elle est ensuite inversée.

    Args:
        image_points: points détectés dans l'image, (n, 2), en pixels.
        pitch_points: mêmes points sur le gabarit, (n, 2), en mètres.
        image_size: (largeur, hauteur) de l'image, pour les seuils relatifs.
        settings: seuils ; valeurs par défaut sinon.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — calibration (homographie robuste)
    """
    settings = settings or CalibrationSettings()
    count = len(image_points)
    if count < settings.min_points:
        return failed("too-few-keypoints", count)
    scale = float(max(image_size))
    pitch_to_image, mask = cv2.findHomography(
        pitch_points.astype(np.float64), image_points.astype(np.float64),
        cv2.RANSAC, settings.ransac_threshold * scale,
    )
    if pitch_to_image is None or mask is None:
        return failed("homography-failed", count)
    inliers = mask.ravel().astype(bool)
    if inliers.sum() < settings.min_points:
        return failed("too-few-inliers", count)

    pitch_inliers = pitch_points[inliers]
    image_inliers = image_points[inliers]
    centred = pitch_inliers - pitch_inliers.mean(axis=0)
    spread = np.linalg.svd(centred, compute_uv=False)[-1] / np.sqrt(len(centred))
    if spread < settings.min_spread_m:
        return failed("aligned-keypoints", count)
    if _orientation(pitch_to_image, pitch_inliers.mean(axis=0)) <= 0:
        return failed("mirrored", count)

    reprojected = cv2.perspectiveTransform(pitch_inliers.reshape(-1, 1, 2), pitch_to_image).reshape(-1, 2)
    error_px = _rms(reprojected - image_inliers)
    if error_px > settings.max_error * scale:
        return failed("reprojection-error", count)

    image_to_pitch = np.linalg.inv(pitch_to_image)
    image_to_pitch /= image_to_pitch[2, 2]
    projected = cv2.perspectiveTransform(image_inliers.reshape(-1, 1, 2), image_to_pitch).reshape(-1, 2)
    return CalibrationResult(
        status="ok", keypoints=count, inliers=int(inliers.sum()),
        error_px=error_px, error_m=_rms(projected - pitch_inliers), image_to_pitch=image_to_pitch,
    )


def pitch_status(position: np.ndarray, margin_m: float = OUTSIDE_MARGIN_M) -> str:
    """Indique si une position projetée est sur le terrain, marge comprise.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — calibration (contrôles)
    """
    half_length = PITCH["length"] / 2 + margin_m
    half_width = PITCH["width"] / 2 + margin_m
    inside = abs(position[0]) <= half_length and abs(position[1]) <= half_width
    return "ok" if inside else "outside-pitch"


def foot_points(boxes: np.ndarray) -> np.ndarray:
    """Point de contact avec le sol de chaque boîte : le milieu de son bord inférieur.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — calibration (projection)
    """
    if len(boxes) == 0:
        return np.zeros((0, 2))
    return np.stack([(boxes[:, 0] + boxes[:, 2]) / 2, boxes[:, 3]], axis=1)


class PitchCalibrator:
    """Détecte les points clés du terrain dans une image et en déduit l'homographie.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — calibration (modèle de points clés)
    """

    def __init__(self, model: Any, settings: CalibrationSettings | None = None, predict_options: dict | None = None):
        """Prépare le calibreur.

        Args:
            model: modèle Ultralytics YOLO pose chargé avec football-pitch-detection.pt.
            settings: seuils de la calibration.
            predict_options: options d'inférence (device, half…).

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — calibration (modèle de points clés)
        """
        self.model = model
        self.settings = settings or CalibrationSettings()
        self.predict_options = predict_options or {}

    def calibrate(self, frame: np.ndarray) -> CalibrationResult:
        """Calibre une image BGR.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — calibration (modèle de points clés)
        """
        import supervision as sv

        result = self.model(frame, verbose=False, **self.predict_options)[0]
        keypoints = sv.KeyPoints.from_ultralytics(result)
        if len(keypoints) == 0 or keypoints.confidence is None:
            return failed("no-pitch-detected")
        height, width = frame.shape[:2]
        xy = keypoints.xy[0].astype(np.float64)
        confidence = keypoints.confidence[0]
        usable = ((confidence >= self.settings.min_keypoint_confidence)
                  & (xy[:, 0] > 1) & (xy[:, 1] > 1) & (xy[:, 0] < width - 1) & (xy[:, 1] < height - 1))
        return estimate_homography(xy[usable], TEMPLATE_M[usable], (width, height), self.settings)
