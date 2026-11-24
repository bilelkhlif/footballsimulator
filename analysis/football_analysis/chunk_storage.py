"""Stockage transactionnel des analyses par morceaux, sans document entier en mémoire.

SQLite conserve les images brutes, leur journal de reprise et les images publiées. Une écriture
brute et son point de reprise partagent la même transaction. Le format échangé reste JSON ; les
morceaux sont comprimés avec zlib, sans sérialisation d'objets Python.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import json
import math
from pathlib import Path
import sqlite3
from typing import Any, Iterable, Iterator
import zlib

#: Version du schéma local, indépendante du contrat JSON des images.
SCHEMA_VERSION = 1

#: Une requête de lecture interactive couvre au plus trente secondes.
MAX_WINDOW_SECONDS = 30.0


def _json(value: Any) -> str:
    """Encode un objet JSON de façon compacte et déterministe.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse vidéo — stockage par morceaux (encodage)
    """
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False)


def _pack(value: Any) -> bytes:
    """Comprime un seul morceau JSON.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse vidéo — stockage par morceaux (encodage)
    """
    return zlib.compress(_json(value).encode("utf-8"))


def _unpack(value: bytes) -> Any:
    """Décomprime un seul morceau JSON, sans charger les autres.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse vidéo — stockage par morceaux (encodage)
    """
    return json.loads(zlib.decompress(value))


class ChunkStore:
    """Base d'une analyse, à ouvrir séparément dans chaque fil lecteur ou écrivain.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse vidéo — stockage par morceaux
    """

    def __init__(self, path: Path, header: dict | None = None, signature: Any = None):
        """Ouvre une base ; crée son schéma ou refuse une signature de reprise différente.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (ouverture)
        """
        self.path = Path(path)
        exists = self.path.exists()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(self.path, timeout=10)
        self._closed = False
        try:
            self._connection.execute("PRAGMA cache_size=-8192")
            self._connection.execute("PRAGMA journal_mode=WAL")
            self._connection.execute("PRAGMA synchronous=FULL")
            self._connection.execute("PRAGMA wal_autocheckpoint=256")
            tables = {row[0] for row in self._connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not tables and (not exists or header is not None):
                with self._connection:
                    self._connection.execute("BEGIN IMMEDIATE")
                    self._connection.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
                    self._connection.execute("CREATE TABLE raw_chunks (seq INTEGER PRIMARY KEY, frames BLOB NOT NULL, "
                                             "replay BLOB NOT NULL, checkpoint TEXT NOT NULL)")
                    self._connection.execute("CREATE TABLE ready_chunks (seq INTEGER PRIMARY KEY, start REAL, end REAL, "
                                             "frame_count INTEGER NOT NULL, frames BLOB NOT NULL)")
                    self._connection.execute("CREATE INDEX ready_times ON ready_chunks(start,end)")
                    self._connection.execute("CREATE TABLE tracks (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
                    self._connection.execute("CREATE TABLE blobs (key TEXT PRIMARY KEY, value BLOB NOT NULL)")
                    self._set("schema", SCHEMA_VERSION)
                    self._set("header", header or {})
                    self._set("signature", signature)
                    self._set("complete", False)
                    self._set("summary", {})
                    self._set("team_cursor", -1)
            elif "meta" not in tables:
                raise ValueError("Base vide en cours d'initialisation, ou format incompatible.")
            if self._get("schema") != SCHEMA_VERSION:
                raise ValueError("Schéma de stockage incompatible.")
            if signature is not None and self._get("signature") != signature:
                raise ValueError("La source, les modèles, le code ou les réglages du point de reprise ont changé.")
        except Exception:
            self.close()
            raise

    def _get(self, key: str, default: Any = None) -> Any:
        """Lit une petite métadonnée, ou sa valeur par défaut.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (métadonnées)
        """
        row = self._connection.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return default if row is None else json.loads(row[0])

    def _set(self, key: str, value: Any) -> None:
        """Écrit une métadonnée dans la transaction de l'appelant.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (métadonnées)
        """
        self._connection.execute("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                                 (key, _json(value)))

    def header(self) -> dict:
        """Renvoie l'en-tête du contrat de données.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (lecture)
        """
        return self._get("header", {})

    def checkpoint(self) -> dict | None:
        """Renvoie le dernier point de reprise validé avec son morceau brut.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (reprise)
        """
        return self._get("checkpoint")

    def commit_raw(self, seq: int, frames: list[dict], replay: Any, checkpoint: dict) -> None:
        """Valide ensemble un morceau brut et son état de reprise ; refuse les doublons.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (écriture atomique)
        """
        packed_frames, packed_replay, encoded_checkpoint = _pack(frames), _pack(replay), _json(checkpoint)
        with self._connection:
            if self._get("complete"):
                raise ValueError("Analyse déjà terminée.")
            last = self._connection.execute("SELECT MAX(seq) FROM raw_chunks").fetchone()[0]
            if seq != (0 if last is None else last + 1):
                raise ValueError("Numéro de morceau brut non consécutif.")
            previous = self._get("raw_tail")
            for frame in frames:
                if previous and (frame["index"] <= previous["index"] or frame["time"] <= previous["time"]):
                    raise ValueError("Image dupliquée ou horodatage non croissant dans le journal brut.")
                previous = {"index": frame["index"], "time": frame["time"]}
            self._connection.execute("INSERT INTO raw_chunks VALUES(?,?,?,?)",
                                     (seq, packed_frames, packed_replay, encoded_checkpoint))
            for frame in frames:
                for obj in frame["objects"]:
                    span = self.track(obj["id"]) or {"id": obj["id"], "shot": frame["shot"],
                        "firstTime": frame["time"], "observations": 0, "roleVotes": {},
                        "team": None, "teamConfidence": None, "teamVotes": 0, "distanceM": 0.0}
                    votes = span["roleVotes"]
                    votes[obj["role"]] = votes.get(obj["role"], 0) + 1
                    span.update(lastTime=frame["time"], observations=span["observations"] + 1,
                                role=max(votes, key=votes.get))
                    self._write_track(span)
            self._set("checkpoint", checkpoint)
            self._set("raw_tail", previous)

    def track(self, track_id: int) -> dict | None:
        """Lit une trajectoire à la fois, y compris ses votes internes de rôle.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage des trajectoires
        """
        row = self._connection.execute("SELECT value FROM tracks WHERE id=?", (track_id,)).fetchone()
        return None if row is None else json.loads(row[0])

    def _write_track(self, track: dict) -> None:
        """Écrit une trajectoire dans la transaction courante.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage des trajectoires
        """
        self._connection.execute("INSERT INTO tracks VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
                                 (track["id"], _json(track)))

    def max_track_id(self) -> int:
        """Plus grand identifiant de trajectoire enregistré, ou 0 sans trajectoire.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Analyse vidéo — stockage des trajectoires (nouveaux identifiants)
        """
        return self._connection.execute("SELECT COALESCE(MAX(id), 0) FROM tracks").fetchone()[0]

    def save_identity(self, plan: dict, tracks: Iterable[dict]) -> None:
        """Valide ensemble le plan d'identités et les résumés des trajectoires qu'il corrige.

        Le plan est écrit avant toute publication des équipes : une reprise le relit tel quel,
        sans refaire les prédictions de maillots.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Analyse vidéo — stockage du contrôle d'identité
        """
        with self._connection:
            if self._get("team_cursor", -1) != -1:
                raise ValueError("Plan d'identités après le début de la publication des équipes.")
            for track in tracks:
                self._write_track(track)
            self._set("identity_plan", plan)

    def state(self, key: str, default: Any = None) -> Any:
        """Lit un état de traitement compact.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — reprise des étapes
        """
        return self._get(key, default)

    def save_state(self, **values: Any) -> None:
        """Valide ensemble plusieurs petites métadonnées de traitement.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — reprise des étapes
        """
        with self._connection:
            for key, value in values.items():
                self._set(key, value)

    def iter_raw(self, after_seq: int = -1) -> Iterator[dict]:
        """Parcourt les morceaux bruts, un seul décomprimé à la fois.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (relecture)
        """
        cursor = self._connection.execute("SELECT seq,frames,replay,checkpoint FROM raw_chunks WHERE seq>? ORDER BY seq",
                                          (after_seq,))
        try:
            for seq, frames, replay, checkpoint in cursor:
                yield {"seq": seq, "frames": _unpack(frames), "replay": _unpack(replay),
                       "checkpoint": json.loads(checkpoint)}
        finally:
            cursor.close()

    def recover_previews(self) -> None:
        """Publie les segments bruts laissés entre validation et aperçu lors d'un arrêt.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — réparation des publications interrompues
        """
        cursor = self._connection.execute("SELECT r.seq,r.frames FROM raw_chunks r LEFT JOIN ready_chunks p "
                                          "ON r.seq=p.seq WHERE p.seq IS NULL ORDER BY r.seq")
        try:
            for seq, payload in cursor:
                self.publish(seq, _unpack(payload))
        finally:
            cursor.close()

    def publish(self, seq: int, frames: list[dict], tracks: list[dict] | None = None,
                state: dict | None = None) -> None:
        """Publie les images définitives et les résumés de trajectoires dans une transaction.

        Une reprise peut republier le même morceau : son contenu est remplacé, sans doublon.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (publication)
        """
        payload = _pack(frames)
        start, end = (frames[0]["time"], frames[-1]["time"]) if frames else (None, None)
        with self._connection:
            if self._get("complete"):
                raise ValueError("Analyse déjà terminée.")
            if self._connection.execute("SELECT 1 FROM raw_chunks WHERE seq=?", (seq,)).fetchone() is None:
                raise ValueError("Morceau brut absent.")
            self._connection.execute("INSERT INTO ready_chunks VALUES(?,?,?,?,?) ON CONFLICT(seq) DO UPDATE SET "
                                     "start=excluded.start,end=excluded.end,frame_count=excluded.frame_count,frames=excluded.frames",
                                     (seq, start, end, len(frames), payload))
            self._set("revision", self._get("revision", 0) + 1)
            for track in tracks or []:
                self._write_track(track)
            if state is not None:
                if seq != self._get("team_cursor", -1) + 1:
                    raise ValueError("Publication des équipes non consécutive.")
                self._set("team_state", state)
                self._set("team_cursor", seq)

    def iter_ready(self) -> Iterator[list[dict]]:
        """Parcourt les images publiées avec un seul morceau décomprimé à la fois.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — lecture séquentielle bornée
        """
        cursor = self._connection.execute("SELECT frames FROM ready_chunks ORDER BY seq")
        try:
            for (payload,) in cursor:
                yield _unpack(payload)
        finally:
            cursor.close()

    def team_counts(self) -> dict[int, int]:
        """Compte les équipes sans charger la liste des trajectoires.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — résumé borné
        """
        return {team: self._connection.execute(
            "SELECT COUNT(*) FROM tracks WHERE json_extract(value,'$.team')=?", (team,)).fetchone()[0]
                for team in (0, 1)}

    def put_blob(self, key: str, value: bytes) -> None:
        """Conserve un état binaire local borné, sans interpréter son contenu.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (état binaire)
        """
        with self._connection:
            self._connection.execute("INSERT INTO blobs VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                                     (key, value))

    def get_blob(self, key: str) -> bytes | None:
        """Lit un état binaire local, ou None s'il n'existe pas.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (état binaire)
        """
        row = self._connection.execute("SELECT value FROM blobs WHERE key=?", (key,)).fetchone()
        return None if row is None else bytes(row[0])

    def finish(self, header: dict, summary: dict) -> None:
        """Valide l'en-tête final, le résumé et le marqueur de fin dans la même transaction.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (finalisation)
        """
        with self._connection:
            missing = self._connection.execute("SELECT COUNT(*) FROM raw_chunks r LEFT JOIN ready_chunks p "
                                               "ON r.seq=p.seq WHERE p.seq IS NULL").fetchone()[0]
            if missing:
                raise ValueError("Des morceaux ne sont pas encore publiés.")
            count = self._connection.execute("SELECT COUNT(*) FROM raw_chunks").fetchone()[0]
            if self._get("detection_done") and self._get("team_cursor", -1) + 1 != count:
                raise ValueError("Le classement des équipes n'est pas encore terminé.")
            for track in summary.get("tracks", []):
                self._connection.execute("INSERT INTO tracks VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
                                         (track["id"], _json(track)))
            self._set("header", header)
            self._set("summary", {key: value for key, value in summary.items() if key != "tracks"})
            self._set("complete", True)
        self._connection.execute("PRAGMA wal_checkpoint(PASSIVE)")

    def manifest(self) -> dict:
        """Décrit les données disponibles, sans charger les images ni toutes les trajectoires.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (manifeste)
        """
        frame_count, ready, available = self._connection.execute(
            "SELECT COALESCE(SUM(frame_count),0),COUNT(*),COALESCE(MAX(end),0) FROM ready_chunks").fetchone()
        committed = self._connection.execute("SELECT COUNT(*) FROM raw_chunks").fetchone()[0]
        header = self.header()
        summary = self._get("summary", {})
        return {**header, **summary, "teams": summary.get("teams", self._get("teams", [])),
                "tracks": [], "complete": bool(self._get("complete")),
                "teamsReady": bool(self._get("team_model_ready", False)),
                "storage": {"kind": "sqlite", "chunkSeconds": header.get("analysis", {}).get("chunkSeconds", 10),
                            "frameCount": frame_count, "committedChunks": committed, "readyChunks": ready,
                            "availableUntil": available, "revision": self._get("revision", 0),
                            "bytes": self.path.stat().st_size + (Path(str(self.path) + "-wal").stat().st_size
                                     if Path(str(self.path) + "-wal").is_file() else 0)}}

    def window(self, from_time: float, to_time: float, selected: int | None = None) -> dict:
        """Lit au plus trente secondes, avec les images voisines utiles à l'interpolation.

        Seuls les résumés des trajectoires présentes et de la sélection sont renvoyés.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (fenêtre de lecture)
        """
        if not (math.isfinite(from_time) and math.isfinite(to_time)) or to_time < from_time:
            raise ValueError("Intervalle de lecture invalide.")
        if to_time - from_time > MAX_WINDOW_SECONDS:
            raise ValueError("La fenêtre de lecture dépasse trente secondes.")
        from_time, to_time = max(0.0, from_time), max(0.0, to_time)
        rows = list(self._connection.execute("SELECT seq FROM ready_chunks WHERE end>=? AND start<=? ORDER BY seq",
                                             (from_time, to_time)))
        before = self._connection.execute("SELECT seq FROM ready_chunks WHERE end<? ORDER BY end DESC LIMIT 1",
                                          (from_time,)).fetchone()
        after = self._connection.execute("SELECT seq FROM ready_chunks WHERE start>? ORDER BY start LIMIT 1",
                                         (to_time,)).fetchone()
        sequences = sorted({row[0] for row in [*rows, *([before] if before else []), *([after] if after else [])]})
        frames, predecessor, successor = [], None, None
        for seq in sequences:
            payload = self._connection.execute("SELECT frames FROM ready_chunks WHERE seq=?", (seq,)).fetchone()[0]
            for frame in _unpack(payload):
                if frame["time"] < from_time:
                    if predecessor is None or frame["time"] > predecessor["time"]:
                        predecessor = frame
                elif frame["time"] > to_time:
                    if successor is None or frame["time"] < successor["time"]:
                        successor = frame
                else:
                    frames.append(frame)
        if predecessor is not None:
            frames.insert(0, predecessor)
        if successor is not None:
            frames.append(successor)
        ids = {obj["id"] for frame in frames for obj in frame["objects"]}
        if selected is not None:
            ids.add(selected)
        tracks = []
        for track_id in sorted(ids):
            row = self._connection.execute("SELECT value FROM tracks WHERE id=?", (track_id,)).fetchone()
            if row is not None:
                tracks.append({key: value for key, value in json.loads(row[0]).items() if key != "roleVotes"})
        return {"frames": frames, "tracks": tracks, "from": from_time, "to": to_time}

    def iter_document(self) -> Iterator[bytes]:
        """Exporte le document historique sans matérialiser les images ou résumés complets.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (export)
        """
        if not self._get("complete"):
            raise ValueError("Analyse pas encore terminée.")
        small = {**self.header(), **self._get("summary", {})}
        yield (_json(small)[:-1] + ',"frames":[').encode("utf-8")
        first = True
        cursor = self._connection.execute("SELECT frames FROM ready_chunks ORDER BY seq")
        try:
            for (payload,) in cursor:
                for frame in _unpack(payload):
                    yield (("" if first else ",") + _json(frame)).encode("utf-8")
                    first = False
        finally:
            cursor.close()
        yield b'],"tracks":['
        first = True
        cursor = self._connection.execute("SELECT value FROM tracks ORDER BY id")
        try:
            for (value,) in cursor:
                public = {key: item for key, item in json.loads(value).items() if key != "roleVotes"}
                yield (("" if first else ",") + _json(public)).encode("utf-8")
                first = False
        finally:
            cursor.close()
        yield b"]}"

    def close(self) -> None:
        """Ferme la connexion et libère ses lectures éventuelles.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (fermeture)
        """
        if not self._closed:
            self._connection.close()
            self._closed = True

    def __enter__(self) -> ChunkStore:
        """Renvoie le stockage utilisé dans un bloc with.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (cycle de vie)
        """
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        """Ferme la connexion à la sortie du bloc, même en cas d'erreur.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage par morceaux (cycle de vie)
        """
        self.close()
