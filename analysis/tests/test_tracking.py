"""Tests du suivi (ByteTrack de la bibliothèque trackers) et des coupures de plan (PySceneDetect).

Les composants réutilisés tournent pour de vrai, sur des images et des détections synthétiques :
les tests vérifient l'adaptation (identifiants uniques dans la vidéo, remise à zéro par plan,
trajectoires non confirmées écartées), pas la précision des composants.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import unittest

import numpy as np
import supervision as sv

from football_analysis.tracking import CutDetector, PeopleTracker


def detections(boxes):
    """Détections de joueurs aux boîtes données.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — suivi
    """
    return sv.Detections(xyxy=np.array(boxes, dtype=float), confidence=np.full(len(boxes), 0.9), class_id=np.full(len(boxes), 2))


class PeopleTrackerTest(unittest.TestCase):
    """Identifiants des trajectoires.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — suivi
    """

    def test_ids_are_unique_across_shots(self):
        """Une trajectoire non confirmée est écartée ; après une coupure, les identifiants sont neufs.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — suivi
        """
        tracker = PeopleTracker(12.5)
        first = tracker.update(detections([[10, 10, 30, 60], [100, 10, 120, 60]]))
        self.assertEqual(len(first), 0, "première image : trajectoires pas encore confirmées")
        confirmed = tracker.update(detections([[12, 10, 32, 60], [100, 10, 120, 60]]))
        ids = sorted(confirmed.tracker_id.tolist())
        self.assertEqual(ids, [1, 2])
        steady = tracker.update(detections([[14, 10, 34, 60], [100, 10, 120, 60]]))
        self.assertEqual(sorted(steady.tracker_id.tolist()), ids, "mêmes joueurs, mêmes identifiants")
        tracker.new_shot()
        tracker.update(detections([[14, 10, 34, 60]]))
        after_cut = tracker.update(detections([[14, 10, 34, 60]]))
        self.assertEqual(after_cut.tracker_id.tolist(), [3], "nouveau plan : identifiant neuf")

    def test_empty_frame(self):
        """Une image sans détection ne casse pas le suivi.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — suivi
        """
        tracker = PeopleTracker(12.5)
        self.assertEqual(len(tracker.update(sv.Detections.empty())), 0)


class CutDetectorTest(unittest.TestCase):
    """Coupures de plan.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Tests de l'analyse vidéo — découpage en plans
    """

    def test_detects_hard_cut(self):
        """Un changement brutal d'image est une coupure ; la première image n'en est pas une.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Tests de l'analyse vidéo — découpage en plans
        """
        detector = CutDetector(12.5)
        green = np.zeros((90, 160, 3), dtype=np.uint8)
        green[:, :] = (40, 140, 40)
        crowd = np.zeros((90, 160, 3), dtype=np.uint8)
        crowd[:, :] = (200, 60, 160)
        results = [detector.is_cut(frame) for frame in [green] * 8 + [crowd] * 8]
        self.assertEqual([index for index, cut in enumerate(results) if cut], [8])

    def test_full_hd_frames_are_reduced_like_scene_manager_with_same_cut(self):
        """Une image 1920 px est réduite à 256 px avant ContentDetector ; même coupure qu'en entier.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests de l'analyse vidéo — découpage en plans (coût)
        """
        rng = np.random.default_rng(0)
        pitch = np.zeros((1080, 1920, 3), dtype=np.uint8)
        pitch[:, :] = (40, 140, 40)
        pitch[500:520] = 255  # une ligne blanche du terrain
        stands = rng.integers(0, 255, size=(1080, 1920, 3), dtype=np.uint8)
        sequence = [pitch] * 8 + [stands] * 8
        reduced, full = CutDetector(12.5), CutDetector(12.5, downscale=False)
        shapes = []
        original = reduced._detector.process_frame

        def spy(timecode, frame):
            shapes.append(frame.shape)
            return original(timecode, frame)

        reduced._detector.process_frame = spy
        cuts = [[index for index, frame in enumerate(sequence) if detector.is_cut(frame)] for detector in (reduced, full)]
        self.assertEqual(cuts, [[8], [8]])
        self.assertEqual(set(shapes), {(144, 256, 3)})


if __name__ == "__main__":
    unittest.main()
