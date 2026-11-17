"""File des analyses : une vidéo téléversée devient un travail, traité par un seul fil d'exécution.

Un seul travail à la fois : le GPU est la ressource rare. Chaque travail a son dossier
(data/jobs/<id>/) avec la vidéo source, son état (status.json) et, à la fin, son document de suivi
(tracking.json). Au redémarrage du serveur, un travail resté « en cours » est déclaré interrompu.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import json
import os
import queue
import re
import secrets
import threading
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

#: Format des identifiants de travail : date, heure et six chiffres hexadécimaux aléatoires.
JOB_ID = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{6}$")

#: États successifs d'un travail.
STATUSES = ("queued", "running", "done", "failed")


def _now() -> str:
    """Instant présent en UTC, au format ISO 8601.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — file des analyses
    """
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


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
            os.replace(temporary, path)

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
        return json.loads(path.read_text(encoding="utf-8"))

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

    def mark_interrupted(self) -> None:
        """Déclare interrompus les travaux laissés en attente ou en cours par un arrêt du serveur.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (stockage)
        """
        for status in self.list():
            if status["status"] in ("receiving", "queued", "running"):
                self.update(status["id"], status="failed", error="Analyse interrompue par l'arrêt du serveur.")


class AnalysisWorker(threading.Thread):
    """Traite les travaux un par un, dans l'ordre d'arrivée.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — file des analyses (traitement)
    """

    def __init__(self, store: JobStore, analyse: Callable[..., dict[str, Any]]):
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
        self.jobs: queue.Queue[str] = queue.Queue()

    def submit(self, job_id: str) -> None:
        """Met un travail en file.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (traitement)
        """
        self.store.update(job_id, status="queued", progress={"stage": "file", "fraction": None,
                                                              "message": "En attente d'analyse"})
        self.jobs.put(job_id)

    def run(self) -> None:
        """Boucle de traitement : un travail après l'autre, sans fin.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (traitement)
        """
        while True:
            self.process(self.jobs.get())

    def process(self, job_id: str) -> None:
        """Analyse un travail ; écrit son document de suivi ou son erreur.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — file des analyses (traitement)
        """
        status = self.store.update(job_id, status="running", startedAt=_now())

        def report(stage: str, fraction: float | None, message: str) -> None:
            """Recopie la progression dans l'état du travail."""
            self.store.update(job_id, progress={"stage": stage, "fraction": fraction, "message": message})

        try:
            document = self.analyse(self.store.source(job_id), report, status["name"])
            temporary = self.store.tracking(job_id).with_suffix(".tmp")
            temporary.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            os.replace(temporary, self.store.tracking(job_id))
            self.store.update(job_id, status="done", finishedAt=_now(), metrics=document.get("metrics"),
                              limitations=document.get("limitations"), progress=None)
        except Exception as error:  # l'erreur est rapportée à l'utilisateur, le fil continue
            traceback.print_exc()
            self.store.update(job_id, status="failed", finishedAt=_now(), error=str(error) or type(error).__name__)
