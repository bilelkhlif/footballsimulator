"""Compare deux analyses sur des maillots annotés visuellement, sans diffuser de vidéo.

Les étiquettes ne sont pas une vérité terrain officielle. Chaque vidéo reçoit une seule
permutation des numéros d'équipe ; les équipes inconnues sont comptées séparément des erreurs.
Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def read_json(path: Path) -> dict:
    """Lit un document JSON local en UTF-8.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Validation de l'analyse vidéo — lecture des résultats
    """
    return json.loads(path.read_bytes())


def evaluate(document: dict, samples: list[dict]) -> dict:
    """Compte les maillots justes, faux et inconnus avec une permutation unique par vidéo.

    Une observation absente du document est une erreur de protocole, pas une équipe inconnue.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Validation de l'analyse vidéo — comparaison des équipes
    """
    objects = {(frame["index"], obj["id"]): obj for frame in document["frames"] for obj in frame["objects"]}
    pairs = [(objects[(s["index"], s["track"])]["team"], s["team"]) for s in samples if s["team"] is not None]
    known = [(predicted, expected) for predicted, expected in pairs if predicted is not None]
    same = sum(predicted == expected for predicted, expected in known)
    flip = int(same < len(known) - same)
    correct = max(same, len(known) - same)
    return {"labelled": len(pairs), "correct": correct, "wrong": len(known) - correct,
            "unknown": len(pairs) - len(known), "excluded": sum(s["team"] is None for s in samples),
            "permutation": flip}


def compare_frames(baseline: dict, candidate: dict) -> dict:
    """Vérifie que détection, suivi, calibration, horodatage et ballon restent identiques.

    Les rôles, identifiants et positions sont comparés ; seuls équipe et confiance d'équipe
    peuvent différer. Un écart est rapporté, même si les moyennes restent identiques.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Validation de l'analyse vidéo — contrôle des régressions
    """
    unchanged = baseline["source"] == candidate["source"] and len(baseline["frames"]) == len(candidate["frames"])
    differences = 0
    for before, after in zip(baseline["frames"], candidate["frames"]):
        before = {**before, "objects": [{k: v for k, v in obj.items() if k not in ("team", "teamConfidence")}
                                         for obj in before["objects"]]}
        after = {**after, "objects": [{k: v for k, v in obj.items() if k not in ("team", "teamConfidence")}
                                       for obj in after["objects"]]}
        differences += before != after
    return {"sourceAndCountIdentical": unchanged, "changedFrames": differences}


def main() -> int:
    """Compare les huit vidéos et écrit les mesures sans inclure les images locales.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Validation de l'analyse vidéo — commande de comparaison
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=Path, default=Path("data/runs"))
    parser.add_argument("--annotations", type=Path, default=Path(__file__).with_name("team-audit.json"))
    parser.add_argument("--output", type=Path, default=Path("data/runs/team-validation.json"))
    args = parser.parse_args()
    annotations = read_json(args.annotations)
    results = {"date": annotations["date"], "method": annotations["description"],
               "annotationsSha256": hashlib.sha256(args.annotations.read_bytes()).hexdigest(),
               "baselineCommit": annotations["baselineCommit"],
               "candidateCodeCommit": annotations["candidateCodeCommit"],
               "settings": annotations["settings"], "fitCorpusNote": annotations["fitCorpusNote"], "videos": []}
    for video in annotations["videos"]:
        baseline = read_json(args.runs / video["baseline"])
        candidate = read_json(args.runs / video["candidate"])
        result = {"name": video["name"], "sourceSha256": video["sha256"], "kits": video["kits"],
                  "baseline": evaluate(baseline, video["samples"]),
                  "candidate": evaluate(candidate, video["samples"]),
                  "regression": compare_frames(baseline, candidate),
                  "baselineProcessing": baseline["metrics"]["processing"],
                  "candidateProcessing": candidate["metrics"]["processing"],
                  "candidateTeams": candidate["metrics"]["teams"]}
        results["videos"].append(result)
        print(video["name"], result["baseline"], "->", result["candidate"], flush=True)
    args.output.write_bytes((json.dumps(results, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    failures = [video["name"] for video in results["videos"]
                if not video["regression"]["sourceAndCountIdentical"] or video["regression"]["changedFrames"]
                or video["candidate"]["wrong"] > video["baseline"]["wrong"]
                or video["candidate"]["unknown"] > video["baseline"]["unknown"]]
    if failures:
        print("Regressions :", ", ".join(failures))
    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())
