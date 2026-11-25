"""Ligne de commande : télécharger les poids, analyser une vidéo, lancer le serveur du visualiseur.

    python -m football_analysis models
    python -m football_analysis analyse match.mp4 -o match.tracking.sqlite
    python -m football_analysis serve

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .models import DATA_DIR, MODELS_DIR, MODEL_FILES, download_models, missing_models, verified_models, backbone_directory

#: Racine du dépôt, qui contient visualizer.html.
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]

#: Licence du serveur et adresse de son code source complet, renvoyées par /api/health : un serveur
#: offert à d'autres par le réseau doit leur proposer son code (AGPL-3.0, section 13).
SOURCE_OFFER = {"license": "AGPL-3.0-only", "source": "https://github.com/bilelkhlif/footballsimulator"}


def build_options(arguments: argparse.Namespace):
    """Traduit les options de la ligne de commande en réglages d'analyse.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — ligne de commande
    """
    from .pipeline import AnalysisOptions

    return AnalysisOptions(models_dir=Path(arguments.models), target_fps=arguments.fps, device=arguments.device,
                           use_ball_model=not arguments.no_ball_model, team_backbone=arguments.teams,
                           max_seconds=getattr(arguments, "max_seconds", None),
                           chunk_seconds=arguments.chunk_seconds, team_fit_seconds=arguments.team_fit_seconds,
                           reference_calibration=(Path(arguments.reference_calibration)
                                                  if getattr(arguments, "reference_calibration", None) else None))


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
    from .chunk_storage import ChunkStore
    from .incremental_pipeline import analyse_to_store

    disable_ultralytics_analytics()
    video = Path(arguments.video)
    output = Path(arguments.output or video.with_suffix(".tracking.sqlite"))
    database = output if output.suffix == ".sqlite" else output.with_suffix(".sqlite")

    def report(stage: str, fraction: float | None, message: str) -> None:
        """Affiche la progression sur une ligne."""
        percent = "" if fraction is None else f" {fraction:4.0%}"
        print(f"\r[{stage}]{percent} {message}".ljust(70), end="", file=sys.stderr, flush=True)

    from .reference_calibration import ReferenceError

    try:
        document = analyse_to_store(video, database, build_options(arguments), report)
    except ReferenceError as error:
        print(file=sys.stderr)
        print(f"Calibration de référence refusée : {error}", file=sys.stderr)
        return 2
    print(file=sys.stderr)
    if output != database:
        # Export facultatif compatible avec les anciens outils, sans chargement du match entier.
        temporary = output.with_suffix(output.suffix + ".tmp")
        with ChunkStore(database) as store, temporary.open("wb") as stream:
            for block in store.iter_document():
                stream.write(block)
        temporary.replace(output)
    print(json.dumps(document["metrics"], ensure_ascii=False, indent=2))
    print(f"Document écrit : {output}", file=sys.stderr)
    return 0


def describe_health(device: str, options, queued: int) -> dict:
    """État renvoyé par /api/health : matériel, modèles, file d'attente, licence et code source.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — état du serveur et offre du code source (AGPL-3.0, section 13)
    """
    return {"ok": True, "device": device, "missingModels": missing_models(options.models_dir),
            "teamEmbeddings": options.team_backbone, "analysisFps": options.target_fps,
            "queued": queued, **SOURCE_OFFER}


def command_serve(arguments: argparse.Namespace) -> int:
    """Lance le serveur local du visualiseur et sa file d'analyses.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — ligne de commande
    """
    from .server import DEFAULT_ALLOWED_ORIGINS, VisualizerServer, is_loopback

    if not is_loopback(arguments.host) and not arguments.allow_network:
        print(f"Adresse d'écoute refusée : {arguments.host} n'est pas la boucle locale. Les vidéos téléversées "
              "et les analyses seraient exposées au réseau ; ajoutez --allow-network seulement en connaissance de cause.",
              file=sys.stderr)
        return 2
    from .jobs import AnalysisWorker, JobStore
    from .incremental_pipeline import analyse_to_store
    from .pipeline import choose_device, probe_video

    disable_ultralytics_analytics()
    options = build_options(arguments)
    store = JobStore(Path(arguments.jobs))
    pending = store.recover()
    worker = AnalysisWorker(store, lambda path, output, progress, name: analyse_to_store(path, output, options, progress, name), chunked=True)
    worker.start()
    for job_id in pending:
        worker.submit(job_id)
    device = choose_device(options.device)

    def health() -> dict:
        """État du serveur, pour la page du visualiseur."""
        return describe_health(device, options, worker.jobs.qsize())

    origins = arguments.allow_origin or list(DEFAULT_ALLOWED_ORIGINS)
    server = VisualizerServer((arguments.host, arguments.port), store, worker, REPOSITORY_ROOT, health, probe=probe_video,
                              allowed_origins=origins)
    local = f"http://{arguments.host}:{arguments.port}"
    print(f"Visualiseur de match : {local}/visualizer.html (calcul : {device})")
    print(f"Pages autorisées : {', '.join(origins)} ; depuis GitHub Pages : "
          f"https://bilelkhlif.github.io/footballsimulator/visualizer.html?serveur={local}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


def command_export(arguments: argparse.Namespace) -> int:
    """Exporte une analyse terminée en fichiers statiques pour le mode démo du visualiseur.

    Sans --video, la vidéo est celle du dossier d'analyse du serveur (status.json à côté de la base).

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — ligne de commande (export statique)
    """
    from .static_export import ExportError, export_analysis, update_catalog

    database = Path(arguments.database)
    video = Path(arguments.video) if arguments.video else None
    status_path = database.parent / "status.json"
    if video is None and status_path.is_file():
        status = json.loads(status_path.read_text(encoding="utf-8"))
        video = database.parent / status.get("source", "")
    if video is None:
        print("Vidéo source requise : --video <fichier>.", file=sys.stderr)
        return 2
    output = Path(arguments.output)
    analysis_id = arguments.id or output.name
    try:
        manifest = export_analysis(database, output, video=video, analysis_id=analysis_id, title=arguments.title,
                                   overwrite=arguments.replace, allow_other_video=arguments.other_video)
        if arguments.catalog:
            check = None if arguments.calibration_check is None else {
                "verdict": arguments.calibration_check, "note": arguments.calibration_note or ""}
            gallery = {key: value for key, value in (
                ("category", arguments.category), ("credit", arguments.credit), ("order", arguments.order),
                ("calibrationCheck", check)) if value is not None}
            update_catalog(Path(arguments.catalog), output, manifest, arguments.description, gallery=gallery)
    except ExportError as error:
        print(f"Export impossible : {error}", file=sys.stderr)
        return 1
    storage = manifest["storage"]
    print(f"Export écrit : {output} ({storage['frameCount']} images, {len(storage['chunks'])} segments, "
          f"{storage['tracks']['count']} trajectoires)")
    return 0


def command_verify_export(arguments: argparse.Namespace) -> int:
    """Vérifie un export statique : manifeste, empreintes, segments et trajectoires.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — ligne de commande (export statique)
    """
    from .static_export import verify_bundle

    problems = verify_bundle(Path(arguments.directory))
    for problem in problems[:20]:
        print(f"- {problem}", file=sys.stderr)
    print("Export valide." if not problems else f"Export invalide : {len(problems)} défaut(s).")
    return 0 if not problems else 1


def command_demo(arguments: argparse.Namespace) -> int:
    """Régénère la démonstration publique synthétique (vidéo, base locale, export, catalogue).

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — ligne de commande (démonstration)
    """
    from .demo_match import build_demo, describe

    manifest = build_demo(Path(arguments.output), Path(arguments.work))
    print(f"Démonstration écrite : {describe(manifest)}")
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
    models = commands.add_parser("models", help="vérifier les poids approuvés ; --download autorise leur téléchargement")
    models.add_argument("--download", action="store_true", help="télécharger explicitement les poids absents, puis vérifier leurs octets")
    models.add_argument("--teams", choices=("siglip", "clip"), default="siglip", help="plongements à vérifier ; clip réservé à la recherche")
    analyse = commands.add_parser("analyse", help="analyser une vidéo")
    analyse.add_argument("video")
    analyse.add_argument("-o", "--output", help="base de suivi (par défaut : <vidéo>.tracking.sqlite) ; .json pour un export")
    analyse.add_argument("--max-seconds", type=float, help="n'analyser que le début de la vidéo")
    analyse.add_argument("--reference-calibration", metavar="FICHIER",
                         help="calibration de référence annotée (JSON) : remplace les points clés, comparés à chaque image")
    serve = commands.add_parser("serve", help="lancer le serveur du visualiseur")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--jobs", default=str(DATA_DIR / "jobs"), help="dossier des analyses (permet un essai isolé)")
    serve.add_argument("--allow-origin", action="append", default=None, metavar="ORIGINE",
                       help="page web autorisée à utiliser ce serveur (par défaut : https://bilelkhlif.github.io) ; répétable")
    serve.add_argument("--allow-network", action="store_true",
                       help="accepte une adresse d'écoute autre que la boucle locale (déconseillé : vidéos privées)")
    export = commands.add_parser("export", help="exporter une analyse terminée en fichiers statiques (mode démo)")
    export.add_argument("database", help="base d'analyse terminée (.sqlite)")
    export.add_argument("output", help="dossier de l'export")
    export.add_argument("--video", help="vidéo analysée, MP4 ou WebM (par défaut : celle du dossier d'analyse)")
    export.add_argument("--id", help="identifiant de l'export (par défaut : le nom du dossier)")
    export.add_argument("--title", help="titre affiché dans le visualiseur")
    export.add_argument("--catalog", help="catalogue à mettre à jour, par exemple ../demo/index.json")
    export.add_argument("--description", help="description dans le catalogue")
    export.add_argument("--category", help="catégorie affichée dans la galerie (vue large, coup franc…)")
    export.add_argument("--credit", help="crédit court de la vidéo affiché sur la carte de la galerie")
    export.add_argument("--order", type=int, help="rang dans la galerie (0 : match ouvert par défaut)")
    export.add_argument("--calibration-check", choices=("approximate", "rejected", "exact"),
                        help="verdict du contrôle visuel de la calibration ; rejected masque les positions 3D")
    export.add_argument("--calibration-note", help="constat du contrôle visuel, affiché dans le visualiseur")
    export.add_argument("--replace", action="store_true", help="remplace un export existant")
    export.add_argument("--other-video", action="store_true", help="accepte une vidéo transcodée, différente de la source")
    verify = commands.add_parser("verify-export", help="vérifier un export statique")
    verify.add_argument("directory")
    demo = commands.add_parser("demo", help="régénérer la démonstration synthétique publique")
    demo.add_argument("--output", default=str(REPOSITORY_ROOT / "demo"), help="dossier public de la démonstration")
    demo.add_argument("--work", default=str(DATA_DIR / "demo"), help="dossier de travail local (base SQLite)")
    for sub in (analyse, serve):
        sub.add_argument("--models", default=str(MODELS_DIR), help="dossier des poids")
        sub.add_argument("--fps", type=float, default=12.5, help="cadence d'analyse, en images par seconde")
        sub.add_argument("--device", help="cuda:0, cpu… (par défaut : le GPU s'il existe)")
        sub.add_argument("--no-ball-model", action="store_true", help="sans le modèle dédié au ballon")
        sub.add_argument("--teams", choices=("siglip", "clip"), default="siglip", help="modèle de plongements des équipes")
        sub.add_argument("--chunk-seconds", type=float, default=10, help="durée des segments, entre 0,5 et 30 s")
        sub.add_argument("--team-fit-seconds", type=float, default=30, help="amorçage des équipes, entre 1 et 120 s")
    arguments = parser.parse_args(argv)
    if arguments.command == "models":
        try:
            if arguments.download:
                print("Téléchargement explicite depuis les sources de models.lock.json ; les poids restent soumis aux conditions de leurs auteurs (THIRD_PARTY_NOTICES.md).")
                for path in download_models():
                    print(f"Téléchargé et vérifié : {path.name}")
            print(json.dumps(verified_models(MODELS_DIR, tuple(MODEL_FILES)), ensure_ascii=False))
            backbone_directory(arguments.teams, download=arguments.download)
        except (ValueError, RuntimeError) as error:
            # Un poids refusé n'est jamais chargé : la cause suffit, sans trace Python.
            print(f"Modèles non vérifiés : {error}", file=sys.stderr)
            if not arguments.download:
                print("Poids absents : « python -m football_analysis models --download » ; poids modifiés : supprimez-les puis relancez.",
                      file=sys.stderr)
            return 1
        print(f"Poids vérifiés, plongements {arguments.teams} épinglés et vérifiés.")
        return 0
    return {"analyse": command_analyse, "serve": command_serve, "export": command_export,
            "verify-export": command_verify_export, "demo": command_demo}[arguments.command](arguments)


if __name__ == "__main__":
    sys.exit(main())
