"""Tests de l'export statique (mode démo) et de la démonstration synthétique.

L'export est vérifié sur une petite base construite ici avec la vraie ChunkStore : fichiers écrits,
adresses relatives, provenance, schémas JSON, refus des analyses incomplètes ou abîmées, écriture
atomique, détection des fichiers modifiés et catalogue. La démonstration publique est vérifiée telle
qu'elle est versionnée (demo/), et son générateur sur ses propriétés : reproductible, conforme au
contrat, coupures, plan non calibré, contact d'identité incertaine et vitesses plausibles.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import hashlib
import json
import math
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from football_analysis import contract, demo_match
from football_analysis.chunk_storage import ChunkStore
from football_analysis.static_export import (ExportError, catalog_problems, export_analysis, gallery_quality, path_problems,
                                             update_catalog, verify_bundle, _relative_file)

REPOSITORY = Path(__file__).resolve().parents[2]
SCHEMAS = REPOSITORY / "src" / "visualizer" / "schemas"
VIDEO = b"\x00\x00\x00\x18ftypmp42" + bytes(range(256)) * 8


def make_frames(start, count, ids=(1, 2)):
    """Images de test calibrées, deux joueurs qui avancent d'un mètre par image.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Tests de l'export statique — données
    """
    frames = []
    for step in range(count):
        time = round((start + step) * 0.08, 4)
        objects = [contract.make_object(track, "player", 0.9, [10 * track, 20, 10 * track + 8, 40],
                                        (float(start + step), float(track)), "ok", track % 2, 1.0) for track in ids]
        calibration = {"status": "ok", "keypoints": 8, "inliers": 8, "homography": [1, 0, 0, 0, 1, 0, 0, 0, 1]}
        frames.append(contract.make_frame(2 * (start + step), time, 0, False, calibration, objects, None))
    return frames


def make_store(path, complete=True, video_bytes=VIDEO, source_name="match-test.mp4"):
    """Base d'analyse terminée (ou non) de deux segments, signée avec l'empreinte de la vidéo.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Tests de l'export statique — données
    """
    header = {"format": contract.FORMAT, "version": contract.VERSION,
              "source": {"kind": "file", "name": source_name, "width": 64, "height": 36, "fps": 25.0, "duration": 2.0},
              "analysis": {"createdAt": "2026-11-24T10:00:00+00:00", "stride": 2, "fps": 12.5, "chunkSeconds": 1.0,
                           "models": {"players": {"file": "football-player-detection.pt", "sha256": "0" * 64}}},
              "pitch": dict(contract.PITCH)}
    signature = {"schema": 1, "sourceSha256": hashlib.sha256(video_bytes).hexdigest(), "weights": {"players": "0" * 64},
                 "implementation": {"chunk_storage": "1" * 64}, "versions": {"numpy": "2.0"}, "settings": {"target_fps": 12.5}}
    with ChunkStore(path, header, signature) as store:
        for seq, frames in enumerate((make_frames(0, 12), make_frames(12, 13))):
            store.commit_raw(seq, frames, None, {"seq": seq})
            store.publish(seq, frames)
        if complete:
            tracks = [{"id": 1, "role": "player", "team": 1, "teamConfidence": 1.0, "firstTime": 0.0, "lastTime": 1.92,
                       "distanceM": 24.0}, {"id": 2, "role": "player", "team": 0, "teamConfidence": 1.0,
                                            "firstTime": 0.0, "lastTime": 1.92, "distanceM": 24.0}]
            store.finish(header, {"teams": [{"id": 0, "color": "#ff0000", "tracks": 1}, {"id": 1, "color": "#0000ff", "tracks": 1}],
                                  "metrics": {"detection": {"frames": 25}}, "limitations": ["Données de test."], "tracks": tracks})


class StaticExportTest(unittest.TestCase):
    """Export d'une analyse terminée vers des fichiers statiques.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Tests de l'export statique
    """

    def setUp(self):
        """Base terminée et vidéo de test dans un dossier temporaire.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'export statique
        """
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.database = self.root / "analyse.sqlite"
        self.video = self.root / "match-test.mp4"
        self.video.write_bytes(VIDEO)
        make_store(self.database)

    def tearDown(self):
        """Efface le dossier temporaire.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'export statique
        """
        self.directory.cleanup()

    def export(self, name="export", **options):
        """Exporte la base de test vers un dossier du répertoire temporaire.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'export statique
        """
        return export_analysis(self.database, self.root / name, video=options.pop("video", self.video),
                               analysis_id=options.pop("analysis_id", "match-test"), **options)

    def test_export_is_complete_relative_and_verified(self):
        """Manifeste, segments, trajectoires et vidéo écrits ; adresses relatives ; aucun chemin local.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'export statique
        """
        manifest = self.export()
        output = self.root / "export"
        self.assertEqual(verify_bundle(output), [])
        storage = manifest["storage"]
        self.assertEqual((storage["frameCount"], len(storage["chunks"]), storage["tracks"]["count"]), (25, 2, 2))
        self.assertEqual([chunk["file"] for chunk in storage["chunks"]], ["chunks/00000.json", "chunks/00001.json"])
        self.assertEqual(manifest["video"]["file"], "video.mp4")
        self.assertEqual(manifest["provenance"]["kind"], "analysis")
        self.assertEqual(manifest["provenance"]["analysis"]["sourceSha256"], hashlib.sha256(VIDEO).hexdigest())
        self.assertIn("implementation", manifest["provenance"]["analysis"])
        tracks = json.loads((output / "tracks.json").read_text(encoding="utf-8"))["tracks"]
        self.assertTrue(all("roleVotes" not in track for track in tracks), "votes internes retirés")
        for path in output.rglob("*.json"):
            text = path.read_text(encoding="utf-8")
            self.assertNotIn(str(self.root), text)
            self.assertEqual(path_problems(json.loads(text)), [], path.name)
        self.assertFalse(any(item.name.startswith(".") for item in self.root.iterdir()), "aucun dossier temporaire laissé")

    def test_export_conforms_to_json_schemas(self):
        """Les fichiers exportés respectent les schémas JSON publiés avec le visualiseur.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'export statique — schémas
        """
        try:
            import jsonschema
        except ImportError:
            self.skipTest("jsonschema absent : contrôle des schémas formels non exécuté")
        self.export()
        output = self.root / "export"

        def load(path):
            return json.loads(Path(path).read_text(encoding="utf-8"))

        for schema in SCHEMAS.glob("*.schema.json"):
            jsonschema.Draft202012Validator.check_schema(load(schema))
        manifest = load(output / "manifest.json")
        jsonschema.validate(manifest, load(SCHEMAS / "static-manifest.schema.json"))
        for chunk in manifest["storage"]["chunks"]:
            jsonschema.validate(load(output / chunk["file"]), load(SCHEMAS / "static-chunk.schema.json"))
        jsonschema.validate(load(output / "tracks.json"), load(SCHEMAS / "static-tracks.schema.json"))

    def test_incomplete_or_unreadable_analysis_is_refused(self):
        """Analyse non terminée, base illisible : erreur claire, aucun dossier écrit.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'export statique — erreurs
        """
        partial = self.root / "partielle.sqlite"
        make_store(partial, complete=False)
        with self.assertRaisesRegex(ExportError, "incomplète"):
            export_analysis(partial, self.root / "a", video=self.video, analysis_id="a")
        garbage = self.root / "abimee.sqlite"
        garbage.write_bytes(b"pas une base sqlite" * 10)
        with self.assertRaisesRegex(ExportError, "illisible|incompatible"):
            export_analysis(garbage, self.root / "b", video=self.video, analysis_id="b")
        self.assertFalse((self.root / "a").exists() or (self.root / "b").exists())

    def test_corrupted_segment_keeps_previous_export(self):
        """Un segment abîmé fait échouer l'export ; l'export précédent reste intact (remplacement atomique).

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'export statique — écriture atomique
        """
        self.export()
        before = (self.root / "export" / "manifest.json").read_bytes()
        connection = sqlite3.connect(self.database)
        try:
            with connection:
                connection.execute("UPDATE ready_chunks SET frames=? WHERE seq=1", (b"\x78\x9cabime",))
        finally:
            connection.close()  # Windows : une base restée ouverte ne peut pas être effacée
        with self.assertRaisesRegex(ExportError, "corrompue|illisible"):
            self.export(overwrite=True)
        self.assertEqual((self.root / "export" / "manifest.json").read_bytes(), before)
        self.assertEqual(verify_bundle(self.root / "export"), [])

    def test_video_must_be_the_analysed_one_and_browser_readable(self):
        """Une autre vidéo est refusée (synchronisation non garantie), sauf demande explicite, signalée.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'export statique — vidéo
        """
        other = self.root / "autre.mp4"
        other.write_bytes(VIDEO + b"!")
        with self.assertRaisesRegex(ExportError, "pas celle qui a été analysée"):
            self.export(video=other)
        manifest = self.export(name="transcodee", video=other, allow_other_video=True)
        self.assertIn("transcodage", " ".join(manifest["provenance"]["notes"]))
        mkv = self.root / "match.mkv"
        mkv.write_bytes(VIDEO)
        with self.assertRaisesRegex(ExportError, "MP4"):
            self.export(name="mkv", video=mkv)
        with self.assertRaisesRegex(ExportError, "existe déjà"):
            self.export(name="transcodee", video=other, allow_other_video=True)

    def test_tampered_or_missing_files_are_detected(self):
        """Un segment modifié ou supprimé après l'export est signalé par la vérification.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'export statique — intégrité
        """
        self.export()
        output = self.root / "export"
        chunk = output / "chunks" / "00000.json"
        chunk.write_bytes(chunk.read_bytes().replace(b'"time":0.0', b'"time":0.5', 1))
        self.assertTrue(any("empreinte" in problem for problem in verify_bundle(output)))
        chunk.unlink()
        self.assertTrue(any("manquant" in problem for problem in verify_bundle(output)))

    def test_local_paths_are_stripped_or_refused(self):
        """Un chemin dans le nom de la source est réduit au nom du fichier ; un chemin ailleurs est refusé.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'export statique — aucun chemin local
        """
        database = self.root / "chemin.sqlite"
        make_store(database, source_name=r"C:\Users\quelqu'un\Vidéos\match-test.mp4")
        manifest = export_analysis(database, self.root / "chemin", video=self.video, analysis_id="chemin")
        self.assertEqual(manifest["source"]["name"], "match-test.mp4")
        self.assertTrue(path_problems({"limitations": ["/home/quelqu'un/match.mp4"]}))

    def test_catalog_lists_exports_with_relative_paths(self):
        """Le catalogue ajoute ou remplace une entrée, toujours relative ; un export hors du dossier est refusé.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'export statique — catalogue
        """
        demo = self.root / "demo"
        manifest = export_analysis(self.database, demo / "matches" / "match-test", video=self.video, analysis_id="match-test")
        catalog = update_catalog(demo / "index.json", demo / "matches" / "match-test", manifest, "essai")
        self.assertEqual(catalog["matches"][0]["path"], "matches/match-test/")
        catalog = update_catalog(demo / "index.json", demo / "matches" / "match-test", manifest, "remplacé")
        self.assertEqual(len(catalog["matches"]), 1)
        self.assertEqual(catalog_problems(json.loads((demo / "index.json").read_text(encoding="utf-8"))), [])
        with self.assertRaisesRegex(ExportError, "dossier du catalogue"):
            update_catalog(demo / "index.json", self.root / "ailleurs", manifest)

    def test_catalog_gallery_fields_are_kept_checked_and_measured(self):
        """Galerie : champs gardés d'un export à l'autre, qualité lue dans les mesures, ordre, verdict contrôlé.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests de l'export statique — galerie
        """
        demo = self.root / "demo"
        bundle = demo / "matches" / "match-test"
        manifest = export_analysis(self.database, bundle, video=self.video, analysis_id="match-test")
        (bundle / "thumbnail.jpg").write_bytes(b"\xff\xd8\xff\xd9")
        check = {"verdict": "rejected", "note": "ligne de but prise pour la ligne médiane"}
        catalog = update_catalog(demo / "index.json", bundle, manifest, "essai",
                                 gallery={"category": "Suivi difficile", "credit": "Auteur — CC BY-SA 4.0",
                                          "order": 3, "calibrationCheck": check})
        entry = catalog["matches"][0]
        self.assertEqual(entry["thumbnail"], "matches/match-test/thumbnail.jpg")
        self.assertEqual(entry["calibrationCheck"], check)
        metrics = manifest["metrics"]
        self.assertEqual(entry["quality"]["calibratedShare"], (metrics.get("calibration") or {}).get("calibratedShare"))
        self.assertEqual(entry["quality"]["implausibleSpeedShare"],
                         (metrics.get("positions") or {}).get("implausibleSpeedShare"))
        shots = (metrics.get("tracking") or {}).get("shots")
        self.assertEqual(entry["quality"]["cuts"], None if shots is None else shots - 1)
        full = {"detection": {"peoplePerFrame": {"player": 11.8}, "ballFrameShare": 0.84},
                "tracking": {"shots": 2, "medianTrackSeconds": 2.8}, "calibration": {"calibratedShare": 0.95},
                "positions": {"implausibleSpeedShare": 0.11}, "identity": {"uncertainSeconds": 0},
                "teams": {"knownTeamShare": 0.97, "medianMajorityShare": 0.55}}
        self.assertEqual(gallery_quality(full), {"knownTeamShare": 0.97, "teamMajorityShare": 0.55,
                                                 "playersPerFrame": 11.8, "ballShare": 0.84, "calibratedShare": 0.95,
                                                 "medianTrackSeconds": 2.8, "uncertainIdentitySeconds": 0,
                                                 "implausibleSpeedShare": 0.11, "cuts": 1})
        teams = {"verdict": "verified", "note": "40 trajectoires contrôlées, aucune erreur"}
        catalog = update_catalog(demo / "index.json", bundle, manifest, gallery={"teamCheck": teams})
        self.assertEqual(catalog["matches"][0]["teamCheck"], teams)
        self.assertEqual(catalog["matches"][0]["calibrationCheck"], check, "verdict précédent conservé")
        again = update_catalog(demo / "index.json", bundle, manifest)["matches"][0]
        for key in ("category", "credit", "order", "calibrationCheck", "description"):
            self.assertEqual(again[key], entry[key], key)
        self.assertEqual(catalog_problems(json.loads((demo / "index.json").read_text(encoding="utf-8"))), [])
        bad = json.loads((demo / "index.json").read_text(encoding="utf-8"))
        bad["matches"][0]["calibrationCheck"] = {"verdict": "parfait", "note": ""}
        bad["matches"][0]["order"] = -1
        bad["matches"][0]["quality"]["cuts"] = "deux"
        bad["matches"][0]["teamCheck"] = {"verdict": "parfaites"}
        self.assertEqual(len(catalog_problems(bad)), 4)

    def test_export_file_names_are_relative_on_windows_and_posix(self):
        """UNC, adresse réseau, lecteur relatif, flux Windows et chemin absolu sont refusés.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'export statique — adresses portables
        """
        for value in ("//server/share/file.json", r"\\server\share\file.json", "D:outside.json",
                      "C:/outside.json", "/outside.json", "../outside.json", "chunks/../outside.json",
                      "//example.invalid/tracks.json", "chunks/file.json:stream", ".", "file\x00.json"):
            with self.subTest(value=repr(value)):
                self.assertFalse(_relative_file(value))
        for value in ("chunks/00000.json", "tracks.json", "images/affiche du match.jpg", "matches/match-test/"):
            self.assertTrue(_relative_file(value), value)

    def test_export_rejects_external_extra_names_before_any_external_io(self):
        """Un nom joint invalide est refusé avant création de dossier ou copie hors de l'export.

        Les gardes de test évitent tout accès UNC même avec l'ancienne implémentation défectueuse.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'export statique — confinement des écritures
        """
        original_mkdir, original_copy = Path.mkdir, shutil.copyfile

        def guarded_mkdir(path, *args, **kwargs):
            """Interdit une tentative de création hors du dossier temporaire du test."""
            self.assertTrue(Path(path).is_relative_to(self.root), "création externe tentée")
            return original_mkdir(path, *args, **kwargs)

        def guarded_copy(source, target, *args, **kwargs):
            """Interdit une tentative de copie hors du dossier temporaire du test."""
            self.assertTrue(Path(target).is_relative_to(self.root), "copie externe tentée")
            return original_copy(source, target, *args, **kwargs)

        for index, relative in enumerate(("//server/share/file.json", "D:outside.json", "C:/outside.json")):
            with self.subTest(relative=relative), patch.object(Path, "mkdir", guarded_mkdir), \
                    patch("football_analysis.static_export.shutil.copyfile", guarded_copy):
                with self.assertRaisesRegex(ExportError, "nommé|relative"):
                    self.export(name=f"invalide-{index}", extra_files={relative: self.video})

    def test_bundle_extra_descriptors_are_validated_before_file_access(self):
        """Un descripteur joint ne peut désigner un chemin UNC ou un lecteur relatif.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'export statique — contrôle des fichiers joints du manifeste
        """
        self.export()
        output = self.root / "export"
        manifest_path = output / "manifest.json"
        manifest = json.loads(manifest_path.read_bytes())
        original_is_file = Path.is_file

        def guarded_is_file(path):
            """Échoue avant tout accès à un autre volume, même avec l'ancien vérificateur."""
            self.assertTrue(Path(path).is_relative_to(output), "lecture externe tentée")
            return original_is_file(path)

        for relative in ("//server/share/file.json", "D:outside.json"):
            with self.subTest(relative=relative):
                manifest["files"] = {"joint": {"file": relative, "bytes": 1, "sha256": "0" * 64}}
                manifest_path.write_bytes(json.dumps(manifest).encode("utf-8"))
                with patch.object(Path, "is_file", guarded_is_file):
                    problems = verify_bundle(output)
                self.assertTrue(any("relative" in problem for problem in problems), problems)

    def test_bundle_resolved_files_cannot_leave_the_export_directory(self):
        """Manifeste, trajectoires et segments ne peuvent suivre un lien hors du dossier choisi.

        Un lien réel est utilisé si le système l'autorise ; sinon sa résolution est simulée,
        sans ignorer le contrôle de confinement ni lire de fichier de l'utilisateur.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'export statique — confinement des lectures et liens
        """
        self.export()
        output = self.root / "export"
        outside = self.root / "hors-export.json"
        original_resolve = Path.resolve
        for relative in ("manifest.json", "tracks.json", "chunks/00000.json"):
            target = output / relative
            contents = target.read_bytes()
            outside.write_bytes(contents)
            target.unlink()
            linked = True
            try:
                target.symlink_to(outside)
            except (OSError, NotImplementedError):
                linked = False
                target.write_bytes(contents)

            def resolved(path, *args, **kwargs):
                """Modélise le lien lorsque sa création demande un droit absent sur Windows."""
                return outside if path == target else original_resolve(path, *args, **kwargs)

            try:
                if linked:
                    problems = verify_bundle(output)
                else:
                    with patch.object(Path, "resolve", resolved):
                        problems = verify_bundle(output)
                self.assertTrue(any("hors" in problem for problem in problems), (relative, problems))
            finally:
                target.unlink()
                target.write_bytes(contents)


