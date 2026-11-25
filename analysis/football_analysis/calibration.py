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
- deux erreurs sont mesurées, en pixels et en mètres. L'erreur d'ajustement porte sur les points
  qui ont servi à l'estimation : elle est optimiste par construction. L'erreur hors échantillon
  prédit chaque point par une homographie estimée sans lui (validation croisée « un point de
  côté ») : c'est la meilleure estimation disponible sans vérité terrain, et elle reste une erreur
  sur les repères du terrain, pas sur la position des joueurs ;
- les points alignés (une seule ligne du terrain) et les homographies en miroir sont refusés ;
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
    fit_error_px: float | None = None
    fit_error_m: float | None = None
    holdout_error_px: float | None = None
    holdout_error_m: float | None = None
    image_to_pitch: np.ndarray | None = None
    #: Homographie mesurée sur les points clés de cette seule image, avant stabilisation temporelle ;
    #: image_to_pitch contient alors l'homographie stabilisée (HomographyStabilizer).
    measured_image_to_pitch: np.ndarray | None = None
    #: Vrai si la mesure de cette image a été écartée : l'homographie est alors la seule prédiction.
    measurement_rejected: bool = False
    #: « reference » pour une calibration annotée à la main et suivie (reference_calibration.py) ;
    #: None pour la calibration automatique par points clés.
    source: str | None = None
    #: Calibration automatique de la même image, comparée à la référence (statut, écart en mètres).
    automatic: dict[str, Any] | None = None
    #: Dérive du suivi mesurée en arrivant sur une image clé, en mètres.
    reference_drift_m: float | None = None
    #: Vrai si le mouvement de la caméra n'a pas pu être mesuré : la référence est reprise telle quelle.
    motion_lost: bool = False

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
                "fitErrorPx": round(float(self.fit_error_px), 2),
                "fitErrorM": round(float(self.fit_error_m), 3),
                "holdoutErrorPx": None if self.holdout_error_px is None else round(float(self.holdout_error_px), 2),
                "holdoutErrorM": None if self.holdout_error_m is None else round(float(self.holdout_error_m), 3),
                "homography": [float(f"{v:.6g}") for v in self.image_to_pitch.ravel()],
            })
            # La mesure brute reste enregistrée en pleine précision : une reprise reconstruit exactement le
            # même état de lissage (HomographyStabilizer), sans écart d'arrondi sur les positions.
            raw = self.image_to_pitch if self.measured_image_to_pitch is None else self.measured_image_to_pitch
            record["stabilized"] = self.measured_image_to_pitch is not None
            record["measuredHomography"] = [float(v) for v in raw.ravel()]
            if self.measurement_rejected:
                record["measurementRejected"] = True
            if self.reference_drift_m is not None:
                record["referenceDriftM"] = round(float(self.reference_drift_m), 2)
            if self.motion_lost:
                record["motionLost"] = True
        else:
            record["reason"] = self.reason
        if self.source is not None:
            record["source"] = self.source
        if self.automatic is not None:
            record["automatic"] = self.automatic
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


