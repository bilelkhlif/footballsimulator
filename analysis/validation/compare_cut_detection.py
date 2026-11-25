"""Compare la détection des coupures sur l'image entière et sur l'image réduite (PySceneDetect).

Les mêmes images analysées (cadence de la chaîne, 12,5 images/s) passent par deux CutDetector :
l'un sur l'image entière (avant le 24 novembre 2026), l'autre sur l'image réduite comme le fait
le SceneManager de PySceneDetect par défaut. Le changement n'est retenu que si les coupures sont
identiques sur toutes les vidéos de validation. Temps de détection seul, décodage exclu.
Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import cv2

from football_analysis.tracking import CutDetector


def main() -> int:
    """Écrit les coupures et les temps des deux variantes, vidéo par vidéo.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Validation des performances — détection des coupures
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--videos", type=Path, default=Path("data/videos"))
    parser.add_argument("--fps", type=float, default=12.5)
    parser.add_argument("--output", type=Path, default=Path("data/runs/cut-detection-comparison.json"))
    args = parser.parse_args()
    rows = []
    for video in sorted(args.videos.glob("*.mp4")):
        capture = cv2.VideoCapture(str(video))
        fps = capture.get(cv2.CAP_PROP_FPS)
        stride = max(1, round(fps / args.fps))
        detectors = {"full": CutDetector(fps / stride, downscale=False), "downscaled": CutDetector(fps / stride, downscale=True)}
        cuts = {name: [] for name in detectors}
        seconds = {name: 0.0 for name in detectors}
        index = -1
        while capture.grab():
            index += 1
            if index % stride:
                continue
            ok, image = capture.retrieve()
            if not ok:
                break
            for name, detector in detectors.items():
                started = time.perf_counter()
                if detector.is_cut(image):
                    cuts[name].append(index)
                seconds[name] += time.perf_counter() - started
        capture.release()
        row = {"name": video.stem, "sourceFrames": index + 1, "width": image.shape[1], "cuts": cuts,
               "identical": cuts["full"] == cuts["downscaled"], "seconds": {k: round(v, 2) for k, v in seconds.items()}}
        rows.append(row)
        print(json.dumps(row), flush=True)
    args.output.write_bytes((json.dumps({"date": "2026-11-24", "videos": rows,
                                         "allIdentical": all(row["identical"] for row in rows)}, indent=2) + "\n").encode("utf-8"))
    return 0 if all(row["identical"] for row in rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
