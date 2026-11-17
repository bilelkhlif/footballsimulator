"""Ligne de commande : télécharger les poids, analyser une vidéo, lancer le serveur du visualiseur.

    python -m football_analysis models
    python -m football_analysis analyse match.mp4 -o match.tracking.json
    python -m football_analysis serve

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .models import DATA_DIR, MODELS_DIR, download_models, missing_models

#: Racine du dépôt, qui contient visualizer.html.
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def build_options(arguments: argparse.Namespace):
    """Traduit les options de la ligne de commande en réglages d'analyse.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — ligne de commande
    """
    from .pipeline import AnalysisOptions

    return AnalysisOptions(models_dir=Path(arguments.models), target_fps=arguments.fps, device=arguments.device,
                           use_ball_model=not arguments.no_ball_model, team_backbone=arguments.teams,
                           max_seconds=getattr(arguments, "max_seconds", None))


def disable_ultralytics_analytics() -> None:
    """Coupe l'envoi de statistiques d'usage d'Ultralytics, actif par défaut.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — ligne de commande (vie privée)
    """
    from ultralytics import settings

    if settings.get("sync", False):
        settings.update({"sync": False})


def command_analyse(arguments: argparse.Namespace) -> int:
    """Analyse une vidéo et écrit son document de suivi.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — ligne de commande
    """
    from .contract import validate_document
    from .pipeline import analyse_video

    disable_ultralytics_analytics()
    video = Path(arguments.video)
    output = Path(arguments.output or video.with_suffix(".tracking.json"))

    def report(stage: str, fraction: float | None, message: str) -> None:
        """Affiche la progression sur une ligne."""
        percent = "" if fraction is None else f" {fraction:4.0%}"
        print(f"\r[{stage}]{percent} {message}".ljust(70), end="", file=sys.stderr, flush=True)

    document = analyse_video(video, build_options(arguments), report)
    print(file=sys.stderr)
    problems = validate_document(document)
    if problems:
        print("Document invalide :", *problems[:10], sep="\n  ", file=sys.stderr)
        return 1
    output.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(document["metrics"], ensure_ascii=False, indent=2))
    print(f"Document écrit : {output}", file=sys.stderr)
    return 0


def command_serve(arguments: argparse.Namespace) -> int:
    """Lance le serveur local du visualiseur et sa file d'analyses.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — ligne de commande
    """
    from .jobs import AnalysisWorker, JobStore
    from .pipeline import analyse_video, choose_device, probe_video
    from .server import VisualizerServer

    disable_ultralytics_analytics()
    options = build_options(arguments)
    store = JobStore(DATA_DIR / "jobs")
    pending = store.recover()
    worker = AnalysisWorker(store, lambda path, progress, name: analyse_video(path, options, progress, name))
    worker.start()
    for job_id in pending:
        worker.submit(job_id)
    device = choose_device(options.device)

    def health() -> dict:
        """État du serveur, pour la page du visualiseur."""
        return {"ok": True, "device": device, "missingModels": missing_models(options.models_dir),
                "teamEmbeddings": options.team_backbone, "analysisFps": options.target_fps,
                "queued": worker.jobs.qsize()}

    server = VisualizerServer((arguments.host, arguments.port), store, worker, REPOSITORY_ROOT, health, probe=probe_video)
    print(f"Visualiseur de match : http://{arguments.host}:{arguments.port}/visualizer.html (calcul : {device})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


def main(argv: list[str] | None = None) -> int:
    """Point d'entrée de la ligne de commande.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — ligne de commande
    """
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")  # console Windows : accents lisibles
    parser = argparse.ArgumentParser(prog="football_analysis", description="Analyse de vidéos de football.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("models", help="télécharger les poids de Roboflow Sports")
    analyse = commands.add_parser("analyse", help="analyser une vidéo")
    analyse.add_argument("video")
    analyse.add_argument("-o", "--output", help="document de suivi (par défaut : <vidéo>.tracking.json)")
    analyse.add_argument("--max-seconds", type=float, help="n'analyser que le début de la vidéo")
    serve = commands.add_parser("serve", help="lancer le serveur du visualiseur")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    for sub in (analyse, serve):
        sub.add_argument("--models", default=str(MODELS_DIR), help="dossier des poids")
        sub.add_argument("--fps", type=float, default=12.5, help="cadence d'analyse, en images par seconde")
        sub.add_argument("--device", help="cuda:0, cpu… (par défaut : le GPU s'il existe)")
        sub.add_argument("--no-ball-model", action="store_true", help="sans le modèle dédié au ballon")
        sub.add_argument("--teams", choices=("siglip", "clip"), default="siglip", help="modèle de plongements des équipes")
    arguments = parser.parse_args(argv)
    if arguments.command == "models":
        for path in download_models():
            print(f"Téléchargé : {path}")
        return 0
    return {"analyse": command_analyse, "serve": command_serve}[arguments.command](arguments)


if __name__ == "__main__":
    sys.exit(main())
