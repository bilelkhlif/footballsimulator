"""Tests de l'horloge des images (FrameClock) : horodatage du conteneur, cadence fixe ou variable.

Défaut corrigé : sur une copie à cadence variable de la vidéo de la Bundesliga, « numéro ÷ cadence »
s'écartait jusqu'à 2,4 s des instants réels ; l'horodatage du conteneur (CAP_PROP_POS_MSEC) est exact.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import unittest

from football_analysis.pipeline import FrameClock


class FrameClockTest(unittest.TestCase):
    """Instants des images et nature de la cadence.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — lecture de la vidéo (horodatage)
    """

    def test_variable_frame_rate_uses_container_timestamps(self):
        """Cadence variable : les instants du conteneur sont gardés, la cadence est déclarée variable.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — lecture de la vidéo (horodatage)
        """
        clock = FrameClock(fps=16.44)
        container_ms = [0, 120, 240, 360, 400, 440, 480]  # 8,3 images/s, puis 25 images/s
        times = [clock.tick(index, ms) for index, ms in enumerate(container_ms)]
        self.assertEqual(times, [0.0, 0.12, 0.24, 0.36, 0.4, 0.44, 0.48])
        summary = clock.summary()
        self.assertEqual(summary["timestamps"], "container")
        self.assertFalse(summary["constantFrameRate"])
        self.assertEqual(summary["frameCount"], 7)

    def test_constant_frame_rate(self):
        """Cadence fixe : instants réguliers, cadence déclarée fixe, durée lue.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — lecture de la vidéo (horodatage)
        """
        clock = FrameClock(fps=25)
        for index in range(50):
            clock.tick(index, index * 40.0)
        summary = clock.summary()
        self.assertTrue(summary["constantFrameRate"])
        self.assertEqual(summary["duration"], 2.0)

    def test_falls_back_to_frame_index(self):
        """Horodatage inutilisable (toujours 0) : repli sur numéro ÷ cadence, et ce repli est dit.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — lecture de la vidéo (horodatage)
        """
        clock = FrameClock(fps=25)
        times = [clock.tick(index, 0.0) for index in range(3)]
        self.assertEqual(times, [0.0, 0.04, 0.08])
        self.assertEqual(clock.summary()["timestamps"], "frame-index")


if __name__ == "__main__":
    unittest.main()
