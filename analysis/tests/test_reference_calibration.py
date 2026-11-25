"""Calibration de référence : validation du fichier, suivi par le mouvement de la caméra, comparaison.

Les séquences sont synthétiques et la vérité est connue : un décor texturé filmé par une caméra qui
panoramique (comme test_stabilisation.py).

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import json
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from football_analysis.calibration import CalibrationResult, failed
from football_analysis.metrics import calibration_metrics, describe_limitations, quality_metrics
from football_analysis.reference_calibration import (ReferenceCalibrator, ReferenceError, file_sha256,
                                                     load_reference)
try:
    from test_stabilisation import HEIGHT, WIDTH, frame_and_truth, noisy, scene
except ImportError:  # lancé comme module du paquet tests
    from tests.test_stabilisation import HEIGHT, WIDTH, frame_and_truth, noisy, scene

#: Repères réglementaires visibles dans la vue de test (surface de réparation, point de penalty, but).
LANDMARKS = np.array([[-36.0, -20.16], [-36.0, 20.16], [-47.0, -9.16], [-47.0, 9.16], [-41.5, 0.0],
                      [-52.5, -9.16], [-52.5, 9.16], [-36.0, 0.0]])


def view() -> np.ndarray:
    """Homographie image → terrain d'une vue où la surface de réparation gauche remplit l'image.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Tests — calibration de référence
    """
    pitch = np.float32([[-52.5, -25.0], [-28.0, -25.0], [-28.0, 25.0], [-52.5, 25.0]])
    image = np.float32([[180, 90], [800, 120], [930, 520], [40, 480]])
    return np.linalg.inv(cv2.getPerspectiveTransform(pitch, image))


def annotate(image_to_pitch: np.ndarray, noise_px: float = 0.0, seed: int = 0) -> list[dict]:
    """Points annotés : les repères projetés dans l'image, avec un bruit de pointage éventuel.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Tests — calibration de référence
    """
    pitch_to_image = np.linalg.inv(image_to_pitch)
    image = cv2.perspectiveTransform(LANDMARKS.reshape(-1, 1, 2), pitch_to_image).reshape(-1, 2)
    image += np.random.default_rng(seed).normal(0, noise_px, image.shape)
    return [{"label": f"repère {k}", "image": [float(x), float(y)], "pitch": [float(p[0]), float(p[1])]}
            for k, ((x, y), p) in enumerate(zip(image, LANDMARKS))]


class ReferenceFileTest(unittest.TestCase):
    """Le fichier de référence est lié à sa vidéo et refuse toute annotation incohérente.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Tests — calibration de référence
    """

    def write(self, document) -> Path:
        """Écrit un fichier de référence temporaire.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — calibration de référence
        """
        directory = Path(tempfile.mkdtemp())
        path = directory / "reference.json"
        path.write_text(json.dumps(document), encoding="utf-8")
        return path

    def document(self, points=None, index=0, sha="a" * 64):
        """Document valide, modifiable par test.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — calibration de référence
        """
        return {"format": "football-reference-calibration", "version": 1, "videoSha256": sha,
                "keyframes": [{"index": index, "points": annotate(view()) if points is None else points}]}

    def test_valid_annotation_is_fitted_with_published_errors(self):
        """Huit repères exacts : homographie retrouvée, erreurs quasi nulles, tous les points gardés.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — calibration de référence
        """
        fitted = load_reference(self.write(self.document()), (WIDTH, HEIGHT), video_sha256="a" * 64, stride=2)
        result = fitted[0]
        self.assertTrue(result.ok)
        self.assertEqual(result.inliers, len(LANDMARKS))
        self.assertLess(result.holdout_error_m, 0.01)
        truth = view() / view()[2, 2]
        np.testing.assert_allclose(result.image_to_pitch, truth, rtol=1e-5, atol=1e-6)

    def test_bad_files_are_refused(self):
        """Autre vidéo, trop peu de points, point hors image ou hors terrain, image non analysée, miroir.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — calibration de référence
        """
        size = (WIDTH, HEIGHT)
        with self.assertRaisesRegex(ReferenceError, "autre vidéo"):
            load_reference(self.write(self.document()), size, video_sha256="b" * 64)
        with self.assertRaisesRegex(ReferenceError, "too-few-keypoints"):
            load_reference(self.write(self.document(points=annotate(view())[:4])), size)
        outside_image = annotate(view())
        outside_image[0]["image"] = [WIDTH + 50.0, 10.0]
        with self.assertRaisesRegex(ReferenceError, "hors de l'image"):
            load_reference(self.write(self.document(points=outside_image)), size)
        outside_pitch = annotate(view())
        outside_pitch[0]["pitch"] = [-80.0, 0.0]
        with self.assertRaisesRegex(ReferenceError, "hors du terrain"):
            load_reference(self.write(self.document(points=outside_pitch)), size)
        with self.assertRaisesRegex(ReferenceError, "image analysée"):
            load_reference(self.write(self.document(index=3)), size, stride=2)
        mirrored = annotate(view())
        for point in mirrored:
            point["pitch"][1] = -point["pitch"][1]
        with self.assertRaisesRegex(ReferenceError, "mirrored"):
            load_reference(self.write(self.document(points=mirrored)), size)
        wrong_label = annotate(view())
        wrong_label[4]["pitch"] = [-36.0, -9.16]
        with self.assertRaises(ReferenceError):
            load_reference(self.write(self.document(points=wrong_label)), size)
        with self.assertRaisesRegex(ReferenceError, "Format"):
            load_reference(self.write({"format": "autre"}), size)

    def test_file_digest_matches_hashlib(self):
        """L'empreinte lue par blocs est celle du fichier entier.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — calibration de référence
        """
        import hashlib

        path = self.write(self.document())
        self.assertEqual(file_sha256(path), hashlib.sha256(path.read_bytes()).hexdigest())


def pan_sequence(shifts, keyframes, noise_px=0.0):
    """Suit la référence le long d'un panoramique ; renvoie résultats et vérités.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Tests — calibration de référence
    """
    background = scene()
    frames = [frame_and_truth(background, shift) for shift in shifts]
    base = view()
    truths = []
    for _, truth in frames:
        # La vue de référence remplace l'homographie de base du décor, pan compris.
        motion = np.linalg.inv(frame_and_truth(background, 0.0)[1]) @ truth
        truths.append(base @ motion / (base @ motion)[2, 2])
    annotated = {k: CalibrationResult(status="ok", keypoints=8, inliers=8, fit_error_px=0.0, fit_error_m=0.0,
                                      holdout_error_px=0.0, holdout_error_m=0.0, image_to_pitch=truths[k])
                 for k in keyframes}
    calibrator = ReferenceCalibrator(annotated, (WIDTH, HEIGHT))
    return calibrator, frames, truths


class ReferenceTrackingTest(unittest.TestCase):
    """La référence suit la caméra, mesure sa dérive et s'arrête à une coupure sans image clé.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Tests — calibration de référence
    """

    def error(self, calibrator, homography, truth):
        """Écart médian, en mètres, sur les ancres du terrain.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — calibration de référence
        """
        a = cv2.perspectiveTransform(calibrator.anchors.reshape(-1, 1, 2), homography).reshape(-1, 2)
        b = cv2.perspectiveTransform(calibrator.anchors.reshape(-1, 1, 2), truth).reshape(-1, 2)
        return float(np.median(np.linalg.norm(a - b, axis=1)))

    def test_reference_follows_a_pan_and_measures_drift(self):
        """Panoramique de 200 px : erreur sous 0,5 m ; la deuxième image clé publie une dérive faible.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — calibration de référence
        """
        shifts = [5.0 * k for k in range(41)]
        calibrator, frames, truths = pan_sequence(shifts, keyframes=(0, 40))
        errors, drift = [], None
        for k, (image, _) in enumerate(frames):
            result = calibrator.update(image, k, None, new_shot=k == 0)
            self.assertTrue(result.ok)
            self.assertEqual(result.source, "reference")
            errors.append(self.error(calibrator, result.image_to_pitch, truths[k]))
            if k == 40:
                drift = result.reference_drift_m
        self.assertLess(max(errors[:40]), 0.5, max(errors))
        self.assertIsNotNone(drift)
        self.assertLess(drift, 0.5)
        self.assertEqual(result.to_dict()["referenceDriftM"], round(drift, 2))

    def test_cut_without_keyframe_gives_no_position(self):
        """Après une coupure sans image clé : échec « no-reference », jamais l'ancienne homographie.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — calibration de référence
        """
        calibrator, frames, _ = pan_sequence([4.0 * k for k in range(6)], keyframes=(0,))
        for k, (image, _) in enumerate(frames[:5]):
            self.assertTrue(calibrator.update(image, k, None, new_shot=k == 0).ok)
        after_cut = calibrator.update(frames[5][0], 5, failed("no-pitch-detected"), new_shot=True)
        self.assertFalse(after_cut.ok)
        self.assertEqual(after_cut.reason, "no-reference")
        record = after_cut.to_dict()
        self.assertEqual(record["source"], "reference")
        self.assertEqual(record["automatic"], {"status": "failed", "keypoints": 0, "reason": "no-pitch-detected"})

    def test_automatic_calibration_gap_is_recorded(self):
        """Une calibration automatique décalée de 30 m est mesurée comme telle, sans influencer la référence.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — calibration de référence
        """
        calibrator, frames, truths = pan_sequence([0.0, 3.0], keyframes=(0,))
        rng = np.random.default_rng(1)
        calibrator.update(frames[0][0], 0, None, new_shot=True)
        wrong = noisy(truths[1], rng, 0.01)
        wrong.image_to_pitch = np.array([[1.0, 0.0, 30.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]) @ wrong.image_to_pitch
        result = calibrator.update(frames[1][0], 1, wrong, new_shot=False)
        self.assertLess(self.error(calibrator, result.image_to_pitch, truths[1]), 0.5)
        self.assertAlmostEqual(result.automatic["gapM"], 30.0, delta=0.5)
        self.assertEqual(result.automatic["status"], "ok")


class ReferenceMetricsTest(unittest.TestCase):
    """Les mesures et les limites publiées disent d'où vient la calibration.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Tests — calibration de référence
    """

    def test_metrics_and_limitations_for_both_sources(self):
        """Référence : écart automatique et dérive ; points clés : mesures écartées et avertissement.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — calibration de référence
        """
        base = {"status": "ok", "keypoints": 8, "inliers": 8, "fitErrorPx": 1.0, "fitErrorM": 0.1,
                "holdoutErrorPx": 2.0, "holdoutErrorM": 0.2}
        reference = [
            {**base, "source": "reference", "automatic": {"status": "ok", "keypoints": 14, "gapM": 31.5}},
            {**base, "source": "reference", "automatic": {"status": "ok", "keypoints": 15, "gapM": 2.5},
             "referenceDriftM": 0.8},
            {**base, "source": "reference", "motionLost": True, "automatic": {"status": "failed", "keypoints": 0}},
        ]
        metrics = calibration_metrics([{"calibration": c} for c in reference])
        self.assertEqual(metrics["source"], "reference")
        self.assertEqual(metrics["maxReferenceDriftM"], 0.8)
        self.assertEqual(metrics["motionLostShare"], round(1 / 3, 3))
        self.assertEqual(metrics["automatic"], {"calibratedShare": round(2 / 3, 3), "medianGapM": 17.0,
                                                "p90GapM": 28.6, "agreementShare": 0.5})
        keypoints = [{**base, "measurementRejected": True}, base, base, base]
        stabilized = calibration_metrics([{"calibration": c} for c in keypoints])
        self.assertEqual(stabilized["source"], "keypoints")
        self.assertEqual(stabilized["rejectedMeasurementShare"], 0.25)
        frames = [{"index": k, "time": k * 0.08, "shot": 0, "cut": False, "calibration": c, "objects": [], "ball": None}
                  for k, c in enumerate(reference)]
        notes = " ".join(describe_limitations(quality_metrics(frames)))
        self.assertIn("calibration de référence", notes)
        self.assertIn("s'écarte de la référence de 17 m", notes)
        self.assertIn("fausse sur ce clip", notes)
        frames = [{"index": k, "time": k * 0.08, "shot": 0, "cut": False, "calibration": c, "objects": [], "ball": None}
                  for k, c in enumerate(keypoints)]
        notes = " ".join(describe_limitations(quality_metrics(frames)))
        self.assertIn("25 % des mesures de calibration écartées", notes)
        self.assertIn("sans référence", notes)


if __name__ == "__main__":
    unittest.main()
