"""Tests des équipes : choix des images, vote par trajectoire, gardiens, couleurs.

Le classifieur réutilisé (SigLIP ou CLIP, UMAP, KMeans) est remplacé par un double qui regroupe
les images d'après leur couleur : les tests vérifient l'adaptation (vote, gardiens), pas le modèle.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import unittest

import numpy as np

from football_analysis.teams import (CropCollector, TeamAssignment, assign_player_teams, overlap_share,
                                     resolve_goalkeepers, team_colour, vote)


class ColourClassifier:
    """Double du classifieur : le « plongement » d'une image est sa couleur moyenne.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — équipes
    """

    def __init__(self):
        """Prépare un réducteur et un regroupement trivial, sur le rouge moyen.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — équipes
        """
        self.reducer = self
        self.cluster_model = self

    def extract_features(self, crops):
        """Couleur moyenne de chaque image.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — équipes
        """
        return np.array([crop.reshape(-1, 3).mean(axis=0) for crop in crops])

    def fit_transform(self, features):
        """Identité.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — équipes
        """
        return features

    def fit_predict(self, projections):
        """Groupe 1 si le rouge domine, sinon 0.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — équipes
        """
        return (projections[:, 2] > projections[:, 0]).astype(int)


def crop(bgr):
    """Image unie de 40 × 20 pixels.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — équipes
    """
    return np.full((40, 20, 3), bgr, dtype=np.uint8)


RED, BLUE = (30, 30, 220), (220, 60, 30)


class VoteTest(unittest.TestCase):
    """Vote majoritaire par trajectoire.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — équipes
    """

    def test_majority(self):
        """Cinq votes sur six : équipe attribuée, confiance 5/6.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — équipes
        """
        result = vote([1, 1, 1, 0, 1, 1])
        self.assertEqual(result.team, 1)
        self.assertAlmostEqual(result.confidence, 5 / 6)
        self.assertEqual(result.votes, 6)

    def test_split_vote_stays_unknown(self):
        """Votes partagés : l'équipe reste inconnue au lieu d'être tirée au sort.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — équipes
        """
        self.assertIsNone(vote([0, 1, 0, 1]).team)
        self.assertEqual(vote([]), TeamAssignment(None, None, 0))


class AssignmentTest(unittest.TestCase):
    """Attribution des équipes à partir des images des joueurs.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — équipes
    """

    def test_tracks_get_their_team_and_colour(self):
        """Une image mal classée ne change pas l'équipe de la trajectoire ; couleurs des maillots.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — équipes
        """
        crops = {track: [crop(RED)] * 4 for track in (1, 2, 3)}
        crops.update({track: [crop(BLUE)] * 4 for track in (4, 5, 6)})
        crops[3] = [crop(RED)] * 3 + [crop(BLUE)]
        assignments, by_team = assign_player_teams(ColourClassifier(), crops)
        self.assertEqual({t: assignments[t].team for t in crops}, {1: 1, 2: 1, 3: 1, 4: 0, 5: 0, 6: 0})
        self.assertAlmostEqual(assignments[3].confidence, 0.75)
        self.assertEqual(team_colour(by_team[1]), "#dc1e1e")

    def test_too_few_crops(self):
        """Moins de 20 images : pas d'apprentissage, équipes inconnues.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — équipes
        """
        assignments, by_team = assign_player_teams(ColourClassifier(), {1: [crop(RED)] * 3})
        self.assertIsNone(assignments[1].team)
        self.assertEqual(by_team, {})


class CollectorTest(unittest.TestCase):
    """Choix des images de joueurs gardées pour le vote.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — équipes
    """

    def test_skips_overlapped_and_small_players(self):
        """Un joueur à moitié masqué, ou trop petit, n'est pas gardé.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — équipes
        """
        frame = np.zeros((200, 300, 3), dtype=np.uint8)
        boxes = np.array([[10, 10, 40, 90], [25, 10, 55, 90], [200, 10, 230, 90], [100, 10, 110, 20]], dtype=float)
        self.assertGreater(overlap_share(boxes[0], boxes[1:]), 0.3)
        collector = CropCollector()
        collector.offer(frame, [1, 2, 3, 4], boxes)
        self.assertEqual(sorted(collector.crops), [3])

    def test_keeps_regular_samples(self):
        """Une image toutes les 4 observations, 6 au plus par trajectoire.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — équipes
        """
        frame = np.zeros((200, 300, 3), dtype=np.uint8)
        collector = CropCollector()
        for _ in range(40):
            collector.offer(frame, [7], np.array([[10, 10, 40, 90]], dtype=float))
        self.assertEqual(len(collector.crops[7]), 6)


class GoalkeeperTest(unittest.TestCase):
    """Équipe des gardiens, d'après le centre le plus proche.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — équipes
    """

    def test_nearest_team_centre(self):
        """Le gardien près des joueurs de l'équipe 0 rejoint l'équipe 0.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — équipes
        """
        def person(track, role, x):
            return {"id": track, "role": role, "box": [x, 0, x + 10, 50], "pitch": [x / 10, 0.0]}

        frames = [{"objects": [person(1, "player", -300), person(2, "player", -250), person(3, "player", 200),
                               person(4, "player", 260), person(9, "goalkeeper", -480)]}] * 3
        result = resolve_goalkeepers(frames, {9}, {1: 0, 2: 0, 3: 1, 4: 1})
        self.assertEqual(result[9].team, 0)
        self.assertEqual(result[9].votes, 3)


if __name__ == "__main__":
    unittest.main()
