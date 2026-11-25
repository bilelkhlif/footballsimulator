"""Tests du protocole d'audit des équipes et du contrôle des autres résultats.

Les observations sont synthétiques : aucun poids, aucune vidéo et aucun GPU ne sont utilisés.
Ces tests séparent les erreurs, les équipes inconnues et les échantillons exclus de l'audit.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from copy import deepcopy
import unittest

from validation.compare_teams import compare_frames, evaluate


def comparison_document():
    """Prépare deux images avec les champs dont l'audit doit contrôler la conservation.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — données du contrôle des régressions
    """
    frame = {
        "index": 0, "time": 0.0, "shot": 0, "cut": False,
        "calibration": {"status": "ok", "fitErrorM": 0.2},
        "ball": {"box": [10, 10, 12, 12], "confidence": 0.8, "pitch": [1, 2]},
        "objects": [{"id": 1, "role": "player", "box": [20, 30, 40, 90],
                     "pitch": [3, 4], "pitchStatus": "ok", "confidence": 0.9,
                     "team": 0, "teamConfidence": 1.0}],
    }
    following = deepcopy(frame)
    following.update(index=2, time=0.08)
    return {"source": {"name": "synthese.mp4", "width": 1920, "height": 1080, "fps": 25},
            "frames": [frame, following]}


class TeamAuditTest(unittest.TestCase):
    """Comptage des maillots avec une seule permutation des équipes par vidéo.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — audit des équipes
    """

    def test_global_permutation_keeps_wrong_unknown_and_excluded_separate(self):
        """Inverser les deux équipes corrige trois observations, sans effacer une erreur.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — permutation et comptage des équipes
        """
        document = {"frames": [
            {"index": 0, "objects": [{"id": 1, "team": 1}, {"id": 2, "team": 1},
                                     {"id": 3, "team": 0}, {"id": 4, "team": None},
                                     {"id": 5, "team": 0}]},
            {"index": 2, "objects": [{"id": 1, "team": 1}]},
        ]}
        samples = [{"index": 0, "track": track, "team": expected}
                   for track, expected in ((1, 0), (2, 0), (3, 0), (4, 1), (5, None))]
        samples.append({"index": 2, "track": 1, "team": 0})

        self.assertEqual(evaluate(document, samples),
                         {"labelled": 5, "correct": 3, "wrong": 1, "unknown": 1,
                          "excluded": 1, "permutation": 1})

    def test_matching_team_numbers_keep_identity_permutation(self):
        """Deux observations déjà justes gardent la permutation identité.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — permutation des équipes
        """
        document = {"frames": [{"index": 4, "objects": [{"id": 1, "team": 0},
                                                          {"id": 2, "team": 1}]}]}
        samples = [{"index": 4, "track": 1, "team": 0}, {"index": 4, "track": 2, "team": 1}]

        self.assertEqual(evaluate(document, samples),
                         {"labelled": 2, "correct": 2, "wrong": 0, "unknown": 0,
                          "excluded": 0, "permutation": 0})

    def test_all_unknown_teams_do_not_become_correct_or_wrong(self):
        """Sans équipe attribuée, les observations annotées restent toutes inconnues.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — équipes inconnues
        """
        document = {"frames": [{"index": 0, "objects": [{"id": 1, "team": None},
                                                          {"id": 2, "team": None}]}]}
        samples = [{"index": 0, "track": 1, "team": 0}, {"index": 0, "track": 2, "team": 1}]

        self.assertEqual(evaluate(document, samples),
                         {"labelled": 2, "correct": 0, "wrong": 0, "unknown": 2,
                          "excluded": 0, "permutation": 0})

    def test_missing_observation_is_a_protocol_error(self):
        """Une observation absente ne doit pas améliorer le score ou devenir inconnue.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — cohérence des observations auditées
        """
        document = {"frames": [{"index": 0, "objects": [{"id": 1, "team": 0}]}]}

        with self.assertRaises(KeyError):
            evaluate(document, [{"index": 0, "track": 2, "team": 1}])


class FrameRegressionTest(unittest.TestCase):
    """Conservation exacte des images analysées en dehors des informations d'équipe.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — contrôle des régressions
    """

    def test_team_changes_are_allowed_without_mutating_inputs(self):
        """L'équipe et sa confiance peuvent changer ; les documents sources restent intacts.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — conservation des documents comparés
        """
        baseline = comparison_document()
        candidate = deepcopy(baseline)
        candidate["frames"][0]["objects"][0].update(team=1, teamConfidence=0.75)
        original_baseline, original_candidate = deepcopy(baseline), deepcopy(candidate)

        self.assertEqual(compare_frames(baseline, candidate),
                         {"sourceAndCountIdentical": True, "changedFrames": 0})
        self.assertEqual(baseline, original_baseline)
        self.assertEqual(candidate, original_candidate)

    def test_timing_calibration_ball_and_shot_changes_are_detected(self):
        """Un écart d'horodatage, de calibration, de ballon ou de plan est une régression.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — conservation des données par image
        """
        baseline = comparison_document()
        changes = (("time", 0.04), ("index", 1), ("shot", 1), ("cut", True),
                   ("calibration", {"status": "failed"}), ("ball", None))
        for field, value in changes:
            with self.subTest(field=field):
                candidate = deepcopy(baseline)
                candidate["frames"][0][field] = value

                self.assertEqual(compare_frames(baseline, candidate),
                                 {"sourceAndCountIdentical": True, "changedFrames": 1})

    def test_detection_tracking_and_positions_are_compared(self):
        """L'identifiant, le rôle, la boîte et la position ne sont pas masqués par l'audit.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — conservation de la détection et du suivi
        """
        baseline = comparison_document()
        changes = (("id", 2), ("role", "referee"), ("box", [20, 30, 41, 90]),
                   ("pitch", [3, 5]), ("pitchStatus", "outside-pitch"), ("confidence", 0.7))
        for field, value in changes:
            with self.subTest(field=field):
                candidate = deepcopy(baseline)
                candidate["frames"][0]["objects"][0][field] = value

                self.assertEqual(compare_frames(baseline, candidate),
                                 {"sourceAndCountIdentical": True, "changedFrames": 1})

    def test_multiple_changed_frames_are_counted(self):
        """Deux images différentes produisent deux écarts, sans arrêt au premier.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — comptage des images modifiées
        """
        baseline = comparison_document()
        candidate = deepcopy(baseline)
        candidate["frames"][0]["time"] = 0.04
        candidate["frames"][1]["ball"] = None

        self.assertEqual(compare_frames(baseline, candidate),
                         {"sourceAndCountIdentical": True, "changedFrames": 2})

    def test_source_or_frame_count_changes_are_not_silently_accepted(self):
        """Une source différente ou une image manquante invalide le contrôle de conservation.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — conservation de la source et du nombre d'images
        """
        baseline = comparison_document()
        for change in ("source", "missing-frame", "extra-frame"):
            with self.subTest(change=change):
                candidate = deepcopy(baseline)
                if change == "source":
                    candidate["source"]["width"] = 1280
                elif change == "missing-frame":
                    candidate["frames"].pop()
                else:
                    candidate["frames"].append(deepcopy(candidate["frames"][-1]))

                self.assertEqual(compare_frames(baseline, candidate),
                                 {"sourceAndCountIdentical": False, "changedFrames": 0})


if __name__ == "__main__":
    unittest.main()
