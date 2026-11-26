"""Groupe « autres » du regroupement des équipes : arbitres et stadiers mis à part, équipes gardées.

Plongements synthétiques (couleur moyenne), sans GPU ni poids : le double de test_chunks.py.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import unittest

import numpy as np

from football_analysis.streaming_teams import FrozenTeamModel
from football_analysis.teams import MAX_OTHER_SHARE, OTHER, split_teams, vote

try:
    from test_chunks import classifier_factory
except ImportError:  # lancé comme module du paquet tests
    from tests.test_chunks import classifier_factory


def cloud(centre, count, rng, spread=0.02):
    """Nuage de plongements autour d'une couleur.

    @responsable Bilel Khlif
    @date 2026-11-26
    @role Tests — équipes (groupe « autres »)
    """
    return np.asarray(centre, dtype=np.float32) + rng.normal(0, spread, (count, 3)).astype(np.float32)


def uniform_crop(colour, rng):
    """Image d'un joueur de couleur unie (BGR), légèrement bruitée, de 60 × 24 pixels.

    @responsable Bilel Khlif
    @date 2026-11-26
    @role Tests — équipes (groupe « autres »)
    """
    image = np.empty((60, 24, 3), dtype=np.float32)
    image[:] = colour
    return np.clip(image + rng.normal(0, 3, image.shape), 0, 255).astype(np.uint8)


class SplitTeamsTest(unittest.TestCase):
    """Le troisième groupe n'est écarté que s'il est petit et à part.

    @responsable Bilel Khlif
    @date 2026-11-26
    @role Tests — équipes (groupe « autres »)
    """

    def test_officials_are_set_aside_and_teams_kept(self):
        """Blancs, rouges et quelques arbitres turquoise : deux équipes et un groupe « autres ».

        @responsable Bilel Khlif
        @date 2026-11-26
        @role Tests — équipes (groupe « autres »)
        """
        rng = np.random.default_rng(1)
        features = np.vstack([cloud((0.95, 0.95, 0.95), 60, rng), cloud((0.1, 0.1, 0.9), 50, rng),
                              cloud((0.8, 0.8, 0.1), 8, rng)])
        labels, centers = split_teams(features, features, seed=0)
        self.assertEqual(centers.shape, (3, 3))
        self.assertEqual(set(labels[:60].tolist()), {0}, "équipe la plus nombreuse : 0")
        self.assertEqual(set(labels[60:110].tolist()), {1})
        self.assertEqual(set(labels[110:].tolist()), {OTHER})

    def test_team_split_by_light_is_not_taken_for_officials(self):
        """Une équipe coupée en deux (soleil, ombre) et une petite équipe : le regroupement en deux est gardé.

        @responsable Bilel Khlif
        @date 2026-11-26
        @role Tests — équipes (groupe « autres »)
        """
        rng = np.random.default_rng(2)
        features = np.vstack([cloud((0.95, 0.95, 0.95), 46, rng), cloud((0.72, 0.72, 0.72), 40, rng),
                              cloud((0.1, 0.1, 0.9), 14, rng)])
        self.assertLessEqual(14 / 100, MAX_OTHER_SHARE, "le petit groupe passerait le seul critère de taille")
        labels, centers = split_teams(features, features, seed=0)
        self.assertEqual(centers.shape[0], 2)
        self.assertNotIn(OTHER, labels.tolist())
        self.assertEqual(len(set(labels[:86].tolist())), 1, "soleil et ombre : même équipe")
        self.assertNotEqual(labels[0], labels[90])

    def test_large_third_group_keeps_two_teams(self):
        """Trois groupes de tailles comparables : aucun n'est écarté.

        @responsable Bilel Khlif
        @date 2026-11-26
        @role Tests — équipes (groupe « autres »)
        """
        rng = np.random.default_rng(3)
        features = np.vstack([cloud((0.95, 0.95, 0.95), 40, rng), cloud((0.1, 0.1, 0.9), 35, rng),
                              cloud((0.8, 0.8, 0.1), 25, rng)])
        labels, centers = split_teams(features, features, seed=0)
        self.assertEqual(centers.shape[0], 2)
        self.assertNotIn(OTHER, labels.tolist())

    def test_other_majority_gets_no_team(self):
        """Une trajectoire votée « autres » reste sans équipe, même à l'unanimité.

        @responsable Bilel Khlif
        @date 2026-11-26
        @role Tests — équipes (groupe « autres »)
        """
        self.assertIsNone(vote([OTHER, OTHER, OTHER, 0]).team)
        self.assertEqual(vote([OTHER, OTHER, OTHER, 0]).confidence, 0.75)
        self.assertEqual(vote([1, 1, 1, OTHER]).team, 1)


class FrozenModelOthersTest(unittest.TestCase):
    """Le repère figé des équipes garde le groupe « autres » à la prédiction et à la reprise.

    @responsable Bilel Khlif
    @date 2026-11-26
    @role Tests — équipes (groupe « autres »)
    """

    def test_officials_are_unknown_and_survive_a_reload(self):
        """Arbitres sans équipe à l'apprentissage, à la prédiction et après rechargement du repère.

        @responsable Bilel Khlif
        @date 2026-11-26
        @role Tests — équipes (groupe « autres »)
        """
        rng = np.random.default_rng(4)
        white, red, cyan = (235, 235, 235), (40, 40, 210), (200, 200, 40)
        crops = {track: [uniform_crop(white, rng) for _ in range(5)] for track in range(1, 11)}
        crops.update({track: [uniform_crop(red, rng) for _ in range(5)] for track in range(11, 21)})
        crops.update({track: [uniform_crop(cyan, rng) for _ in range(4)] for track in (21, 22)})
        model = FrozenTeamModel("siglip", "cpu", 0, classifier_factory=classifier_factory)
        assignments = model.fit(crops)
        self.assertIsNone(assignments[21].team)
        self.assertIsNone(assignments[22].team)
        whites = {assignments[t].team for t in range(1, 11)}
        reds = {assignments[t].team for t in range(11, 21)}
        self.assertEqual(len(whites), 1)
        self.assertEqual(len(reds), 1)
        self.assertEqual(whites | reds, {0, 1}, "deux équipes distinctes, numérotées 0 et 1")
        red_team = reds.pop()
        query = {30: [uniform_crop(cyan, rng)], 31: [uniform_crop(red, rng)]}
        self.assertEqual(model.predict(query), {30: [None], 31: [red_team]})
        reloaded = FrozenTeamModel.load(model.dump(), classifier_factory=classifier_factory, device="cpu")
        self.assertEqual(reloaded.fingerprint, model.fingerprint)
        self.assertEqual(reloaded.predict(query), {30: [None], 31: [red_team]})
        self.assertEqual([team["tracks"] for team in reloaded.teams()], [10, 10])


if __name__ == "__main__":
    unittest.main()
