"""Chaîne d'analyse d'une vidéo : de l'image aux positions sur le terrain.

Lecture de la vidéo (OpenCV) → coupures de plan → détection → suivi → calibration → positions sur
le terrain → équipes → document de suivi horodaté, avec ses mesures de qualité et ses limites.

Les images sont analysées à cadence régulière (12,5 images/s par défaut) quelle que soit la cadence
de la vidéo : une image sur deux en 25 images/s, une sur quatre en 50 images/s… Chaque image
analysée garde son numéro et son instant dans la vidéo source, pour la synchronisation.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import time as clock
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np

from . import contract
from .calibration import CalibrationSettings, PitchCalibrator, foot_points, pitch_status
from .detection import DetectionSettings, FootballDetector
from .metrics import describe_limitations, quality_metrics
from .models import MODELS_DIR, missing_models, model_path, sha256
from .teams import (BACKBONES, MIN_CROPS_TO_FIT, CropCollector, TeamAssignment, assign_player_teams,
                    build_classifier, resolve_goalkeepers, team_colour)
from .tracking import CutDetector, PeopleTracker

#: Rappel de progression : étape, avancement entre 0 et 1 (ou None), message.
Progress = Callable[[str, float | None, str], None]


class VideoError(ValueError):
    """Vidéo illisible ou inexploitable, avec un message destiné à l'utilisateur.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — chaîne d'analyse (erreurs)
    """


@dataclass
class AnalysisOptions:
    """Réglages d'une analyse.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — chaîne d'analyse (réglages)
    """

    models_dir: Path = MODELS_DIR
    target_fps: float = 12.5
    device: str | None = None
    use_ball_model: bool = True
    team_backbone: str = "siglip"
    max_seconds: float | None = None
    seed: int = 0


def probe_video(path: Path) -> dict[str, Any]:
    """Lit les dimensions, la cadence et la durée annoncée d'une vidéo.

    Raises:
        VideoError: si OpenCV ne peut pas la lire ou si sa cadence est illisible.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — lecture de la vidéo
    """
    capture = cv2.VideoCapture(str(path))
    try:
        if not capture.isOpened():
            raise VideoError("Vidéo illisible : format ou codec non pris en charge.")
        fps = capture.get(cv2.CAP_PROP_FPS)
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    finally:
        capture.release()
    if not (0 < fps <= 240) or width <= 0 or height <= 0:
        raise VideoError("Cadence ou dimensions de la vidéo illisibles.")
    return {
        "width": width, "height": height, "fps": round(fps, 4),
        "frameCount": count if count > 0 else None,
        "duration": round(count / fps, 3) if count > 0 else None,
    }


def choose_device(requested: str | None) -> str:
    """Choisit le processeur de calcul : le GPU CUDA s'il existe, sinon le processeur central.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — chaîne d'analyse (matériel)
    """
    if requested:
        return requested
    import torch

    return "cuda:0" if torch.cuda.is_available() else "cpu"


class ResourceMeter:
    """Mesure la mémoire vive du processus et la mémoire du GPU au plus haut.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — mesures de traitement
    """

    def __init__(self, device: str):
        """Prépare la mesure ; remet à zéro le maximum de mémoire du GPU.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — mesures de traitement
        """
        import psutil

        self._process = psutil.Process()
        self._cuda = device.startswith("cuda")
        self.peak_rss = self._process.memory_info().rss
        if self._cuda:
            import torch

            torch.cuda.reset_peak_memory_stats()

    def sample(self) -> None:
        """Relève la mémoire vive actuelle.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — mesures de traitement
        """
        self.peak_rss = max(self.peak_rss, self._process.memory_info().rss)

    def summary(self) -> dict[str, Any]:
        """Maxima relevés, en mégaoctets.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — mesures de traitement
        """
        self.sample()
        result = {"peakRamMb": round(self.peak_rss / 2 ** 20)}
        if self._cuda:
            import torch

            result["peakGpuMb"] = round(torch.cuda.max_memory_allocated() / 2 ** 20)
        return result


def _load_models(options: AnalysisOptions, device: str) -> tuple[FootballDetector, PitchCalibrator, dict[str, Any]]:
    """Charge les modèles YOLO et décrit les poids utilisés.

    Raises:
        FileNotFoundError: si un fichier de poids manque.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — chaîne d'analyse (modèles)
    """
    from ultralytics import YOLO, settings

    if settings.get("sync", False):
        settings.update({"sync": False})  # pas de statistiques d'usage envoyées à Ultralytics
    needed = ("players", "pitch", "ball") if options.use_ball_model else ("players", "pitch")
    missing = missing_models(options.models_dir, needed)
    if missing:
        raise FileNotFoundError(f"Poids manquants : {', '.join(missing)}. "
                                "Lancez « python -m football_analysis models » pour les télécharger.")
    # Demi-précision (16 bits) sur GPU : option « quantize » d'Ultralytics 8.4, qui remplace « half ».
    predict = {"device": device, **({"quantize": 16} if device.startswith("cuda") else {})}
    people = YOLO(str(model_path("players", options.models_dir)))
    ball = YOLO(str(model_path("ball", options.models_dir))) if options.use_ball_model else None
    pitch = YOLO(str(model_path("pitch", options.models_dir)))
    detector = FootballDetector(people, ball, DetectionSettings(), predict)
    calibrator = PitchCalibrator(pitch, CalibrationSettings(), predict)
    described = {name: {"file": model_path(name, options.models_dir).name,
                        "sha256": sha256(model_path(name, options.models_dir))} for name in needed}
    crop_method = "torse" if options.team_backbone == "siglip" else "personne entière"
    described["teams"] = {"embeddings": BACKBONES[options.team_backbone],
                          "method": f"{crop_method} + UMAP + KMeans, vote par trajectoire"}
    return detector, calibrator, described


def _ball_record(ball: Any, calibration: Any) -> dict[str, Any] | None:
    """Enregistrement du ballon, placé sur le terrain si l'image est calibrée.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — chaîne d'analyse
    """
    if ball is None:
        return None
    if not calibration.ok:
        return contract.make_ball(ball.confidence, ball.box, None, "no-calibration")
    position = calibration.project(foot_points(ball.box.reshape(1, 4)))[0]
    status = pitch_status(position)
    return contract.make_ball(ball.confidence, ball.box, position if status == "ok" else None, status)


class FrameClock:
    """Instant de chaque image lue : l'horodatage du conteneur, sinon numéro ÷ cadence.

    Une vidéo à cadence variable (fréquente au téléphone) rend « numéro ÷ cadence » faux : sur une
    copie à cadence variable de la vidéo de la Bundesliga, l'écart atteignait 2,4 s, contre 0 avec
    l'horodatage du conteneur (CAP_PROP_POS_MSEC d'OpenCV). L'horloge garde aussi l'écart le plus
    grand entre deux images, pour dire si la cadence est fixe : le visualiseur en a besoin pour
    retrouver l'image affichée à l'arrêt.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — lecture de la vidéo (horodatage)
    """

    def __init__(self, fps: float):
        """Prépare l'horloge pour une cadence annoncée.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — lecture de la vidéo (horodatage)
        """
        self.fps = fps
        self.last: float | None = None
        self.count = 0
        self.container = True
        self.worst_jitter = 0.0

    def tick(self, index: int, position_ms: float) -> float:
        """Renvoie l'instant de l'image lue, en secondes, et met à jour les statistiques.

        Args:
            index: numéro de l'image, à partir de 0.
            position_ms: CAP_PROP_POS_MSEC juste après grab().

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — lecture de la vidéo (horodatage)
        """
        candidate = position_ms / 1000.0
        valid = candidate >= 0 and (self.last is None or candidate > self.last) and not (index > 0 and candidate == 0)
        if not valid:
            self.container = False
        time = candidate if valid and self.container else index / self.fps
        if self.last is not None:
            self.worst_jitter = max(self.worst_jitter, abs(time - self.last - 1 / self.fps))
        self.last = time
        self.count += 1
        return time

    def summary(self) -> dict[str, Any]:
        """Source des instants, cadence fixe ou non, et durée lue.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — lecture de la vidéo (horodatage)
        """
        return {
            "timestamps": "container" if self.container else "frame-index",
            "constantFrameRate": self.worst_jitter <= 0.25 / self.fps,
            "duration": None if self.last is None else round(self.last + 1 / self.fps, 3),
            "frameCount": self.count,
        }


def _analyse_frames(path: Path, video: dict[str, Any], options: AnalysisOptions, detector: FootballDetector,
                    calibrator: PitchCalibrator, meter: ResourceMeter, progress: Progress) -> tuple[list, CropCollector, dict, int, dict]:
    """Analyse les images échantillonnées : détection, suivi, calibration, positions.

    Returns:
        les images analysées, les images de joueurs gardées pour les équipes, les votes de rôle
        par trajectoire, le pas d'échantillonnage et le résumé de l'horloge (FrameClock).

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — chaîne d'analyse (images)
    """
    fps = video["fps"]
    stride = max(1, round(fps / options.target_fps))
    last_index = None if options.max_seconds is None else int(options.max_seconds * fps)
    expected = video["frameCount"] if last_index is None else min(video["frameCount"] or last_index, last_index)
    tracker = PeopleTracker(fps / stride)
    cuts = CutDetector(fps / stride)
    collector = CropCollector()
    role_votes: dict[int, Counter] = defaultdict(Counter)
    frames = []
    capture = cv2.VideoCapture(str(path))
    clock = FrameClock(fps)
    index = -1
    try:
        while capture.grab():
            index += 1
            if last_index is not None and index > last_index:
                break
            time = clock.tick(index, capture.get(cv2.CAP_PROP_POS_MSEC))
            if index % stride:
                continue
            ok, image = capture.retrieve()
            if not ok:
                break
            cut = cuts.is_cut(image)
            if cut:
                tracker.new_shot()
            people, ball = detector.detect(image)
            tracked = tracker.update(people)
            calibration = calibrator.calibrate(image)
            positions = calibration.project(foot_points(tracked.xyxy)) if calibration.ok else None
            objects = []
            for k in range(len(tracked)):
                track_id = int(tracked.tracker_id[k])
                role = detector.people_classes[int(tracked.class_id[k])]
                role_votes[track_id][role] += 1
                status = "no-calibration" if positions is None else pitch_status(positions[k])
                pitch = positions[k] if status == "ok" else None
                objects.append(contract.make_object(track_id, role, tracked.confidence[k], tracked.xyxy[k], pitch, status))
            players = [k for k in range(len(tracked)) if objects[k]["role"] == "player"]
            collector.offer(image, [int(tracked.tracker_id[k]) for k in players], tracked.xyxy[players] if players else np.zeros((0, 4)))
            frames.append(contract.make_frame(index, time, tracker.shot, cut, calibration.to_dict(),
                                              objects, _ball_record(ball, calibration)))
            meter.sample()
            if len(frames) % 10 == 0:
                progress("images", None if not expected else min(index / expected, 1.0),
                         f"{len(frames)} images analysées")
    finally:
        capture.release()
    return frames, collector, role_votes, stride, clock.summary()


def _assign_teams(frames: list, collector: CropCollector, role_votes: dict, options: AnalysisOptions,
                  device: str) -> tuple[dict, list[dict[str, Any]]]:
    """Fixe le rôle de chaque trajectoire, puis son équipe ; renvoie aussi les deux équipes.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — chaîne d'analyse (équipes)
    """
    roles = {track: votes.most_common(1)[0][0] for track, votes in role_votes.items()}
    player_crops = {track: crops for track, crops in collector.crops.items() if roles.get(track) == "player"}
    if sum(map(len, player_crops.values())) < MIN_CROPS_TO_FIT:
        # Pas assez d'images : le résultat reste inconnu, sans charger un modèle de 0,8 à 1,6 Go.
        assignments = {track: TeamAssignment(None, None, 0) for track in player_crops}
        crops_by_team = {}
    else:
        classifier = build_classifier(options.team_backbone, "cuda" if device.startswith("cuda") else "cpu", options.seed)
        assignments, crops_by_team = assign_player_teams(classifier, player_crops)
        del classifier
    for track, role in roles.items():
        if role == "player" and track not in assignments:
            assignments[track] = None
    teams = {track: (a.team if a else None) for track, a in assignments.items()}
    for frame in frames:
        for obj in frame["objects"]:
            obj["role"] = roles[obj["id"]]
    keepers = {track for track, role in roles.items() if role == "goalkeeper"}
    assignments.update(resolve_goalkeepers(frames, keepers, teams))
    summary = [{"id": team, "color": team_colour(crops_by_team.get(team, [])),
                "tracks": sum(1 for a in assignments.values() if a and a.team == team)} for team in (0, 1)]
    return {"roles": roles, "assignments": assignments}, summary


def _fill_teams(frames: list, roles: dict, assignments: dict) -> list[dict[str, Any]]:
    """Recopie l'équipe de chaque trajectoire dans ses images, et résume les trajectoires.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — chaîne d'analyse (équipes)
    """
    spans: dict[int, dict[str, Any]] = {}
    for frame in frames:
        for obj in frame["objects"]:
            assignment = assignments.get(obj["id"])
            if assignment is not None and assignment.team is not None:
                obj["team"] = assignment.team
                obj["teamConfidence"] = round(assignment.confidence, 3)
            span = spans.setdefault(obj["id"], {"id": obj["id"], "role": roles[obj["id"]], "shot": frame["shot"],
                                                "firstTime": frame["time"], "observations": 0})
            span["lastTime"] = frame["time"]
            span["observations"] += 1
    for track, span in spans.items():
        assignment = assignments.get(track)
        span["team"] = None if assignment is None else assignment.team
        span["teamConfidence"] = None if assignment is None or assignment.confidence is None else round(assignment.confidence, 3)
        span["teamVotes"] = 0 if assignment is None else assignment.votes
    return sorted(spans.values(), key=lambda span: span["id"])


def analyse_video(path: Path, options: AnalysisOptions | None = None, progress: Progress | None = None,
                  name: str | None = None) -> dict[str, Any]:
    """Analyse une vidéo et renvoie son document de suivi (voir contract.py).

    Args:
        path: fichier vidéo lisible par OpenCV.
        options: réglages ; valeurs par défaut sinon.
        progress: rappel de progression, facultatif.
        name: nom d'origine du fichier, pour l'en-tête.

    Raises:
        VideoError: vidéo illisible.
        FileNotFoundError: poids manquants.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — chaîne d'analyse
    """
    options = options or AnalysisOptions()
    progress = progress or (lambda stage, fraction, message: None)
    path = Path(path)
    video = probe_video(path)
    device = choose_device(options.device)
    meter = ResourceMeter(device)
    timings = {}

    started = clock.perf_counter()
    progress("modèles", None, "Chargement des modèles")
    detector, calibrator, models = _load_models(options, device)
    timings["models"] = clock.perf_counter() - started

    started = clock.perf_counter()
    frames, collector, role_votes, stride, timing = _analyse_frames(path, video, options, detector, calibrator, meter, progress)
    timings["frames"] = clock.perf_counter() - started
    if not frames:
        raise VideoError("Aucune image n'a pu être lue dans cette vidéo.")
    del detector, calibrator
    if device.startswith("cuda"):
        import torch

        torch.cuda.empty_cache()

    started = clock.perf_counter()
    progress("équipes", None, "Classement des joueurs en deux équipes")
    team_data, teams = _assign_teams(frames, collector, role_votes, options, device)
    tracks = _fill_teams(frames, team_data["roles"], team_data["assignments"])
    timings["teams"] = clock.perf_counter() - started

    progress("mesures", None, "Mesures de qualité")
    # Vitesse : temps de traitement rapporté à la durée de vidéo réellement lue (horloge des images),
    # et non au nombre d'images analysées, qui n'est qu'une image sur « stride ».
    video_seconds = timing["duration"]
    processing_seconds = sum(timings.values())
    metrics = quality_metrics(frames)
    metrics["processing"] = {
        "device": device,
        "seconds": {stage: round(value, 2) for stage, value in timings.items()},
        "videoSeconds": video_seconds,
        "processingSeconds": round(processing_seconds, 2),
        "slowdown": round(processing_seconds / video_seconds, 2),
        "analysedFrames": len(frames),
        "analysedFramesPerSecond": round(len(frames) / timings["frames"], 2),
        **meter.summary(),
    }
    limitations = describe_limitations(metrics)
    if not timing["constantFrameRate"]:
        limitations.append("Cadence variable : les instants viennent du conteneur ; à l'arrêt, sans "
                           "requestVideoFrameCallback, la synchronisation se fait à l'image analysée près.")
    if options.team_backbone == "clip":
        limitations.append("Équipes calculées avec CLIP ViT-L/14, modèle réservé à la recherche par sa fiche.")
    return {
        "format": contract.FORMAT,
        "version": contract.VERSION,
        "source": {"kind": "file", "name": name or path.name, **video, "duration": timing["duration"],
                   "frameCount": timing["frameCount"], "constantFrameRate": timing["constantFrameRate"],
                   "timestamps": timing["timestamps"]},
        "analysis": {
            "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "stride": stride, "fps": round(video["fps"] / stride, 4),
            "analysedSeconds": video_seconds,
            "models": models,
        },
        "pitch": dict(contract.PITCH),
        "frames": frames,
        "teams": teams,
        "tracks": tracks,
        "metrics": metrics,
        "limitations": limitations,
    }
