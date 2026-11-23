"""Contrôle des équipes par segments sur huit vidéos réelles déjà suivies et auditées.

Les détections et identifiants v4 sont figés ; les maillots sont relus depuis les vidéos privées.
Cette commande mesure la classification, pas une nouvelle détection ni une précision d'identité.
Les boîtes historiques sont arrondies au dixième de pixel : ce protocole est distinct de la
nouvelle chaîne complète, qui enregistre aussi les boîtes exactes pour ses maillots.
Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
import time

from football_analysis.chunk_storage import ChunkStore
from football_analysis.incremental_pipeline import classify_chunks, validate_options
from football_analysis.models import sha256
from football_analysis.pipeline import AnalysisOptions, ResourceMeter
from .compare_teams import evaluate


def main() -> int:
    """Relit les huit sources, publie par segments et vérifie l'audit interne existant.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Validation incrémentale — équipes sur vidéos réelles
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=Path, default=Path("data/runs"))
    parser.add_argument("--videos", type=Path, default=Path("data/videos"))
    parser.add_argument("--output", type=Path, default=Path("data/runs/chunk-team-validation.json"))
    parser.add_argument("--fit-seconds", type=float, default=30, help="durée de référence ; 10 s pour un contrôle sur la suite du clip")
    args = parser.parse_args()
    options = AnalysisOptions(chunk_seconds=10, device="cuda:0", team_fit_seconds=args.fit_seconds)
    validate_options(options)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    audit_path = Path(__file__).with_name("team-audit.json")
    audit = json.loads(audit_path.read_bytes())
    results = {"kind": "real-video-classification-on-frozen-tracks", "date": "2026-11-23",
               "fitSeconds": args.fit_seconds, "annotationsSha256": sha256(audit_path), "videos": [],
               "strictPerClipGateFailures": []}
    failures = []
    for entry in audit["videos"]:
        source = args.videos / (entry["name"] + ".mp4")
        if sha256(source) != entry["sha256"]:
            raise ValueError(f"Source différente de l'audit : {entry['name']}")
        original = json.loads((args.runs / entry["candidate"]).read_bytes())
        prefix = "chunk-teams-" if args.fit_seconds == 30 else f"chunk-teams-fit{args.fit_seconds:g}-"
        database = args.runs / (prefix + entry["name"] + ".sqlite")
        header = {key: original[key] for key in ("format", "version", "source", "analysis", "pitch")}
        with ChunkStore(database, header) as store:
            if store.checkpoint() is None:
                part = []
                seq = 0
                for index, original_frame in enumerate(original["frames"]):
                    frame = copy.deepcopy(original_frame)
                    for obj in frame["objects"]:
                        obj.update(team=None, teamConfidence=None)
                    part.append(frame)
                    if frame["time"] - part[0]["time"] >= 10 - .09 or index == len(original["frames"]) - 1:
                        replay = [{"crops": [[obj["id"], obj["box"]] for obj in frame["objects"] if obj["role"] == "player"]}
                                  for frame in part]
                        store.commit_raw(seq, part, replay, {"seq": seq, "index": part[-1]["index"]})
                        seq += 1
                        part = []
                store.save_state(timing={"duration": original["source"]["duration"]})
            started = time.perf_counter()
            classify_chunks(source, store, options, "cuda:0", ResourceMeter("cuda:0"), lambda *args: None)
            candidate = {"frames": [frame for chunk in store.iter_ready() for frame in chunk]}
            result = {"name": entry["name"], "sourceSha256": entry["sha256"],
                      "baseline": evaluate(original, entry["samples"]), "candidate": evaluate(candidate, entry["samples"]),
                      "classificationSeconds": round(time.perf_counter() - started, 2)}
            results["videos"].append(result)
            print(json.dumps(result, ensure_ascii=False), flush=True)
            if result["candidate"]["wrong"] > result["baseline"]["wrong"] or result["candidate"]["unknown"] > result["baseline"]["unknown"]:
                failures.append(entry["name"])
        results["strictPerClipGateFailures"] = list(failures)
        args.output.write_bytes((json.dumps(results, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())
