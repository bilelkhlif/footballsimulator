"""File des analyses : une vidéo téléversée devient un travail, traité par un seul fil d'exécution.

Un seul travail à la fois : le GPU est la ressource rare. Chaque travail a son dossier
(data/jobs/<id>/) avec la vidéo source, son état (status.json) et sa base incrémentale
(tracking.sqlite). Les anciens tracking.json restent lisibles. Au redémarrage, une analyse
interrompue avec une base peut être reprise explicitement ; les téléversements en attente sont
remis en file. Aucun travail GPU n'est ajouté deux fois à la file.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import json
import os
import queue
import re
import secrets
import threading
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

#: Format des identifiants de travail : date, heure et six chiffres hexadécimaux aléatoires.
JOB_ID = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{6}$")

#: États successifs d'un travail.
STATUSES = ("queued", "running", "done", "interrupted", "failed")


def _now() -> str:
    """Instant présent en UTC, au format ISO 8601.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — file des analyses
    """
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _retry_sharing_violation(action: Callable[[], Any], attempts: int = 50) -> Any:
    """Exécute une lecture ou un renommage de status.json, en réessayant pendant un conflit d'accès.

    Sous Windows, remplacer un fichier qu'un autre fil est en train de lire (ou lire pendant le
    remplacement) échoue un instant avec PermissionError : le serveur lit l'état pendant que
    l'analyse le met à jour. Le conflit dure quelques millisecondes ; au-delà d'environ 0,5 s,
    l'erreur est rendue telle quelle.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — file des analyses (accès concurrents)
    """
    for attempt in range(attempts):
        try:
            return action()
        except PermissionError:
            if attempt == attempts - 1:
                raise
            time.sleep(0.01)
    return None


class JobStore:
    """Dossiers et états des travaux d'analyse.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — file des analyses (stockage)
    """

    def __init__(self, root: Path):
        """Prépare le dossier des travaux.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (stockage)
        """
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def directory(self, job_id: str) -> Path:
        """Dossier d'un travail ; refuse tout identifiant mal formé.

        Raises:
            KeyError: identifiant invalide.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (stockage)
        """
        if not JOB_ID.match(job_id or ""):
            raise KeyError(job_id)
        return self.root / job_id

    def create(self, name: str, suffix: str) -> tuple[str, Path]:
        """Crée un travail ; renvoie son identifiant et le chemin où écrire la vidéo.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (stockage)
        """
        job_id = f"{datetime.now(timezone.utc):%Y%m%d-%H%M%S}-{secrets.token_hex(3)}"
        directory = self.directory(job_id)
        directory.mkdir()
        self.write(job_id, {"id": job_id, "name": name, "status": "receiving", "createdAt": _now(),
                            "source": f"source{suffix}"})
        return job_id, directory / f"source{suffix}"

    def write(self, job_id: str, status: dict[str, Any]) -> None:
        """Écrit l'état d'un travail, d'un seul coup (fichier temporaire puis renommage).

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (stockage)
        """
        path = self.directory(job_id) / "status.json"
        temporary = path.with_suffix(".tmp")
        with self._lock:
            temporary.write_text(json.dumps(status, ensure_ascii=False), encoding="utf-8")
            _retry_sharing_violation(lambda: os.replace(temporary, path))

    def update(self, job_id: str, **fields: Any) -> dict[str, Any]:
        """Modifie quelques champs de l'état d'un travail.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (stockage)
        """
        status = self.get(job_id) or {"id": job_id}
        status.update(fields)
        status["updatedAt"] = _now()
        self.write(job_id, status)
        return status

    def get(self, job_id: str) -> dict[str, Any] | None:
        """État d'un travail, ou None s'il n'existe pas.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (stockage)
        """
        try:
            path = self.directory(job_id) / "status.json"
        except KeyError:
            return None
        if not path.is_file():
            return None
        return json.loads(_retry_sharing_violation(lambda: path.read_text(encoding="utf-8")))

    def list(self) -> list[dict[str, Any]]:
        """États de tous les travaux, du plus récent au plus ancien.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (stockage)
        """
        statuses = [self.get(path.name) for path in self.root.iterdir() if JOB_ID.match(path.name)]
        return sorted((s for s in statuses if s), key=lambda s: s["createdAt"], reverse=True)

    def source(self, job_id: str) -> Path | None:
        """Chemin de la vidéo source d'un travail, ou None.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (stockage)
        """
        status = self.get(job_id)
        return None if not status else self.directory(job_id) / status["source"]

    def tracking(self, job_id: str) -> Path:
        """Chemin du document de suivi d'un travail.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (stockage)
        """
        return self.directory(job_id) / "tracking.json"

    def recover(self) -> list[str]:
        """Remet en ordre les travaux laissés par un arrêt du serveur ; renvoie ceux à remettre en file.

        Un travail en file, dont la vidéo est arrivée et a été vérifiée, est rendu pour être relancé
        (défaut constaté : un téléversement complet était perdu au redémarrage). Un travail en cours
        avec une base est déclaré interrompu, avec reprise explicite proposée. Sans base,
        il reste déclaré en échec, comme les anciens traitements non récupérables.
        Un téléversement inachevé est déclaré interrompu.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (stockage)
        """
        resubmit = []
        for status in sorted(self.list(), key=lambda s: s["createdAt"]):
            if status["status"] == "queued" and status.get("video"):
                resubmit.append(status["id"])
            elif status["status"] == "running" and self.database(status["id"]).is_file():
                self.update(status["id"], status="interrupted", resumable=True,
                            error="Analyse interrompue ; les segments validés peuvent être repris.")
            elif status["status"] in ("receiving", "queued", "running"):
                self.update(status["id"], status="failed", error="Analyse interrompue par l'arrêt du serveur.")
        return resubmit

    def database(self, job_id: str) -> Path:
        """Chemin du suivi incrémental, séparé des anciens documents JSON.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse vidéo — stockage des analyses longues
        """
        return self.directory(job_id) / "tracking.sqlite"


class AnalysisInterrupted(Exception):
    """Interruption demandée par l'utilisateur : levée au prochain rapport de progression.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Analyse vidéo — file d'analyses (interruption)
    """


class AnalysisWorker(threading.Thread):
    """Traite les travaux un par un, dans l'ordre d'arrivée.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — file des analyses (traitement)
    """

    def __init__(self, store: JobStore, analyse: Callable[..., dict[str, Any]], chunked: bool = False):
        """Prépare le fil de traitement.

        Args:
            store: dossiers et états des travaux.
            analyse: fonction (chemin, progression, nom) → document de suivi.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (traitement)
        """
        super().__init__(name="analysis-worker", daemon=True)
        self.store = store
        self.analyse = analyse
        self.chunked = chunked
        self.jobs: queue.Queue[str] = queue.Queue()
        self._pending: set[str] = set()
        self._interrupts: set[str] = set()
        self._submission_lock = threading.Lock()

    def submit(self, job_id: str) -> bool:
        """Met un travail en file.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (traitement)
        """
        with self._submission_lock:
            if job_id in self._pending:
                return False
            self._pending.add(job_id)
            self.store.update(job_id, status="queued", progress={"stage": "file", "fraction": None,
                                                                  "message": "En attente d'analyse"})
            self.jobs.put(job_id)
            return True

    def interrupt(self, job_id: str) -> dict[str, Any] | None:
        """Interrompt une analyse en attente (aussitôt) ou en cours (au prochain lot d'images).

        L'analyse devient « interrupted » et reste reprenable : les segments validés sont gardés.
        Renvoie l'état mis à jour, ou None si l'analyse n'est ni en attente ni en cours.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Analyse vidéo — file d'analyses (interruption)
        """
        with self._submission_lock:
            status = self.store.get(job_id)
            if status is None or status["status"] not in ("queued", "running"):
                return None
            if status["status"] == "queued":
                self._pending.discard(job_id)
                return self.store.update(job_id, status="interrupted", resumable=True, progress=None,
                                         error="Analyse interrompue avant son début.")
            self._interrupts.add(job_id)
            progress = dict(status.get("progress") or {})
            progress["message"] = "Interruption demandée : arrêt au prochain lot d'images."
            return self.store.update(job_id, progress=progress, interruptRequested=True)

    def run(self) -> None:
        """Boucle de traitement : un travail après l'autre, sans fin.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (traitement)
        """
        while True:
            job_id = self.jobs.get()
            try:
                self.process(job_id)
            finally:
                with self._submission_lock:
                    self._pending.discard(job_id)
                    self._interrupts.discard(job_id)
                self.jobs.task_done()

    def process(self, job_id: str) -> None:
        """Analyse un travail ; écrit son document de suivi ou son erreur.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (traitement)
        """
        with self._submission_lock:
            # L'interruption et le passage en cours partagent le même verrou : un état lu avant
            # son acquisition pourrait être périmé et relancer un travail déjà interrompu.
            current = self.store.get(job_id)
            if current is None or current["status"] != "queued":
                return  # entrée de file périmée, ou interruption ayant gagné le démarrage
            self._interrupts.discard(job_id)
            status = self.store.update(job_id, status="running", startedAt=_now(), error=None, interruptRequested=False)

        def report(stage: str, fraction: float | None, message: str) -> None:
            """Recopie la progression dans l'état du travail."""
            if job_id in self._interrupts:
                raise AnalysisInterrupted()
            self.store.update(job_id, progress={"stage": stage, "fraction": fraction, "message": message})

        try:
            if self.chunked:
                document = self.analyse(self.store.source(job_id), self.store.database(job_id), report, status["name"])
                if document.get("complete") is not True:
                    raise ValueError("Analyse incomplète : aucune fin de traitement validée.")
            else:
                document = self.analyse(self.store.source(job_id), report, status["name"])
                temporary = self.store.tracking(job_id).with_suffix(".tmp")
                temporary.write_bytes(json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
                os.replace(temporary, self.store.tracking(job_id))
            self.store.update(job_id, status="done", finishedAt=_now(), metrics=document.get("metrics"),
                              limitations=document.get("limitations"), progress=None, resumable=False)
        except AnalysisInterrupted:
            self.store.update(job_id, status="interrupted", finishedAt=_now(), progress=None, interruptRequested=False,
                              error="Analyse interrompue à la demande ; les segments validés sont conservés.",
                              resumable=self.chunked)
        except Exception as error:  # l'erreur est rapportée à l'utilisateur, le fil continue
            traceback.print_exc()
            self.store.update(job_id, status="failed", finishedAt=_now(), error=str(error) or type(error).__name__,
                              resumable=self.chunked and self.store.database(job_id).is_file())
