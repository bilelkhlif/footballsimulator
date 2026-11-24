"""Serveur local du visualiseur de match : téléversement, file d'analyses, résultats et pages.

Bibliothèque standard seulement (http.server) : aucune dépendance de plus pour un serveur local.

API (JSON) :

- GET  /api/health : état du serveur et des poids ;
- POST /api/analyses?name=<fichier> : corps = la vidéo brute ; renvoie 202 et l'identifiant ;
- GET  /api/analyses : liste des analyses ;
- GET  /api/analyses/<id> : état et progression d'une analyse ;
- GET  /api/analyses/<id>/tracking : document de suivi (contract.py) ;
- GET  /api/analyses/<id>/manifest : en-tête et disponibilité, sans images ;
- GET  /api/analyses/<id>/frames?from=0&to=17 : fenêtre horodatée de trente secondes au plus ;
- POST /api/analyses/<id>/resume : reprise explicite d'une analyse interrompue ;
- POST /api/analyses/<id>/interrupt : interruption au prochain lot d'images, reprenable ensuite ;
- GET  /api/analyses/<id>/video : vidéo source, avec lecture partielle (Range) pour l'avance rapide.

Pages : visualizer.html et les dossiers src/, assets/ et demo/ du dépôt. Le serveur ne sert ni index.html,
ni sw.js, ni sw.mjs, ni manifest.json : le Service Worker de l'application AR ne peut donc pas s'installer sur
son origine, où il mettrait en cache les réponses de l'API et casserait la lecture partielle.

Le serveur écoute 127.0.0.1 par défaut : il n'est pas prévu pour être exposé sur un réseau.

Sécurité, pour une page publique (GitHub Pages) qui utilise ce serveur local :

- l'en-tête Host doit nommer la boucle locale (127.0.0.1, localhost, [::1]) : protection contre le
  rebond DNS ;
- une requête qui porte un en-tête Origin n'est acceptée que de la page servie ici ou d'une origine
  autorisée (par défaut https://bilelkhlif.github.io) : un autre site ne peut ni lire les résultats,
  ni téléverser, ni lancer ou reprendre une analyse ;
- une requête intersite sans Origin (balise vidéo ou image d'un autre site) est refusée sur l'API ;
- les en-têtes CORS ne sont envoyés qu'aux origines autorisées, avec l'accord « Private Network
  Access » de Chrome pour l'accès d'une page publique à la boucle locale.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import json
import mimetypes
import re
import shutil
import sqlite3
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import ipaddress
from typing import Any, Callable, Iterable
from urllib.parse import parse_qs, unquote, urlsplit

from .jobs import AnalysisWorker, JobStore
from .chunk_storage import ChunkStore

#: Extensions vidéo acceptées et leur type MIME.
VIDEO_TYPES = {
    ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
    ".mkv": "video/x-matroska", ".ogv": "video/ogg", ".avi": "video/x-msvideo",
}

#: Types des fichiers statiques : fixés ici, car Windows associe parfois .js à text/plain.
STATIC_TYPES = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2",
}

#: Chemins statiques servis, relatifs à la racine du dépôt.
STATIC_PREFIXES = ("/visualizer.html", "/src/", "/assets/", "/demo/")

#: Page publique autorisée par défaut à utiliser le serveur local : le site GitHub Pages du projet.
DEFAULT_ALLOWED_ORIGINS = ("https://bilelkhlif.github.io",)

#: Noms de la boucle locale acceptés dans l'en-tête Host.
LOOPBACK_NAMES = ("127.0.0.1", "localhost", "[::1]")

#: Taille maximale d'une vidéo téléversée, en octets (4 Go).
MAX_UPLOAD_BYTES = 4 * 2 ** 30

ROUTE = re.compile(r"^/api/analyses/(?P<id>[^/]+)(?:/(?P<part>tracking|video|manifest|frames|resume|interrupt))?$")


def is_loopback(host: str) -> bool:
    """Vrai si l'adresse d'écoute est la boucle locale (127.0.0.0/8, ::1 ou localhost).

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — serveur (sécurité)
    """
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host.strip("[]")).is_loopback
    except ValueError:
        return False


def parse_range(header: str | None, size: int) -> tuple[int, int] | None:
    """Lit un en-tête Range « bytes=début-fin » ; renvoie l'intervalle inclus, ou None.

    Raises:
        ValueError: intervalle hors du fichier.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — serveur (lecture partielle)
    """
    if not header:
        return None
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", header.strip())
    if not match or match.groups() == ("", ""):
        return None
    start_text, end_text = match.groups()
    if start_text == "":
        length = int(end_text)
        start, end = max(size - length, 0), size - 1
    else:
        start = int(start_text)
        end = min(int(end_text), size - 1) if end_text else size - 1
    if start >= size or start > end:
        raise ValueError("intervalle hors du fichier")
    return start, end


class VisualizerServer(ThreadingHTTPServer):
    """Serveur HTTP du visualiseur, avec sa file d'analyses.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — serveur
    """

    daemon_threads = True

    def __init__(self, address: tuple[str, int], store: JobStore, worker: AnalysisWorker, static_root: Path,
                 health: Callable[[], dict[str, Any]], max_upload: int = MAX_UPLOAD_BYTES,
                 probe: Callable[[Path], Any] | None = None, allowed_origins: Iterable[str] = DEFAULT_ALLOWED_ORIGINS):
        """Prépare le serveur.

        Args:
            address: adresse et port d'écoute.
            store: dossiers des analyses.
            worker: fil de traitement des analyses.
            static_root: racine du dépôt, pour les pages.
            health: fonction qui décrit l'état du serveur (matériel, poids).
            max_upload: taille maximale d'une vidéo, en octets.
            probe: vérifie qu'une vidéo est lisible (lève une erreur sinon).
            allowed_origins: pages publiques autorisées à utiliser ce serveur (CORS).

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — serveur
        """
        super().__init__(address, RequestHandler)
        self.store = store
        self.worker = worker
        self.static_root = Path(static_root).resolve()
        self.health = health
        self.max_upload = max_upload
        self.probe = probe or (lambda path: None)
        host, port = self.server_address[0], self.server_address[1]
        names = [*LOOPBACK_NAMES, *([] if is_loopback(str(host)) else [str(host)])]
        self.allowed_hosts = {f"{name}:{port}" for name in names}
        self.local_origins = {f"http://{name}:{port}" for name in names}
        self.allowed_origins = {origin.rstrip("/") for origin in allowed_origins}


class RequestHandler(BaseHTTPRequestHandler):
    """Répond aux requêtes de l'API et sert les pages du visualiseur.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — serveur (requêtes)
    """

    server: VisualizerServer
    server_version = "FootballAnalysis/1"

    def log_message(self, format: str, *args: Any) -> None:
        """Journal discret : seules les erreurs sont affichées.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — serveur (requêtes)
        """
        if len(args) > 1 and str(args[1]).startswith(("4", "5")):
            super().log_message(format, *args)

    def _origin_allowed(self, origin: str) -> bool:
        """Vrai pour la page servie par ce serveur ou une origine publique autorisée.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Analyse vidéo — serveur (sécurité)
        """
        return origin in self.server.local_origins or origin in self.server.allowed_origins

    def _request_path(self) -> str:
        """Décode une fois le chemin brut, de façon identique pour la sécurité et les routes.

        Chaque appel part de self.path, jamais d'une valeur déjà décodée ; les séparateurs et
        lettres encodés ne peuvent donc changer la route après le contrôle d'accès.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Analyse vidéo — serveur (normalisation des routes)
        """
        return unquote(urlsplit(self.path).path)

    def _refuse(self) -> bool:
        """Refuse une requête d'un hôte inattendu ou d'une origine non autorisée ; vrai si refusée.

        Host : seuls les noms de la boucle locale (rebond DNS). Origin : présent, il doit être
        autorisé. Sans Origin, une requête intersite (balise d'un autre site) n'atteint pas l'API.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Analyse vidéo — serveur (sécurité)
        """
        if self.headers.get("Host", "") not in self.server.allowed_hosts:
            self.send_error_json(HTTPStatus.MISDIRECTED_REQUEST, "Hôte inattendu : ce serveur ne répond qu'à la boucle locale.")
            return True
        origin = self.headers.get("Origin")
        if origin is not None and not self._origin_allowed(origin):
            self.send_error_json(HTTPStatus.FORBIDDEN, "Origine non autorisée : lancez le serveur avec --allow-origin pour cette page.")
            return True
        path = self._request_path()
        if origin is None and self.headers.get("Sec-Fetch-Site") == "cross-site" and path.startswith("/api/"):
            self.send_error_json(HTTPStatus.FORBIDDEN, "Requête intersite refusée.")
            return True
        return False

    def end_headers(self) -> None:
        """Ajoute les en-têtes CORS pour une origine autorisée, puis termine les en-têtes.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Analyse vidéo — serveur (CORS)
        """
        headers = getattr(self, "headers", None)
        origin = headers.get("Origin") if headers is not None else None
        if origin is not None and self._origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        """Répond à la requête préalable CORS, avec l'accord d'accès au réseau privé de Chrome.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Analyse vidéo — serveur (CORS)
        """
        if self._refuse():
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
        requested = [name.strip() for name in self.headers.get("Access-Control-Request-Headers", "").split(",")]
        allowed = [name for name in requested if name.lower() in ("content-type", "range")]
        if allowed:
            self.send_header("Access-Control-Allow-Headers", ", ".join(allowed))
        if self.headers.get("Access-Control-Request-Private-Network") == "true":
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def send_json(self, payload: Any, status: int = HTTPStatus.OK) -> None:
        """Envoie une réponse JSON, jamais mise en cache.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — serveur (requêtes)
        """
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_error_json(self, status: int, message: str) -> None:
        """Envoie une erreur, avec un message lisible par l'utilisateur.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — serveur (requêtes)
        """
        self.send_json({"error": message}, status)

    def send_file(self, path: Path, content_type: str, allow_range: bool = False,
                  extra_headers: dict[str, str] | None = None) -> None:
        """Envoie un fichier, en entier ou par intervalle (Range).

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — serveur (lecture partielle)
        """
        size = path.stat().st_size
        try:
            interval = parse_range(self.headers.get("Range"), size) if allow_range else None
        except ValueError:
            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return
        start, end = interval or (0, size - 1)
        self.send_response(HTTPStatus.PARTIAL_CONTENT if interval else HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(end - start + 1))
        if allow_range:
            self.send_header("Accept-Ranges", "bytes")
        if interval:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Cache-Control", "no-cache")
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if self.command == "HEAD":
            return
        with open(path, "rb") as stream:
            stream.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = stream.read(min(1 << 20, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError):
                    return  # le lecteur vidéo a changé d'intervalle : réponse abandonnée
                remaining -= len(chunk)

    def do_HEAD(self) -> None:
        """Comme GET, sans le corps (le lecteur vidéo s'en sert pour connaître la taille).

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — serveur (requêtes)
        """
        self.do_GET()

    def do_GET(self) -> None:
        """Aiguille une requête GET vers l'API ou les fichiers statiques.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — serveur (requêtes)
        """
        if self._refuse():
            return
        path = self._request_path()
        if path == "/":
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "/visualizer.html")
            self.end_headers()
        elif path == "/api/health":
            self.send_json(self.server.health())
        elif path == "/api/analyses":
            self.send_json(self.server.store.list())
        elif path.startswith("/api/"):
            self.get_analysis(path)
        else:
            self.get_static(path)

    def get_analysis(self, path: str) -> None:
        """Renvoie l'état, le document de suivi ou la vidéo d'une analyse.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — serveur (API)
        """
        match = ROUTE.match(path)
        store = self.server.store
        status = store.get(match["id"]) if match else None
        if status is None:
            self.send_error_json(HTTPStatus.NOT_FOUND, "Analyse introuvable.")
        elif match["part"] is None:
            # « results » : la base des segments existe ; avant, ni manifeste ni fenêtre à demander.
            self.send_json({**status, "results": store.database(match["id"]).is_file()})
        elif match["part"] == "video":
            source = store.source(match["id"])
            self.send_file(source, VIDEO_TYPES.get(source.suffix.lower(), "application/octet-stream"), allow_range=True)
        elif match["part"] in ("manifest", "frames", "tracking") and store.database(match["id"]).is_file():
            self.get_chunked(match["id"], match["part"])
        elif match["part"] in ("manifest", "frames") and status["status"] in ("receiving", "queued", "running"):
            self.send_error_json(HTTPStatus.CONFLICT, "Résultats en cours d'initialisation : aucun segment publié.")
        elif match["part"] != "tracking":
            self.send_error_json(HTTPStatus.NOT_FOUND, "Lecture par fenêtres indisponible pour cette ancienne analyse.")
        elif status["status"] != "done" or not store.tracking(match["id"]).is_file():
            self.send_error_json(HTTPStatus.CONFLICT, "Analyse pas encore terminée.")
        else:
            self.send_file(store.tracking(match["id"]), "application/json; charset=utf-8")

    def get_chunked(self, job_id: str, part: str) -> None:
        """Sert un manifeste, une fenêtre bornée ou un export JSON séquentiel.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — API des analyses longues
        """
        try:
            database = ChunkStore(self.server.store.database(job_id))
        except (ValueError, sqlite3.DatabaseError):
            self.send_error_json(HTTPStatus.CONFLICT, "Résultats en cours d'initialisation ou base incompatible.")
            return
        with database:
            if part == "manifest":
                self.send_json(database.manifest())
            elif part == "frames":
                query = parse_qs(urlsplit(self.path).query)
                try:
                    start, end = float(query["from"][0]), float(query["to"][0])
                    selected = int(query["selected"][0]) if "selected" in query else None
                    if selected is not None and selected < 1:
                        raise ValueError("Identifiant de sélection invalide.")
                    payload = database.window(start, end, selected)
                except (KeyError, ValueError, OverflowError) as error:
                    self.send_error_json(HTTPStatus.BAD_REQUEST, f"Fenêtre invalide : {error}")
                    return
                self.send_json(payload)
            elif not database.manifest()["complete"]:
                self.send_error_json(HTTPStatus.CONFLICT, "Analyse pas encore terminée ; les fenêtres publiées restent disponibles.")
            else:
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Connection", "close")
                self.end_headers()
                if self.command == "HEAD":
                    return
                try:
                    for block in database.iter_document():
                        self.wfile.write(block)
                except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError):
                    return

    def get_static(self, path: str) -> None:
        """Sert une page ou un module du visualiseur, sans sortir des dossiers autorisés.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — serveur (pages)
        """
        root = self.server.static_root
        target = (root / path.lstrip("/")).resolve()
        allowed = path.startswith(STATIC_PREFIXES) and root in target.parents and ".." not in path
        if not allowed or not target.is_file():
            self.send_error_json(HTTPStatus.NOT_FOUND, "Fichier introuvable.")
            return
        content_type = STATIC_TYPES.get(target.suffix.lower()) or mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        # Vidéos de démo : lecture partielle, sinon Chrome ne peut pas se déplacer dans un MP4 non chargé.
        self.send_file(target, content_type, allow_range=target.suffix.lower() in VIDEO_TYPES,
                       extra_headers={"Server-Timing": "football-analysis"})

    def do_POST(self) -> None:
        """Reçoit une vidéo (corps brut), vérifie qu'elle est lisible, puis la met en file.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — serveur (téléversement)
        """
        if self._refuse():
            return
        parts = urlsplit(self.path)
        path = self._request_path()
        match = ROUTE.match(path)
        if match and match["part"] == "interrupt":
            status = self.server.store.get(match["id"])
            if status is None:
                self.send_error_json(HTTPStatus.NOT_FOUND, "Analyse introuvable.")
            else:
                updated = self.server.worker.interrupt(match["id"])
                if updated is None:
                    self.send_error_json(HTTPStatus.CONFLICT, "Seule une analyse en attente ou en cours peut être interrompue.")
                else:
                    self.send_json(updated, HTTPStatus.ACCEPTED)
            return
        if match and match["part"] == "resume":
            status = self.server.store.get(match["id"])
            if status is None:
                self.send_error_json(HTTPStatus.NOT_FOUND, "Analyse introuvable.")
            elif status["status"] not in ("failed", "interrupted") or not status.get("resumable"):
                self.send_error_json(HTTPStatus.CONFLICT, "Cette analyse ne peut pas être reprise dans son état actuel.")
            else:
                if self.server.worker.submit(match["id"]) is False:
                    self.send_error_json(HTTPStatus.CONFLICT, "Cette analyse est déjà en file.")
                else:
                    self.send_json(self.server.store.get(match["id"]), HTTPStatus.ACCEPTED)
            return
        if path != "/api/analyses":
            self.send_error_json(HTTPStatus.NOT_FOUND, "Adresse inconnue.")
            return
        name = Path(parse_qs(parts.query).get("name", ["video.mp4"])[0]).name
        suffix = Path(name).suffix.lower()
        length = int(self.headers.get("Content-Length") or 0)
        if suffix not in VIDEO_TYPES:
            self.send_error_json(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, f"Format non pris en charge : {suffix or 'sans extension'}.")
            return
        if length <= 0 or length > self.server.max_upload:
            self.send_error_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Vidéo vide ou trop volumineuse.")
            return
        store = self.server.store
        job_id, target = store.create(name, suffix)
        with open(target, "wb") as stream:
            remaining = length
            while remaining > 0:
                chunk = self.rfile.read(min(1 << 20, remaining))
                if not chunk:
                    break
                stream.write(chunk)
                remaining -= len(chunk)
        if remaining:
            store.update(job_id, status="failed", error="Téléversement interrompu.")
            self.send_error_json(HTTPStatus.BAD_REQUEST, "Téléversement interrompu.")
            return
        try:
            video = self.server.probe(target)
        except Exception as error:  # vidéo illisible : l'erreur est renvoyée telle quelle
            store.update(job_id, status="failed", error=str(error))
            shutil.rmtree(store.directory(job_id), ignore_errors=True)
            self.send_error_json(HTTPStatus.UNPROCESSABLE_ENTITY, str(error))
            return
        store.update(job_id, video=video)
        self.server.worker.submit(job_id)
        self.send_json(store.get(job_id), HTTPStatus.ACCEPTED)
