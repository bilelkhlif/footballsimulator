"""Tests du serveur local : téléversement, file d'analyses, lecture partielle, fichiers servis.

L'analyse est remplacée par une fonction de test : ces tests vérifient le serveur et la file, pas
les modèles. Le document renvoyé est un document de test.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import json
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

from football_analysis.jobs import AnalysisWorker, JobStore
from football_analysis.server import VisualizerServer, parse_range
from football_analysis.chunk_storage import ChunkStore

VIDEO_BYTES = bytes(range(256)) * 40


def fake_probe(path):
    """Vidéo « lisible » si elle commence par l'octet 0, comme VIDEO_BYTES.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — serveur
    """
    if Path(path).read_bytes()[:1] != b"\x00":
        raise ValueError("Vidéo illisible : format ou codec non pris en charge.")
    return {"width": 64, "height": 36, "fps": 25.0}


def fake_analyse(path, progress, name):
    """Analyse de test : signale une étape et renvoie un petit document.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — serveur
    """
    progress("images", 0.5, "moitié")
    return {"format": "football-tracking", "version": 1, "source": {"name": name}, "frames": [], "metrics": {"ok": 1},
            "limitations": ["test"]}


class ServerTest(unittest.TestCase):
    """Serveur réel sur un port libre, avec une file de test.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — serveur
    """

    def setUp(self):
        """Démarre le serveur sur un dossier temporaire.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — serveur
        """
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        (root / "src").mkdir()
        (root / "src" / "app.js").write_text("export {};", encoding="utf-8")
        (root / "src" / "window.mjs").write_bytes(b"export {};\n")
        for name in ("visualizer.html", "index.html", "sw.js", "ATTRIBUTION.md"):
            (root / name).write_text("<!doctype html>", encoding="utf-8")
        self.store = JobStore(root / "jobs")
        worker = AnalysisWorker(self.store, fake_analyse)
        worker.start()
        self.server = VisualizerServer(("127.0.0.1", 0), self.store, worker, root, lambda: {"ok": True}, probe=fake_probe)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        """Arrête le serveur et efface le dossier temporaire.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — serveur
        """
        self.server.shutdown()
        self.server.server_close()
        self.directory.cleanup()

    def request(self, path, data=None, headers=None, method=None):
        """Envoie une requête ; renvoie le code, les en-têtes et le corps, même en cas d'erreur.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — serveur
        """
        request = urllib.request.Request(self.base + path, data=data, headers=headers or {}, method=method)
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, response.headers, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.headers, error.read()

    def upload(self, name="match.mp4", body=VIDEO_BYTES):
        """Téléverse une vidéo de test.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — serveur
        """
        return self.request(f"/api/analyses?name={name}", data=body, headers={"Content-Type": "video/mp4"}, method="POST")

    def wait_done(self, job_id):
        """Attend la fin de l'analyse de test (2 s au plus).

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — serveur
        """
        for _ in range(100):
            status = json.loads(self.request(f"/api/analyses/{job_id}")[2])
            if status["status"] in ("done", "failed"):
                return status
            time.sleep(0.02)
        self.fail("analyse non terminée")

    def test_upload_analyse_and_fetch(self):
        """Téléversement, analyse en file, puis document de suivi et vidéo servis.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — serveur
        """
        status, _, body = self.upload()
        self.assertEqual(status, 202)
        job = json.loads(body)
        self.assertEqual(job["name"], "match.mp4")
        done = self.wait_done(job["id"])
        self.assertEqual(done["status"], "done")
        self.assertEqual(done["limitations"], ["test"])
        status, headers, body = self.request(f"/api/analyses/{job['id']}/tracking")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["source"]["name"], "match.mp4")
        status, headers, body = self.request(f"/api/analyses/{job['id']}/video", headers={"Range": "bytes=100-199"})
        self.assertEqual(status, 206)
        self.assertEqual(headers["Content-Range"], f"bytes 100-199/{len(VIDEO_BYTES)}")
        self.assertEqual(body, VIDEO_BYTES[100:200])
        self.assertEqual([j["id"] for j in json.loads(self.request("/api/analyses")[2])], [job["id"]])

    def test_rejects_unreadable_and_unsupported_videos(self):
        """Vidéo illisible : 422 et dossier effacé ; extension inconnue : 415.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — serveur
        """
        status, _, body = self.upload(body=b"\x01" * 64)
        self.assertEqual(status, 422)
        self.assertIn("illisible", json.loads(body)["error"])
        self.assertEqual(self.store.list(), [])
        self.assertEqual(self.upload(name="notes.txt")[0], 415)

    def test_static_files_are_restricted(self):
        """Seuls le visualiseur et src/ sont servis : ni l'application AR, ni son Service Worker.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — serveur
        """
        self.assertEqual(self.request("/visualizer.html")[0], 200)
        status, headers, _ = self.request("/src/app.js")
        self.assertEqual((status, headers["Content-Type"]), (200, "text/javascript; charset=utf-8"))
        status, headers, _ = self.request("/src/window.mjs")
        self.assertEqual((status, headers["Content-Type"]), (200, "text/javascript; charset=utf-8"))
        for path in ("/index.html", "/sw.js", "/ATTRIBUTION.md", "/src/../ATTRIBUTION.md", "/jobs/x", "/api/analyses/../x"):
            self.assertEqual(self.request(path)[0], 404, path)

    def test_unknown_analysis(self):
        """Identifiant inconnu ou mal formé : 404.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — serveur
        """
        self.assertEqual(self.request("/api/analyses/20260101-000000-abcdef")[0], 404)
        self.assertEqual(self.request("/api/analyses/..%2F..%2Fsecret")[0], 404)

    def test_incremental_manifest_window_incomplete_export_and_resume(self):
        """Les résultats partiels sont lisibles ; l'export complet et la reprise sont explicites.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests de l'analyse vidéo — API incrémentale
        """
        job_id, source = self.store.create("long.mp4", ".mp4")
        source.write_bytes(VIDEO_BYTES)
        fixture = Path(__file__).resolve().parents[2] / "tests/fixtures/visualizer/match-synthetique.tracking.json"
        document = json.loads(fixture.read_bytes())
        header = {key: document[key] for key in ("format", "version", "source", "analysis", "pitch")}
        with ChunkStore(self.store.database(job_id), header) as database:
            database.commit_raw(0, document["frames"][:20], [], {"seq": 0})
            database.publish(0, document["frames"][:20])
            self.store.update(job_id, status="running", video={"fps": 25})
            status, headers, body = self.request(f"/api/analyses/{job_id}/manifest")
            self.assertEqual(status, 200)
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertFalse(json.loads(body)["complete"])
            self.assertEqual(json.loads(body)["storage"]["frameCount"], 20)
            status, _, body = self.request(f"/api/analyses/{job_id}/frames?from=0.5&to=1&selected=7")
            self.assertEqual(status, 200)
            self.assertGreater(len(json.loads(body)["frames"]), 0)
            self.assertEqual(self.request(f"/api/analyses/{job_id}/frames?from=0&to=31")[0], 400)
            self.assertEqual(self.request(f"/api/analyses/{job_id}/frames?from=nan&to=2")[0], 400)
            self.assertEqual(self.request(f"/api/analyses/{job_id}/tracking")[0], 409)
            self.assertEqual(self.request(f"/api/analyses/{job_id}/resume", data=b"", method="POST")[0], 409)
            self.store.recover()
            self.assertEqual(self.store.get(job_id)["status"], "interrupted")
            with patch.object(self.server.worker, "submit") as submit:
                self.assertEqual(self.request(f"/api/analyses/{job_id}/resume", data=b"", method="POST")[0], 202)
                submit.assert_called_once_with(job_id)
            database.finish(header, {"teams": document["teams"], "tracks": document["tracks"]})
            status, _, body = self.request(f"/api/analyses/{job_id}/tracking")
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)["frames"], document["frames"][:20])


class RecoveryTest(unittest.TestCase):
    """Reprise des travaux après un arrêt du serveur.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — serveur
    """

    def test_same_job_cannot_be_submitted_twice(self):
        """Deux demandes de reprise ne créent pas deux tâches GPU pour la même analyse.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests de l'analyse vidéo — file sans doublon
        """
        with tempfile.TemporaryDirectory() as directory:
            store = JobStore(Path(directory))
            job_id, _ = store.create("a.mp4", ".mp4")
            worker = AnalysisWorker(store, fake_analyse)
            self.assertTrue(worker.submit(job_id))
            self.assertFalse(worker.submit(job_id))
            self.assertEqual(worker.jobs.qsize(), 1)

    def test_interrupt_wins_before_the_worker_acquires_the_start_lock(self):
        """Une interruption gagnant le verrou de démarrage empêche tout lancement, même après une lecture.

        Le verrou instrumenté bloque le fil de traitement avant son acquisition, sans temporisation
        de course : l'interruption doit gagner. Le travail reste ensuite reprenable une seule fois.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'analyse vidéo — atomicité du démarrage et de l'interruption
        """
        reached, release = threading.Event(), threading.Event()

        class StartGate:
            """Retient seulement le fil de démarrage devant le verrou partagé."""

            def __init__(self):
                self.lock = threading.Lock()

            def __enter__(self):
                if threading.current_thread().name == "queued-start-regression":
                    reached.set()
                    if not release.wait(5):
                        raise TimeoutError("Le test n'a pas libéré le démarrage.")
                self.lock.acquire()
                return self

            def __exit__(self, *_):
                self.lock.release()

        with tempfile.TemporaryDirectory() as directory:
            store = JobStore(Path(directory))
            job_id, source = store.create("interruption.mp4", ".mp4")
            source.write_bytes(VIDEO_BYTES)
            calls, errors = [], []
            worker = AnalysisWorker(store, lambda *_: calls.append(job_id) or {})
            worker.submit(job_id)
            worker._submission_lock = StartGate()

            def process():
                """Rapporte au test les exceptions du fil secondaire."""
                try:
                    worker.process(job_id)
                except BaseException as error:
                    errors.append(error)

            thread = threading.Thread(target=process, name="queued-start-regression")
            thread.start()
            try:
                self.assertTrue(reached.wait(5), "le traitement atteint le verrou de démarrage")
                self.assertEqual(worker.interrupt(job_id)["status"], "interrupted")
            finally:
                release.set()
                thread.join(5)
            self.assertFalse(thread.is_alive())
            self.assertEqual(errors, [])
            self.assertEqual(calls, [], "une interruption acceptée avant le démarrage n'appelle pas l'analyse")
            self.assertEqual(store.get(job_id)["status"], "interrupted")
            self.assertTrue(worker.submit(job_id), "le travail interrompu reste reprenable")
            worker.process(job_id)
            self.assertEqual(calls, [job_id])
            self.assertEqual(store.get(job_id)["status"], "done")

    def test_queued_upload_survives_a_restart(self):
        """En file et vidéo vérifiée : relancé ; en cours ou inachevé : déclaré interrompu.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — serveur
        """
        with tempfile.TemporaryDirectory() as directory:
            store = JobStore(Path(directory))
            queued, _ = store.create("a.mp4", ".mp4")
            store.update(queued, status="queued", video={"fps": 25.0})
            running, _ = store.create("b.mp4", ".mp4")
            store.update(running, status="running", video={"fps": 25.0})
            receiving, _ = store.create("c.mp4", ".mp4")
            self.assertEqual(store.recover(), [queued])
            self.assertEqual(store.get(running)["status"], "failed")
            self.assertEqual(store.get(receiving)["status"], "failed")
            self.assertEqual(store.get(queued)["status"], "queued")

    def test_stale_queue_entries_only_start_after_explicit_submission(self):
        """Une ancienne entrée ne relance ni un échec, ni un traitement déjà en cours.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'analyse vidéo — état admissible au démarrage
        """
        with tempfile.TemporaryDirectory() as directory:
            store = JobStore(Path(directory))
            job_id, source = store.create("perime.mp4", ".mp4")
            source.write_bytes(VIDEO_BYTES)
            calls = []
            worker = AnalysisWorker(store, lambda *_: calls.append(job_id) or {})
            for status in ("receiving", "running", "failed", "interrupted", "done"):
                with self.subTest(status=status):
                    store.update(job_id, status=status)
                    worker.process(job_id)
                    self.assertEqual(calls, [])
                    self.assertEqual(store.get(job_id)["status"], status)
            self.assertTrue(worker.submit(job_id))
            worker.process(job_id)
            self.assertEqual(calls, [job_id])
            self.assertEqual(store.get(job_id)["status"], "done")


class RangeTest(unittest.TestCase):
    """Lecture de l'en-tête Range.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — serveur
    """

    def test_forms(self):
        """Intervalle complet, ouvert, suffixe ; hors du fichier refusé.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — serveur
        """
        self.assertEqual(parse_range("bytes=0-9", 100), (0, 9))
        self.assertEqual(parse_range("bytes=90-", 100), (90, 99))
        self.assertEqual(parse_range("bytes=-10", 100), (90, 99))
        self.assertIsNone(parse_range(None, 100))
        with self.assertRaises(ValueError):
            parse_range("bytes=200-300", 100)


if __name__ == "__main__":
    unittest.main()
