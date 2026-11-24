"""Compare deux analyses complètes du même clip : temps par étape, équipes, identités, distances.

Les deux bases viennent de la chaîne complète (détection, suivi, équipes), dans des processus
neufs, l'une avant et l'autre après le contrôle d'identité. Les observations annotées sont
retrouvées par leur boîte. Les distances des identités corrigées sont relevées au dernier instant.
Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from football_analysis.chunk_storage import ChunkStore
from .compare_teams import evaluate_by_box


def load(path: Path) -> tuple[dict, dict]:
    """Manifeste et images publiées d'une base terminée.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Validation de l'analyse vidéo — lecture des bases
    """
    with ChunkStore(path) as store:
        return store.manifest(), {"frames": [frame for chunk in store.iter_ready() for frame in chunk]}


def final_distances(document: dict) -> dict[int, float]:
    """Dernière distance cumulée publiée de chaque identité.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Validation de l'analyse vidéo — distances
    """
    distances = {}
    for frame in document["frames"]:
        for obj in frame["objects"]:
            if obj.get("distanceM") is not None:
                distances[obj["id"]] = obj["distanceM"]
    return distances


def main() -> int:
    """Écrit la comparaison des deux analyses des clips donnés.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Validation de l'analyse vidéo — comparaison avant/après
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=Path, default=Path("data/runs"))
    parser.add_argument("--before", default="id-base-")
    parser.add_argument("--after", default="id-new-")
    parser.add_argument("--output", type=Path, default=Path("data/runs/id-full-comparison.json"))
    args = parser.parse_args()
    audit = json.loads(Path(__file__).with_name("team-audit.json").read_bytes())
    rows = []
    for entry in audit["videos"]:
        paths = [args.runs / f"{prefix}{entry['name']}.tracking.sqlite" for prefix in (args.before, args.after)]
        if not all(path.is_file() for path in paths):
            continue
        reference = json.loads((args.runs / entry["candidate"]).read_bytes())
        row = {"name": entry["name"]}
        for label, path in zip(("before", "after"), paths):
            manifest, document = load(path)
            processing = manifest["metrics"]["processing"]
            result = evaluate_by_box(reference, document, entry["samples"])
            row[label] = {"seconds": processing["seconds"], "processingSeconds": processing["processingSeconds"],
                          "slowdown": processing["slowdown"], "identitySeconds": processing.get("identitySeconds"),
                          "peakRamMb": processing.get("peakRamMb"), "peakGpuMb": processing.get("peakGpuMb"),
                          "frames": processing["analysedFrames"], "identity": manifest["metrics"].get("identity"),
                          "wrong": result["wrong"], "unknown": result["unknown"], "correct": result["correct"],
                          "mixedIdentities": len(result["mixedIdentities"]), "uncertain": result["uncertainObservations"],
                          "distances": final_distances(document)}
        same = [track for track in row["after"]["distances"] if row["before"]["distances"].get(track) == row["after"]["distances"][track]]
        row["unchangedDistanceIds"] = len(same)
        row["changedDistances"] = {track: [row["before"]["distances"].get(track), distance]
                                   for track, distance in row["after"]["distances"].items()
                                   if row["before"]["distances"].get(track) != distance}
        for label in ("before", "after"):
            del row[label]["distances"]
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False))
    args.output.write_bytes((json.dumps({"date": "2026-11-24", "videos": rows}, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
