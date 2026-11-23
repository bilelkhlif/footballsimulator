"""Mesure reproductible de mémoire et de taille du stockage, sur un suivi synthétique.

Chaque commande doit tourner dans un processus neuf. Elle n'exécute aucun modèle, ne mesure
aucune précision football et ne permet pas d'annoncer un débit d'inférence sur un match entier.
Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import time

import psutil

from football_analysis.chunk_storage import ChunkStore


def frame(index: int) -> dict:
    """Construit 22 objets mobiles contrôlés, à 12,5 images analysées par seconde.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Validation incrémentale — fixture de charge
    """
    instant = index / 12.5
    objects = []
    for track in range(1, 23):
        x = round(35 * math.sin(instant * .04 + track), 2)
        y = round(22 * math.cos(instant * .03 + track * .4), 2)
        objects.append({"id": track, "role": "player", "confidence": .9,
            "box": [round(800 + 12 * x, 1), round(450 + 7 * y, 1), round(820 + 12 * x, 1), round(510 + 7 * y, 1)],
            "pitch": [x, y], "pitchStatus": "ok", "team": track % 2, "teamConfidence": .9})
    return {"index": index * 2, "time": instant, "shot": 0, "cut": False,
        "calibration": {"status": "ok", "keypoints": 8, "fitErrorPx": .2, "fitErrorM": .02,
                        "holdoutErrorPx": .3, "holdoutErrorM": .03}, "objects": objects, "ball": None}


def main() -> None:
    """Mesure un stockage historique ou incrémental, puis écrit uniquement ses nombres.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Validation incrémentale — mesure de charge synthétique
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("json", "sqlite"))
    parser.add_argument("--seconds", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    process = psutil.Process()
    initial = process.memory_info().rss
    peak = initial
    count = round(args.seconds * 12.5)
    started = time.perf_counter()
    if args.mode == "json":
        frames = []
        for index in range(count):
            frames.append(frame(index))
            if index % 125 == 0:
                peak = max(peak, process.memory_info().rss)
        encoded = json.dumps({"frames": frames}, separators=(",", ":"))
        peak = max(peak, process.memory_info().rss)
        args.output.write_bytes(encoded.encode("utf-8"))
        peak = max(peak, process.memory_info().rss)
    else:
        with ChunkStore(args.output, {"analysis": {"chunkSeconds": 10}}) as store:
            for seq, start in enumerate(range(0, count, 125)):
                frames = [frame(index) for index in range(start, min(start + 125, count))]
                replay = [{"boxes": [obj["box"] for obj in item["objects"]],
                           "confidence": [.9] * 22, "classes": [0] * 22,
                           "ids": list(range(1, 23)), "crops": [[obj["id"], obj["box"]] for obj in item["objects"]]}
                          for item in frames]
                store.commit_raw(seq, frames, replay, {"seq": seq, "index": frames[-1]["index"]})
                store.publish(seq, frames)
                peak = max(peak, process.memory_info().rss)
    result = {"kind": "synthetic-storage-only", "mode": args.mode, "videoSeconds": args.seconds,
              "analysedFrames": count, "sourceFps": 25, "analysisFps": 12.5,
              "wallSeconds": round(time.perf_counter() - started, 3),
              "initialRamMb": round(initial / 2**20, 2), "peakRamMb": round(peak / 2**20, 2),
              "outputBytes": args.output.stat().st_size}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
