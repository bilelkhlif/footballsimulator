"""Tests de sécurité et d'interruption du serveur local : origines, hôte, CORS, accès au réseau privé.

Le serveur réel écoute sur la boucle locale, avec une file de test : ces tests vérifient ce qu'un
autre site pourrait faire depuis le navigateur de l'utilisateur (lire, téléverser, intégrer une
vidéo), ce que la page publique autorisée peut faire, et l'interruption puis la reprise d'une analyse.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import http.client
import json
import os
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path

from football_analysis.__main__ import main
from football_analysis.jobs import AnalysisWorker, JobStore
from football_analysis.server import DEFAULT_ALLOWED_ORIGINS, VisualizerServer, is_loopback

VIDEO_BYTES = bytes(range(256)) * 40
PUBLIC = DEFAULT_ALLOWED_ORIGINS[0]
EVIL = "https://exemple-malveillant.test"


def fake_probe(path):
    """Toute vidéo de test est lisible.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Tests du serveur — sécurité
    """
    return {"width": 64, "height": 36, "fps": 25.0}


class SecurityTest(unittest.TestCase):
    """Requêtes HTTP brutes, en-têtes Host, Origin et Sec-Fetch-Site choisis par le test.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Tests du serveur — sécurité
    """

    def setUp(self):
        """Serveur réel sur un port libre ; l'analyse attend un signal du test.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests du serveur — sécurité
        """
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        (root / "demo").mkdir()
        (root / "demo" / "index.json").write_text("{}", encoding="utf-8")
        (root / "demo" / "video.mp4").write_bytes(VIDEO_BYTES)
        (root / "visualizer.html").write_text("<!doctype html>", encoding="utf-8")
        self.release = threading.Event()
        self.runs = 0

        def analyse(path, database, progress, name):
            self.runs += 1
            for _ in range(400):
                progress("images", 0.1, "lot d'images")
                if self.release.wait(0.01):
                    break
            return {"complete": True, "metrics": {}, "limitations": []}

        self.store = JobStore(root / "jobs")
        self.worker = AnalysisWorker(self.store, analyse, chunked=True)
        self.worker.start()
        self.server = VisualizerServer(("127.0.0.1", 0), self.store, self.worker, root, lambda: {"ok": True},
                                       probe=fake_probe)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.port = self.server.server_address[1]

    def tearDown(self):
        """Libère l'analyse en cours, arrête le serveur et efface le dossier.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests du serveur — sécurité
        """
        self.release.set()
        self.server.shutdown()
        self.server.server_close()
        time.sleep(0.05)
        self.directory.cleanup()

    def request(self, method, path, headers=None, body=None, host=None):
        """Envoie une requête avec exactement ces en-têtes ; renvoie statut, en-têtes et corps.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests du serveur — sécurité
        """
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            connection.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
            connection.putheader("Host", host or f"127.0.0.1:{self.port}")
            for name, value in (headers or {}).items():
                connection.putheader(name, value)
            if body is not None:
                connection.putheader("Content-Length", str(len(body)))
            connection.endheaders(body)
            response = connection.getresponse()
            return response.status, {k.lower(): v for k, v in response.getheaders()}, response.read()
        finally:
            connection.close()

    def wait_status(self, job_id, wanted, seconds=10):
        """Attend un état d'analyse ; échoue au-delà du délai.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests du serveur — interruption
        """
        deadline = time.time() + seconds
        while time.time() < deadline:
            status = self.store.get(job_id)
            if status and status["status"] == wanted:
                return status
            time.sleep(0.02)
        self.fail(f"état {wanted} non atteint : {self.store.get(job_id)}")

    def upload(self, origin=None):
        """Téléverse une vidéo de test, depuis une origine éventuelle.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests du serveur — sécurité
        """
        headers = {"Content-Type": "video/mp4", **({"Origin": origin} if origin else {})}
        return self.request("POST", "/api/analyses?name=essai.mp4", headers, VIDEO_BYTES)

    def test_invalid_lengths_and_transfer_encoding_are_rejected(self):
        """Une longueur invalide n'abandonne pas la connexion sans réponse et ne crée aucun travail.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests du serveur — cadrage des téléversements
        """
        for headers in ({"Content-Length": "invalid"}, {"Content-Length": "-1"},
                        {"Content-Length": "1,1"}, {"Transfer-Encoding": "chunked", "Content-Length": "1"}):
            self.assertEqual(self.request("POST", "/api/analyses?name=a.mp4", headers)[0], 400)
        self.assertEqual(self.store.list(), [])
        self.assertEqual(self.request("GET", "/api/health")[0], 200)

    def test_invalid_paths_and_nested_encodings_return_controlled_errors(self):
        """NUL, encodages imbriqués, lecteurs et séparateurs ne font pas tomber un gestionnaire.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests du serveur — chemins hostiles
        """
        for path in ("/demo/%00", "/demo/%zz", "/demo/%252e%252e/file", "/demo/C:%5cWindows/file", "/demo/%5c%5cserver/file"):
            self.assertEqual(self.request("GET", path)[0], 400, path)
        self.assertEqual(self.request("GET", "/demo/index.json")[0], 200)

    def test_upload_filename_is_a_simple_bounded_name(self):
        """Un nom vidéo reste une étiquette : chemins, contrôles et noms démesurés sont refusés.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests du serveur — noms de fichiers
        """
        for name in ("../a.mp4", "C:%5ca.mp4", "%5c%5cserver%5ca.mp4", "a%00.mp4", "a" * 201 + ".mp4"):
            self.assertEqual(self.request("POST", f"/api/analyses?name={name}", {}, VIDEO_BYTES)[0], 400, name)
        self.assertEqual(self.store.list(), [])

    def test_interrupted_uploads_are_bounded_and_cleaned(self):
        """Deux corps incomplets bornent l'admission ; leur fermeture libère le disque et la file.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests du serveur — ressources des téléversements
        """
        connections = []
        try:
            for _ in range(2):
                connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
                connection.putrequest("POST", "/api/analyses?name=partial.mp4")
                connection.putheader("Content-Length", "100")
                connection.endheaders(b"partial")
                connections.append(connection)
            deadline = time.time() + 5
            while len(self.store.list()) < 2 and time.time() < deadline:
                time.sleep(0.01)
            self.assertEqual(len(self.store.list()), 2)
            self.assertEqual(self.upload()[0], 429)
            for connection in connections:
                connection.sock.shutdown(socket.SHUT_WR)
                self.assertEqual(connection.getresponse().status, 400)
            for status in self.store.list():
                self.wait_status(status["id"], "failed")
                self.assertFalse(self.store.source(status["id"]).exists())
            self.assertEqual(self.request("GET", "/api/health")[0], 200)
        finally:
            for connection in connections:
                connection.close()

    def test_local_files_cannot_escape_through_status_or_directory_links(self):
        """Les routes média et statiques refusent aussi les liens locaux et un état corrompu.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests du serveur — confinement réel des fichiers
        """
        root = Path(self.directory.name)
        external = tempfile.TemporaryDirectory()
        outside = Path(external.name)
        (outside / "secret.txt").write_text("outside-canary", encoding="utf-8")
        link = root / "demo" / "linked"
        if os.name == "nt":
            subprocess.run(["cmd.exe", "/d", "/c", "mklink", "/J", str(link), str(outside)], check=True, capture_output=True)
        else:
            link.symlink_to(outside, target_is_directory=True)
        try:
            self.assertEqual(self.request("GET", "/demo/linked/secret.txt")[0], 404)
            job_id, _ = self.store.create("a.mp4", ".mp4")
            self.store.update(job_id, source=str(outside / "secret.txt"))
            self.assertEqual(self.request("GET", f"/api/analyses/{job_id}/video")[0], 404)
        finally:
            os.rmdir(link) if os.name == "nt" else link.unlink()
            external.cleanup()

    def raw(self, data):
        """Envoie des octets bruts ; renvoie la ligne de statut, ou ce qui en tient lieu.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests du serveur — requêtes HTTP brutes
        """
        with socket.create_connection(("127.0.0.1", self.port), timeout=5) as connection:
            connection.sendall(data)
            connection.shutdown(socket.SHUT_WR)
            received = b""
            while chunk := connection.recv(65536):
                received += chunk
        return received

    def test_raw_malformed_requests_get_a_controlled_answer(self):
        """Requêtes impossibles pour un navigateur : réponse d'erreur, aucun fichier servi, serveur intact.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests du serveur — requêtes HTTP brutes
        """
        root = Path(self.directory.name)
        (root / "secret.txt").write_text("racine-privee", encoding="utf-8")
        host = f"127.0.0.1:{self.port}".encode()
        get = lambda target, extra=b"": b"GET " + target + b" HTTP/1.1\r\nHost: " + host + b"\r\n" + extra + b"\r\n"
        post = lambda length_headers: (b"POST /api/analyses?name=a.mp4 HTTP/1.1\r\nHost: " + host + b"\r\n"
                                       + length_headers + b"\r\nabcd")
        cases = {
            "NUL brut": (get(b"/demo/\x00"), b" 400 "),
            "HTTP/0.9, sans version": (b"GET /demo/index.json\r\nHost: " + host + b"\r\n\r\n", b"505"),
            "version inconnue": (b"GET /demo/index.json HTTP/9.9\r\nHost: " + host + b"\r\n\r\n", b" 505 "),
            "en-tete de 70 Kio": (get(b"/demo/index.json", b"X: " + b"a" * 70000 + b"\r\n"), b" 431 "),
            "cible absolue vers un autre hote": (get(b"http://exemple.test/demo/index.json"), b" 400 "),
            # http.server ramène « //hôte/… » à « /hôte/… » (Python 3.11) : simple chemin introuvable.
            "autorite //hote": (get(b"//serveur/partage/secret.txt"), b" 404 "),
            "sans Host": (b"GET /demo/index.json HTTP/1.1\r\n\r\n", b" 421 "),
            "methode inconnue": (b"BREW /demo/index.json HTTP/1.1\r\nHost: " + host + b"\r\n\r\n", b" 501 "),
            "traversee encodee %2e%2e%2f": (get(b"/demo/%2e%2e%2fsecret.txt"), b" 404 "),
            "separateurs meles ..%5c": (get(b"/demo/..%5csecret.txt"), b" 400 "),
            "lecteur relatif C:": (get(b"/demo/C:secret.txt"), b" 400 "),
            "UTF-8 invalide %c0%ae": (get(b"/demo/%c0%ae%c0%ae/secret.txt"), b" 400 "),
            "longueur nulle": (post(b"Content-Length: 0\r\n"), b" 413 "),
            "longueur demesuree": (post(b"Content-Length: 999999999999\r\n"), b" 413 "),
            "deux longueurs": (post(b"Content-Length: 4\r\nContent-Length: 5\r\n"), b" 400 "),
        }
        for name, (data, expected) in cases.items():
            with self.subTest(name):
                answer = self.raw(data)
                self.assertIn(expected, answer.split(b"\r\n", 1)[0] if b"HTTP/" in answer[:9] else answer, answer[:200])
                self.assertNotIn(b"racine-privee", answer)
                self.assertNotEqual(answer.strip(), b"{}", "HTTP/0.9 ne doit pas servir le fichier")
        self.assertEqual(self.store.list(), [])
        self.assertEqual(self.request("GET", "/api/health")[0], 200)

    def test_health_offers_the_licence_and_the_source_code(self):
        """/api/health du vrai serveur indique sa licence et l'adresse de son code complet.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests du serveur — offre du code source (AGPL-3.0, section 13)
        """
        from football_analysis.__main__ import describe_health
        from football_analysis.pipeline import AnalysisOptions

        state = describe_health("cpu", AnalysisOptions(models_dir=Path(self.directory.name)), 0)
        self.assertEqual(state["license"], "AGPL-3.0-only")
        self.assertEqual(state["source"], "https://github.com/bilelkhlif/footballsimulator")
        self.assertTrue(state["ok"])
        self.assertEqual(sorted(state["missingModels"]), ["ball", "pitch", "players"])

    def test_public_page_is_allowed_with_cors_and_private_network_access(self):
        """La page publique autorisée lit l'API et passe la requête préalable, accès au réseau privé compris.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests du serveur — CORS
        """
        status, headers, _ = self.request("GET", "/api/health", {"Origin": PUBLIC, "Sec-Fetch-Site": "cross-site"})
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("access-control-allow-origin"), PUBLIC)
        self.assertIn("Origin", headers.get("vary", ""))
        status, headers, _ = self.request("OPTIONS", "/api/analyses?name=a.mp4", {
            "Origin": PUBLIC, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type",
            "Access-Control-Request-Private-Network": "true"})
        self.assertEqual(status, 204)
        self.assertEqual(headers.get("access-control-allow-origin"), PUBLIC)
        self.assertEqual(headers.get("access-control-allow-private-network"), "true")
        self.assertIn("content-type", headers.get("access-control-allow-headers", "").lower())
        self.assertIn("POST", headers.get("access-control-allow-methods", ""))

    def test_other_sites_can_neither_read_nor_upload(self):
        """Un autre site est refusé : lecture, requête préalable et téléversement ; aucune analyse créée.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests du serveur — origines
        """
        for method, path in (("GET", "/api/analyses"), ("OPTIONS", "/api/analyses")):
            status, headers, _ = self.request(method, path, {"Origin": EVIL})
            self.assertEqual(status, 403, method)
            self.assertNotIn("access-control-allow-origin", headers)
        status, _, _ = self.upload(origin=EVIL)
        self.assertEqual(status, 403)
        self.assertEqual(self.store.list(), [])
        status, _, _ = self.upload(origin=f"http://127.0.0.1:{self.port}")
        self.assertEqual(status, 202, "la page servie par le serveur lui-même téléverse")

    def test_dns_rebinding_and_cross_site_embedding_are_refused(self):
        """Hôte inattendu refusé (rebond DNS) ; balise intersite sans Origin refusée sur l'API, pas sur les pages.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests du serveur — hôte et intégration
        """
        status, _, _ = self.request("GET", "/api/analyses", host=f"attaquant.test:{self.port}")
        self.assertEqual(status, 421)
        status, _, _ = self.request("GET", "/api/analyses", {"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Dest": "video"})
        self.assertEqual(status, 403)
        status, headers, _ = self.request("GET", "/visualizer.html", {"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("server-timing"), "football-analysis", "marque lue par la page servie ici")
        for host in (f"localhost:{self.port}", f"[::1]:{self.port}"):
            self.assertEqual(self.request("GET", "/api/health", host=host)[0], 200, host)
        self.assertEqual(self.request("GET", "/demo/index.json")[0], 200, "la démonstration est servie aussi")

    def test_demo_video_supports_partial_reads(self):
        """La vidéo de démonstration servie ici accepte la lecture partielle, nécessaire à l'avance rapide.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests du serveur — démonstration
        """
        status, headers, body = self.request("GET", "/demo/video.mp4", {"Range": "bytes=10-19"})
        self.assertEqual(status, 206)
        self.assertEqual(headers.get("content-range"), f"bytes 10-19/{len(VIDEO_BYTES)}")
        self.assertEqual(body, VIDEO_BYTES[10:20])

    def test_encoded_api_paths_have_the_same_cross_site_policy(self):
        """L'encodage du préfixe ne contourne ni Host / Origin, ni le refus intersite sans Origin.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests du serveur — normalisation commune des chemins et de la sécurité
        """
        for path in ("/%61pi/analyses", "/api/%61nalyses", "/api%2fanalyses", "/%61pi/health"):
            for method in ("GET", "HEAD"):
                with self.subTest(path=path, method=method):
                    status, _, _ = self.request(method, path, {"Sec-Fetch-Site": "cross-site"})
                    self.assertEqual(status, 403)
                    self.assertEqual(self.request(method, path, {"Origin": EVIL})[0], 403)
                    status, headers, _ = self.request(method, path, {"Origin": PUBLIC})
                    self.assertEqual(status, 200)
                    self.assertEqual(headers.get("access-control-allow-origin"), PUBLIC)

    def test_encoded_post_upload_interrupt_and_resume_use_the_same_path(self):
        """Les routes POST autorisées utilisent le même décodage que leur contrôle d'accès.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests du serveur — routes POST normalisées
        """
        status, _, body = self.request("POST", "/%61pi/analyses?name=essai.mp4", {"Origin": PUBLIC}, VIDEO_BYTES)
        self.assertEqual(status, 202)
        job_id = json.loads(body)["id"]
        self.wait_status(job_id, "running")
        encoded = f"/%61pi/analyses/{job_id}"
        self.assertEqual(self.request("POST", encoded + "/%69nterrupt", {"Origin": PUBLIC})[0], 202)
        self.wait_status(job_id, "interrupted")
        self.release.set()
        self.assertEqual(self.request("POST", encoded + "/%72esume", {"Origin": PUBLIC})[0], 202)
        self.wait_status(job_id, "done")
        self.assertEqual(self.runs, 2)

    def test_loopback_only_by_default(self):
        """Adresses de la boucle locale reconnues ; « serve » refuse une autre adresse sans --allow-network.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests du serveur — écoute locale
        """
        for host in ("127.0.0.1", "127.0.0.2", "::1", "[::1]", "localhost"):
            self.assertTrue(is_loopback(host), host)
        for host in ("0.0.0.0", "192.168.1.20", "::", "exemple.test"):
            self.assertFalse(is_loopback(host), host)
        self.assertEqual(main(["serve", "--host", "0.0.0.0", "--port", "0"]), 2)

    def test_running_analysis_is_interrupted_then_resumed(self):
        """Interrompre une analyse en cours la rend « interrupted » et reprenable ; la reprise la termine.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests du serveur — interruption
        """
        status, _, body = self.upload()
        job_id = json.loads(body)["id"]
        self.wait_status(job_id, "running")
        status, _, body = self.request("POST", f"/api/analyses/{job_id}/interrupt", {"Origin": PUBLIC})
        self.assertEqual(status, 202)
        self.assertTrue(json.loads(body)["interruptRequested"])
        interrupted = self.wait_status(job_id, "interrupted")
        self.assertTrue(interrupted["resumable"])
        self.release.set()
        status, _, _ = self.request("POST", f"/api/analyses/{job_id}/resume", {"Origin": PUBLIC})
        self.assertEqual(status, 202)
        self.wait_status(job_id, "done")
        self.assertEqual(self.runs, 2)
        status, _, _ = self.request("POST", f"/api/analyses/{job_id}/interrupt")
        self.assertEqual(status, 409, "une analyse terminée ne s'interrompt pas")

    def test_queued_analysis_is_interrupted_before_it_starts(self):
        """Une analyse en attente interrompue n'est jamais lancée, mais reste reprenable.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests du serveur — interruption
        """
        first = json.loads(self.upload()[2])["id"]
        self.wait_status(first, "running")
        second = json.loads(self.upload()[2])["id"]
        self.assertEqual(self.store.get(second)["status"], "queued")
        status, _, _ = self.request("POST", f"/api/analyses/{second}/interrupt")
        self.assertEqual(status, 202)
        self.assertEqual(self.store.get(second)["status"], "interrupted")
        self.release.set()
        self.wait_status(first, "done")
        time.sleep(0.2)
        self.assertEqual(self.store.get(second)["status"], "interrupted")
        self.assertEqual(self.runs, 1, "l'analyse interrompue en attente n'a pas tourné")
        self.assertTrue(self.store.get(second)["resumable"])


if __name__ == "__main__":
    unittest.main()
