"""Étend la vidéo synthétique à 36 secondes pour exercer les fenêtres et déplacements du lecteur.

Les images répètent la fixture contrôlée de quatre secondes. Ce ne sont pas des résultats IA.
Lancer avec le Python de analysis/.venv ; OpenCV et numpy sont déjà des dépendances d'analyse.
Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import copy
import json
from pathlib import Path

import cv2

HERE = Path(__file__).resolve().parent


def main():
    """Écrit une petite vidéo VP9 répétée et son suivi horodaté correspondant.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Tests du visualiseur — fixture des fenêtres
    """
    source = cv2.VideoCapture(str(HERE / "match-synthetique.webm"))
    target = cv2.VideoWriter(str(HERE / "fenetres-synthetiques.webm"), cv2.VideoWriter_fourcc(*"VP90"), 25, (320, 180))
    if not target.isOpened():
        raise RuntimeError("Encodeur VP9 indisponible dans OpenCV.")
    try:
        for _ in range(9):
            source.set(cv2.CAP_PROP_POS_FRAMES, 0)
            for _ in range(100):
                ok, image = source.read()
                if not ok:
                    raise RuntimeError("Fixture vidéo source incomplète.")
                target.write(image)
    finally:
        source.release()
        target.release()
    base = json.loads((HERE / "match-synthetique.tracking.json").read_bytes())
    document = copy.deepcopy(base)
    document["source"].update(name="fenetres-synthetiques.webm", duration=36, frameCount=900)
    document["analysis"]["analysedSeconds"] = 36
    document["frames"], document["tracks"] = [], []
    document["metrics"] = None
    for repeat in range(9):
        for original in base["frames"]:
            frame = copy.deepcopy(original)
            frame["time"] = round(original["time"] + repeat * 4, 4)
            frame["index"] += repeat * 100
            frame["shot"] += repeat * 2
            frame["cut"] = frame["cut"] or (repeat > 0 and original["index"] == 0)
            for obj in frame["objects"]:
                obj["id"] += repeat * 100
                obj["distanceM"] = round(frame["time"] * 2, 3)
            document["frames"].append(frame)
        for original in base["tracks"]:
            track = copy.deepcopy(original)
            track["id"] += repeat * 100
            track["firstTime"] += repeat * 4
            track["lastTime"] += repeat * 4
            document["tracks"].append(track)
    (HERE / "fenetres-synthetiques.tracking.json").write_bytes(
        (json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8"))


if __name__ == "__main__":
    main()
