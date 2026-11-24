"""Tests du contrôle des identités aux contacts (identity.py), sur des cas synthétiques.

Les maillots, boîtes et vidéos sont contrôlés : ces tests vérifient la logique (contacts, preuves,
décisions, renumérotation, reprise), pas une précision sur de vrais matchs.
Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
import supervision as sv

from football_analysis import identity
from football_analysis.chunk_storage import ChunkStore
from football_analysis.contract import validate_document
from football_analysis.incremental_pipeline import analyse_to_store
from football_analysis.pipeline import AnalysisOptions
from football_analysis.streaming_teams import FrozenTeamModel
from test_chunks import SyntheticCalibration, classifier_factory

RED, BLUE = (20, 20, 220), (220, 20, 20)


def player(track, x, y=30, width=16, height=40, role="player"):
    """Observation d'un joueur dans une image du contrat.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Tests d'identité — montage
    """
    return {"id": track, "role": role, "box": [x, y, x + width, y + height], "pitch": None, "pitchStatus": "no-calibration",
            "team": None, "teamConfidence": None}


def frame(index, objects, shot=0, cut=False, fps=10):
    """Image du contrat à 10 images par seconde.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Tests d'identité — montage
    """
    return {"index": index, "time": round(index / fps, 4), "shot": shot, "cut": cut, "objects": objects}


def crossing(hide=(12, 13), swap_kits=True, count=40):
    """Deux joueurs se rejoignent (images 10 à 15), l'un disparaît, puis repartent chacun de son côté.

    Retourne les images (identifiants bruts 1 et 2, comme ByteTrack les garde par position) et le
    maillot réellement visible dans chaque boîte : avec swap_kits, les joueurs se sont croisés.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Tests d'identité — scénario d'échange
    """
    frames, kits = [], {}
    for index in range(count):
        # Écart entre les bords gauches : 40 px, puis rapprochement progressif jusqu'à 6 px (boîtes
        # de 16 px qui se chevauchent, IoU 0,45), puis éloignement progressif.
        gap = 40 - 3.4 * index if index < 10 else 6 if index <= 15 else min(40, 6 + 4 * (index - 15))
        objects = [player(1, 40)]
        if index not in hide:
            objects.append(player(2, 40 + gap))
        frames.append(frame(index, objects))
        after = index > 15 and swap_kits
        kits[(index, 1)] = BLUE if after else RED
        kits[(index, 2)] = RED if after else BLUE
    return frames, kits


class ContactsTest(unittest.TestCase):
    """Repérage des contacts masqués.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Tests d'identité — contacts
    """

    def test_overlap_with_hidden_player_is_a_contact(self):
        """Un chevauchement suivi d'une disparition forme un contact, borné au plan.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — contacts
        """
        frames, _ = crossing()
        contacts, truncated = identity.find_contacts(frames, lambda track: True)
        self.assertFalse(truncated)
        self.assertEqual(len(contacts), 1)
        self.assertEqual((contacts[0]["a"], contacts[0]["b"]), (1, 2))
        self.assertEqual((contacts[0]["start"], contacts[0]["end"]), (0.8, 1.6), "IoU 0,23 encore à l'image 16")
        self.assertGreater(identity.box_iou(frames[10]["objects"][0]["box"], frames[10]["objects"][1]["box"]), 0.1)

    def test_overlap_without_hiding_or_with_non_player_is_ignored(self):
        """Sans disparition, ByteTrack garde chaque boîte : pas de contact à contrôler ; ni avec un arbitre.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — contacts
        """
        frames, _ = crossing(hide=())
        self.assertEqual(identity.find_contacts(frames, lambda track: True)[0], [])
        frames, _ = crossing()
        self.assertEqual(identity.find_contacts(frames, lambda track: track != 2)[0], [])

    def test_camera_cut_closes_the_contact(self):
        """Une coupure termine le contact : aucune preuve ni correction ne traverse les plans.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — coupures de caméra
        """
        frames, _ = crossing(hide=())
        for item in frames[12:]:
            item["shot"] = 1
        frames[12]["cut"] = True
        frames[12]["objects"] = frames[12]["objects"][:1]
        contacts, _ = identity.find_contacts(frames, lambda track: True)
        self.assertEqual(contacts, [], "le joueur absent après la coupure n'est pas un masquage")

    def test_windows_stay_in_segment_and_crowded_contacts_are_marked(self):
        """Les fenêtres ne débordent pas sur le contact voisin ; trois joueurs mêlés : pas de correction.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — fenêtres de preuve
        """
        contacts = [{"a": 1, "b": 2, "shot": 0, "start": 1.0, "end": 2.0},
                    {"a": 1, "b": 3, "shot": 0, "start": 3.0, "end": 3.5},
                    {"a": 4, "b": 5, "shot": 0, "start": 10.0, "end": 11.0},
                    {"a": 4, "b": 6, "shot": 0, "start": 10.5, "end": 10.8}]
        windows = identity.plan_windows(contacts)
        post = next(w for w in windows if w["contact"] == 0 and w["track"] == 1 and w["side"] == "post")
        pre = next(w for w in windows if w["contact"] == 1 and w["track"] == 1 and w["side"] == "pre")
        self.assertEqual((post["from"], post["to"]), (2.0, 3.0))
        self.assertEqual((pre["from"], pre["to"]), (2.0, 3.0))
        self.assertEqual([c["crowded"] for c in contacts], [False, False, True, True])
        self.assertEqual(sorted(w["key"] for w in windows), list(range(len(windows))))


class DecisionTest(unittest.TestCase):
    """Décisions à partir des votes des fenêtres.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Tests d'identité — décision
    """

    def plan(self, pre_a, post_a, pre_b, post_b, contacts=None):
        """Décide un contact avec des votes imposés.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — décision
        """
        contacts = contacts or [{"a": 1, "b": 2, "shot": 0, "start": 1.0, "end": 2.0}]
        windows = identity.plan_windows(contacts)
        given = {(1, "pre"): pre_a, (1, "post"): post_a, (2, "pre"): pre_b, (2, "post"): post_b}
        votes = {w["key"]: given[(w["track"], w["side"])] for w in windows}
        return identity.decide(contacts, windows, votes, next_id=100)

    def test_window_verdict_needs_enough_clear_votes(self):
        """Trois votes nets et 75 % au moins, abstentions comprises au dénominateur.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — décision
        """
        self.assertEqual(identity.window_verdict([0, 0, 0]), 0)
        self.assertIsNone(identity.window_verdict([0, 0]), "trop peu de preuves")
        self.assertIsNone(identity.window_verdict([0, 0, 0, None, None]), "abstentions : 60 %")
        self.assertIsNone(identity.window_verdict([0, 0, 1, 1]), "maillots mélangés")
        self.assertEqual(identity.window_verdict([1, 1, 1, None]), 1)

    def test_opposite_kit_changes_are_a_swap(self):
        """Les deux joueurs changent de maillot en sens inverse : identités échangées après le contact.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — échange de maillots différents
        """
        plan = self.plan([0] * 4, [1] * 4, [1] * 4, [0] * 4)
        self.assertEqual(plan["summary"]["swaps"], 1)
        self.assertEqual(plan["corrections"][0]["owners"], {"1": 2, "2": 1})
        teams = identity.evidence_assignments(plan)
        self.assertEqual((teams[1].team, teams[2].team), (0, 1))
        self.assertEqual(teams[1].votes, 8)

    def test_one_kit_change_is_a_split_without_guessed_link(self):
        """Un seul changement : la suite reçoit un nouvel identifiant, pas celui de l'autre joueur.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — identité inconnue plutôt que devinée
        """
        plan = self.plan([0] * 4, [1] * 4, [1] * 4, [1] * 4)
        self.assertEqual(plan["summary"], {"contacts": 1, "crowded": 0, "decidable": 1, "swaps": 0, "splits": 1})
        self.assertEqual(plan["corrections"][0]["owners"], {"1": 100})
        self.assertEqual(plan["nextId"], 101)

    def test_same_kit_unknown_evidence_or_crowd_change_nothing(self):
        """Coéquipiers, preuves insuffisantes, contacts mêlés : rien n'est corrigé.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — abstention
        """
        self.assertEqual(self.plan([0] * 4, [0] * 4, [0] * 4, [0] * 4)["corrections"], [], "maillots semblables")
        weak = self.plan([0] * 4, [1, None, None, None], [1] * 4, [0] * 4)
        self.assertEqual([(c["kind"], c["tracks"]) for c in weak["corrections"]], [("split", [2])],
                         "preuve faible pour A : pas d'échange affirmé ; B, qui change seul, est séparé")
        alone = self.plan([0] * 4, [1] * 4, [1] * 4, [])
        self.assertEqual([c["kind"] for c in alone["corrections"]], ["split"],
                         "B sans preuve après : pas d'échange affirmé, A seulement séparé")
        crowded = [{"a": 1, "b": 2, "shot": 0, "start": 1.0, "end": 2.0}, {"a": 1, "b": 3, "shot": 0, "start": 1.5, "end": 1.8}]
        windows = identity.plan_windows(crowded)
        plan = identity.decide(crowded, windows, {w["key"]: ([0] * 4 if w["side"] == "pre" else [1] * 4) for w in windows}, 50)
        self.assertEqual(plan["corrections"], [])
        self.assertEqual(plan["summary"]["crowded"], 2)

    def test_chained_swaps_compose(self):
        """Deux échanges successifs des mêmes trajectoires ramènent chaque joueur à son identifiant brut.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — corrections successives
        """
        contacts = [{"a": 1, "b": 2, "shot": 0, "start": 1.0, "end": 2.0},
                    {"a": 1, "b": 2, "shot": 0, "start": 5.0, "end": 6.0}]
        windows = identity.plan_windows(contacts)
        kits = {(0, 1, "pre"): 0, (0, 1, "post"): 1, (0, 2, "pre"): 1, (0, 2, "post"): 0,
                (1, 1, "pre"): 1, (1, 1, "post"): 0, (1, 2, "pre"): 0, (1, 2, "post"): 1}
        votes = {w["key"]: [kits[(w["contact"], w["track"], w["side"])]] * 4 for w in windows}
        plan = identity.decide(contacts, windows, votes, 10)
        mapper = identity.IdentityMapper(plan)
        mapper.advance(3.0)
        self.assertEqual((mapper.final_id(1), mapper.final_id(2)), (2, 1))
        mapper.advance(7.0)
        self.assertEqual((mapper.final_id(1), mapper.final_id(2)), (1, 2))


class MapperTest(unittest.TestCase):
    """Renumérotation, observations incertaines et reprise.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Tests d'identité — renumérotation
    """

    def test_remap_uncertain_interval_and_resume_continuity(self):
        """Avant : inchangé ; pendant : incertain ; après : échangé. Une reprise retrouve le même état.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — continuité entre segments
        """
        plan = {"version": 1, "corrections": [{"kind": "swap", "start": 0.8, "time": 1.6, "shot": 0, "tracks": [1, 2],
                                               "owners": {"1": 2, "2": 1}}], "evidence": {}, "summary": {}}
        frames, _ = crossing()
        whole = copy.deepcopy(frames)
        mapper = identity.IdentityMapper(identity.validate_plan(plan))
        events = [{"crops": [[obj["id"], obj["box"]] for obj in item["objects"]]} for item in whole]
        for item, event in zip(whole, events):
            mapper.apply(item, event)
        self.assertEqual([obj["id"] for obj in whole[5]["objects"]], [1, 2])
        self.assertTrue(all(obj.get("identity") == "uncertain" for obj in whole[10]["objects"]))
        self.assertEqual([obj["id"] for obj in whole[20]["objects"]], [2, 1])
        self.assertEqual([row[0] for row in events[20]["crops"]], [2, 1], "les maillots votent pour l'identité finale")
        self.assertNotIn("identity", whole[20]["objects"][0])
        # Reprise au segment suivant (images 20 et plus) : nouvel applicateur, même résultat.
        resumed = copy.deepcopy(frames[20:])
        restart = identity.IdentityMapper(plan)
        for item in resumed:
            restart.apply(item)
        self.assertEqual(resumed, whole[20:])

    def test_rebuilt_tracks_follow_final_identities(self):
        """Résumés recalculés : premier et dernier instants, observations, rôle.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — résumés corrigés
        """
        plan = {"version": 1, "corrections": [{"kind": "split", "start": 0.8, "time": 1.6, "shot": 0, "tracks": [2],
                                               "owners": {"2": 7}}], "evidence": {"2": [1, 1, 1], "7": [0, 0, 0]}, "summary": {}}
        frames, _ = crossing()
        spans = identity.rebuild_tracks(frames, plan, identity.affected_ids(plan))
        self.assertEqual(set(spans), {2, 7})
        self.assertEqual((spans[2]["firstTime"], spans[2]["lastTime"]), (0.0, 1.6))
        self.assertEqual((spans[7]["firstTime"], spans[7]["lastTime"]), (1.7, 3.9))
        self.assertEqual(spans[2]["observations"] + spans[7]["observations"], 38)
        self.assertEqual(spans[7]["role"], "player")

    def test_invalid_plans_are_refused(self):
        """Un plan relu doit être cohérent avant d'être appliqué.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — reprise vérifiée
        """
        good = {"version": 1, "corrections": [], "evidence": {}, "summary": {}}
        self.assertIs(identity.validate_plan(good), good)
        for bad in ({**good, "version": 2}, {**good, "evidence": {"1": [3]}},
                    {**good, "corrections": [{"kind": "swap", "start": 2.0, "time": 1.0, "tracks": [1], "owners": {}}]},
                    {"version": 1}):
            with self.assertRaises(ValueError):
                identity.validate_plan(bad)


class WindowVotesTest(unittest.TestCase):
    """Maillots des fenêtres, relus dans la source.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Tests d'identité — fenêtres de preuve
    """

    def test_only_clear_crops_inside_windows_are_classified_with_bounded_reads(self):
        """Maillots nets, dans les fenêtres, quatre au plus ; lecture de la source en avançant seulement.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — fenêtres de preuve
        """
        frames, kits = crossing()
        contacts, _ = identity.find_contacts(frames, lambda track: True)
        windows = identity.plan_windows(contacts)
        reads = []

        def read_image(index):
            reads.append(index)
            image = np.zeros((100, 120, 3), dtype=np.uint8)
            for obj in frames[index]["objects"]:
                x1, y1, x2, y2 = (int(v) for v in obj["box"])
                image[y1:y2, x1:x2] = kits[(index, obj["id"])]
            return image

        def predict(crops_by_key):
            self.assertTrue(all(len(crops) <= identity.WINDOW_CROPS for crops in crops_by_key.values()))
            return {key: [0 if crop.mean(axis=(0, 1))[2] > 128 else 1 for crop in crops] for key, crops in crops_by_key.items()}

        events = [(item, {"crops": [[obj["id"], obj["box"]] for obj in item["objects"]]}) for item in frames]
        votes = identity.window_votes(events, windows, read_image, predict, batch_windows=1)
        self.assertEqual(reads, sorted(set(reads)))
        start, end = contacts[0]["start"], contacts[0]["end"]
        self.assertTrue(all(start - identity.WINDOW_SECONDS <= index / 10 <= end + identity.WINDOW_SECONDS for index in reads))
        self.assertFalse(any(start <= index / 10 <= end for index in reads), "aucune image du contact lui-même")
        by_side = {(w["track"], w["side"]): identity.window_verdict(votes[w["key"]]) for w in windows}
        self.assertEqual(by_side, {(1, "pre"): 0, (1, "post"): 1, (2, "pre"): 1, (2, "post"): 0})
        plan = identity.decide(contacts, windows, votes, 3)
        self.assertEqual(plan["summary"]["swaps"], 1)


class CrossingDetector:
    """Détections imposées : deux joueurs se rejoignent, l'un disparaît deux images, puis repartent.

    Deux joueurs fixes, un de chaque maillot, servent à apprendre les équipes. Le compteur suit les
    appels : une analyse sans interruption appelle la détection une fois par image analysée.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Tests d'identité — double de détection
    """

    people_classes = {0: "player"}

    def __init__(self, schedule):
        """Garde les boîtes prévues de chaque image.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — double de détection
        """
        self.schedule = schedule
        self.calls = 0

    def detect(self, image):
        """Renvoie les boîtes de l'image courante, ByteTrack réel les associant ensuite.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — double de détection
        """
        boxes = np.asarray(self.schedule[min(self.calls, len(self.schedule) - 1)], dtype=np.float32)
        self.calls += 1
        return sv.Detections(xyxy=boxes, confidence=np.full(len(boxes), .9, dtype=np.float32),
                             class_id=np.zeros(len(boxes), dtype=int)), None


class SwapPipelineTest(unittest.TestCase):
    """Chaîne réelle : ByteTrack échange deux joueurs pendant un masquage, le contrôle le corrige.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Tests d'identité — chaîne complète
    """

    def setUp(self):
        """Prépare le dossier et les modèles synthétiques ; la vidéo est écrite par chaque test.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — préparation
        """
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.patches = []
        self.write_video(same_kit=False)

    def write_video(self, same_kit):
        """Écrit la vidéo : maillots aux boîtes prévues, les deux joueurs mobiles se croisant.

        Avec same_kit, les deux joueurs mobiles portent le même maillot rouge (coéquipiers).

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — préparation
        """
        for item in self.patches:
            item.stop()
        self.video = self.root / ("same-kit.avi" if same_kit else "crossing.avi")
        frames, self.kits = crossing(count=60)
        if same_kit:
            self.kits = {key: RED for key in self.kits}
        self.schedule = []
        writer = cv2.VideoWriter(str(self.video), cv2.VideoWriter_fourcc(*"MJPG"), 10, (200, 100))
        for item in frames:
            image = np.zeros((100, 200, 3), dtype=np.uint8)
            boxes = [[150, 30, 166, 70], [176, 30, 192, 70]]
            image[30:70, 150:166] = RED
            image[30:70, 176:192] = BLUE
            for obj in item["objects"]:
                x1, y1, x2, y2 = (int(v) for v in obj["box"])
                image[y1:y2, x1:x2] = self.kits[(item["index"], obj["id"])]
                boxes.append(obj["box"])
            self.schedule.append(boxes)
            writer.write(image)
        writer.release()
        self.options = AnalysisOptions(device="cpu", models_dir=self.root, target_fps=10, chunk_seconds=2)
        constructor = FrozenTeamModel.__init__

        def synthetic_init(model, backbone, device, seed=0, max_fit_crops=512, classifier_factory_=None):
            constructor(model, backbone, device, seed, max_fit_crops, classifier_factory)

        detector = CrossingDetector(self.schedule)
        self.patches = [patch("football_analysis.incremental_pipeline._load_models",
                              lambda *args: (detector, SyntheticCalibration(), {"synthetic": True})),
                        patch.object(FrozenTeamModel, "__init__", synthetic_init)]
        for item in self.patches:
            item.start()

    def tearDown(self):
        """Libère les remplacements et le dossier temporaire.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — nettoyage
        """
        for item in self.patches:
            item.stop()
        self.directory.cleanup()

    def kit_of(self, index, box):
        """Maillot réellement dessiné dans une boîte publiée.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — vérité synthétique
        """
        x = (box[0] + box[2]) / 2
        if x > 140:
            return "fixe"
        left = abs(x - 48) < 1  # le joueur de gauche reste en x = 40 à 56
        return "rouge" if self.kits[(index, 1 if left else 2)] == RED else "bleu"

    def test_teammates_crossing_are_left_unchanged(self):
        """Coéquipiers : l'échange éventuel n'est pas visible au maillot ; rien n'est corrigé ni marqué.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — maillots semblables
        """
        self.write_video(same_kit=True)
        target = self.root / "same-kit.sqlite"
        manifest = analyse_to_store(self.video, target, self.options)
        with ChunkStore(target) as store:
            document = json.loads(b"".join(store.iter_document()))
            raw_ids = {obj["id"] for chunk in store.iter_raw() for item in chunk["frames"] for obj in item["objects"]}
        self.assertEqual(manifest["metrics"]["identity"]["swaps"] + manifest["metrics"]["identity"]["splits"], 0)
        self.assertEqual({obj["id"] for item in document["frames"] for obj in item["objects"]}, raw_ids)
        self.assertFalse(any("identity" in obj for item in document["frames"] for obj in item["objects"]))
        self.assertEqual(validate_document(document), [])

    def test_swap_is_corrected_teams_follow_players_and_document_stays_valid(self):
        """Avant correction, une trajectoire brute porte les deux maillots ; après, chaque identité un seul.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — échange pendant un masquage
        """
        target = self.root / "crossing.sqlite"
        manifest = analyse_to_store(self.video, target, self.options)
        with ChunkStore(target) as store:
            raw = [item for chunk in store.iter_raw() for item in chunk["frames"]]
            document = json.loads(b"".join(store.iter_document()))
            plan = store.state("identity_plan")
        raw_kits, final_kits = {}, {}
        for item in raw:
            for obj in item["objects"]:
                raw_kits.setdefault(obj["id"], set()).add(self.kit_of(item["index"], obj["box"]))
        self.assertTrue(any(kits == {"rouge", "bleu"} for kits in raw_kits.values()),
                        "précondition : ByteTrack a bien échangé les deux joueurs")
        teams = {}
        for item in document["frames"]:
            for obj in item["objects"]:
                kit = self.kit_of(item["index"], obj["box"])
                if obj.get("identity") == "uncertain":
                    self.assertIsNone(obj["team"])
                    continue
                final_kits.setdefault(obj["id"], set()).add(kit)
                if kit != "fixe":
                    teams.setdefault(kit, set()).add(obj["team"])
        self.assertTrue(all(len(kits) == 1 for kits in final_kits.values()), final_kits)
        self.assertEqual(plan["summary"]["swaps"], 1)
        self.assertEqual(len(teams["rouge"]), 1)
        self.assertEqual(len(teams["bleu"]), 1)
        self.assertNotEqual(teams["rouge"], teams["bleu"])
        self.assertNotIn(None, teams["rouge"] | teams["bleu"])
        self.assertEqual(manifest["metrics"]["identity"]["swaps"], 1)
        self.assertEqual(validate_document(document), [])
        ids = {obj["id"] for item in document["frames"] for obj in item["objects"]}
        self.assertEqual(ids, {track["id"] for track in document["tracks"]}, "un résumé pour chaque identité publiée")
        # Distance cumulée : jamais en baisse pour une identité, et sans pas invraisemblable.
        last = {}
        for item in document["frames"]:
            for obj in item["objects"]:
                if obj.get("distanceM") is None:
                    continue
                previous = last.get(obj["id"])
                if previous is not None:
                    self.assertGreaterEqual(obj["distanceM"], previous[1])
                    self.assertLessEqual(obj["distanceM"] - previous[1], 12 * (item["time"] - previous[0]) + 1e-6)
                last[obj["id"]] = (item["time"], obj["distanceM"])

    def test_resume_after_identity_plan_reuses_it_without_new_predictions(self):
        """Une reprise pendant la publication des équipes relit le plan : même document.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Tests d'identité — reprise
        """
        baseline = self.root / "complete.sqlite"
        analyse_to_store(self.video, baseline, self.options)
        target = self.root / "interrupted.sqlite"
        self.patches[0].stop()
        detector = CrossingDetector(self.schedule)
        self.patches[0] = patch("football_analysis.incremental_pipeline._load_models",
                                lambda *args: (detector, SyntheticCalibration(), {"synthetic": True}))
        self.patches[0].start()

        def interrupt(stage, fraction, message):
            if stage == "équipes" and fraction and fraction > .85:
                raise RuntimeError("arrêt équipes")

        with self.assertRaisesRegex(RuntimeError, "arrêt équipes"):
            analyse_to_store(self.video, target, self.options, interrupt)
        with ChunkStore(target) as store:
            self.assertIsNotNone(store.state("identity_plan"))
            self.assertGreaterEqual(store.state("team_cursor"), 0)
        with patch("football_analysis.identity.window_votes", side_effect=AssertionError("pas de nouvelle prédiction")):
            analyse_to_store(self.video, target, self.options)
        with ChunkStore(baseline) as one, ChunkStore(target) as two:
            first = json.loads(b"".join(one.iter_document()))
            second = json.loads(b"".join(two.iter_document()))
        self.assertEqual(first["frames"], second["frames"])
        self.assertEqual(first["tracks"], second["tracks"])


if __name__ == "__main__":
    unittest.main()
