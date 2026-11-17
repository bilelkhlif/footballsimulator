"""Tests du cadrage des maillots et de l'extraction des équipes par lots bornés.

Les modèles sont remplacés par un extracteur de couleurs : ces tests vérifient le cadrage,
l'ordre des lots et l'absence de chargement inutile. La précision sous soleil et ombre est
mesurée séparément sur les vidéos réelles ; elle n'est pas simulée ici.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import builtins
import unittest
from collections import Counter
from unittest.mock import patch

import numpy as np

from football_analysis.pipeline import AnalysisOptions, _assign_teams
from football_analysis.teams import (CropCollector, build_classifier, extract_team_features,
                                     prepare_team_crop)


class RecordingExtractor:
    """Double d'extraction : couleurs moyennes, avec la taille de chaque lot reçu.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — extraction des équipes
    """

    def __init__(self, batch_size=3):
        """Prépare un extracteur sans modèle, sans poids et sans GPU.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — extraction des équipes
        """
        self.batch_size = batch_size
        self.batch_lengths = []

    def extract_features(self, crops):
        """Renvoie une ligne par image, dans l'ordre reçu, et relève la taille du lot.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — extraction des équipes
        """
        self.batch_lengths.append(len(crops))
        return np.array([image.mean(axis=(0, 1)) for image in crops])


class TeamPreprocessingTest(unittest.TestCase):
    """Cadrage du maillot, ordre et bornage des lots, sans tester un modèle préentraîné.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — préparation des équipes
    """

    def test_torso_excludes_head_shorts_and_background(self):
        """Seul le maillot central est extrait, sans modifier l'image source.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — cadrage du maillot
        """
        image = np.full((100, 80, 3), (30, 140, 40), dtype=np.uint8)
        image[:15] = (200, 40, 20)  # tête et bord supérieur
        image[55:] = (220, 220, 220)  # short et jambes
        image[15:55, 16:64] = (20, 30, 210)  # maillot, entre les bords de pelouse
        original = image.copy()

        torso = prepare_team_crop(image)

        self.assertGreater(torso.size, 0)
        self.assertTrue(np.all(torso == (20, 30, 210)))
        np.testing.assert_array_equal(image, original)

    def test_extraction_keeps_order_with_a_short_final_batch(self):
        """Sept images restent dans leur ordre avec des lots de trois, puis un lot d'une image.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — extraction des équipes par lots
        """
        images = [np.full((80, 40, 3), (index, index + 10, index + 20), dtype=np.uint8)
                  for index in range(7)]
        classifier = RecordingExtractor(batch_size=3)
        features = extract_team_features(classifier, images)
        reference = extract_team_features(RecordingExtractor(batch_size=1), images)

        self.assertEqual(classifier.batch_lengths, [3, 3, 1])
        np.testing.assert_array_equal(features, reference)
        np.testing.assert_array_equal(features, [[index, index + 10, index + 20] for index in range(7)])

    def test_empty_extraction_does_not_call_the_model(self):
        """Une liste vide produit zéro ligne et n'appelle pas l'extracteur.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — extraction des équipes par lots
        """
        classifier = RecordingExtractor()

        features = extract_team_features(classifier, [])

        self.assertEqual(features.shape[0], 0)
        self.assertEqual(classifier.batch_lengths, [])

    def test_full_person_policy_preserves_clip_inputs(self):
        """La politique CLIP conserve le contexte de l'image au lieu de ne garder que le maillot.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — cadrage selon le modèle
        """
        image = np.full((100, 80, 3), (30, 140, 40), dtype=np.uint8)
        image[15:55, 16:64] = (20, 30, 210)
        classifier = RecordingExtractor()
        classifier.crop_torso = False

        features = extract_team_features(classifier, [image])

        np.testing.assert_array_equal(features, [image.mean(axis=(0, 1))])
        self.assertFalse(np.array_equal(features[0], prepare_team_crop(image).mean(axis=(0, 1))))


class TeamLoadingTest(unittest.TestCase):
    """Les entrées insuffisantes ou invalides ne chargent pas les dépendances des modèles.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — chargement des équipes
    """

    def test_sparse_player_crops_skip_classifier_loading(self):
        """Aucun échantillon ou trois échantillons : équipe inconnue, sans charger le modèle.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — chargement des équipes
        """
        for count in (0, 3):
            with self.subTest(crops=count):
                collector = CropCollector()
                if count:
                    collector.crops[1] = [np.zeros((80, 40, 3), dtype=np.uint8)] * count
                frames = [{"objects": [{"id": 1, "role": "player"}]}]
                with patch("football_analysis.pipeline.build_classifier",
                           side_effect=AssertionError("chargement inutile du modèle")) as loader:
                    data, summary = _assign_teams(frames, collector, {1: Counter(player=3)},
                                                  AnalysisOptions(), "cpu")

                loader.assert_not_called()
                assignment = data["assignments"].get(1)
                self.assertIsNone(None if assignment is None else assignment.team)
                self.assertEqual(data["roles"], {1: "player"})
                self.assertTrue(all(team["tracks"] == 0 for team in summary))

    def test_unknown_backbone_is_rejected_before_dependency_imports(self):
        """Une option inconnue est refusée avant tout import des bibliothèques de modèles.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — chargement des équipes
        """
        original_import = builtins.__import__

        # Interdit les dépendances lourdes ; les autres imports restent utilisables.
        def guarded_import(name, *args, **kwargs):
            if name.split(".")[0] in {"umap", "sklearn", "sports", "transformers", "torch"}:
                raise AssertionError(f"dépendance importée avant validation : {name}")
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=guarded_import):
            with self.assertRaises(ValueError):
                build_classifier("modele-inconnu", "cpu")


if __name__ == "__main__":
    unittest.main()