def holdout_errors(pitch_points: np.ndarray, image_points: np.ndarray) -> tuple[float | None, float | None]:
    """Erreur hors échantillon : chaque point est prédit par une homographie estimée sans lui.

    Pour chaque point retenu, l'homographie est recalculée sur les autres (moindres carrés), puis le
    point écarté est projeté dans l'image (écart en pixels) et ramené sur le terrain (écart en
    mètres). Renvoie la médiane de chaque écart. Avec cinq points, chaque estimation n'en a que
    quatre : l'erreur est alors grande dès qu'un point est imprécis, ce qui est voulu.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — calibration (erreur hors échantillon)
    """
    errors_px, errors_m = [], []
    for index in range(len(pitch_points)):
        keep = np.arange(len(pitch_points)) != index
        pitch_to_image, _ = cv2.findHomography(pitch_points[keep], image_points[keep], 0)
        if pitch_to_image is None or abs(np.linalg.det(pitch_to_image)) < 1e-12:
            continue
        predicted = cv2.perspectiveTransform(pitch_points[index:index + 1].reshape(-1, 1, 2), pitch_to_image).reshape(2)
        back = cv2.perspectiveTransform(image_points[index:index + 1].reshape(-1, 1, 2), np.linalg.inv(pitch_to_image)).reshape(2)
        errors_px.append(float(np.linalg.norm(predicted - image_points[index])))
        errors_m.append(float(np.linalg.norm(back - pitch_points[index])))
    if not errors_px:
        return None, None
    return float(np.median(errors_px)), float(np.median(errors_m))


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
    # Le seuil d'acceptation porte sur la moyenne quadratique ; les erreurs publiées sont des médianes
    # par point, comme l'erreur hors échantillon, pour être comparables.
    if _rms(reprojected - image_inliers) > settings.max_error * scale:
        return failed("reprojection-error", count)

    image_to_pitch = np.linalg.inv(pitch_to_image)
    image_to_pitch /= image_to_pitch[2, 2]
    projected = cv2.perspectiveTransform(image_inliers.reshape(-1, 1, 2), image_to_pitch).reshape(-1, 2)
    holdout_px, holdout_m = holdout_errors(pitch_inliers.astype(np.float64), image_inliers.astype(np.float64))
    return CalibrationResult(
        status="ok", keypoints=count, inliers=int(inliers.sum()),
        fit_error_px=float(np.median(np.linalg.norm(reprojected - image_inliers, axis=1))),
        fit_error_m=float(np.median(np.linalg.norm(projected - pitch_inliers, axis=1))),
        holdout_error_px=holdout_px, holdout_error_m=holdout_m, image_to_pitch=image_to_pitch,
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


#: Poids de la mesure d'une image face à la prédiction par le mouvement de la caméra. 1 désactive la
#: stabilisation ; 0,2 a été retenu sur la vidéo de tribune France–Allemagne (docs/stabilisation-homographie.md).
STABILIZER_MEASUREMENT_WEIGHT = 0.2

#: Écart médian, en mètres, entre mesure et prédiction au-delà duquel la mesure est jugée aberrante.
STABILIZER_OUTLIER_M = 4.0

#: Mesures écartées successives, cohérentes entre elles, qui prouvent que la prédiction a décroché
#: (coupure non détectée, mouvement perdu) : le filtre repart alors de la dernière mesure. Des mesures
#: écartées mais dispersées (drapeau devant l'objectif, points clés confondus) ne suffisent pas.
STABILIZER_CONFIRMATIONS = 3


def _normalized(homography: np.ndarray) -> np.ndarray:
    """Homographie ramenée à h33 = 1.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — calibration (stabilisation temporelle)
    """
    return homography / homography[2, 2]


def _image_motion(previous: np.ndarray, current: np.ndarray, scale: float) -> np.ndarray | None:
    """Mouvement de la caméra entre deux images en niveaux de gris réduites : homographie image → image.

    Flux optique de Lucas-Kanade sur les coins du décor, puis homographie RANSAC : les joueurs, petits
    et mobiles, sont écartés comme points aberrants. Renvoie la transformation en pixels de l'image
    d'origine, ou None si le décor manque de texture (moins de 20 correspondances cohérentes).

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — calibration (mouvement de la caméra)
    """
    corners = cv2.goodFeaturesToTrack(previous, maxCorners=400, qualityLevel=0.01, minDistance=8, blockSize=7)
    if corners is None or len(corners) < 20:
        return None
    moved, found, _ = cv2.calcOpticalFlowPyrLK(previous, current, corners, None, winSize=(21, 21), maxLevel=3)
    kept = found.ravel() == 1
    if kept.sum() < 20:
        return None
    motion, inliers = cv2.findHomography(corners[kept], moved[kept], cv2.RANSAC, 2.0)
    if motion is None or inliers is None or int(inliers.sum()) < 20:
        return None
    to_small = np.diag([scale, scale, 1.0])
    full = np.linalg.inv(to_small) @ motion @ to_small
    return full / full[2, 2]


class HomographyStabilizer:
    """Stabilise dans le temps l'homographie image → terrain d'un même plan.

    Chaque homographie mesurée vient des points clés d'une seule image : leur bruit fait sauter tout le
    terrain d'une image à l'autre. Sur la vidéo de tribune France–Allemagne, ce mouvement commun à tous
    les joueurs atteignait 22 m/s en médiane, l'essentiel des vitesses jugées invraisemblables. Le
    mouvement réel de la caméra, lui, se mesure de façon lisse entre deux images, par le flux optique du
    décor. Le filtre prédit l'homographie par ce mouvement, puis la rapproche de la mesure avec un poids
    faible : filtre complémentaire, sans retard pendant un panoramique, car la prédiction suit la caméra.

    La fusion se fait sur douze points d'ancrage de la moitié basse de l'image, projetés sur le terrain,
    puis une homographie est réajustée sur ces points. Une mesure qui contredit fortement la prédiction
    est écartée (drapeau devant l'objectif, points clés confondus) ; si plusieurs mesures écartées de
    suite concordent entre elles, c'est la prédiction qui a décroché et le filtre repart de la mesure.
    Sans mouvement mesurable (décor masqué), la caméra est supposée immobile. Une coupure de plan remet
    le filtre à zéro. Aucune position n'est inventée : une image dont la calibration échoue reste sans
    position, même si le filtre continue de suivre la caméra.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — calibration (stabilisation temporelle)
    """

    def __init__(self, image_size: tuple[int, int], weight: float = STABILIZER_MEASUREMENT_WEIGHT,
                 outlier_m: float = STABILIZER_OUTLIER_M, confirmations: int = STABILIZER_CONFIRMATIONS):
        """Prépare le filtre pour des images de la taille donnée (largeur, hauteur).

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Analyse vidéo — calibration (stabilisation temporelle)
        """
        width, height = image_size
        xs, ys = np.meshgrid(np.linspace(0.1 * width, 0.9 * width, 4), np.linspace(0.45 * height, 0.95 * height, 3))
        self.anchors = np.stack([xs.ravel(), ys.ravel()], axis=1).astype(np.float64)
        self.scale = min(1.0, 640.0 / max(width, height))
        self.weight = weight
        self.outlier_m = outlier_m
        self.confirmations_needed = confirmations
        self.reset()

    def reset(self) -> None:
        """Oublie l'état : nouveau plan ou reprise sans historique.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Analyse vidéo — calibration (stabilisation temporelle)
        """
        self.previous_gray: np.ndarray | None = None
        self.smoothed: np.ndarray | None = None
        #: Dernière mesure écartée, suivie avec la caméra, et nombre de mesures écartées concordantes.
        self.candidate: np.ndarray | None = None
        self.confirmations = 0

    def _project(self, homography: np.ndarray) -> np.ndarray:
        """Projette les points d'ancrage sur le terrain.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Analyse vidéo — calibration (stabilisation temporelle)
        """
        return cv2.perspectiveTransform(self.anchors.reshape(-1, 1, 2), homography).reshape(-1, 2)

    def _gap(self, first: np.ndarray, second: np.ndarray) -> float:
        """Écart médian, en mètres, entre deux homographies sur les points d'ancrage.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Analyse vidéo — calibration (stabilisation temporelle)
        """
        return float(np.median(np.linalg.norm(self._project(first) - self._project(second), axis=1)))

    def _restart(self, measured: CalibrationResult) -> CalibrationResult:
        """Repart de la mesure, telle quelle : début de plan, ou prédiction démentie.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Analyse vidéo — calibration (stabilisation temporelle)
        """
        self.smoothed = measured.image_to_pitch.copy()
        self.candidate, self.confirmations = None, 0
        return measured

    def update(self, image: np.ndarray, measured: CalibrationResult, new_shot: bool) -> CalibrationResult:
        """Renvoie la calibration stabilisée de cette image ; la mesure brute y reste attachée.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Analyse vidéo — calibration (stabilisation temporelle)
        """
        small = cv2.resize(image, None, fx=self.scale, fy=self.scale, interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY) if small.ndim == 3 else small
        if new_shot:
            self.reset()
        motion = None if self.previous_gray is None else _image_motion(self.previous_gray, gray, self.scale)
        self.previous_gray = gray
        # Mouvement introuvable (décor masqué, flou) : caméra supposée immobile ; les mesures suivantes
        # confirment l'état ou, si elles concordent contre lui, le remplacent.
        step = np.eye(3) if motion is None else np.linalg.inv(motion)
        prediction = None if self.smoothed is None else _normalized(self.smoothed @ step)
        if self.candidate is not None:
            self.candidate = _normalized(self.candidate @ step)
        if not measured.ok or getattr(measured, "image_to_pitch", None) is None:
            # Échec, ou calibration sans matrice (double de test, enregistrement ancien) : rien à stabiliser.
            self.smoothed = prediction
            return measured
        if prediction is None:
            return self._restart(measured)
        anchors_measured = self._project(measured.image_to_pitch)
        anchors_predicted = self._project(prediction)
        gap = float(np.median(np.linalg.norm(anchors_measured - anchors_predicted, axis=1)))
        rejected = gap > self.outlier_m
        if rejected:
            agrees = self.candidate is not None and self._gap(measured.image_to_pitch, self.candidate) <= self.outlier_m
            self.confirmations = self.confirmations + 1 if agrees else 1
            self.candidate = measured.image_to_pitch.copy()
            if self.confirmations >= self.confirmations_needed:
                return self._restart(measured)
            fused = anchors_predicted
        else:
            self.candidate, self.confirmations = None, 0
            fused = (1.0 - self.weight) * anchors_predicted + self.weight * anchors_measured
        stabilized, _ = cv2.findHomography(self.anchors, fused, 0)
        if stabilized is None:
            return self._restart(measured)
        self.smoothed = _normalized(stabilized)
        return CalibrationResult(status=measured.status, reason=measured.reason, keypoints=measured.keypoints,
                                 inliers=measured.inliers, fit_error_px=measured.fit_error_px, fit_error_m=measured.fit_error_m,
                                 holdout_error_px=measured.holdout_error_px, holdout_error_m=measured.holdout_error_m,
                                 image_to_pitch=self.smoothed, measured_image_to_pitch=measured.image_to_pitch,
                                 measurement_rejected=rejected)


def calibration_from_record(record: dict) -> CalibrationResult:
    """Reconstruit la calibration mesurée d'une image enregistrée (reprise d'une analyse).

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — calibration (reprise de la stabilisation)
    """
    if record.get("status") != "ok":
        return failed(record.get("reason") or "unknown", record.get("keypoints", 0))
    raw = record.get("measuredHomography") or record.get("homography")
    return CalibrationResult(status="ok", keypoints=record.get("keypoints", 0), inliers=record.get("inliers", 0),
                             fit_error_px=record.get("fitErrorPx"), fit_error_m=record.get("fitErrorM"),
                             holdout_error_px=record.get("holdoutErrorPx"), holdout_error_m=record.get("holdoutErrorM"),
                             image_to_pitch=None if raw is None else np.array(raw, dtype=np.float64).reshape(3, 3))
