"""Tests du format des données de suivi et des mesures de qualité.

Les documents sont construits à la main : ce sont des données de test, pas des résultats d'analyse.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import unittest

from football_analysis.contract import (document_to_messages, make_ball, make_frame, make_object,
                                        messages_to_document, validate_document)
from football_analysis.metrics import describe_limitations, quality_metrics

CALIBRATED = {"status": "ok", "keypoints": 9, "inliers": 9, "errorPx": 2.0, "errorM": 0.3, "homography": [1, 0, 0, 0, 1, 0, 0, 0, 1]}
UNCALIBRATED = {"status": "failed", "reason": "too-few-keypoints", "keypoints": 3}


def player(track, x, y=0.0, team=0, pitch=True):
    """Joueur de test, placé sur le terrain si « pitch » est vrai.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — format des données
    """
    return make_object(track, "player", 0.9, [100, 100, 120, 160], (x, y) if pitch else None,
                       "ok" if pitch else "no-calibration", team, 0.9)


def document(frames):
    """Document de test, avec un en-tête minimal.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — format des données
    """
    return {"format": "football-tracking", "version": 1,
            "source": {"kind": "file", "name": "test.mp4", "width": 1920, "height": 1080, "fps": 25.0},
            "analysis": {"stride": 2, "fps": 12.5}, "pitch": {"length": 105, "width": 68},
            "frames": frames, "teams": [], "tracks": [], "metrics": {}, "limitations": []}


class ContractTest(unittest.TestCase):
    """Construction, validation et découpage en messages.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — format des données
    """

    def test_valid_document(self):
        """Un document cohérent n'a aucun défaut.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — format des données
        """
        frames = [make_frame(0, 0.0, 0, False, CALIBRATED, [player(1, 10.0)], make_ball(0.8, [5, 5, 9, 9], (1.0, 2.0), "ok")),
                  make_frame(2, 0.08, 0, False, UNCALIBRATED, [player(1, 0, pitch=False)], None)]
        self.assertEqual(validate_document(document(frames)), [])

    def test_position_without_calibration_is_refused(self):
        """Une position sur le terrain dans une image non calibrée serait inventée : refusée.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — format des données
        """
        frames = [make_frame(0, 0.0, 0, False, UNCALIBRATED, [player(1, 10.0)], None)]
        self.assertTrue(any("sans calibration" in p for p in validate_document(document(frames))))

    def test_time_must_increase(self):
        """Les instants des images doivent croître.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — format des données
        """
        frames = [make_frame(2, 0.08, 0, False, CALIBRATED, [], None), make_frame(0, 0.0, 0, False, CALIBRATED, [], None)]
        self.assertTrue(any("non croissant" in p for p in validate_document(document(frames))))

    def test_messages_round_trip(self):
        """Fichier et flux en direct : découper en messages puis recomposer rend le même document.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — format des données
        """
        original = document([make_frame(0, 0.0, 0, False, CALIBRATED, [player(1, 3.0)], None)])
        messages = list(document_to_messages(original))
        self.assertEqual([m["type"] for m in messages], ["header", "frame", "summary"])
        self.assertEqual(messages_to_document(messages), original)
        with self.assertRaises(ValueError):
            messages_to_document(messages[1:])


class MetricsTest(unittest.TestCase):
    """Mesures de qualité calculées sur le document.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — mesures de qualité
    """

    def test_calibration_and_speed(self):
        """Part calibrée, déplacement invraisemblable repéré, limites décrites.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — mesures de qualité
        """
        frames = [
            make_frame(0, 0.0, 0, False, CALIBRATED, [player(1, 0.0)], None),
            make_frame(2, 0.08, 0, False, CALIBRATED, [player(1, 0.5)], None),
            make_frame(4, 0.16, 0, False, CALIBRATED, [player(1, 5.0)], None),
            make_frame(6, 0.24, 0, False, UNCALIBRATED, [player(1, 0, pitch=False)], None),
        ]
        metrics = quality_metrics(frames)
        self.assertEqual(metrics["calibration"]["calibratedShare"], 0.75)
        self.assertEqual(metrics["calibration"]["failureReasons"], {"too-few-keypoints": 1})
        self.assertEqual(metrics["positions"]["implausibleSpeedShare"], 0.5)
        self.assertEqual(metrics["detection"]["ballFrameShare"], 0.0)
        notes = " ".join(describe_limitations(metrics))
        self.assertIn("Calibration impossible sur 25 %", notes)
        self.assertIn("numéros de maillot", notes)

    def test_fragmentation(self):
        """Six joueurs vus ensemble, neuf identifiants dans le plan : indice 1,5.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — mesures de qualité
        """
        first = make_frame(0, 0.0, 0, False, CALIBRATED, [player(i, i) for i in range(1, 7)], None)
        second = make_frame(2, 0.08, 0, False, CALIBRATED, [player(i, i) for i in (1, 2, 3, 7, 8, 9)], None)
        self.assertEqual(quality_metrics([first, second])["tracking"]["fragmentation"], 1.5)


if __name__ == "__main__":
    unittest.main()
