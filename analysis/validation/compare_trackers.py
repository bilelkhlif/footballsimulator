"""Rejoue les détections enregistrées avec les suiveurs de la bibliothèque trackers, déjà installée.

Question : un suiveur éprouvé (BoT-SORT, OC-SORT, C-BIoU, McByte) évite-t-il, à lui seul, les
échanges d'identifiants constatés avec ByteTrack ? Aucune nouvelle détection ni aucun nouveau
poids : les boîtes, confiances et classes du journal SQLite sont rejouées sur le processeur ; les
images ne sont relues que pour la compensation du mouvement de caméra (CMC). Le suivi repart à
chaque coupure, comme dans la chaîne.

Mesures, sur l'audit interne retrouvé par boîte : identités qui portent deux maillots annotés
(échanges entre maillots différents), nombre d'identifiants, observations annotées non suivies.
Ce n'est pas un HOTA ni un IDF1 : il n'existe pas de vérité terrain d'identité pour ces clips.
Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import cv2
import numpy as np
import supervision as sv

from football_analysis.chunk_storage import ChunkStore
from .compare_teams import _box_iou


def tracker_factories() -> dict:
    """Suiveurs comparés, avec leurs réglages par défaut ; la cadence est celle de l'analyse.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Validation du suivi — suiveurs comparés
    """
    import trackers

    return {
        "ByteTrack (actuel)": lambda fps: trackers.ByteTrackTracker(frame_rate=fps),
        "BoT-SORT + CMC": lambda fps: trackers.BoTSORTTracker(frame_rate=fps),
        "OC-SORT": lambda fps: trackers.OCSORTTracker(frame_rate=fps),
        "OC-SORT + CMC": lambda fps: trackers.OCSORTTracker(frame_rate=fps, enable_cmc=True),
        "C-BIoU": lambda fps: trackers.CBIoUTracker(frame_rate=fps),
        "McByte + CMC (sans masques)": lambda fps: trackers.McByteTracker(frame_rate=fps),
    }


def replay(store: ChunkStore, video: Path, factory, fps: float) -> tuple[list[dict], float]:
    """Rejoue un suiveur sur le journal ; renvoie les images {index, objects[{id, box}]} et sa durée.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Validation du suivi — rejeu des détections
    """
    capture = cv2.VideoCapture(str(video))
    position = -1
    output = []
    tracker = None
    shot = None
    next_id, ids = 1, {}
    spent = 0.0
    try:
        for chunk in store.iter_raw():
            for frame, event in zip(chunk["frames"], chunk["replay"]):
                while position < frame["index"]:
                    capture.grab()
                    position += 1
                ok, image = capture.retrieve()
                if not ok:
                    raise RuntimeError("image illisible")
                started = time.perf_counter()
                if tracker is None or frame["shot"] != shot:
                    tracker, shot = factory(fps), frame["shot"]
                detections = sv.Detections(xyxy=np.asarray(event["boxes"], dtype=np.float32).reshape(-1, 4),
                                           confidence=np.asarray(event["confidence"], dtype=np.float32),
                                           class_id=np.asarray(event["classes"], dtype=int))
                try:
                    tracked = tracker.update(detections, frame=image, timestamp=frame["time"])
                except TypeError:
                    tracked = tracker.update(detections, timestamp=frame["time"])
                objects = []
                if tracked.tracker_id is not None:
                    for box, local in zip(tracked.xyxy, tracked.tracker_id):
                        if local < 0:
                            continue
                        key = (shot, int(local))
                        if key not in ids:
                            ids[key], next_id = next_id, next_id + 1
                        objects.append({"id": ids[key], "box": [float(v) for v in box]})
                spent += time.perf_counter() - started
                output.append({"index": frame["index"], "objects": objects})
    finally:
        capture.release()
    return output, spent


def audit_identity(frames: list[dict], baseline: dict, samples: list[dict]) -> dict:
    """Identités qui portent deux maillots annotés, et observations annotées sans identifiant.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Validation du suivi — mesure d'identité sur l'audit
    """
    boxes = {(frame["index"], obj["id"]): obj["box"] for frame in baseline["frames"] for obj in frame["objects"]}
    by_index = {frame["index"]: frame for frame in frames}
    kits: dict[int, set] = {}
    missing = 0
    for sample in samples:
        if sample["team"] is None:
            continue
        box = boxes[(sample["index"], sample["track"])]
        best = max(by_index[sample["index"]]["objects"], key=lambda obj: _box_iou(obj["box"], box), default=None)
        if best is None or _box_iou(best["box"], box) < 0.9:
            missing += 1
            continue
        kits.setdefault(best["id"], set()).add(sample["team"])
    return {"mixedIdentities": sum(len(teams) > 1 for teams in kits.values()), "untracked": missing,
            "ids": len({obj["id"] for frame in frames for obj in frame["objects"]})}


def main() -> int:
    """Compare les suiveurs sur les clips dont le journal brut existe.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Validation du suivi — commande de comparaison
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=Path, default=Path("data/runs"))
    parser.add_argument("--videos", type=Path, default=Path("data/videos"))
    parser.add_argument("--prefix", default="id-base-")
    parser.add_argument("--output", type=Path, default=Path("data/runs/tracker-comparison.json"))
    args = parser.parse_args()
    audit = json.loads(Path(__file__).with_name("team-audit.json").read_bytes())
    results = {"kind": "tracker-replay-on-recorded-detections", "date": "2026-11-24", "videos": []}
    for entry in audit["videos"]:
        database = args.runs / f"{args.prefix}{entry['name']}.tracking.sqlite"
        if not database.is_file():
            continue
        baseline = json.loads((args.runs / entry["candidate"]).read_bytes())
        with ChunkStore(database) as store:
            fps = store.header()["analysis"]["fps"]
            row = {"name": entry["name"], "fps": fps, "trackers": {}}
            for name, factory in tracker_factories().items():
                frames, spent = replay(store, args.videos / (entry["name"] + ".mp4"), factory, fps)
                row["trackers"][name] = {**audit_identity(frames, baseline, entry["samples"]), "seconds": round(spent, 2)}
                print(entry["name"], name, row["trackers"][name], flush=True)
        results["videos"].append(row)
    args.output.write_bytes((json.dumps(results, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
