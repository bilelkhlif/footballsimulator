"""Tests de la calibration : homographie robuste sur des points synthétiques.

Une caméra fictive (homographie connue) projette les points du gabarit dans l'image ; la
calibration doit retrouver les positions sur le terrain, écarter un point aberrant, et refuser
les cas qu'elle ne peut pas vérifier au lieu d'inventer des positions.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import unittest

import cv2
import numpy as np

from football_analysis.calibration import (TEMPLATE_M, CalibrationSettings, estimate_homography, foot_points,
                                           pitch_status)

#: Caméra fictive : homographie du terrain (mètres) vers une image de 1920 × 1080.
CAMERA = np.array([[14.0, -2.5, 960.0], [0.3, 6.0, 420.0], [0.0, -0.004, 1.0]])
IMAGE_SIZE = (1920, 1080)


def project(points: np.ndarray) -> np.ndarray:
    """Projette des points du terrain dans l'image de la caméra fictive.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — calibration
    """
    return cv2.perspectiveTransform(points.reshape(-1, 1, 2).astype(np.float64), CAMERA).reshape(-1, 2)


class TemplateTest(unittest.TestCase):
    """Gabarit réglementaire, l'origine au point central.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — calibration
    """

    def test_regulation_dimensions(self):
        """Coins à ±52,5 m et ±34 m ; surface de réparation de 16,5 m de profondeur.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — calibration
        """
        self.assertEqual(TEMPLATE_M.shape, (32, 2))
        np.testing.assert_allclose(TEMPLATE_M[0], [-52.5, -34.0])
        np.testing.assert_allclose(TEMPLATE_M[29], [52.5, 34.0])
        self.assertAlmostEqual(TEMPLATE_M[9][0] - TEMPLATE_M[0][0], 16.5)
        self.assertAlmostEqual(TEMPLATE_M[12][1] - TEMPLATE_M[9][1], 40.32)


class HomographyTest(unittest.TestCase):
    """Estimation de l'homographie de l'image vers le terrain.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — calibration
    """

    def test_recovers_pitch_positions(self):
        """Avec les points d'une surface de réparation, un joueur est replacé au centimètre près.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — calibration
        """
        indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        result = estimate_homography(project(TEMPLATE_M[indices]), TEMPLATE_M[indices], IMAGE_SIZE)
        self.assertTrue(result.ok, result.reason)
        self.assertEqual(result.inliers, len(indices))
        player = np.array([[-40.0, 5.0]])
        np.testing.assert_allclose(result.project(project(player)), player, atol=0.01)
        self.assertLess(result.fit_error_m, 0.01)
        self.assertLess(result.holdout_error_m, 0.01)

    def test_rejects_outlier(self):
        """Un point clé mal placé de 150 pixels est écarté par RANSAC.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — calibration
        """
        indices = [9, 10, 11, 12, 13, 14, 15, 16, 30]
        image = project(TEMPLATE_M[indices])
        image[3] += [150.0, -40.0]
        result = estimate_homography(image, TEMPLATE_M[indices], IMAGE_SIZE)
        self.assertTrue(result.ok, result.reason)
        self.assertEqual(result.inliers, len(indices) - 1)
        self.assertLess(result.fit_error_px, 1.0)

    def test_needs_a_redundant_point(self):
        """Quatre points suffisent à une homographie, mais pas à la vérifier : échec déclaré.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — calibration
        """
        indices = [9, 10, 11, 12]
        result = estimate_homography(project(TEMPLATE_M[indices]), TEMPLATE_M[indices], IMAGE_SIZE)
        self.assertFalse(result.ok)
        self.assertEqual(result.reason, "too-few-keypoints")
        self.assertNotIn("homography", result.to_dict())

    def test_rejects_aligned_points(self):
        """Les points d'une seule ligne (ligne médiane) ne fixent pas le terrain : échec déclaré.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — calibration
        """
        indices = [13, 14, 15, 16]
        pitch = np.vstack([TEMPLATE_M[indices], [[0.0, -20.0]]])
        result = estimate_homography(project(pitch), pitch, IMAGE_SIZE)
        self.assertFalse(result.ok)
        self.assertIn(result.reason, ("aligned-keypoints", "homography-failed", "too-few-inliers"))

    def test_rejects_mirrored_correspondences(self):
        """Une image en miroir (gauche et droite inversées) est refusée.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — calibration
        """
        indices = [0, 1, 2, 3, 4, 5, 9, 10, 11, 12]
        image = project(TEMPLATE_M[indices])
        image[:, 0] = IMAGE_SIZE[0] - image[:, 0]
        result = estimate_homography(image, TEMPLATE_M[indices], IMAGE_SIZE)
        self.assertFalse(result.ok)
        self.assertEqual(result.reason, "mirrored")

    def test_serialises_homography(self):
        """Le résultat JSON porte l'homographie (9 nombres) et les erreurs mesurées.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — calibration
        """
        indices = list(range(13))
        record = estimate_homography(project(TEMPLATE_M[indices]), TEMPLATE_M[indices], IMAGE_SIZE).to_dict()
        self.assertEqual(record["status"], "ok")
        self.assertEqual(len(record["homography"]), 9)
        self.assertIn("fitErrorM", record)
        self.assertIn("holdoutErrorM", record)

    def test_holdout_error_is_larger_than_fit_error(self):
        """Avec du bruit, l'erreur hors échantillon dépasse l'erreur d'ajustement, optimiste.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — calibration
        """
        indices = [9, 10, 11, 12, 13, 14, 15, 16, 30, 31]
        noisy = project(TEMPLATE_M[indices]) + np.random.default_rng(1).normal(0, 3.0, (len(indices), 2))
        result = estimate_homography(noisy, TEMPLATE_M[indices], IMAGE_SIZE)
        self.assertTrue(result.ok, result.reason)
        self.assertGreater(result.holdout_error_px, result.fit_error_px)
        self.assertGreater(result.holdout_error_m, result.fit_error_m)

    def test_settings_are_relative_to_image_size(self):
        """Un seuil d'erreur plus strict refuse une reprojection bruitée.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — calibration
        """
        indices = list(range(13))
        noisy = project(TEMPLATE_M[indices]) + np.random.default_rng(0).normal(0, 4.0, (13, 2))
        strict = CalibrationSettings(max_error=0.0005, ransac_threshold=0.05)
        self.assertEqual(estimate_homography(noisy, TEMPLATE_M[indices], IMAGE_SIZE, strict).reason, "reprojection-error")
        self.assertTrue(estimate_homography(noisy, TEMPLATE_M[indices], IMAGE_SIZE).ok)


class PositionTest(unittest.TestCase):
    """Points de contact au sol et positions hors du terrain.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — calibration
    """

    def test_foot_point_is_bottom_centre(self):
        """Le point de contact est le milieu du bord inférieur de la boîte.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — calibration
        """
        np.testing.assert_allclose(foot_points(np.array([[10.0, 20.0, 30.0, 80.0]])), [[20.0, 80.0]])

    def test_outside_margin(self):
        """Une position à plus de 5 m des lignes est déclarée hors du terrain.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — calibration
        """
        self.assertEqual(pitch_status(np.array([55.0, 0.0])), "ok")
        self.assertEqual(pitch_status(np.array([0.0, 39.5])), "outside-pitch")


if __name__ == "__main__":
    unittest.main()
