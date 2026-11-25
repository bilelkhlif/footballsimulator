"""Tests contrôlés du stockage borné, de la reprise et des équipes persistantes, sans poids.

Ces vidéos et plongements sont synthétiques : aucune précision football n'en est déduite.
Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
import supervision as sv

from football_analysis.chunk_storage import ChunkStore
from football_analysis.contract import validate_document
from football_analysis.incremental_metrics import quality_metrics_stream
from football_analysis.incremental_pipeline import analyse_to_store, BoundedCrops, BoundedPeopleTracker, detect_chunks
from football_analysis.metrics import quality_metrics
from football_analysis.pipeline import AnalysisOptions, FrameClock
from football_analysis.streaming_teams import FrozenTeamModel, TeamState


class SyntheticClassifier:
    """Plongements de couleur contrôlés, sans réseau profond.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Tests incrémentaux — double de classification
    """

    def __init__(self):
        """Utilise KMeans réel, avec une réduction identité contrôlée.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — double de classification
        """
        from sklearn.cluster import KMeans

        self.reducer = self
        self.cluster_model = KMeans(n_clusters=2, n_init=10, random_state=0)
        self.crop_torso = True

    def fit_transform(self, features):
        """Garde les couleurs comme coordonnées.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — plongements synthétiques
        """
        return features

    def extract_features(self, crops):
        """Résume chaque découpage par ses trois canaux moyens.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — plongements synthétiques
        """
        return np.asarray([image.mean(axis=(0, 1)) for image in crops], dtype=np.float32)


def classifier_factory(*args):
    """Construit le double sans GPU ni téléchargement.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Tests incrémentaux — injection des modèles
    """
    return SyntheticClassifier()


def frozen_factory(backbone, device, seed=0):
    """Garde la logique persistante réelle et remplace seulement les plongements.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Tests incrémentaux — injection des modèles
    """
    return FrozenTeamModel(backbone, device, seed, classifier_factory=classifier_factory)


class SyntheticDetector:
    """Quatre boîtes fixes dans la vidéo contrôlée.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Tests incrémentaux — double de détection
    """

    people_classes = {0: "player"}

    def detect(self, image):
        """Renvoie quatre détections, pour exercer ByteTrack réel.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — double de détection
        """
        boxes = np.array([[4 + k * 24, 12, 20 + k * 24, 54] for k in range(4)], dtype=np.float32)
        return sv.Detections(xyxy=boxes, confidence=np.full(4, .9, dtype=np.float32), class_id=np.zeros(4, dtype=int)), None


class SyntheticCalibration:
    """Homographie contrôlée, sans estimation de précision.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Tests incrémentaux — double de calibration
    """

    ok = True

    def calibrate(self, image):
        """Renvoie le résultat fixe.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — double de calibration
        """
        return self

    def project(self, points):
        """Projette les pieds dans un petit terrain contrôlé.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — double de calibration
        """
        return points * .1

    def to_dict(self):
        """Décrit l'homographie synthétique au format du contrat.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — double de calibration
        """
        return {"status": "ok", "keypoints": 6, "fitErrorPx": .1, "fitErrorM": .01,
                "holdoutErrorPx": .2, "holdoutErrorM": .02, "homography": [[.1, 0, 0], [0, .1, 0], [0, 0, 1]]}


def fake_models(*args):
    """Remplace les poids, sans remplacer le suivi ni le stockage.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Tests incrémentaux — injection des modèles
    """
    return SyntheticDetector(), SyntheticCalibration(), {"synthetic": True}


class ChunkPipelineTest(unittest.TestCase):
    """Chaîne réelle avec détections contrôlées et vidéo MJPEG locale.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Tests incrémentaux — interruptions et continuité
    """

    def setUp(self):
        """Crée quatre secondes de maillots rouges et bleus.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — préparation
        """
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.video = self.root / "controlled.avi"
        writer = cv2.VideoWriter(str(self.video), cv2.VideoWriter_fourcc(*"MJPG"), 10, (96, 64))
        for _ in range(40):
            image = np.zeros((64, 96, 3), dtype=np.uint8)
            image[:, :48] = (20, 20, 220)
            image[:, 48:] = (220, 20, 20)
            writer.write(image)
        writer.release()
        self.options = AnalysisOptions(device="cpu", models_dir=self.root, target_fps=10, chunk_seconds=1)
        constructor = FrozenTeamModel.__init__

        def synthetic_init(model, backbone, device, seed=0, max_fit_crops=512, classifier_factory=None):
            # Conserve l'initialisation réelle ; seuls les plongements profonds sont remplacés.
            constructor(model, backbone, device, seed, max_fit_crops, globals()["classifier_factory"])

        self.patches = [patch("football_analysis.incremental_pipeline._load_models", fake_models),
                        patch.object(FrozenTeamModel, "__init__", synthetic_init)]
        for item in self.patches:
            item.start()

    def tearDown(self):
        """Libère les remplacements et le dossier temporaire.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — nettoyage
        """
        for item in self.patches:
            item.stop()
        self.directory.cleanup()

    def document(self, path):
        """Reconstitue seulement le petit document de test pour le comparer.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — assertions
        """
        with ChunkStore(path) as store:
            return json.loads(b"".join(store.iter_document()))

    def test_resume_detection_and_classification_without_duplicate_records(self):
        """Une interruption après validation ne refait pas YOLO et reproduit les images finales.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — reprise déterministe
        """
        baseline = self.root / "baseline.sqlite"
        target = self.root / "resumed.sqlite"
        analyse_to_store(self.video, baseline, self.options)

        def interrupt(stage, fraction, message):
            # Après le premier segment : des images restent récupérables.
            if stage == "images" and fraction and fraction > .25:
                raise RuntimeError("arrêt contrôlé")

        with self.assertRaisesRegex(RuntimeError, "arrêt contrôlé"):
            analyse_to_store(self.video, target, self.options, interrupt)
        with ChunkStore(target) as store:
            self.assertFalse(store.manifest()["complete"])
            self.assertGreater(store.manifest()["storage"]["readyChunks"], 0)
            prefix = store.manifest()["storage"]["frameCount"]
        with patch.object(SyntheticDetector, "detect", wraps=SyntheticDetector().detect) as detect:
            analyse_to_store(self.video, target, self.options)
            self.assertEqual(detect.call_count, 40 - prefix)
        expected, result = self.document(baseline), self.document(target)
        self.assertEqual(expected["frames"], result["frames"])
        self.assertEqual(expected["tracks"], result["tracks"])
        self.assertEqual(validate_document(result), [])
        ids = [frame["index"] for frame in result["frames"]]
        self.assertEqual(ids, sorted(set(ids)))
        self.assertEqual(result["frames"][9]["objects"][0]["id"], result["frames"][10]["objects"][0]["id"])

    def test_interruption_during_team_publication_preserves_votes_and_distance(self):
        """La reprise des équipes remplace une publication sans recompter les observations.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — transaction de classification
        """
        target = self.root / "team-resume.sqlite"
        self.options.team_fit_seconds = 2

        def interrupt(stage, fraction, message):
            if stage == "équipes" and fraction and fraction > .8:
                raise RuntimeError("arrêt équipes")

        with self.assertRaisesRegex(RuntimeError, "arrêt équipes"):
            analyse_to_store(self.video, target, self.options, interrupt)
        with ChunkStore(target) as store:
            self.assertEqual(store.state("team_cursor"), 0)
        with patch.object(SyntheticDetector, "detect", side_effect=AssertionError("YOLO ne doit pas être rappelé")):
            analyse_to_store(self.video, target, self.options)
        document = self.document(target)
        self.assertEqual(len(document["frames"]), 40)
        self.assertTrue(all(track["observations"] == 39 for track in document["tracks"]))
        self.assertTrue(all(track["distanceM"] == 0 for track in document["tracks"]))
        self.assertTrue(all(obj["team"] is not None for frame in document["frames"] for obj in frame["objects"]))

    def test_signature_and_completed_job_prevent_accidental_reprocessing(self):
        """Une analyse finie n'est pas recalculée ; un réglage différent est refusé.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — intégrité de reprise
        """
        target = self.root / "complete.sqlite"
        analyse_to_store(self.video, target, self.options)
        with patch("football_analysis.incremental_pipeline._load_models", side_effect=AssertionError("pas de modèles")):
            self.assertTrue(analyse_to_store(self.video, target, self.options)["complete"])
        self.options.chunk_seconds = 2
        with self.assertRaisesRegex(ValueError, "réglages"):
            analyse_to_store(self.video, target, self.options)

    def test_resume_repairs_crash_between_commit_and_preview(self):
        """Un segment validé mais pas encore publié redevient visible à la reprise.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — interruption entre deux transactions
        """
        target = self.root / "preview-crash.sqlite"
        with patch.object(ChunkStore, "publish", side_effect=RuntimeError("arrêt aperçu")):
            with self.assertRaisesRegex(RuntimeError, "arrêt aperçu"):
                analyse_to_store(self.video, target, self.options)
        with ChunkStore(target) as store:
            self.assertEqual(store.manifest()["storage"]["committedChunks"], 1)
            self.assertEqual(store.manifest()["storage"]["readyChunks"], 0)
        self.assertTrue(analyse_to_store(self.video, target, self.options)["complete"])
        self.assertEqual(len(self.document(target)["frames"]), 40)


class ChunkStorageTest(unittest.TestCase):
    """Transactions et fenêtres bornées, sur la fixture horodatée du visualiseur.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Tests incrémentaux — stockage
    """

    def test_initialization_can_resume_after_an_interrupted_first_transaction(self):
        """Une base interrompue pendant sa création est réinitialisable sans données perdues.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — transaction initiale
        """
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "initial.sqlite"
            with patch.object(ChunkStore, "_set", side_effect=RuntimeError("arrêt initial")):
                with self.assertRaisesRegex(RuntimeError, "arrêt initial"):
                    ChunkStore(path, {"source": {"name": "test"}})
            with ChunkStore(path, {"source": {"name": "test"}}) as store:
                self.assertFalse(store.manifest()["complete"])
                self.assertEqual(store.header()["source"]["name"], "test")

    def test_atomicity_window_limits_export_and_exact_metrics(self):
        """Échec au milieu d'une transaction, doublons, fenêtres et quantiles exacts.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — stockage
        """
        fixture = Path(__file__).resolve().parents[2] / "tests/fixtures/visualizer/match-synthetique.tracking.json"
        document = json.loads(fixture.read_bytes())
        frames = document["frames"]
        header = {key: document[key] for key in ("format", "version", "source", "analysis", "pitch")}
        with tempfile.TemporaryDirectory() as directory, ChunkStore(Path(directory) / "x.sqlite", header) as store:
            with patch.object(store, "_write_track", side_effect=RuntimeError("écriture interrompue")):
                with self.assertRaises(RuntimeError):
                    store.commit_raw(0, frames[:20], [], {"seq": 0})
            self.assertIsNone(store.checkpoint())
            self.assertEqual(list(store.iter_raw()), [])
            for seq, start in enumerate(range(0, len(frames), 20)):
                part = frames[start:start + 20]
                store.commit_raw(seq, part, [], {"seq": seq})
                store.publish(seq, part)
            with self.assertRaises(ValueError):
                store.commit_raw(0, frames[:20], [], {"seq": 0})
            for start, end in [(0, 31), (float("nan"), 1), (2, 1), (0, float("inf"))]:
                with self.assertRaises(ValueError):
                    store.window(start, end)
            window = store.window(1.01, 1.2)
            self.assertLess(window["frames"][0]["time"], 1.01)
            self.assertGreater(window["frames"][-1]["time"], 1.2)
            self.assertEqual(quality_metrics_stream(store.iter_ready()), quality_metrics(frames))
            with self.assertRaises(ValueError):
                list(store.iter_document())
            store.finish(header, {key: document[key] for key in ("teams", "tracks", "metrics", "limitations")})
            self.assertEqual(json.loads(b"".join(store.iter_document()))["frames"], frames)

    def test_variable_frame_rate_cut_and_resume_keep_exact_times(self):
        """Une source à deux cadences garde ses instants et ses plans, même après interruption.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — cadence variable et coupures
        """
        times = [index * .2 for index in range(15)] + [3 + index * .05 for index in range(25)]

        def cuts_factory(*args):
            # Une coupure contrôlée au changement de cadence.
            flags = iter([index == 15 for index in range(40)])
            detector = unittest.mock.Mock()
            detector.is_cut.side_effect = lambda image: next(flags)
            return detector

        def interrupt(stage, fraction, message):
            if stage == "images" and fraction and fraction > .4:
                raise RuntimeError("arrêt VFR")

        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "vfr.sqlite"
            options = AnalysisOptions(device="cpu", target_fps=10, chunk_seconds=.5)
            video = {"fps": 10, "duration": 4.3, "frameCount": 40}
            meter = unittest.mock.Mock()
            with patch("football_analysis.incremental_pipeline.cv2.VideoCapture", side_effect=lambda path: ControlledCapture(times)), \
                    patch("football_analysis.incremental_pipeline.CutDetector", side_effect=cuts_factory), \
                    ChunkStore(target, {"analysis": {"chunkSeconds": .5}}) as store:
                with self.assertRaisesRegex(RuntimeError, "arrêt VFR"):
                    detect_chunks(Path("controlled"), store, video, options, SyntheticDetector(), SyntheticCalibration(), meter, interrupt)
                detect_chunks(Path("controlled"), store, video, options, SyntheticDetector(), SyntheticCalibration(), meter,
                              lambda *args: None)
                frames = [frame for chunk in store.iter_raw() for frame in chunk["frames"]]
                self.assertEqual([frame["time"] for frame in frames], [round(value, 4) for value in times])
                self.assertEqual([frame["index"] for frame in frames], list(range(40)))
                self.assertFalse(store.state("timing")["constantFrameRate"])
                self.assertEqual([frame["index"] for frame in frames if frame["cut"]], [15])
                self.assertEqual(frames[14]["shot"], 0)
                self.assertEqual(frames[15]["shot"], 1)
                first_ids = {obj["id"] for frame in frames[:15] for obj in frame["objects"]}
                second_ids = {obj["id"] for frame in frames[15:] for obj in frame["objects"]}
                self.assertFalse(first_ids & second_ids)

    def test_tracker_discards_expired_id_mappings(self):
        """Des centaines de trajectoires terminées ne restent pas dans le dictionnaire Python.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — mémoire du suivi
        """
        tracker = BoundedPeopleTracker(10)
        for index in range(600):
            x = (index // 3) * 100
            detections = sv.Detections(xyxy=np.array([[x, 0, x + 20, 50]], dtype=float),
                                       confidence=np.array([.9]), class_id=np.array([0]))
            tracker.update(detections, timestamp=index / 10)
        self.assertGreater(tracker._next_global, 100)
        self.assertLess(len(tracker._ids), 20)


class PersistentTeamsTest(unittest.TestCase):
    """Identités d'équipe figées et mémoire des votes bornée, sur couleurs contrôlées.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Tests incrémentaux — équipes
    """

    def test_frozen_labels_reload_abstention_and_bounded_votes(self):
        """Les groupes survivent à une sauvegarde, aux segments et aux coupures.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — équipes
        """
        red = np.full((40, 20, 3), (10, 10, 220), dtype=np.uint8)
        blue = np.full((40, 20, 3), (220, 10, 10), dtype=np.uint8)
        model = frozen_factory("siglip", "cpu")
        model.fit({1: [red] * 8, 2: [red] * 8, 3: [blue] * 8, 4: [blue] * 8})
        restored = FrozenTeamModel.load(model.dump(), classifier_factory=classifier_factory)
        self.assertEqual(model.fingerprint, restored.fingerprint)
        self.assertEqual(model.predict({5: [red, blue]}), restored.predict({5: [red, blue]}))
        with self.assertRaises(RuntimeError):
            model.fit({1: [red] * 30})
        state = TeamState(model, max_active_tracks=4, vote_window=8)
        for track in range(10):
            state.update({track: [red] * 4}, track)
        snapshot = state.snapshot()
        self.assertEqual(len(snapshot["tracks"]), 4)
        self.assertTrue(all(len(track["votes"]) <= 8 for track in snapshot["tracks"]))
        duplicate = TeamState(model, max_active_tracks=4, vote_window=8)
        duplicate.restore(snapshot)
        self.assertEqual(snapshot, duplicate.snapshot())
        state.new_shot()
        self.assertEqual(state.assignment(9).team, None)
        self.assertTrue(model.ready)
        unknown = frozen_factory("siglip", "cpu")
        unknown.fit({1: [red]})
        self.assertFalse(unknown.ready)
        self.assertEqual(unknown.predict({2: [blue]}), {2: [None]})
        identical = frozen_factory("siglip", "cpu")
        identical.fit({track: [red] * 8 for track in range(4)})
        self.assertFalse(identical.ready)
        self.assertTrue(all(value.team is None for value in identical.assignments.values()))

    def test_crops_remain_bounded_when_many_tracks_arrive(self):
        """Les maillots et compteurs restent bornés même avec des identifiants toujours nouveaux.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — réserve d'images
        """
        collector = BoundedCrops()
        image = np.zeros((1080, 1920, 3), dtype=np.uint8)
        for track in range(300):
            collector.offer(image, [track], np.array([[0., 0., 900., 1000.]]))
        self.assertLessEqual(len(collector.seen), 64)
        self.assertLessEqual(sum(len(crops) for crops in collector.crops.values()), 512)
        self.assertTrue(all(max(crop.shape[:2]) <= 256 for crops in collector.crops.values() for crop in crops))


class ControlledCapture:
    """Décodeur de test à horodatages irréguliers et images fixes, sans codec externe.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Tests incrémentaux — source VFR synthétique
    """

    def __init__(self, times):
        """Prépare la séquence de temps contrôlée.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — source VFR synthétique
        """
        self.times, self.index = times, -1

    def grab(self):
        """Avance d'une image jusqu'à la fin contrôlée.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — source VFR synthétique
        """
        self.index += 1
        return self.index < len(self.times)

    def get(self, property):
        """Expose les instants réels en millisecondes.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — source VFR synthétique
        """
        return self.times[self.index] * 1000 if property == cv2.CAP_PROP_POS_MSEC else 0

    def retrieve(self):
        """Fournit une image fixe aux doubles de détection.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — source VFR synthétique
        """
        return True, np.zeros((64, 96, 3), dtype=np.uint8)

    def release(self):
        """Termine la source contrôlée.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Tests incrémentaux — source VFR synthétique
        """
        return None


if __name__ == "__main__":
    unittest.main()
