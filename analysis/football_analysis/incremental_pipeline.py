"""Analyse par segments : images sur disque, mémoire bornée et reprise déterministe.

La détection publie immédiatement des images aux équipes inconnues. Une seconde passe apprend
un repère de maillots borné, puis classe les segments sans réapprendre les deux identités.
La reprise relit la vidéo et rejoue les seules détections déjà enregistrées : ni pickle,
ni nouvelle inférence YOLO sur ces images. Les calculs d'équipes ont leur transaction propre.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import math
import time
from collections import Counter
from dataclasses import asdict
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path
from typing import Any, Iterator

import cv2
import numpy as np
import supervision as sv

from . import contract, identity
from .calibration import HomographyStabilizer, calibration_from_record, foot_points, pitch_status
from .reference_calibration import ReferenceCalibrator, file_sha256, load_reference
from .chunk_storage import ChunkStore
from .incremental_metrics import quality_metrics_stream
from .metrics import describe_limitations
from .models import MODEL_LOCK, model_path, sha256
from .pipeline import (AnalysisOptions, FrameClock, Progress, ResourceMeter, VideoError,
                       _ball_record, _load_models, choose_device, probe_video)
from .streaming_teams import FrozenTeamModel, TeamState
from .teams import CropCollector, TeamAssignment, overlap_share, resolve_goalkeepers
from .tracking import CutDetector, PeopleTracker

#: Une réserve de 64 trajectoires × 8 maillots ; les grandes images sont réduites.
MAX_CROP_TRACKS = 64
MAX_CROP_HEIGHT = 256
MAX_CHUNK_FRAMES = 7200


class BoundedPeopleTracker(PeopleTracker):
    """ByteTrack inchangé ; seules les correspondances encore vivantes restent en mémoire.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse incrémentale — suivi borné
    """

    def __init__(self, frame_rate: float):
        """Prépare le compteur global, indépendant du dictionnaire des trajectoires actives.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse incrémentale — suivi borné
        """
        super().__init__(frame_rate)
        self._next_global = 1

    def new_shot(self) -> None:
        """Réinitialise le plan, sans réutiliser un identifiant global.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse incrémentale — coupures de caméra
        """
        super().new_shot()
        self._ids.clear()

    def update(self, detections: sv.Detections, timestamp: float | None = None) -> sv.Detections:
        """Associe les détections et libère les anciennes correspondances.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse incrémentale — continuité des identifiants
        """
        tracked = self._tracker.update(detections, timestamp=timestamp)
        alive = {int(track.tracker_id) for track in self._tracker.tracks if track.tracker_id >= 0}
        self._ids = {key: value for key, value in self._ids.items() if key[1] in alive}
        if tracked.tracker_id is None:
            return tracked[:0]
        tracked = tracked[tracked.tracker_id >= 0]
        global_ids = []
        for local in tracked.tracker_id:
            key = (self.shot, int(local))
            if key not in self._ids:
                self._ids[key] = self._next_global
                self._next_global += 1
            global_ids.append(self._ids[key])
        tracked.tracker_id = np.asarray(global_ids, dtype=int)
        return tracked


class BoundedCrops(CropCollector):
    """Réserve bornée réutilisant le choix des maillots validé dans teams.py.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse incrémentale — mémoire des images de maillots
    """

    def offer(self, frame: np.ndarray, track_ids: list[int], boxes: np.ndarray) -> None:
        """Limite l'effectif et les dimensions, en gardant le contrôle des masquages.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse incrémentale — mémoire des images de maillots
        """
        for index, track in enumerate(track_ids):
            if track not in self.seen and len(self.seen) >= MAX_CROP_TRACKS:
                continue
            box = boxes[index].copy()
            if overlap_share(box, np.delete(boxes, index, axis=0)) > self.max_overlap:
                box[3] = box[1]
            # Le contrôle de masquage précède cet appel ; la stratégie d'échantillonnage reste celle validée.
            super().offer(frame, [track], box.reshape(1, 4))
        for track, crops in self.crops.items():
            for index, crop in enumerate(crops):
                if crop.shape[0] > MAX_CROP_HEIGHT or crop.shape[1] > MAX_CROP_HEIGHT:
                    scale = MAX_CROP_HEIGHT / max(crop.shape[:2])
                    crops[index] = cv2.resize(crop, (max(1, round(crop.shape[1] * scale)),
                                                   max(1, round(crop.shape[0] * scale))))


class CropReader:
    """Relit les seules images utiles aux maillots, sans recherche fondée sur une cadence moyenne.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse incrémentale — relecture de la source
    """

    def __init__(self, path: Path):
        """Ouvre un décodeur séquentiel et son compteur d'images.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse incrémentale — relecture de la source
        """
        self.capture = cv2.VideoCapture(str(path))
        self.index = -1

    def collect(self, frames: list[dict], replay: list[dict], collector: BoundedCrops,
                from_time: float = 0.0, to_time: float = math.inf) -> None:
        """Propose les boîtes exactes des joueurs au collecteur, dans l'ordre d'origine.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse incrémentale — choix reproductible des maillots
        """
        for frame, event in zip(frames, replay):
            if not from_time <= frame["time"] <= to_time:
                continue
            while self.index < frame["index"]:
                if not self.capture.grab():
                    raise VideoError("Source interrompue pendant la relecture des maillots.")
                self.index += 1
            ok, image = self.capture.retrieve()
            if not ok:
                raise VideoError("Image de maillot illisible.")
            boxes = event["crops"]
            collector.offer(image, [row[0] for row in boxes],
                            np.asarray([row[1] for row in boxes], dtype=float).reshape(-1, 4))

    def image(self, index: int) -> np.ndarray:
        """Renvoie une image source, en avançant seulement : les numéros demandés croissent.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Analyse incrémentale — relecture de la source (contrôle d'identité)
        """
        if index <= self.index:
            raise VideoError("Relecture d'identité non séquentielle.")
        while self.index < index:
            if not self.capture.grab():
                raise VideoError("Source interrompue pendant le contrôle d'identité.")
            self.index += 1
        ok, image = self.capture.retrieve()
        if not ok:
            raise VideoError("Image illisible pendant le contrôle d'identité.")
        return image

    def close(self) -> None:
        """Libère le décodeur, même après une interruption.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse incrémentale — relecture de la source
        """
        self.capture.release()


def analysis_signature(path: Path, options: AnalysisOptions) -> dict:
    """Lie la reprise à la source, aux poids, aux réglages et aux versions du suivi.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse incrémentale — compatibilité des points de reprise
    """
    settings = {key: value for key, value in asdict(options).items()
                if key not in ("models_dir", "device", "reference_calibration")}
    names = ("players", "pitch", "ball") if options.use_ball_model else ("players", "pitch")
    weights = {name: sha256(model_path(name, options.models_dir)) if model_path(name, options.models_dir).is_file()
               else None for name in names}
    reference = None if options.reference_calibration is None else file_sha256(options.reference_calibration)
    return {"schema": 1, "sourceSha256": sha256(path), "settings": settings, "weights": weights, "reference": reference,
            "teamWeights": {key: MODEL_LOCK["backbones"][options.team_backbone][key]
                            for key in ("repository", "revision", "sha256")},
            "implementation": {name: sha256(Path(__file__).with_name(name + ".py")) for name in (
                "incremental_pipeline", "pipeline", "tracking", "teams", "streaming_teams", "calibration",
                "detection", "contract", "chunk_storage", "identity", "reference_calibration")},
            "versions": {name: version(name) for name in ("trackers", "scenedetect", "opencv-python", "numpy",
                "supervision", "ultralytics", "torch", "transformers", "scikit-learn", "umap-learn")}}


def validate_options(options: AnalysisOptions) -> None:
    """Refuse les réglages qui rendraient le traitement ou la réserve non bornés.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse incrémentale — validation des réglages
    """
    for value, minimum, maximum, label in (
        (options.target_fps, 0.1, 240, "cadence"),
        (options.chunk_seconds, 0.5, 30, "durée des segments"),
        (options.team_fit_seconds, 1, 120, "durée d'amorçage des équipes"),
    ):
        if isinstance(value, bool) or not math.isfinite(value) or not minimum <= value <= maximum:
            raise ValueError(f"Réglage invalide : {label}.")
    if options.max_seconds is not None and (not math.isfinite(options.max_seconds) or options.max_seconds <= 0):
        raise ValueError("Durée maximale invalide.")


def _events(store: ChunkStore) -> Iterator[tuple[dict, dict]]:
    """Parcourt les événements de suivi déjà validés, un segment à la fois.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse incrémentale — journal déterministe du suivi
    """
    for chunk in store.iter_raw():
        yield from zip(chunk["frames"], chunk["replay"])


def _detections(event: dict) -> sv.Detections:
    """Reconstruit les tableaux de détection, sans charger de modèle ni d'objet sérialisé.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse incrémentale — relecture du suivi
    """
    return sv.Detections(xyxy=np.asarray(event["boxes"], dtype=np.float32).reshape(-1, 4),
                         confidence=np.asarray(event["confidence"], dtype=np.float32),
                         class_id=np.asarray(event["classes"], dtype=int))


def detect_chunks(path: Path, store: ChunkStore, video: dict, options: AnalysisOptions,
                  detector: Any, calibrator: Any, meter: Any, progress: Progress,
                  reference: dict | None = None) -> None:
    """Détecte, suit et publie des segments ; rejoue le préfixe enregistré lors d'une reprise.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse incrémentale — détection et reprise
    """
    fps = video["fps"]
    store.recover_previews()
    stride = max(1, round(fps / options.target_fps))
    tracker, cuts, frame_clock = BoundedPeopleTracker(fps / stride), CutDetector(fps / stride), FrameClock(fps)
    stabilizer: HomographyStabilizer | None = None
    # Référence annotée : elle remplace la calibration automatique, qui reste mesurée pour comparaison.
    referee = None if reference is None else ReferenceCalibrator(reference, (video["width"], video["height"]))
    checkpoint = store.checkpoint() or {}
    last_committed = checkpoint.get("index", -1)
    seq = checkpoint.get("seq", -1) + 1
    count = checkpoint.get("analysedFrames", 0)
    old_seconds = checkpoint.get("detectionSeconds", 0.0)
    replay = _events(store)
    frames, events = [], []
    capture = cv2.VideoCapture(str(path))
    index = -1
    started = time.perf_counter()
    try:
        while capture.grab():
            index += 1
            previous_time = frame_clock.last
            instant = frame_clock.tick(index, capture.get(cv2.CAP_PROP_POS_MSEC))
            if options.max_seconds is not None and instant >= options.max_seconds:
                frame_clock.last, frame_clock.count = previous_time, frame_clock.count - 1
                break
            if index % stride:
                continue
            ok, image = capture.retrieve()
            if not ok:
                raise VideoError(f"Image source {index} illisible ; analyse conservée comme incomplète.")
            cut = cuts.is_cut(image)
            if cut:
                tracker.new_shot()
            if stabilizer is None:
                stabilizer = HomographyStabilizer((image.shape[1], image.shape[0]))
            if index <= last_committed:
                old_frame, event = next(replay)
                tracked = tracker.update(_detections(event), timestamp=instant)
                if (old_frame["index"] != index or abs(old_frame["time"] - instant) > 0.00006
                        or old_frame["cut"] != cut or [int(i) for i in tracked.tracker_id] != event["ids"]):
                    raise VideoError("Le suivi rejoué diffère du point de reprise ; les données sont conservées.")
                # Même état de lissage qu'une analyse sans interruption : la mesure brute est rejouée.
                if referee is not None:
                    referee.update(image, index, None, new_shot=cut)
                else:
                    stabilizer.update(image, calibration_from_record(old_frame["calibration"]), new_shot=cut)
                if index == last_committed:
                    progress("reprise", None, f"Suivi restauré jusqu'à {instant:.2f} s")
                elif index % (stride * 100) == 0:
                    progress("reprise", None, f"Restauration du suivi : {index + 1} images source relues")
                continue
            people, ball = detector.detect(image)
            tracked = tracker.update(people, timestamp=instant)
            measured = calibrator.calibrate(image)
            calibration = (referee.update(image, index, measured, new_shot=cut) if referee is not None
                           else stabilizer.update(image, measured, new_shot=cut))
            positions = calibration.project(foot_points(tracked.xyxy)) if calibration.ok else None
            objects, crop_boxes = [], []
            for k in range(len(tracked)):
                role = detector.people_classes[int(tracked.class_id[k])]
                status = "no-calibration" if positions is None else pitch_status(positions[k])
                track = int(tracked.tracker_id[k])
                objects.append(contract.make_object(track, role, tracked.confidence[k], tracked.xyxy[k],
                    positions[k] if status == "ok" else None, status))
                if role == "player":
                    crop_boxes.append([track, tracked.xyxy[k].tolist()])
            frames.append(contract.make_frame(index, instant, tracker.shot, cut, calibration.to_dict(),
                                              objects, _ball_record(ball, calibration)))
            events.append({"boxes": people.xyxy.tolist(), "confidence": people.confidence.tolist(),
                           "classes": people.class_id.tolist(), "ids": tracked.tracker_id.tolist(), "crops": crop_boxes})
            count += 1
            meter.sample()
            full = instant - frames[0]["time"] + stride / fps >= options.chunk_seconds - 1e-6
            if full or len(frames) >= MAX_CHUNK_FRAMES:
                checkpoint = {"seq": seq, "index": index, "analysedFrames": count,
                              "detectionSeconds": old_seconds + time.perf_counter() - started}
                store.commit_raw(seq, frames, events, checkpoint)
                store.publish(seq, frames)
                seq += 1
                frames, events = [], []
            if count % 10 == 0:
                duration = min(video["duration"] or math.inf, options.max_seconds or math.inf)
                progress("images", None if not math.isfinite(duration) else min(0.8 * instant / duration, 0.8),
                         f"{count} images analysées ; {instant:.1f} s lues")
        if index < last_committed:
            raise VideoError("La source se termine avant le point de reprise.")
        if frames:
            checkpoint = {"seq": seq, "index": frames[-1]["index"], "analysedFrames": count,
                          "detectionSeconds": old_seconds + time.perf_counter() - started}
            store.commit_raw(seq, frames, events, checkpoint)
            store.publish(seq, frames)
        if not count:
            raise VideoError("Aucune image n'a pu être lue dans cette vidéo.")
        if options.max_seconds is None and video.get("frameCount") and frame_clock.count < video["frameCount"] - 2:
            raise VideoError("Décodage arrêté avant la fin annoncée ; résultat conservé comme incomplet.")
        store.save_state(detection_done=True, timing=frame_clock.summary(),
                         detection_seconds=old_seconds + time.perf_counter() - started)
    finally:
        replay.close()
        capture.release()


def _roles(store: ChunkStore, frames: list[dict]) -> dict[int, dict]:
    """Fixe les rôles selon les votes stockés, sans charger les trajectoires absentes.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse incrémentale — rôles par trajectoire
    """
    spans = {obj["id"]: None for frame in frames for obj in frame["objects"]}
    for track in spans:
        spans[track] = store.track(track)
    for frame in frames:
        for obj in frame["objects"]:
            obj["role"] = spans[obj["id"]]["role"]
    return spans


def fit_team_reference(path: Path, store: ChunkStore, options: AnalysisOptions, device: str) -> tuple[FrozenTeamModel, dict]:
    """Apprend une réserve initiale bornée ; recharge les références si elles sont déjà sur disque.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse incrémentale — repère persistant des maillots
    """
    saved = store.get_blob("team_reference")
    if saved is not None:
        return FrozenTeamModel.load(saved, device=device), store.state("initial_keepers", {})
    collector, reader = BoundedCrops(), CropReader(path)
    try:
        for chunk in store.iter_raw():
            if chunk["frames"][0]["time"] > options.team_fit_seconds:
                break
            reader.collect(chunk["frames"], chunk["replay"], collector, to_time=options.team_fit_seconds)
        crops = {track: images for track, images in collector.crops.items() if store.track(track)["role"] == "player"}
        model = FrozenTeamModel(options.team_backbone, device, options.seed)
        model.fit(crops)
    finally:
        reader.close()
    # Même vote des gardiens que dans l'analyse historique, sur l'amorçage uniquement.
    counts: dict[int, Counter] = {}
    teams = {track: assignment.team for track, assignment in model.assignments.items()}
    for chunk in store.iter_raw():
        if chunk["frames"][0]["time"] > options.team_fit_seconds:
            break
        _roles(store, chunk["frames"])
        for frame in chunk["frames"]:
            if frame["time"] > options.team_fit_seconds:
                break
            keepers = {obj["id"] for obj in frame["objects"] if obj["role"] == "goalkeeper"}
            for track, assignment in resolve_goalkeepers([frame], keepers, teams).items():
                if assignment.team is not None:
                    counts.setdefault(track, Counter())[assignment.team] += 1
    initial_keepers = {}
    for track, votes in counts.items():
        team, count = votes.most_common(1)[0]
        total = sum(votes.values())
        initial_keepers[str(track)] = {"team": team if count / total >= 0.6 else None,
                                       "confidence": count / total, "votes": total}
    # Un arrêt entre ces écritures provoque au pire un nouvel apprentissage, sans publication.
    store.save_state(initial_keepers=initial_keepers, teams=model.teams(), team_model_ready=model.ready)
    store.put_blob("team_reference", model.dump())
    return model, initial_keepers


def check_identities(path: Path, store: ChunkStore, model: FrozenTeamModel) -> dict:
    """Contrôle les identités aux contacts masqués entre joueurs, d'après les maillots (identity.py).

    Lit le journal deux fois, sans le charger entier : contacts, puis maillots des seules fenêtres
    de preuve, relus dans la source. Le plan et les résumés corrigés sont validés ensemble ; une
    reprise relit le plan au lieu de refaire les prédictions. Sans repère d'équipes, rien n'est
    corrigé.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse incrémentale — contrôle des identités
    """
    saved = store.state("identity_plan")
    if saved is not None:
        return identity.validate_plan(saved)
    started = time.perf_counter()
    roles: dict[int, bool] = {}

    def is_player(track: int) -> bool:
        """Rôle majoritaire de la trajectoire, lu une fois."""
        if track not in roles:
            span = store.track(track)
            roles[track] = span is not None and span["role"] == "player"
        return roles[track]

    contacts, truncated = identity.find_contacts(identity.iter_frames(store.iter_raw()), is_player)
    windows = identity.plan_windows(contacts)
    votes: dict[int, list] = {}
    if model.ready and windows:
        reader = CropReader(path)
        try:
            votes = identity.window_votes(_events(store), windows, reader.image, model.predict)
        finally:
            reader.close()
    plan = identity.decide(contacts, windows, votes, store.max_track_id() + 1)
    plan["truncated"] = truncated
    spans = identity.rebuild_tracks(identity.iter_frames(store.iter_raw()), plan, identity.affected_ids(plan))
    store.save_identity(plan, spans.values())
    store.save_state(identity_seconds=time.perf_counter() - started)
    return plan


def classify_chunks(path: Path, store: ChunkStore, options: AnalysisOptions, device: str,
                    meter: Any, progress: Progress) -> list[dict]:
    """Publie équipes et distances ; les votes, distances et images partagent la même transaction.

    Depuis le contrôle d'identité, les images publiées portent les identifiants finaux : une
    trajectoire échangée à un contact est rétablie, et ses équipe, votes et distance suivent le
    même joueur.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse incrémentale — classification persistante et reprise
    """
    model, keepers = fit_team_reference(path, store, options, "cuda" if device.startswith("cuda") else "cpu")
    progress("identités", 0.8, "Contrôle des identités aux contacts entre joueurs")
    plan = check_identities(path, store, model)
    mapper = identity.IdentityMapper(plan)
    corrected = identity.evidence_assignments(plan)
    votes = TeamState(model)
    votes.set_initial()
    for track, assignment in corrected.items():
        votes.seed(track, assignment, plan["evidence"][str(track)])
    saved = store.state("team_state")
    motion = {}
    if saved:
        votes.restore(saved["votes"])
        motion = saved["motion"]
    cursor = store.state("team_cursor", -1)
    reader = CropReader(path)
    started = time.perf_counter()
    old_seconds = store.state("classification_seconds", 0.0)
    try:
        for chunk in store.iter_raw(after_seq=cursor):
            frames = chunk["frames"]
            for frame, event in zip(frames, chunk["replay"]):
                mapper.apply(frame, event)
            spans = _roles(store, frames)
            if frames[-1]["time"] > options.team_fit_seconds:
                collector = BoundedCrops()
                reader.collect(frames, chunk["replay"], collector, from_time=options.team_fit_seconds + 0.00001)
                player_crops = {track: crops for track, crops in collector.crops.items()
                                if spans[track]["role"] == "player"}
                votes.update(player_crops, frames[-1]["time"])
                del collector, player_crops
            assignments = {track: (corrected[track] if track in corrected and frames[-1]["time"] <= options.team_fit_seconds
                                    else model.assignments.get(track) if frames[-1]["time"] <= options.team_fit_seconds
                                    else votes.assignment(track)) for track in spans}
            teams = {track: assignment.team if assignment else None for track, assignment in assignments.items()}
            goalkeeper_ids = {track for track, span in spans.items() if span["role"] == "goalkeeper"}
            if frames[-1]["time"] <= options.team_fit_seconds:
                assignments.update({track: TeamAssignment(**keepers[str(track)]) for track in goalkeeper_ids
                                    if str(track) in keepers})
            else:
                assignments.update(resolve_goalkeepers(frames, goalkeeper_ids, teams))
            for frame in frames:
                if frame["cut"]:
                    motion.clear()
                for obj in frame["objects"]:
                    track, span = obj["id"], spans[obj["id"]]
                    assignment = assignments.get(track)
                    if obj["role"] != "referee" and assignment is not None:
                        obj["team"] = assignment.team
                        obj["teamConfidence"] = None if assignment.confidence is None else round(assignment.confidence, 3)
                    if obj.get("identity") == "uncertain":
                        # Pendant un contact corrigé, qui est qui n'est pas connu : pas d'équipe affirmée.
                        obj["team"] = obj["teamConfidence"] = None
                    else:
                        span.update(team=obj["team"], teamConfidence=obj["teamConfidence"],
                                    teamVotes=0 if assignment is None else assignment.votes)
                    previous = motion.get(str(track))
                    if obj["pitch"] is not None:
                        if previous and previous["shot"] == frame["shot"]:
                            gap = frame["time"] - previous["time"]
                            distance = math.dist(previous["pitch"], obj["pitch"])
                            if 0 < gap <= 0.5 and distance / gap <= 12:
                                span["distanceM"] += distance
                        motion[str(track)] = {"time": frame["time"], "shot": frame["shot"], "pitch": obj["pitch"]}
                    obj["distanceM"] = round(span["distanceM"], 3)
                motion = {track: point for track, point in motion.items() if frame["time"] - point["time"] <= 2}
                if len(motion) > 128:
                    motion = dict(sorted(motion.items(), key=lambda item: item[1]["time"])[-128:])
            active = {track for track, span in spans.items() if frames[-1]["time"] - span["lastTime"] <= 2}
            votes.expire(active)
            state = {"votes": votes.snapshot(), "motion": motion}
            store.publish(chunk["seq"], frames, list(spans.values()), state=state)
            store.save_state(classification_seconds=old_seconds + time.perf_counter() - started)
            meter.sample()
            duration = store.state("timing")["duration"]
            progress("équipes", min(0.8 + 0.17 * frames[-1]["time"] / duration, 0.97),
                     f"Équipes publiées jusqu'à {frames[-1]['time']:.1f} s")
    finally:
        reader.close()
    counts = store.team_counts()
    return [{**team, "tracks": counts[team["id"]]} for team in model.teams()]


def analyse_to_store(path: Path, output: Path, options: AnalysisOptions | None = None,
                     progress: Progress | None = None, name: str | None = None) -> dict:
    """Analyse ou reprend une vidéo ; renvoie seulement son manifeste compact.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse incrémentale — orchestration des étapes
    """
    options = options or AnalysisOptions()
    validate_options(options)
    progress = progress or (lambda stage, fraction, message: None)
    path = Path(path)
    progress("vérification", 0, "Vérification de la source, des poids et du point de reprise")
    signature = analysis_signature(path, options)
    video = probe_video(path)
    stride = max(1, round(video["fps"] / options.target_fps))
    reference = None
    if options.reference_calibration is not None:
        reference = load_reference(options.reference_calibration, (video["width"], video["height"]),
                                   video_sha256=signature["sourceSha256"], stride=stride)
    header = {"format": contract.FORMAT, "version": contract.VERSION,
              "source": {"kind": "file", "name": name or path.name, **video, "constantFrameRate": False},
              "analysis": {"createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                           "stride": stride, "fps": round(video["fps"] / stride, 4),
                           "chunkSeconds": options.chunk_seconds, "teamFitSeconds": options.team_fit_seconds,
                           # Origine des positions sur le terrain : points clés stabilisés, ou référence annotée.
                           "calibration": ({"source": "reference", "keyframes": sorted(reference),
                                            "points": sum(r.keypoints for r in reference.values())}
                                           if reference else {"source": "keypoints", "stabilized": True})},
              "pitch": dict(contract.PITCH)}
    with ChunkStore(output, header, signature) as store:
        if store.manifest()["complete"]:
            return store.manifest()
        device = choose_device(options.device)
        meter = ResourceMeter(device)
        if not store.state("detection_done"):
            progress("modèles", 0, "Chargement des modèles ; reprise des segments validés")
            started = time.perf_counter()
            detector, calibrator, models = _load_models(options, device)
            store.save_state(models=models, model_seconds=store.state("model_seconds", 0) + time.perf_counter() - started)
            detect_chunks(path, store, video, options, detector, calibrator, meter, progress, reference)
            del detector, calibrator
            if device.startswith("cuda"):
                import torch

                torch.cuda.empty_cache()
        timing = store.state("timing")
        header = store.header()
        header["source"].update(timing)
        header["analysis"].update(models=store.state("models"), analysedSeconds=timing["duration"])
        store.save_state(header=header)
        progress("équipes", 0.8, "Référence persistante des maillots, puis classement des segments")
        started = time.perf_counter()
        teams = classify_chunks(path, store, options, device, meter, progress)
        elapsed = store.state("team_total_seconds", 0.0) + time.perf_counter() - started
        store.save_state(team_total_seconds=elapsed)
        progress("mesures", 0.98, "Mesures de qualité par lecture séquentielle")
        metrics = quality_metrics_stream(store.iter_ready())
        seconds = {"models": store.state("model_seconds", 0), "frames": store.state("detection_seconds", 0), "teams": elapsed}
        processing = sum(seconds.values())
        frame_count = store.manifest()["storage"]["frameCount"]
        metrics["processing"] = {"device": device, "seconds": {key: round(value, 2) for key, value in seconds.items()},
            "videoSeconds": timing["duration"], "processingSeconds": round(processing, 2),
            "slowdown": round(processing / timing["duration"], 2), "analysedFrames": frame_count,
            "analysedFramesPerSecond": round(frame_count / max(seconds["frames"], 1e-9), 2),
            "pipelineFramesPerSecond": round(frame_count / max(processing, 1e-9), 2),
            "videoFramesPerSecond": video["fps"], "identitySeconds": round(store.state("identity_seconds", 0), 2),
            **meter.summary()}
        metrics["identity"] = identity.describe(store.state("identity_plan"))
        limitations = describe_limitations(metrics)
        limitations.extend(["Les deux identités d'équipe sont apprises sur une réserve initiale bornée ; "
                            "un changement de tenue ultérieur peut laisser des joueurs inconnus.",
                            "Sans réidentification, un identifiant de suivi ne garantit pas l'identité du joueur : "
                            "un échange entre joueurs de maillots différents est corrigé seulement à un contact "
                            "masqué, quand les maillots le prouvent ; entre coéquipiers, il n'est pas détecté."])
        if timing["timestamps"] != "container":
            limitations.append("Horodatages du conteneur inutilisables : temps reconstitués à la cadence nominale ; "
                               "la synchronisation d'une source à cadence variable n'est pas garantie.")
        elif not timing["constantFrameRate"]:
            limitations.append("Cadence variable : horodatages du conteneur ; repli annoncé si le décodeur ne les fournit pas.")
        if options.team_backbone == "clip":
            limitations.append("CLIP ViT-L/14 : usage réservé à la recherche selon sa fiche de modèle.")
        store.finish(header, {"teams": teams, "metrics": metrics, "limitations": limitations})
        result = store.manifest()
        result["metrics"]["processing"]["outputBytes"] = Path(output).stat().st_size
        progress("terminé", 1.0, "Analyse terminée ; toutes les fenêtres sont disponibles")
        return result
