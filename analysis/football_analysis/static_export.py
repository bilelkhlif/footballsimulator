"""Export statique d'une analyse terminée, lisible par le navigateur sans serveur ni Python.

Le visualiseur lit ces fichiers comme l'API locale : un manifeste, puis des fenêtres de temps
assemblées à partir de segments horodatés (src/visualizer/static-source.mjs). L'export ne garde
aucun chemin local, ni le journal de reprise, ni les états binaires ; chaque fichier écrit est relu,
vérifié et accompagné de son empreinte SHA-256 dans le manifeste.

Format (version 1), adresses relatives au dossier de l'export :

    manifest.json        en-tête, résumé, provenance, index des segments, empreintes
    tracks.json          résumés des trajectoires (sans les votes internes)
    chunks/00000.json    images analysées d'un segment, dans l'ordre du temps
    video.mp4 | .webm    vidéo source, copiée telle quelle

Mémoire bornée : un seul segment est décomprimé à la fois, les résumés de trajectoires sont écrits
au fil de l'eau. Écriture atomique : tout est écrit dans un dossier temporaire voisin, vérifié, puis
renommé ; un export interrompu ne laisse jamais un dossier à moitié écrit à la place de l'ancien.

Schémas formels : src/visualizer/schemas/*.schema.json (JSON Schema 2020-12). Les contrôles
ci-dessous les appliquent sans dépendance ; les tests vérifient les exports avec ces schémas.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path, PureWindowsPath
import re
import shutil
import sqlite3
from typing import Any, Iterable

from . import contract
from .chunk_storage import ChunkStore

#: Format et version d'un export statique (manifeste, segment, trajectoires, catalogue).
FORMAT = "football-tracking-static"
CHUNK_FORMAT = "football-tracking-chunk"
TRACKS_FORMAT = "football-tracking-tracks"
CATALOG_FORMAT = "football-demo-catalog"
VERSION = 1

#: Version de l'exportateur, notée dans la provenance.
EXPORTER_VERSION = 1

#: Vidéos lisibles par les navigateurs, avec leur type MIME.
VIDEO_TYPES = {".mp4": "video/mp4", ".webm": "video/webm"}

#: Identifiant d'un export : il devient un nom de dossier et une partie d'adresse.
EXPORT_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")

#: Chaîne qui ressemble à un chemin local (lecteur Windows, chemin absolu, UNC, file:).
LOCAL_PATH = re.compile(r"^(?:[A-Za-z]:[\\/]|\\\\|/(?!/)|file:)|\\")


class ExportError(Exception):
    """Export impossible ou export invalide ; le message est destiné à l'utilisateur.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (erreurs)
    """


def _number(value: Any, minimum: float | None = None) -> bool:
    """Vrai pour un nombre fini (pas un booléen), au moins égal au minimum s'il est donné.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (contrôles)
    """
    return (isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
            and (minimum is None or value >= minimum))


def _relative_file(value: Any) -> bool:
    """Vrai pour une adresse relative simple à l'intérieur de l'export (ni absolue, ni « .. »).

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (adresses portables)
    """
    return (isinstance(value, str) and bool(value) and value != "." and "\x00" not in value
            and not LOCAL_PATH.search(value) and ":" not in value and not value.startswith(("/", "./"))
            and not PureWindowsPath(value).drive and not PureWindowsPath(value).root
            and ".." not in value.split("/"))


def _bundle_file(directory: Path, relative: Any) -> Path:
    """Résout un fichier relatif et refuse toute sortie par un lien symbolique ou une jonction.

    Le nom est vérifié avant resolve : une adresse UNC ou un lecteur Windows ne déclenche
    aucun accès au réseau ni à un autre volume pendant la vérification.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (confinement des fichiers)
    """
    if not _relative_file(relative):
        raise ValueError(f"Adresse de fichier non relative : {relative!r}")
    try:
        root = Path(directory).resolve()
        target = (root / relative).resolve()
    except (OSError, RuntimeError, ValueError) as error:
        raise ValueError(f"Adresse de fichier illisible : {relative!r}") from error
    if target == root or not target.is_relative_to(root):
        raise ValueError(f"Fichier hors du dossier de l'export : {relative!r}")
    return target


def path_problems(value: Any, where: str = "manifeste") -> list[str]:
    """Liste les chaînes qui ressemblent à un chemin local, où qu'elles soient dans une valeur JSON.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (aucun chemin local)
    """
    if isinstance(value, str):
        return [f"{where} : chemin local interdit ({value[:40]!r})"] if LOCAL_PATH.search(value) else []
    if isinstance(value, dict):
        return [problem for key, item in value.items() for problem in path_problems(item, f"{where}.{key}")]
    if isinstance(value, list):
        return [problem for index, item in enumerate(value) for problem in path_problems(item, f"{where}[{index}]")]
    return []


def manifest_problems(manifest: Any) -> list[str]:
    """Contrôle la structure d'un manifeste d'export (même règles que static-manifest.schema.json).

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (schéma du manifeste)
    """
    if not isinstance(manifest, dict):
        return ["manifeste : objet attendu"]
    problems = []
    if manifest.get("format") != FORMAT or manifest.get("version") != VERSION:
        problems.append(f"manifeste : format attendu {FORMAT} version {VERSION}")
    if not isinstance(manifest.get("id"), str) or not EXPORT_ID.match(manifest["id"]):
        problems.append("manifeste.id invalide")
    if not isinstance(manifest.get("title"), str) or not manifest["title"].strip():
        problems.append("manifeste.title absent")
    if manifest.get("complete") is not True:
        problems.append("manifeste.complete doit être vrai : seule une analyse terminée s'exporte")
    provenance = manifest.get("provenance")
    if not isinstance(provenance, dict) or provenance.get("kind") not in ("analysis", "synthetic"):
        problems.append("manifeste.provenance.kind doit valoir analysis ou synthetic")
    source = manifest.get("source") or {}
    for key in ("width", "height", "fps"):
        if not _number(source.get(key), 0) or source.get(key) == 0:
            problems.append(f"manifeste.source.{key} absent ou nul")
    if not isinstance(source.get("name"), str) or "/" in source["name"] or "\\" in source["name"]:
        problems.append("manifeste.source.name doit être un simple nom de fichier")
    if not isinstance(manifest.get("analysis"), dict) or not _number(manifest["analysis"].get("fps"), 0):
        problems.append("manifeste.analysis.fps absent")
    if manifest.get("pitch") != contract.PITCH:
        problems.append("manifeste.pitch : terrain de 105 × 68 m attendu")
    for key, kind in (("teams", list), ("metrics", dict), ("limitations", list)):
        if not isinstance(manifest.get(key), kind):
            problems.append(f"manifeste.{key} absent")
    storage = manifest.get("storage")
    if not isinstance(storage, dict) or storage.get("kind") != "static":
        return problems + ["manifeste.storage.kind doit valoir static"]
    if not _number(storage.get("chunkSeconds"), 0) or not _number(storage.get("availableUntil"), 0):
        problems.append("manifeste.storage : chunkSeconds et availableUntil requis")
    chunks = storage.get("chunks")
    if not isinstance(chunks, list) or not chunks:
        return problems + ["manifeste.storage.chunks vide"]
    previous_end, frames, sequences = -math.inf, 0, set()
    for position, entry in enumerate(chunks):
        where = f"manifeste.storage.chunks[{position}]"
        if not isinstance(entry, dict):
            problems.append(f"{where} : objet attendu")
            continue
        if not isinstance(entry.get("seq"), int) or entry["seq"] < 0 or entry["seq"] in sequences:
            problems.append(f"{where}.seq invalide ou dupliqué")
        sequences.add(entry.get("seq"))
        if not _relative_file(entry.get("file")):
            problems.append(f"{where}.file doit être une adresse relative")
        if not (_number(entry.get("start"), 0) and _number(entry.get("end"), 0)) or entry["end"] < entry["start"] \
                or entry["start"] <= previous_end:
            problems.append(f"{where} : intervalle de temps invalide ou non croissant")
        else:
            previous_end = entry["end"]
        if not isinstance(entry.get("frames"), int) or entry["frames"] < 1:
            problems.append(f"{where}.frames invalide")
        else:
            frames += entry["frames"]
        problems.extend(_file_entry_problems(entry, where))
    if storage.get("frameCount") != frames:
        problems.append("manifeste.storage.frameCount ne correspond pas aux segments")
    if _number(storage.get("availableUntil")) and abs(storage["availableUntil"] - previous_end) > 1e-6:
        problems.append("manifeste.storage.availableUntil ne correspond pas au dernier segment")
    tracks = storage.get("tracks")
    if not isinstance(tracks, dict) or not _relative_file(tracks.get("file")) or not isinstance(tracks.get("count"), int):
        problems.append("manifeste.storage.tracks invalide")
    else:
        problems.extend(_file_entry_problems(tracks, "manifeste.storage.tracks"))
    video = manifest.get("video")
    if not isinstance(video, dict) or not _relative_file(video.get("file")) or video.get("type") not in VIDEO_TYPES.values():
        problems.append("manifeste.video invalide : fichier relatif MP4 ou WebM attendu")
    else:
        problems.extend(_file_entry_problems(video, "manifeste.video"))
    files = manifest.get("files", {})
    if not isinstance(files, dict):
        problems.append("manifeste.files doit être un objet de fichiers joints")
    else:
        for name, entry in files.items():
            where = f"manifeste.files[{name!r}]"
            if not isinstance(entry, dict) or not _relative_file(entry.get("file")):
                problems.append(f"{where}.file doit être une adresse relative")
            else:
                problems.extend(_file_entry_problems(entry, where))
    return problems


def _file_entry_problems(entry: dict, where: str) -> list[str]:
    """Contrôle la taille et l'empreinte annoncées d'un fichier de l'export.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (intégrité)
    """
    problems = []
    if not isinstance(entry.get("bytes"), int) or entry["bytes"] < 1:
        problems.append(f"{where}.bytes invalide")
    if not isinstance(entry.get("sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]):
        problems.append(f"{where}.sha256 invalide")
    return problems


def frame_problems(frames: Iterable[dict], previous_time: float, where: str) -> tuple[list[str], float]:
    """Contrôle les images d'un segment avec le contrat de données ; renvoie aussi le dernier instant.

    Les instants doivent croître strictement d'un segment à l'autre.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (contrôle des images)
    """
    problems = []
    for position, frame in enumerate(frames):
        if not isinstance(frame, dict):
            problems.append(f"{where}.frames[{position}] : objet attendu")
            continue
        found = contract._frame_problems(frame, position, previous_time)  # pylint: disable=protected-access
        if _number(frame.get("time")) and frame["time"] <= previous_time:
            found.append(f"frames[{position}].time non strictement croissant")
        if not isinstance(frame.get("index"), int) or frame["index"] < 0:
            found.append(f"frames[{position}].index invalide")
        problems.extend(f"{where}.{problem}" for problem in found)
        if _number(frame.get("time")):
            previous_time = frame["time"]
    return problems, previous_time


def track_problems(track: Any, where: str) -> list[str]:
    """Contrôle le résumé public d'une trajectoire.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (contrôle des trajectoires)
    """
    if not isinstance(track, dict):
        return [f"{where} : objet attendu"]
    problems = []
    if not isinstance(track.get("id"), int) or track["id"] < 1:
        problems.append(f"{where}.id invalide")
    if track.get("role") not in (*contract.ROLES, None):
        problems.append(f"{where}.role invalide")
    if track.get("team") not in (None, 0, 1):
        problems.append(f"{where}.team invalide")
    if not (_number(track.get("firstTime"), 0) and _number(track.get("lastTime"), 0)) or track["lastTime"] < track["firstTime"]:
        problems.append(f"{where} : firstTime et lastTime invalides")
    if "distanceM" in track and not _number(track["distanceM"], 0):
        problems.append(f"{where}.distanceM invalide")
    if "roleVotes" in track:
        problems.append(f"{where} : votes internes interdits dans l'export")
    return problems


def catalog_problems(catalog: Any) -> list[str]:
    """Contrôle le catalogue des exports proposés en démonstration (demo/index.json).

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (catalogue)
    """
    if not isinstance(catalog, dict) or catalog.get("format") != CATALOG_FORMAT or catalog.get("version") != VERSION:
        return [f"catalogue : format attendu {CATALOG_FORMAT} version {VERSION}"]
    matches = catalog.get("matches")
    if not isinstance(matches, list):
        return ["catalogue.matches absent"]
    problems, seen = [], set()
    for position, entry in enumerate(matches):
        where = f"catalogue.matches[{position}]"
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str) or not EXPORT_ID.match(entry["id"]) \
                or entry["id"] in seen:
            problems.append(f"{where}.id invalide ou dupliqué")
            continue
        seen.add(entry["id"])
        if not _relative_file(entry.get("path")) or not entry["path"].endswith("/"):
            problems.append(f"{where}.path doit être un dossier relatif terminé par /")
        if entry.get("kind") not in ("analysis", "synthetic"):
            problems.append(f"{where}.kind doit valoir analysis ou synthetic")
        if not isinstance(entry.get("title"), str) or not entry["title"].strip():
            problems.append(f"{where}.title absent")
        problems.extend(_gallery_problems(entry, where))
        problems.extend(path_problems(entry, where))
    return problems


#: Verdicts du contrôle humain de la calibration, par superposition des lignes du terrain à l'image :
#: « approximate » (lignes proches, écart de quelques mètres), « rejected » (calibration fausse :
#: le visualiseur masque positions, vitesses et distances), « exact » (vidéo synthétique).
CALIBRATION_VERDICTS = ("approximate", "rejected", "exact")


def _gallery_problems(entry: dict, where: str) -> list[str]:
    """Contrôle les champs facultatifs de la galerie : catégorie, vignette, crédit, ordre, qualité, contrôle.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — export statique (galerie)
    """
    problems = []
    for key in ("category", "credit"):
        if key in entry and (not isinstance(entry[key], str) or not entry[key].strip()):
            problems.append(f"{where}.{key} doit être un texte")
    if "thumbnail" in entry and not _relative_file(entry["thumbnail"]):
        problems.append(f"{where}.thumbnail doit être un fichier relatif")
    if "order" in entry and (not isinstance(entry["order"], int) or isinstance(entry["order"], bool) or entry["order"] < 0):
        problems.append(f"{where}.order doit être un entier positif")
    check = entry.get("calibrationCheck")
    if check is not None and (not isinstance(check, dict) or check.get("verdict") not in CALIBRATION_VERDICTS
                              or not isinstance(check.get("note"), str)):
        problems.append(f"{where}.calibrationCheck : verdict {CALIBRATION_VERDICTS} et note attendus")
    quality = entry.get("quality")
    if quality is not None and (not isinstance(quality, dict)
                                or any(value is not None and not _number(value, 0) for value in quality.values())):
        problems.append(f"{where}.quality : nombres positifs ou null attendus")
    return problems


def gallery_quality(metrics: dict) -> dict:
    """Indicateurs des cartes de la galerie, lus dans les mesures de l'export (rien n'est saisi à la main).

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — export statique (galerie)
    """
    detection, tracking = metrics.get("detection") or {}, metrics.get("tracking") or {}
    calibration, positions = metrics.get("calibration") or {}, metrics.get("positions") or {}
    identity = metrics.get("identity") or {}
    shots = tracking.get("shots")
    return {
        "playersPerFrame": (detection.get("peoplePerFrame") or {}).get("player"),
        "ballShare": detection.get("ballFrameShare"),
        "calibratedShare": calibration.get("calibratedShare"),
        "medianTrackSeconds": tracking.get("medianTrackSeconds"),
        "uncertainIdentitySeconds": identity.get("uncertainSeconds"),
        "implausibleSpeedShare": positions.get("implausibleSpeedShare"),
        "cuts": None if shots is None else max(0, shots - 1),
    }


def _write_json(path: Path, value: Any) -> tuple[str, int]:
    """Écrit une valeur JSON compacte ; renvoie son empreinte SHA-256 et sa taille.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (écriture)
    """
    data = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return hashlib.sha256(data).hexdigest(), len(data)


def _digest_file(path: Path) -> tuple[str, int]:
    """Empreinte SHA-256 et taille d'un fichier, lu par blocs.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (intégrité)
    """
    digest, size = hashlib.sha256(), 0
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
            size += len(block)
    return digest.hexdigest(), size


def _public_source(source: dict, video_name: str) -> dict:
    """Description publique de la source : seul le nom du fichier est gardé, jamais son chemin.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (aucun chemin local)
    """
    public = {key: value for key, value in source.items() if key not in ("path", "directory")}
    public["name"] = Path(str(source.get("name") or video_name)).name
    return public


def _provenance(store_signature: Any, header: dict, provided: dict | None) -> dict:
    """Provenance explicite : outil d'export, analyse d'origine, empreintes et versions.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (provenance)
    """
    provenance = {"kind": "analysis", **(provided or {})}
    provenance["exporter"] = {"name": "football_analysis.static_export", "version": EXPORTER_VERSION}
    provenance["exportedAt"] = (provided or {}).get("exportedAt") or datetime.now(timezone.utc).isoformat(timespec="seconds")
    provenance.setdefault("analysisCreatedAt", header.get("analysis", {}).get("createdAt"))
    if isinstance(store_signature, dict) and provenance["kind"] == "analysis":
        provenance["analysis"] = {key: store_signature.get(key) for key in
                                  ("sourceSha256", "weights", "implementation", "versions", "settings")
                                  if key in store_signature}
    return provenance


def export_analysis(database: Path, output: Path, *, video: Path, analysis_id: str, title: str | None = None,
                    provenance: dict | None = None, overwrite: bool = False, allow_other_video: bool = False,
                    extra_files: dict[str, Path] | None = None) -> dict:
    """Exporte une analyse terminée vers un dossier statique ; renvoie le manifeste écrit.

    Args:
        database: base SQLite d'une analyse terminée (chunk_storage.ChunkStore).
        output: dossier de l'export ; remplacé seulement avec overwrite.
        video: vidéo source, MP4 ou WebM ; elle doit être celle qui a été analysée.
        analysis_id: identifiant de l'export (minuscules, chiffres et tirets).
        title: titre affiché ; par défaut, le nom de la vidéo.
        provenance: compléments de provenance (par exemple kind="synthetic" et le générateur).
        overwrite: remplace un export existant, de façon atomique.
        allow_other_video: accepte une vidéo différente de la source analysée (transcodage), signalé.
        extra_files: fichiers publics à joindre (nom relatif → chemin), par exemple une affiche.

    Raises:
        ExportError: base absente, illisible, incomplète ou invalide ; vidéo refusée ; export invalide.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique
    """
    database, output, video = Path(database), Path(output), Path(video)
    if not EXPORT_ID.match(analysis_id):
        raise ExportError("Identifiant d'export invalide : minuscules, chiffres et tirets, 64 caractères au plus.")
    if not database.is_file():
        raise ExportError(f"Base d'analyse introuvable : {database.name}")
    suffix = video.suffix.lower()
    if suffix not in VIDEO_TYPES:
        raise ExportError("Vidéo non lisible par les navigateurs : convertissez-la en MP4 (H.264) ou en WebM.")
    if not video.is_file():
        raise ExportError(f"Vidéo source introuvable : {video.name}")
    if output.exists() and not overwrite:
        raise ExportError(f"Le dossier {output.name} existe déjà : ajoutez --remplacer pour le remplacer.")
    try:
        store = ChunkStore(database)
    except (ValueError, sqlite3.DatabaseError) as error:
        raise ExportError(f"Base d'analyse illisible ou incompatible : {error}") from error
    temporary = output.parent / f".{output.name}.partiel-{os.getpid()}"
    shutil.rmtree(temporary, ignore_errors=True)
    try:
        with store:
            try:
                state = store.manifest()
            except (sqlite3.DatabaseError, ValueError) as error:
                raise ExportError(f"Base d'analyse illisible : {error}") from error
            if not state["complete"]:
                raise ExportError("Analyse incomplète : seules les analyses terminées s'exportent ; reprenez-la d'abord.")
            header, summary, signature = store.header(), store.summary(), store.signature()
            video_digest, video_bytes = _digest_file(video)
            expected = signature.get("sourceSha256") if isinstance(signature, dict) else None
            if expected and expected != video_digest and not allow_other_video:
                raise ExportError("Cette vidéo n'est pas celle qui a été analysée (empreinte différente) : "
                                  "la synchronisation ne serait pas garantie.")
            temporary.mkdir(parents=True)
            chunks, previous_time, frame_count = [], -1.0, 0
            try:
                for seq, _start, _end, frames in store.iter_ready_chunks():
                    if not frames:
                        continue
                    problems, previous_time = frame_problems(frames, previous_time, f"segment {seq}")
                    if problems:
                        raise ExportError(f"Segment {seq} invalide ({len(problems)} défaut(s)) : {problems[0]}")
                    name = f"chunks/{seq:05d}.json"
                    digest, size = _write_json(temporary / name, {
                        "format": CHUNK_FORMAT, "version": VERSION, "seq": seq,
                        "start": frames[0]["time"], "end": frames[-1]["time"], "frames": frames})
                    chunks.append({"seq": seq, "file": name, "start": frames[0]["time"], "end": frames[-1]["time"],
                                   "frames": len(frames), "bytes": size, "sha256": digest})
                    frame_count += len(frames)
            except (sqlite3.DatabaseError, ValueError) as error:
                raise ExportError(f"Base d'analyse corrompue : {error}") from error
            if not chunks:
                raise ExportError("Aucune image analysée à exporter.")
            tracks_digest, tracks_bytes, track_count = _write_tracks(temporary / "tracks.json", store.iter_tracks())
            shutil.copyfile(video, temporary / f"video{suffix}")
            extras = {}
            for relative, path in (extra_files or {}).items():
                try:
                    target = _bundle_file(temporary, relative)
                except ValueError as error:
                    raise ExportError(str(error)) from error
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target)
                digest, size = _digest_file(target)
                extras[relative] = {"file": relative, "bytes": size, "sha256": digest}
            provenance = _provenance(signature, header, provenance)
            if expected and expected != video_digest:
                provenance.setdefault("notes", []).append("Vidéo jointe différente de la source analysée (transcodage).")
            manifest = {
                "format": FORMAT, "version": VERSION, "id": analysis_id,
                "title": title or Path(str(header.get("source", {}).get("name") or video.name)).stem,
                "provenance": provenance,
                "source": _public_source(header.get("source", {}), video.name),
                "analysis": header.get("analysis", {}), "pitch": header.get("pitch"),
                "teams": summary.get("teams", []), "metrics": summary.get("metrics", {}),
                "limitations": summary.get("limitations", []), "complete": True,
                "storage": {"kind": "static", "chunkSeconds": header.get("analysis", {}).get("chunkSeconds", 10),
                            "frameCount": frame_count, "availableUntil": chunks[-1]["end"], "chunks": chunks,
                            "tracks": {"file": "tracks.json", "count": track_count, "bytes": tracks_bytes,
                                       "sha256": tracks_digest}},
                "video": {"file": f"video{suffix}", "type": VIDEO_TYPES[suffix], "bytes": video_bytes, "sha256": video_digest},
                **({"files": extras} if extras else {}),
            }
            problems = manifest_problems(manifest) + path_problems(manifest)
            if problems:
                raise ExportError(f"Manifeste invalide : {problems[0]}")
            _write_json(temporary / "manifest.json", manifest)
        problems = verify_bundle(temporary)
        if problems:
            raise ExportError(f"Vérification de l'export : {problems[0]}")
        _replace_directory(temporary, output)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    return manifest


def _write_tracks(path: Path, tracks: Iterable[dict]) -> tuple[str, int, int]:
    """Écrit les résumés de trajectoires au fil de l'eau, contrôlés un à un.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (trajectoires)
    """
    digest, size, count = hashlib.sha256(), 0, 0
    with open(path, "wb") as stream:
        def emit(text: str) -> None:
            nonlocal size
            data = text.encode("utf-8")
            digest.update(data)
            stream.write(data)
            size += len(data)

        emit(f'{{"format":"{TRACKS_FORMAT}","version":{VERSION},"tracks":[')
        for track in tracks:
            problems = track_problems(track, f"trajectoire {track.get('id')}") + path_problems(track, "trajectoire")
            if problems:
                raise ExportError(f"Trajectoire invalide : {problems[0]}")
            emit(("," if count else "") + json.dumps(track, ensure_ascii=False, separators=(",", ":"), allow_nan=False))
            count += 1
        emit("]}")
    return digest.hexdigest(), size, count


def _replace_directory(temporary: Path, output: Path) -> None:
    """Met le dossier vérifié à la place de l'export, l'ancien n'étant supprimé qu'après le renommage.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (remplacement atomique)
    """
    previous = None
    if output.exists():
        previous = output.parent / f".{output.name}.ancien-{os.getpid()}"
        shutil.rmtree(previous, ignore_errors=True)
        os.replace(output, previous)
    try:
        os.replace(temporary, output)
    except OSError:
        if previous is not None:
            os.replace(previous, output)
        raise
    if previous is not None:
        shutil.rmtree(previous, ignore_errors=True)


def _read_json(path: Path) -> Any:
    """Lit un fichier JSON de l'export, ou lève ValueError avec un message lisible.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (relecture)
    """
    try:
        return json.loads(path.read_bytes().decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError(f"{path.name} illisible : {error}") from error


def verify_bundle(directory: Path) -> list[str]:
    """Vérifie un export entier : manifeste, présence, taille et empreinte des fichiers, segments.

    Renvoie la liste des défauts, vide si l'export est valide. Ne lit qu'un segment à la fois.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (vérification)
    """
    directory = Path(directory)
    try:
        manifest = _read_json(_bundle_file(directory, "manifest.json"))
    except ValueError as error:
        return [str(error)]
    problems = manifest_problems(manifest) + path_problems(manifest)
    if problems:
        return problems
    storage = manifest["storage"]
    entries = [storage["tracks"], manifest["video"], *manifest.get("files", {}).values()]
    for entry in entries:
        try:
            path = _bundle_file(directory, entry["file"])
        except ValueError as error:
            problems.append(str(error))
            continue
        if not path.is_file():
            problems.append(f"fichier manquant : {entry['file']}")
            continue
        digest, size = _digest_file(path)
        if (digest, size) != (entry["sha256"], entry["bytes"]):
            problems.append(f"empreinte ou taille différente : {entry['file']}")
    previous_time = -1.0
    for entry in storage["chunks"]:
        try:
            path = _bundle_file(directory, entry["file"])
        except ValueError as error:
            problems.append(str(error))
            continue
        if not path.is_file():
            problems.append(f"segment manquant : {entry['file']}")
            continue
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != entry["sha256"] or len(data) != entry["bytes"]:
            problems.append(f"empreinte ou taille différente : {entry['file']}")
            continue
        try:
            chunk = json.loads(data.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            problems.append(f"{entry['file']} illisible : {error}")
            continue
        if not isinstance(chunk, dict) or chunk.get("format") != CHUNK_FORMAT or chunk.get("version") != VERSION \
                or chunk.get("seq") != entry["seq"] or not isinstance(chunk.get("frames"), list):
            problems.append(f"{entry['file']} : en-tête de segment invalide")
            continue
        if len(chunk["frames"]) != entry["frames"] or not chunk["frames"] \
                or chunk["frames"][0].get("time") != entry["start"] or chunk["frames"][-1].get("time") != entry["end"]:
            problems.append(f"{entry['file']} : contenu différent de l'index du manifeste")
            continue
        found, previous_time = frame_problems(chunk["frames"], previous_time, entry["file"])
        problems.extend(found[:3])
    try:
        tracks = _read_json(_bundle_file(directory, storage["tracks"]["file"]))
    except ValueError as error:
        return problems + [str(error)]
    if not isinstance(tracks, dict) or tracks.get("format") != TRACKS_FORMAT or not isinstance(tracks.get("tracks"), list):
        problems.append("tracks.json : format invalide")
    elif len(tracks["tracks"]) != storage["tracks"]["count"]:
        problems.append("tracks.json : nombre de trajectoires différent du manifeste")
    else:
        for track in tracks["tracks"]:
            problems.extend(track_problems(track, f"trajectoire {track.get('id') if isinstance(track, dict) else '?'}"))
    return problems


def update_catalog(catalog: Path, bundle: Path, manifest: dict, description: str | None = None, *,
                   gallery: dict | None = None) -> dict:
    """Ajoute ou remplace l'entrée d'un export dans le catalogue de démonstration, de façon atomique.

    gallery : champs de la galerie (category, credit, order, calibrationCheck) ; ceux qui manquent
    sont repris de l'entrée précédente. La qualité est recalculée à partir des mesures du manifeste,
    et la vignette (thumbnail.jpg) est référencée si elle existe dans l'export.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — export statique (catalogue)
    """
    catalog, bundle = Path(catalog), Path(bundle)
    try:
        relative = bundle.resolve().relative_to(catalog.resolve().parent).as_posix()
    except ValueError as error:
        raise ExportError("L'export doit se trouver dans le dossier du catalogue ou en dessous.") from error
    data = {"format": CATALOG_FORMAT, "version": VERSION, "matches": []}
    if catalog.is_file():
        data = _read_json(catalog)
        problems = catalog_problems(data)
        if problems:
            raise ExportError(f"Catalogue invalide : {problems[0]}")
    previous = next((match for match in data["matches"] if match["id"] == manifest["id"]), {})
    entry = {"id": manifest["id"], "title": manifest["title"], "path": f"{relative}/",
             "kind": manifest["provenance"]["kind"], "duration": manifest["source"].get("duration"),
             "description": description if description is not None else previous.get("description", "")}
    for key in ("category", "credit", "order", "calibrationCheck"):
        value = (gallery or {}).get(key, previous.get(key))
        if value is not None:
            entry[key] = value
    if (bundle / "thumbnail.jpg").is_file():
        entry["thumbnail"] = f"{relative}/thumbnail.jpg"
    entry["quality"] = gallery_quality(manifest.get("metrics") or {})
    # Ordre de la galerie : d'abord les entrées numérotées, puis par identifiant.
    data["matches"] = sorted([match for match in data["matches"] if match["id"] != entry["id"]] + [entry],
                             key=lambda match: (match.get("order", 1000), match["id"]))
    problems = catalog_problems(data)
    if problems:
        raise ExportError(f"Catalogue invalide : {problems[0]}")
    temporary = catalog.with_name(catalog.name + ".partiel")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    os.replace(temporary, catalog)
    return data
