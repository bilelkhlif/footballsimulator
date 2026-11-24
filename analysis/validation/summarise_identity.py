"""Résume le contrôle d'identité sur les huit vidéos auditées, à partir des bases déjà calculées.

Lit les résultats v4 (identifiants figés), les bases segmentées précédentes (« chunk-teams- ») et
les nouvelles (« chunk-identity- »), sans nouvelle inférence. Les observations annotées sont
retrouvées par leur boîte.
Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from football_analysis.chunk_storage import ChunkStore
from .compare_teams import evaluate_by_box


def frames_of(path: Path) -> dict:
    """Images publiées d'une base segmentée.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Validation de l'analyse vidéo — lecture des bases
    """
    with ChunkStore(path) as store:
        return {"frames": [frame for chunk in store.iter_ready() for frame in chunk]}


def main() -> int:
    """Écrit le tableau avant/après par vidéo et les totaux.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Validation de l'analyse vidéo — résumé du contrôle d'identité
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=Path, default=Path("data/runs"))
    parser.add_argument("--output", type=Path, default=Path("data/runs/chunk-identity-summary.json"))
    args = parser.parse_args()
    audit = json.loads(Path(__file__).with_name("team-audit.json").read_bytes())
    validation = json.loads((args.runs / "chunk-identity-validation.json").read_bytes())
    seconds = {video["name"]: video["classificationSeconds"] for video in validation["videos"]}
    previous_seconds = {video["name"]: video["classificationSeconds"]
                        for video in json.loads((args.runs / "chunk-team-validation.json").read_bytes())["videos"]}
    rows, totals = [], {}
    for entry in audit["videos"]:
        original = json.loads((args.runs / entry["candidate"]).read_bytes())
        row = {"name": entry["name"]}
        for label, document in (("v4", original), ("segmentsBefore", frames_of(args.runs / f"chunk-teams-{entry['name']}.sqlite")),
                                ("after", frames_of(args.runs / f"chunk-identity-{entry['name']}.sqlite"))):
            result = evaluate_by_box(original, document, entry["samples"])
            row[label] = {key: result[key] for key in ("labelled", "correct", "wrong", "unknown")}
            row[label]["mixedIdentities"] = len(result["mixedIdentities"])
            row[label]["mixedIncludingUncertain"] = len(result["mixedIncludingUncertain"])
            row[label]["uncertainObservations"] = result["uncertainObservations"]
            for key, value in row[label].items():
                totals.setdefault(label, {}).setdefault(key, 0)
                totals[label][key] += value
        with ChunkStore(args.runs / f"chunk-identity-{entry['name']}.sqlite") as store:
            plan = store.state("identity_plan")
        row["identity"] = plan["summary"]
        row["corrections"] = [{key: item[key] for key in ("kind", "start", "time", "tracks")} for item in plan["corrections"]]
        row["classificationSeconds"] = {"before": previous_seconds.get(entry["name"]), "after": seconds.get(entry["name"])}
        rows.append(row)
        print(f"{entry['name']:<30} faux {row['segmentsBefore']['wrong']} -> {row['after']['wrong']}, "
              f"inconnus {row['segmentsBefore']['unknown']} -> {row['after']['unknown']}, "
              f"identités mixtes {row['segmentsBefore']['mixedIdentities']} -> {row['after']['mixedIdentities']}, "
              f"incertaines {row['after']['uncertainObservations']}, corrections {row['identity']}")
    summary = {"kind": "identity-check-on-frozen-v4-tracks", "date": "2026-11-24", "videos": rows, "totals": totals}
    args.output.write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps(totals, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
