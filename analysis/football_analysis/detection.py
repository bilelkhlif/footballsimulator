"""Détection des joueurs, gardiens, arbitres et du ballon.

Composants réutilisés :

- les poids football-player-detection.pt et football-ball-detection.pt de Roboflow Sports,
  entraînés avec Ultralytics YOLOv8 (AGPL-3.0), exécutés par la bibliothèque ultralytics ;
- supervision (MIT) pour convertir les résultats et filtrer les doublons.

Réglages repris de Roboflow : images en 1280 px (résolution de validation des deux modèles), et
suppression des doublons toutes classes confondues (une même personne vue à la fois comme joueur
et comme arbitre ne doit donner qu'une trajectoire). Le ballon vient du modèle dédié, appliqué à
l'image entière, s'il est fourni : sa validation donne mAP50 0,932, contre 0,599 pour la classe
ballon du modèle des joueurs.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import supervision as sv

#: Rôles des personnes, d'après les noms de classes des poids de Roboflow.
PEOPLE_CLASSES = ("goalkeeper", "player", "referee")


@dataclass
class BallDetection:
    """Le ballon le plus sûr d'une image.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — détection (résultat)
    """

    confidence: float
    box: np.ndarray


@dataclass
class DetectionSettings:
    """Seuils et résolution de la détection.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — détection (réglages)
    """

    image_size: int = 1280
    people_confidence: float = 0.3
    ball_confidence: float = 0.3
    duplicate_iou: float = 0.5


def class_ids(model: Any, names: tuple[str, ...]) -> dict[int, str]:
    """Identifiants des classes voulues, lus dans les noms du modèle plutôt que supposés.

    Raises:
        ValueError: si une classe manque au modèle.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — détection (classes du modèle)
    """
    model_names = {str(name): int(index) for index, name in model.names.items()}
    missing = [name for name in names if name not in model_names]
    if missing:
        raise ValueError(f"classes absentes du modèle : {missing}")
    return {model_names[name]: name for name in names}


def best_ball(detections: sv.Detections) -> BallDetection | None:
    """Garde la détection de ballon la plus sûre, s'il y en a une.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — détection (ballon)
    """
    if len(detections) == 0:
        return None
    best = int(np.argmax(detections.confidence))
    return BallDetection(float(detections.confidence[best]), detections.xyxy[best].astype(float))


class FootballDetector:
    """Détecte les personnes et le ballon dans une image BGR.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — détection
    """

    def __init__(self, people_model: Any, ball_model: Any | None = None,
                 settings: DetectionSettings | None = None, predict_options: dict | None = None):
        """Prépare le détecteur.

        Args:
            people_model: modèle YOLO chargé avec football-player-detection.pt.
            ball_model: modèle YOLO chargé avec football-ball-detection.pt, ou None pour se
                contenter de la classe ballon du premier modèle.
            settings: seuils et résolution.
            predict_options: options d'inférence (device, half…).

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — détection
        """
        self.people_model = people_model
        self.ball_model = ball_model
        self.settings = settings or DetectionSettings()
        self.predict_options = predict_options or {}
        self.people_classes = class_ids(people_model, PEOPLE_CLASSES)
        self.ball_class = next(iter(class_ids(people_model, ("ball",))))
        self.ball_model_class = None if ball_model is None else next(iter(class_ids(ball_model, ("ball",))))

    def _predict(self, model: Any, frame: np.ndarray, confidence: float) -> sv.Detections:
        """Applique un modèle YOLO à l'image entière.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — détection
        """
        result = model(frame, imgsz=self.settings.image_size, conf=confidence, verbose=False, **self.predict_options)[0]
        return sv.Detections.from_ultralytics(result)

    def detect(self, frame: np.ndarray) -> tuple[sv.Detections, BallDetection | None]:
        """Renvoie les personnes (avec leur rôle dans data['role']) et le ballon le plus sûr.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — détection
        """
        settings = self.settings
        detections = self._predict(self.people_model, frame, min(settings.people_confidence, settings.ball_confidence))
        people = detections[np.isin(detections.class_id, list(self.people_classes))]
        people = people[people.confidence >= settings.people_confidence]
        people = people.with_nms(threshold=settings.duplicate_iou, class_agnostic=True)
        people.data["role"] = np.array([self.people_classes[int(c)] for c in people.class_id], dtype=object)

        if self.ball_model is None:
            balls = detections[detections.class_id == self.ball_class]
        else:
            balls = self._predict(self.ball_model, frame, settings.ball_confidence)
            balls = balls[balls.class_id == self.ball_model_class]
        balls = balls[balls.confidence >= settings.ball_confidence]
        return people, best_ball(balls)
