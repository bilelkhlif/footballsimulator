"""Génère les données de test du visualiseur de match : une vidéo synthétique et son document de suivi.

Ce ne sont pas des résultats d'analyse : la vidéo est fabriquée image par image, et le document de
suivi décrit exactement ce qu'elle montre. Ils servent aux tests de bout en bout de l'interface
(tests/visualizer-tests.mjs), sans GPU ni modèles.

- Vidéo : 100 images à 25 images/s, 320 × 180, VP9. En haut de chaque image, huit pavés noirs ou
  blancs codent son numéro en binaire (pavé k blanc si le bit k est à 1) : le test lit les pavés
  affichés pour savoir quelle image est à l'écran, et la compare aux annotations. Un code en
  couleur ne survit pas à la compression (essayé : décalages d'une unité sur le vert).
- Un rectangle blanc (« joueur 7 ») traverse l'image de gauche à droite, de 2 pixels par image.
- Document : une image analysée sur deux ; calibration impossible des images 60 à 70 ; coupure de
  plan à l'image 80.

Usage : python tests/fixtures/visualizer/make_fixture.py (ffmpeg et numpy requis).

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import json
import subprocess
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
WIDTH, HEIGHT, FPS, COUNT, STRIDE = 320, 180, 25, 100, 2

#: Homographie de l'image (320 × 180) vers le terrain (105 × 68 m), centrée : un simple changement d'échelle.
HOMOGRAPHY = [105 / WIDTH, 0, -52.5, 0, 68 / HEIGHT, -34, 0, 0, 1]


#: Bande du code binaire : 8 pavés de 40 × 20 pixels en haut de l'image.
CODE_BITS, CODE_HEIGHT = 8, 20


def draw_code(image, index):
    """Dessine le numéro de l'image en binaire, sur la bande du haut.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de bout en bout du visualiseur — données de test
    """
    width = WIDTH // CODE_BITS
    for bit in range(CODE_BITS):
        image[:CODE_HEIGHT, bit * width:(bit + 1) * width] = 255 if index >> bit & 1 else 0


def player_box(index):
    """Boîte du joueur 7 dans l'image : 12 × 40 pixels, 2 pixels plus à droite à chaque image.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de bout en bout du visualiseur — données de test
    """
    x = 20 + 2 * index
    return [x, 80, x + 12, 120]


def to_pitch(x, y):
    """Point de l'image vers le terrain, par l'homographie de test.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de bout en bout du visualiseur — données de test
    """
    return [round(HOMOGRAPHY[0] * x + HOMOGRAPHY[2], 2), round(HOMOGRAPHY[4] * y + HOMOGRAPHY[5], 2)]


def make_video(path):
    """Encode la vidéo synthétique en VP9 avec ffmpeg.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de bout en bout du visualiseur — données de test
    """
    frames = np.zeros((COUNT, HEIGHT, WIDTH, 3), dtype=np.uint8)
    for index in range(COUNT):
        frames[index, :, :] = (40, 120, 50)
        draw_code(frames[index], index)
        x1, y1, x2, y2 = player_box(index)
        frames[index, y1:y2, x1:x2] = 255
    command = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}",
               "-r", str(FPS), "-i", "-", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "10", "-g", "10",
               "-pix_fmt", "yuv420p", str(path)]
    subprocess.run(command, input=frames.tobytes(), check=True)


def person(track_id, role, box, team, calibrated):
    """Personne d'une image du document de test.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de bout en bout du visualiseur — données de test
    """
    foot = ((box[0] + box[2]) / 2, box[3])
    return {"id": track_id, "role": role, "confidence": 0.9, "box": box,
            "pitch": to_pitch(*foot) if calibrated else None, "pitchStatus": "ok" if calibrated else "no-calibration",
            "team": team, "teamConfidence": None if team is None else 1.0}


def make_document():
    """Document de suivi qui décrit la vidéo synthétique.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de bout en bout du visualiseur — données de test
    """
    frames = []
    for index in range(0, COUNT, STRIDE):
        calibrated = not 60 <= index <= 70
        shot = 1 if index >= 80 else 0
        objects = [
            person(7, "player", player_box(index), 0, calibrated),
            person(12, "player", [250, 120, 262, 160], 1, calibrated),
            person(3, "referee", [150, 30, 160, 60], None, calibrated),
        ]
        calibration = ({"status": "ok", "keypoints": 9, "inliers": 9, "fitErrorPx": 1.5, "fitErrorM": 0.2, "holdoutErrorPx": 2.1, "holdoutErrorM": 0.3, "homography": HOMOGRAPHY}
                       if calibrated else {"status": "failed", "reason": "too-few-keypoints", "keypoints": 3})
        ball_box = [player_box(index)[2] + 2, 114, player_box(index)[2] + 8, 120]
        ball = {"confidence": 0.7, "box": ball_box, "pitch": to_pitch(ball_box[0] + 3, 120) if calibrated else None,
                "pitchStatus": "ok" if calibrated else "no-calibration"}
        frames.append({"index": index, "time": round(index / FPS, 4), "shot": shot, "cut": index == 80,
                       "calibration": calibration, "objects": objects, "ball": ball})
    return {
        "format": "football-tracking", "version": 1,
        "source": {"kind": "file", "name": "match-synthetique.webm", "width": WIDTH, "height": HEIGHT, "fps": FPS,
                   "frameCount": COUNT, "duration": COUNT / FPS},
        "analysis": {"createdAt": "2026-11-17T00:00:00+00:00", "stride": STRIDE, "fps": FPS / STRIDE,
                     "analysedSeconds": COUNT / FPS, "models": {"note": "données de test, sans modèle"}},
        "pitch": {"length": 105.0, "width": 68.0, "origin": "centre", "units": "m"},
        "frames": frames,
        "teams": [{"id": 0, "color": "#e04040", "tracks": 1}, {"id": 1, "color": "#3060e0", "tracks": 1}],
        "tracks": [{"id": 7, "role": "player", "shot": 0, "firstTime": 0.0, "lastTime": 3.92, "observations": 50, "team": 0, "teamConfidence": 1.0, "teamVotes": 6},
                   {"id": 12, "role": "player", "shot": 0, "firstTime": 0.0, "lastTime": 3.92, "observations": 50, "team": 1, "teamConfidence": 1.0, "teamVotes": 6},
                   {"id": 3, "role": "referee", "shot": 0, "firstTime": 0.0, "lastTime": 3.92, "observations": 50, "team": None, "teamConfidence": None, "teamVotes": 0}],
        "metrics": {"detection": {"frames": len(frames), "ballFrameShare": 1.0},
                    "calibration": {"calibratedShare": 0.88, "medianFitErrorPx": 1.5, "medianFitErrorM": 0.2, "medianHoldoutErrorPx": 2.1, "medianHoldoutErrorM": 0.3},
                    "tracking": {"tracks": 3, "fragmentation": 1.0}, "positions": {"placedShare": 0.88},
                    "teams": {"knownTeamShare": 1.0}, "processing": {"slowdown": None, "analysedFramesPerSecond": None, "device": "test"}},
        "limitations": ["Données de test : vidéo synthétique, sans analyse."],
    }


if __name__ == "__main__":
    make_video(HERE / "match-synthetique.webm")
    (HERE / "match-synthetique.tracking.json").write_text(json.dumps(make_document(), ensure_ascii=False, indent=1), encoding="utf-8", newline=chr(10))
    print("ok")