class PublicDemoTest(unittest.TestCase):
    """Démonstration publique versionnée (demo/) et son générateur.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Tests de la démonstration synthétique
    """

    @classmethod
    def setUpClass(cls):
        """Simule une fois la rencontre et ses annotations, sans rendre la vidéo.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de la démonstration synthétique
        """
        cls.people, cls.balls, cls.pair = demo_match.simulate()
        holders = [min((p.positions[step] for p in cls.people if p.role != "referee"),
                       key=lambda point: np.linalg.norm(point - ball)) for step, ball in enumerate(cls.balls)]
        cls.views = demo_match.cameras(cls.balls, holders)
        cls.frames, cls.contact = demo_match.annotate(cls.people, cls.balls, cls.views, cls.pair)

    def test_committed_demo_is_valid_and_complete(self):
        """Le catalogue et l'export versionnés sont intacts : empreintes, segments, vidéo et affiche.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de la démonstration synthétique
        """
        catalog = json.loads((REPOSITORY / "demo" / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(catalog_problems(catalog), [])
        for entry in catalog["matches"]:
            bundle = REPOSITORY / "demo" / entry["path"]
            self.assertEqual(verify_bundle(bundle), [], entry["id"])
            manifest = json.loads((bundle / "manifest.json").read_text(encoding="utf-8"))
            if entry["kind"] == "synthetic":
                self.assertEqual(manifest["provenance"]["kind"], "synthetic")
            else:
                registry = json.loads((REPOSITORY / "demo" / "media-licenses.json").read_text(encoding="utf-8"))["matches"]
                approval = registry[entry["id"]]
                self.assertEqual(manifest["provenance"]["kind"], "analysis")
                for key in ("author", "license", "licenseUrl", "sourceUrl", "changes"):
                    self.assertEqual(manifest["provenance"]["media"][key], approval[key])
                self.assertEqual(manifest["video"]["sha256"], approval["files"][manifest["video"]["file"]])

    def test_simulation_is_reproducible(self):
        """Même graine, mêmes positions : la démonstration se régénère à l'identique.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de la démonstration synthétique
        """
        people, balls, pair = demo_match.simulate()
        self.assertEqual(pair, self.pair)
        self.assertTrue(np.allclose(people[3].positions[500], self.people[3].positions[500]))
        self.assertTrue(np.allclose(balls[700], self.balls[700]))

    def test_annotations_follow_the_contract_and_the_scenario(self):
        """Contrat respecté, coupures à 24 et 28 s, plan rapproché sans position, nouveaux identifiants.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de la démonstration synthétique
        """
        previous = -1.0
        for position, frame in enumerate(self.frames):
            self.assertEqual(contract._frame_problems(frame, position, previous), [])  # pylint: disable=protected-access
            previous = frame["time"]
        self.assertEqual([frame["time"] for frame in self.frames if frame["cut"]], [24.0, 28.0])
        close = [frame for frame in self.frames if 24.0 <= frame["time"] < 28.0]
        self.assertTrue(close and all(frame["calibration"]["status"] == "failed" for frame in close))
        self.assertTrue(all(obj["pitch"] is None for frame in close for obj in frame["objects"]))
        ids = {shot: {obj["id"] for frame in self.frames if frame["shot"] == shot for obj in frame["objects"]} for shot in (0, 1, 2)}
        self.assertFalse(ids[0] & ids[1] or ids[1] & ids[2] or ids[0] & ids[2], "identifiants renouvelés à chaque coupure")

    def test_scripted_contact_is_uncertain_and_speeds_are_plausible(self):
        """Le contact masqué dure au moins une seconde, sans équipe ; aucune vitesse au-delà d'un sprint.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de la démonstration synthétique
        """
        self.assertIsNotNone(self.contact)
        self.assertGreaterEqual(self.contact["end"] - self.contact["start"], 1.0)
        uncertain = [obj for frame in self.frames for obj in frame["objects"] if obj.get("identity") == "uncertain"]
        self.assertTrue(uncertain and all(obj["team"] is None for obj in uncertain))
        previous, fastest = {}, 0.0
        for frame in self.frames:
            for obj in frame["objects"]:
                if obj["pitch"] is not None and obj["role"] != "referee":
                    if obj["id"] in previous and frame["time"] - previous[obj["id"]][0] < 0.2:
                        time, point = previous[obj["id"]]
                        fastest = max(fastest, math.dist(point, obj["pitch"]) / (frame["time"] - time))
                    previous[obj["id"]] = (frame["time"], obj["pitch"])
        self.assertLess(fastest, 9.0)

    def test_frame_code_round_trip(self):
        """Le numéro d'image dessiné en binaire se relit tel quel (outil de vérification de synchronisation).

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de la démonstration synthétique
        """
        image = np.zeros((demo_match.HEIGHT, demo_match.WIDTH, 3), dtype=np.uint8)
        for frame in (0, 1, 299, 899, 4095):
            demo_match._draw_overlay(image, frame)  # pylint: disable=protected-access
            self.assertEqual(demo_match.frame_code(image), frame)


if __name__ == "__main__":
    unittest.main()
