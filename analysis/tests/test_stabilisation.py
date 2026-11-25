"""Stabilisation temporelle de l'homographie, sur des séquences synthétiques à vérité connue.

Le décor est une texture aléatoire filmée par une caméra qui panoramique ; l'homographie vraie de
chaque image est connue. Les mesures simulent le bruit des points clés : chaque image reçoit une
homographie décalée au hasard d'environ 1 m, comme sur la vidéo de tribune France–Allemagne.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import unittest

import cv2
import numpy as np

from football_analysis.calibration import (CalibrationResult, HomographyStabilizer, calibration_from_record, failed)

WIDTH, HEIGHT = 960, 540


def scene(seed: int = 3) -> np.ndarray:
    """Grand décor texturé, plus large que l'image, pour le panoramique.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Tests — stabilisation de l'homographie
    """
    noise = np.random.default_rng(seed).integers(0, 255, (HEIGHT + 200, WIDTH + 800), dtype=np.uint8)
    return cv2.cvtColor(cv2.GaussianBlur(noise, (0, 0), 2.0), cv2.COLOR_GRAY2BGR)


def camera(shift_px: float) -> np.ndarray:
    """Translation de l'image : la caméra panoramique de shift_px pixels vers la droite.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Tests — stabilisation de l'homographie
    """
    return np.array([[1.0, 0.0, -shift_px], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])


#: Homographie image → terrain de la première image : une vue en perspective réaliste.
BASE = np.linalg.inv(cv2.getPerspectiveTransform(
    np.float32([[-30, -20], [30, -20], [30, 20], [-30, 20]]),
    np.float32([[150, 120], [810, 120], [940, 520], [20, 520]])))


def frame_and_truth(background: np.ndarray, shift: float) -> tuple[np.ndarray, np.ndarray]:
    """Image vue après un panoramique, et son homographie image → terrain vraie.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Tests — stabilisation de l'homographie
    """
    x = int(round(shift))
    image = background[100:100 + HEIGHT, 400 + x:400 + x + WIDTH].copy()
    truth = BASE @ np.linalg.inv(camera(x))
    return image, truth / truth[2, 2]


def noisy(truth: np.ndarray, rng: np.random.Generator, sigma_m: float = 1.0) -> CalibrationResult:
    """Mesure bruitée : les points d'un gabarit projetés, décalés au hasard, puis réajustés.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Tests — stabilisation de l'homographie
    """
    image_points = np.float64([[100, 150], [860, 150], [900, 500], [60, 500], [480, 300], [480, 480]])
    pitch = cv2.perspectiveTransform(image_points.reshape(-1, 1, 2), truth).reshape(-1, 2)
    pitch += rng.normal(0, sigma_m, pitch.shape)
    measured, _ = cv2.findHomography(image_points, pitch, 0)
    return CalibrationResult(status="ok", keypoints=6, inliers=6, fit_error_px=1.0, fit_error_m=0.1,
                             holdout_error_px=2.0, holdout_error_m=0.5, image_to_pitch=measured / measured[2, 2])


def anchor_error(stabilizer: HomographyStabilizer, homography: np.ndarray, truth: np.ndarray) -> float:
    """Écart moyen, en mètres, entre deux homographies sur les points d'ancrage du filtre.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Tests — stabilisation de l'homographie
    """
    return float(np.mean(np.linalg.norm(stabilizer._project(homography) - stabilizer._project(truth), axis=1)))


class StabilisationTest(unittest.TestCase):
    """Le filtre réduit le bruit sans retard, oublie à la coupure et refuse d'inventer.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Tests — stabilisation de l'homographie
    """

    def run_sequence(self, shifts, seed=7):
        """Renvoie les erreurs mesurées et stabilisées, image par image.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — stabilisation de l'homographie
        """
        background, rng = scene(), np.random.default_rng(seed)
        stabilizer = HomographyStabilizer((WIDTH, HEIGHT))
        measured_errors, stabilized_errors, signed = [], [], []
        for k, shift in enumerate(shifts):
            image, truth = frame_and_truth(background, shift)
            measurement = noisy(truth, rng)
            result = stabilizer.update(image, measurement, new_shot=k == 0)
            measured_errors.append(anchor_error(stabilizer, measurement.image_to_pitch, truth))
            stabilized_errors.append(anchor_error(stabilizer, result.image_to_pitch, truth))
            signed.append(float(np.mean(stabilizer._project(result.image_to_pitch)[:, 0] - stabilizer._project(truth)[:, 0])))
        return np.array(measured_errors), np.array(stabilized_errors), np.array(signed)

    def test_noise_is_reduced_while_the_camera_pans(self):
        """Panoramique de 6 px par image : l'erreur stabilisée tombe sous la moitié de la mesure, sans biais.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — stabilisation de l'homographie
        """
        measured, stabilized, signed = self.run_sequence([6.0 * k for k in range(60)])
        steady = slice(10, None)
        self.assertLess(stabilized[steady].mean(), 0.5 * measured[steady].mean(), (stabilized.mean(), measured.mean()))
        self.assertLess(abs(signed[steady].mean()), 0.35, "pas de retard systématique pendant le panoramique")

    def test_frame_to_frame_jumps_shrink(self):
        """Le saut d'une image à l'suivante, qui faisait les vitesses aberrantes, diminue nettement.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — stabilisation de l'homographie
        """
        background, rng = scene(), np.random.default_rng(11)
        stabilizer = HomographyStabilizer((WIDTH, HEIGHT))
        jumps = {"mesure": [], "stabilisée": []}
        last = {}
        for k in range(50):
            image, truth = frame_and_truth(background, 4.0 * k)
            measurement = noisy(truth, rng)
            result = stabilizer.update(image, measurement, new_shot=k == 0)
            for key, homography in (("mesure", measurement.image_to_pitch), ("stabilisée", result.image_to_pitch)):
                centre = cv2.perspectiveTransform(np.float64([[[480, 400]]]), homography).ravel()
                truth_centre = cv2.perspectiveTransform(np.float64([[[480, 400]]]), truth).ravel()
                if key in last and k > 5:
                    jumps[key].append(np.linalg.norm((centre - truth_centre) - last[key]))
                last[key] = centre - truth_centre
        self.assertLess(np.mean(jumps["stabilisée"]), 0.4 * np.mean(jumps["mesure"]), {k: np.mean(v) for k, v in jumps.items()})

    def test_a_cut_resets_the_filter_and_failures_stay_failures(self):
        """Après une coupure, la mesure est reprise telle quelle ; un échec n'invente aucune homographie.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — stabilisation de l'homographie
        """
        background, rng = scene(), np.random.default_rng(5)
        stabilizer = HomographyStabilizer((WIDTH, HEIGHT))
        for k in range(8):
            image, truth = frame_and_truth(background, 5.0 * k)
            stabilizer.update(image, noisy(truth, rng), new_shot=k == 0)
        image, truth = frame_and_truth(background, 300.0)
        measurement = noisy(truth, rng)
        result = stabilizer.update(image, measurement, new_shot=True)
        np.testing.assert_allclose(result.image_to_pitch, measurement.image_to_pitch)
        self.assertIsNone(result.measured_image_to_pitch, "première image du plan : mesure brute")
        failure = stabilizer.update(*frame_and_truth(background, 305.0)[:1], failed("no-pitch-detected"), new_shot=False)
        self.assertFalse(failure.ok)
        self.assertIsNone(failure.image_to_pitch)

    def test_isolated_outlier_is_ignored_then_a_persistent_one_wins(self):
        """Une mesure aberrante isolée ne déplace pas le terrain ; trois de suite remplacent la prédiction.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — stabilisation de l'homographie
        """
        background, rng = scene(), np.random.default_rng(9)
        stabilizer = HomographyStabilizer((WIDTH, HEIGHT))
        for k in range(10):
            image, truth = frame_and_truth(background, 3.0 * k)
            stabilizer.update(image, noisy(truth, rng, 0.3), new_shot=k == 0)
        wrong = np.array([[1.0, 0.0, 25.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])
        errors = []
        for k in range(10, 13):
            image, truth = frame_and_truth(background, 3.0 * k)
            bad = noisy(truth, rng, 0.3)
            bad.image_to_pitch = wrong @ bad.image_to_pitch
            result = stabilizer.update(image, bad, new_shot=False)
            errors.append(anchor_error(stabilizer, result.image_to_pitch, truth))
        self.assertLess(errors[0], 1.5, "première mesure aberrante ignorée")
        self.assertGreater(errors[-1], 20.0, "mesure persistante finalement acceptée")

    def test_scattered_outliers_never_take_over(self):
        """Des mesures fausses mais dispersées (drapeau, points confondus) sont toutes écartées, même nombreuses.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — stabilisation de l'homographie
        """
        background, rng = scene(), np.random.default_rng(17)
        stabilizer = HomographyStabilizer((WIDTH, HEIGHT))
        for k in range(10):
            image, truth = frame_and_truth(background, 3.0 * k)
            stabilizer.update(image, noisy(truth, rng, 0.3), new_shot=k == 0)
        offsets = [(25.0, 0.0), (-30.0, 5.0), (0.0, 22.0), (35.0, -10.0), (-18.0, -20.0), (28.0, 14.0)]
        for k, (dx, dy) in enumerate(offsets, start=10):
            image, truth = frame_and_truth(background, 3.0 * k)
            bad = noisy(truth, rng, 0.3)
            bad.image_to_pitch = np.array([[1.0, 0.0, dx], [0.0, 1.0, dy], [0.0, 0.0, 1.0]]) @ bad.image_to_pitch
            result = stabilizer.update(image, bad, new_shot=False)
            self.assertTrue(result.measurement_rejected)
            self.assertTrue(result.to_dict()["measurementRejected"])
            self.assertLess(anchor_error(stabilizer, result.image_to_pitch, truth), 1.5, (dx, dy))

    def test_state_survives_a_frame_without_measurable_motion(self):
        """Image sans texture et sans calibration (objectif masqué) : l'état est gardé, la mesure fausse suivante écartée.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — stabilisation de l'homographie
        """
        background, rng = scene(), np.random.default_rng(19)
        stabilizer = HomographyStabilizer((WIDTH, HEIGHT))
        for k in range(8):
            image, truth = frame_and_truth(background, 2.0 * k)
            stabilizer.update(image, noisy(truth, rng, 0.3), new_shot=k == 0)
        masked = np.full((HEIGHT, WIDTH, 3), 90, np.uint8)
        stabilizer.update(masked, failed("no-pitch-detected"), new_shot=False)
        self.assertIsNotNone(stabilizer.smoothed, "état conservé sans mouvement mesurable")
        image, truth = frame_and_truth(background, 16.0)
        bad = noisy(truth, rng, 0.3)
        bad.image_to_pitch = np.array([[1.0, 0.0, -30.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]) @ bad.image_to_pitch
        result = stabilizer.update(image, bad, new_shot=False)
        self.assertTrue(result.measurement_rejected)
        self.assertLess(anchor_error(stabilizer, result.image_to_pitch, truth), 2.0)

    def test_resume_rebuilds_exactly_the_same_state(self):
        """Rejouer les mesures enregistrées redonne, à l'octet près, les mêmes homographies stabilisées.

        @responsable Bilel Khlif
        @date 2026-11-25
        @role Tests — stabilisation de l'homographie
        """
        background, rng = scene(), np.random.default_rng(13)
        frames = [frame_and_truth(background, 5.0 * k) for k in range(20)]
        measurements = [noisy(truth, rng) for _, truth in frames]
        continuous = HomographyStabilizer((WIDTH, HEIGHT))
        records = [continuous.update(image, m, new_shot=k == 0).to_dict() for k, ((image, _), m) in enumerate(zip(frames, measurements))]
        resumed = HomographyStabilizer((WIDTH, HEIGHT))
        for k in range(12):
            resumed.update(frames[k][0], calibration_from_record(records[k]), new_shot=k == 0)
        for k in range(12, 20):
            again = resumed.update(frames[k][0], measurements[k], new_shot=False).to_dict()
            self.assertEqual(again["homography"], records[k]["homography"])
        self.assertTrue(records[5]["stabilized"])
        self.assertEqual(len(records[5]["measuredHomography"]), 9)


if __name__ == "__main__":
    unittest.main()
