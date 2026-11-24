"""Contrôle des identités aux contacts entre joueurs, d'après les maillots.

Constat (audit interne du 17 novembre 2026) : les 3 équipes fausses et les 13 inconnues restantes
viennent toutes de quatre paires de trajectoires qui ont échangé deux joueurs de maillots
différents. Chaque fois, les deux joueurs se rapprochent à moins d'un mètre, leurs boîtes se
chevauchent, et le détecteur n'en voit plus qu'un pendant au moins une image : ByteTrack, qui
n'associe que par position, rend alors l'identifiant au mauvais joueur. Aucun saut de position ne
trahit l'échange : distance, trace et vitesse suivent ensuite l'autre joueur.

Méthode : l'idée du « splitter » de GTA (Global Tracklet Association, Sun et al., ACCV 2024,
licence MIT) — repérer une trajectoire qui contient deux identités par les apparences de ses
observations — appliquée avec le repère de maillots déjà appris (SigLIP et voisins figés), sans
modèle de réidentification supplémentaire :

1. repérer les contacts masqués : deux joueurs dont les boîtes se chevauchent (IoU ≥ 0,1) et
   dont l'un disparaît au moins une image pendant le contact ;
2. classer quelques maillots nets de chaque joueur dans les 2 s qui précèdent et qui suivent ;
3. décider :
   - les deux joueurs changent de maillot en sens inverse : échange, les identités sont
     rétablies après le contact ;
   - un seul change : la suite reçoit un nouvel identifiant, sans lien deviné ;
   - sinon, ou si les preuves manquent, ou si un autre contact se chevauche : rien ne change.
   Pendant un contact corrigé, qui est qui reste inconnu : l'équipe y est inconnue et
   l'observation porte « identity: uncertain ».

Limites : un échange entre coéquipiers (même maillot) n'est pas détecté ; un échange sans
masquage, ou loin d'un contact, non plus. Les identifiants restent des trajectoires, pas des
identités de joueurs garanties.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import math
from collections import defaultdict
from itertools import combinations
from typing import Any, Callable, Iterable, Iterator

import numpy as np

from .teams import TeamAssignment, overlap_share, vote

#: Chevauchement minimal de deux boîtes pour un contact (IoU).
CONTACT_IOU = 0.1
#: Écart maximal entre deux chevauchements d'un même contact, en secondes.
CONTACT_GAP_SECONDS = 0.5
#: Absence d'un des deux joueurs qui prolonge encore le contact (masquage), en secondes.
HIDDEN_LIMIT_SECONDS = 1.0
#: Durée des fenêtres de preuve avant et après un contact, en secondes.
WINDOW_SECONDS = 2.0
#: Maillots gardés au plus par fenêtre, répartis dans le temps.
WINDOW_CROPS = 4
#: Votes nets nécessaires dans une fenêtre, et part minimale de l'équipe majoritaire.
MIN_WINDOW_VOTES = 3
MIN_WINDOW_SHARE = 0.75
#: Mêmes filtres de netteté que les maillots des équipes (teams.CropCollector).
MIN_CROP_HEIGHT = 24
MAX_CROP_OVERLAP = 0.3
#: Garde-fou de mémoire pour une très longue vidéo : contacts masqués conservés au plus.
MAX_CONTACTS = 50_000
#: Version du plan d'identités enregistré.
PLAN_VERSION = 1


def box_iou(a: Iterable[float], b: Iterable[float]) -> float:
    """Recouvrement de deux boîtes [x1, y1, x2, y2] : intersection sur union.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — contacts entre joueurs
    """
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    width = min(ax2, bx2) - max(ax1, bx1)
    height = min(ay2, by2) - max(ay1, by1)
    if width <= 0 or height <= 0:
        return 0.0
    inter = width * height
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / union if union > 0 else 0.0


def find_contacts(frames: Iterable[dict], is_player: Callable[[int], bool]) -> tuple[list[dict], bool]:
    """Repère, en une lecture séquentielle, les contacts masqués entre deux joueurs.

    Un contact commence au premier chevauchement (IoU ≥ CONTACT_IOU). Il se prolonge tant que les
    boîtes se rechevauchent dans les CONTACT_GAP_SECONDS, ou tant qu'un des deux joueurs est absent
    depuis moins de HIDDEN_LIMIT_SECONDS. Il ne traverse jamais une coupure de plan. Seuls les
    contacts pendant lesquels un joueur a disparu au moins une image sont gardés : ce sont ceux où
    ByteTrack peut rendre l'identifiant au mauvais joueur.

    Args:
        frames: images du contrat, dans l'ordre du temps (identifiants bruts du suivi).
        is_player: indique si une trajectoire est un joueur de champ.

    Returns:
        les contacts {a, b, shot, start, end} triés par fin, et vrai si la borne MAX_CONTACTS
        a été atteinte (les suivants sont ignorés).

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — contacts entre joueurs
    """
    open_contacts: dict[tuple[int, int], dict] = {}
    contacts: list[dict] = []
    truncated = False
    shot = None

    def close(pair: tuple[int, int]) -> None:
        """Termine un contact ; seul un contact masqué est gardé."""
        nonlocal truncated
        event = open_contacts.pop(pair)
        if event["hidden"]:
            if len(contacts) < MAX_CONTACTS:
                contacts.append({"a": pair[0], "b": pair[1], "shot": event["shot"],
                                 "start": event["start"], "end": event["end"]})
            else:
                truncated = True

    for frame in frames:
        if frame["cut"] or frame["shot"] != shot:
            for pair in list(open_contacts):
                close(pair)
            shot = frame["shot"]
        time = frame["time"]
        players = [(obj["id"], obj["box"]) for obj in frame["objects"] if is_player(obj["id"])]
        present = {track for track, _ in players}
        touching = {(min(a, b), max(a, b)) for (a, box_a), (b, box_b) in combinations(players, 2)
                    if box_iou(box_a, box_b) >= CONTACT_IOU}
        for pair in touching:
            event = open_contacts.setdefault(pair, {"start": time, "end": time, "shot": shot, "hidden": False})
            event["end"] = time
        for pair in [pair for pair in open_contacts if pair not in touching]:
            event = open_contacts[pair]
            hidden = pair[0] not in present or pair[1] not in present
            if hidden and time - event["end"] <= HIDDEN_LIMIT_SECONDS:
                event["hidden"] = True
            elif time - event["end"] > CONTACT_GAP_SECONDS or hidden:
                close(pair)
    for pair in list(open_contacts):
        close(pair)
    contacts.sort(key=lambda contact: (contact["end"], contact["start"], contact["a"], contact["b"]))
    return contacts, truncated


def plan_windows(contacts: list[dict]) -> list[dict]:
    """Prépare les fenêtres de preuve : avant et après chaque contact, pour chacun des deux joueurs.

    Une fenêtre reste dans le plan du contact, et ne déborde pas sur le contact précédent ou suivant
    du même joueur : ses maillots appartiennent bien au segment jugé. Deux contacts simultanés d'un
    même joueur (trois joueurs mêlés) sont marqués « crowded » : ils ne seront pas corrigés.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — fenêtres de preuve
    """
    by_track: dict[int, list[int]] = defaultdict(list)
    for index, contact in enumerate(contacts):
        contact["crowded"] = False
        by_track[contact["a"]].append(index)
        by_track[contact["b"]].append(index)
    windows = []
    for track, indices in by_track.items():
        indices.sort(key=lambda i: (contacts[i]["start"], contacts[i]["end"]))
        for position, index in enumerate(indices):
            contact = contacts[index]
            previous = contacts[indices[position - 1]] if position else None
            following = contacts[indices[position + 1]] if position + 1 < len(indices) else None
            for other in (previous, following):
                if other is not None and other["shot"] == contact["shot"] and other["start"] <= contact["end"] and contact["start"] <= other["end"]:
                    contact["crowded"] = True
            pre_from = contact["start"] - WINDOW_SECONDS
            if previous is not None and previous["shot"] == contact["shot"]:
                pre_from = max(pre_from, previous["end"])
            post_to = contact["end"] + WINDOW_SECONDS
            if following is not None and following["shot"] == contact["shot"]:
                post_to = min(post_to, following["start"])
            windows.append({"contact": index, "track": track, "side": "pre", "shot": contact["shot"],
                            "from": pre_from, "to": contact["start"]})
            windows.append({"contact": index, "track": track, "side": "post", "shot": contact["shot"],
                            "from": contact["end"], "to": post_to})
    windows.sort(key=lambda window: (window["from"], window["to"], window["track"], window["side"]))
    for key, window in enumerate(windows):
        window["key"] = key
    return windows


class WindowSampler:
    """Garde quelques maillots nets par fenêtre, répartis dans le temps, avec une mémoire bornée.

    Comme teams.CropCollector : une image toutes les « stride » observations ; quand la réserve
    déborde, une sur deux est retirée et l'intervalle double.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — maillots des fenêtres de preuve
    """

    def __init__(self, max_crops: int = WINDOW_CROPS):
        """Prépare une réserve vide.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Identités — maillots des fenêtres de preuve
        """
        self.max_crops = max_crops
        self.crops: list[np.ndarray] = []
        self.seen = 0
        self.stride = 1

    def offer(self, crop: np.ndarray) -> None:
        """Propose un maillot accepté par les filtres de netteté.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Identités — maillots des fenêtres de preuve
        """
        observation = self.seen
        self.seen += 1
        if observation % self.stride:
            return
        self.crops.append(crop)
        if len(self.crops) > self.max_crops:
            self.crops = self.crops[::2]
            self.stride *= 2


def crop_if_clear(image: np.ndarray, box: list[float], others: list[list[float]]) -> np.ndarray | None:
    """Découpe un maillot assez grand et peu masqué, ou None.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — maillots des fenêtres de preuve
    """
    if box[3] - box[1] < MIN_CROP_HEIGHT:
        return None
    if others and overlap_share(np.asarray(box, dtype=float), np.asarray(others, dtype=float).reshape(-1, 4)) > MAX_CROP_OVERLAP:
        return None
    height, width = image.shape[:2]
    x1, y1 = max(int(box[0]), 0), max(int(box[1]), 0)
    x2, y2 = min(int(box[2]), width), min(int(box[3]), height)
    if x2 <= x1 or y2 <= y1:
        return None
    return image[y1:y2, x1:x2].copy()


def window_contains(window: dict, time: float, shot: int) -> bool:
    """Vrai si l'instant appartient à la fenêtre : [début, contact[ avant, ]contact, fin] après.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — fenêtres de preuve
    """
    if shot != window["shot"]:
        return False
    if window["side"] == "pre":
        return window["from"] <= time < window["to"]
    return window["from"] < time <= window["to"]


def window_passed(window: dict, time: float, shot: int) -> bool:
    """Vrai si la fenêtre ne peut plus recevoir d'image : fin dépassée, ou autre plan.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — fenêtres de preuve
    """
    if shot != window["shot"]:
        return True
    return time >= window["to"] if window["side"] == "pre" else time > window["to"]


def window_votes(events: Iterable[tuple[dict, dict]], windows: list[dict],
                 read_image: Callable[[int], np.ndarray],
                 predict: Callable[[dict[int, list[np.ndarray]]], dict[int, list[int | None]]],
                 batch_windows: int = 64) -> dict[int, list[int | None]]:
    """Classe les maillots de chaque fenêtre, en relisant seulement les images utiles.

    Les fenêtres terminées sont classées par lots, puis leurs images libérées : la mémoire ne
    dépend pas de la durée de la vidéo. Les boîtes viennent du journal de suivi (exactes), et le
    contrôle de masquage porte sur tous les joueurs de l'image.

    Args:
        events: couples (image du contrat, événement du journal avec « crops »), dans l'ordre.
        windows: fenêtres de plan_windows, triées par début.
        read_image: renvoie l'image source d'un numéro, lue séquentiellement.
        predict: classe des maillots par clé ; None pour une abstention.

    Returns:
        les votes (0, 1 ou None) de chaque fenêtre, par clé.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — maillots des fenêtres de preuve
    """
    votes: dict[int, list[int | None]] = {}
    samplers: dict[int, WindowSampler] = {}
    pending = iter(windows)
    upcoming = next(pending, None)
    active: list[dict] = []
    finished: dict[int, list[np.ndarray]] = {}

    def flush() -> None:
        """Classe les fenêtres terminées et libère leurs images."""
        if finished:
            votes.update(predict(dict(finished)))
            finished.clear()

    def finish(window: dict) -> None:
        """Ferme une fenêtre : ses maillots attendent le prochain lot."""
        sampler = samplers.pop(window["key"], None)
        crops = sampler.crops if sampler else []
        if crops:
            finished[window["key"]] = crops
        else:
            votes[window["key"]] = []
        if len(finished) >= batch_windows:
            flush()

    for frame, event in events:
        time = frame["time"]
        while upcoming is not None and upcoming["from"] <= time:
            active.append(upcoming)
            upcoming = next(pending, None)
        for window in [window for window in active if window_passed(window, time, frame["shot"])]:
            active.remove(window)
            finish(window)
        if not active:
            if upcoming is None:
                break
            continue
        boxes = {int(row[0]): list(row[1]) for row in event.get("crops", [])}
        wanted = [window for window in active if window_contains(window, time, frame["shot"]) and window["track"] in boxes]
        if not wanted:
            continue
        image = read_image(frame["index"])
        for window in wanted:
            box = boxes[window["track"]]
            others = [other for track, other in boxes.items() if track != window["track"]]
            crop = crop_if_clear(image, box, others)
            if crop is not None:
                samplers.setdefault(window["key"], WindowSampler()).offer(crop)
    for window in active:
        finish(window)
    while upcoming is not None:
        finish(upcoming)
        upcoming = next(pending, None)
    flush()
    return votes


def window_verdict(labels: list[int | None]) -> int | None:
    """Équipe nette d'une fenêtre : assez de votes, et une majorité franche ; sinon None.

    Les abstentions comptent dans le dénominateur : une fenêtre floue ne décide rien.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — décision
    """
    known = [label for label in labels if label is not None]
    if len(known) < MIN_WINDOW_VOTES:
        return None
    for team in (0, 1):
        if known.count(team) / len(labels) >= MIN_WINDOW_SHARE:
            return team
    return None


def decide(contacts: list[dict], windows: list[dict], votes: dict[int, list[int | None]],
           next_id: int) -> dict[str, Any]:
    """Décide, contact par contact dans l'ordre du temps, des échanges et des séparations.

    Les preuves portent sur les trajectoires brutes du suivi ; les identités finales suivent les
    corrections déjà décidées (une trajectoire déjà échangée reste échangée).

    Returns:
        un plan JSON : corrections ordonnées {kind, start, time, owners}, votes de preuve par
        identité finale corrigée, et résumé chiffré.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — décision
    """
    evidence: dict[tuple[int, int, str], list[int | None]] = {}
    for window in windows:
        evidence[(window["contact"], window["track"], window["side"])] = votes.get(window["key"], [])
    owner: dict[int, int] = {}
    labels: dict[int, list[int | None]] = defaultdict(list)
    corrections = []
    summary = {"contacts": len(contacts), "crowded": 0, "decidable": 0, "swaps": 0, "splits": 0}
    for index, contact in enumerate(contacts):
        if contact["crowded"]:
            summary["crowded"] += 1
            continue
        a, b = contact["a"], contact["b"]
        sides = {(track, side): evidence.get((index, track, side), []) for track in (a, b) for side in ("pre", "post")}
        team = {key: window_verdict(values) for key, values in sides.items()}
        if all(value is not None for value in team.values()):
            summary["decidable"] += 1
        final = {a: owner.get(a, a), b: owner.get(b, b)}
        pre_a, post_a, pre_b, post_b = team[(a, "pre")], team[(a, "post")], team[(b, "pre")], team[(b, "post")]
        if None not in (pre_a, post_a, pre_b, post_b) and pre_a != pre_b and pre_a == post_b and pre_b == post_a:
            # Échange : le joueur du maillot de A continue sous l'identifiant brut de B, et inversement.
            owner[a], owner[b] = final[b], final[a]
            labels[final[a]] += sides[(a, "pre")] + sides[(b, "post")]
            labels[final[b]] += sides[(b, "pre")] + sides[(a, "post")]
            corrections.append({"kind": "swap", "start": contact["start"], "time": contact["end"],
                                "shot": contact["shot"], "tracks": [a, b], "owners": {str(a): final[b], str(b): final[a]}})
            summary["swaps"] += 1
            continue
        for track, pre, post in ((a, pre_a, post_a), (b, pre_b, post_b)):
            if pre is not None and post is not None and pre != post:
                # Un seul changement de maillot : la suite est un autre joueur, sans lien deviné.
                new = next_id
                next_id += 1
                owner[track] = new
                labels[final[track]] += sides[(track, "pre")]
                labels[new] += sides[(track, "post")]
                corrections.append({"kind": "split", "start": contact["start"], "time": contact["end"],
                                    "shot": contact["shot"], "tracks": [track], "owners": {str(track): new}})
                summary["splits"] += 1
    return {"version": PLAN_VERSION, "corrections": corrections,
            "evidence": {str(track): values for track, values in labels.items()},
            "summary": summary, "nextId": next_id}


def evidence_assignments(plan: dict) -> dict[int, TeamAssignment]:
    """Équipe des identités corrigées, d'après leurs seuls votes de preuve.

    Le vote initial d'une trajectoire échangée mélange deux joueurs : il est remplacé. Des preuves
    contradictoires laissent l'équipe inconnue.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — équipes des identités corrigées
    """
    return {int(track): vote([label for label in values if label is not None])
            for track, values in plan["evidence"].items()}


class IdentityMapper:
    """Applique le plan aux images, dans l'ordre du temps : identifiants finaux et contacts incertains.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — renumérotation des observations
    """

    def __init__(self, plan: dict | None):
        """Prépare les corrections ordonnées ; un plan absent ne change rien.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Identités — renumérotation des observations
        """
        self.corrections = sorted((plan or {}).get("corrections", []), key=lambda item: item["time"])
        self._next = 0
        self.owner: dict[int, int] = {}

    def advance(self, time: float) -> None:
        """Applique les corrections terminées avant cet instant (aussi pour une reprise).

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Identités — renumérotation des observations
        """
        while self._next < len(self.corrections) and self.corrections[self._next]["time"] < time:
            for raw, final in self.corrections[self._next]["owners"].items():
                self.owner[int(raw)] = int(final)
            self._next += 1

    def final_id(self, raw: int) -> int:
        """Identifiant final d'une trajectoire brute, à l'instant courant.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Identités — renumérotation des observations
        """
        return self.owner.get(raw, raw)

    def uncertain(self, raw: int, time: float) -> bool:
        """Vrai si l'observation est pendant un contact corrigé : qui est qui n'y est pas connu.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Identités — observations incertaines
        """
        return any(correction["start"] <= time <= correction["time"] and raw in correction["tracks"]
                   for correction in self.corrections)

    def apply(self, frame: dict, event: dict | None = None) -> None:
        """Renumérote une image et son événement de journal ; marque les observations incertaines.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Identités — renumérotation des observations
        """
        self.advance(frame["time"])
        for obj in frame["objects"]:
            raw = obj["id"]
            obj["id"] = self.final_id(raw)
            if self.uncertain(raw, frame["time"]):
                obj["identity"] = "uncertain"
        if event is not None and "crops" in event:
            event["crops"] = [[self.final_id(int(row[0])), row[1]] for row in event["crops"]]


def rebuild_tracks(frames: Iterable[dict], plan: dict, affected: set[int]) -> dict[int, dict]:
    """Recalcule le résumé des identités touchées par une correction, sur leurs observations finales.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — résumés des trajectoires corrigées
    """
    mapper = IdentityMapper(plan)
    spans: dict[int, dict] = {}
    for frame in frames:
        mapper.advance(frame["time"])
        for obj in frame["objects"]:
            final = mapper.final_id(obj["id"])
            if final not in affected:
                continue
            span = spans.setdefault(final, {"id": final, "shot": frame["shot"], "firstTime": frame["time"],
                                            "observations": 0, "roleVotes": {}, "team": None,
                                            "teamConfidence": None, "teamVotes": 0, "distanceM": 0.0})
            votes = span["roleVotes"]
            votes[obj["role"]] = votes.get(obj["role"], 0) + 1
            span.update(lastTime=frame["time"], observations=span["observations"] + 1,
                        role=max(votes, key=votes.get))
    return spans


def affected_ids(plan: dict) -> set[int]:
    """Identités dont les observations changent : avant et après chaque correction.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — résumés des trajectoires corrigées
    """
    ids = set()
    for correction in plan["corrections"]:
        ids.update(int(track) for track in correction["tracks"])
        ids.update(int(final) for final in correction["owners"].values())
    return ids


def describe(plan: dict | None) -> dict[str, Any]:
    """Résumé chiffré du contrôle d'identité, pour les mesures de qualité.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — mesures de qualité
    """
    if not plan:
        return {"checked": False}
    return {"checked": True, **plan["summary"], "truncated": plan.get("truncated", False),
            "uncertainSeconds": round(sum(item["time"] - item["start"] for item in plan["corrections"]), 2)}


def iter_frames(chunks: Iterable[dict]) -> Iterator[dict]:
    """Parcourt les images de segments bruts, un segment à la fois.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — lecture du journal
    """
    for chunk in chunks:
        yield from chunk["frames"]


def validate_plan(plan: Any) -> dict:
    """Vérifie un plan relu depuis la base avant de l'appliquer à une reprise.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Identités — validation du plan
    """

    def finite(value: Any) -> bool:
        """Instant numérique fini et positif."""
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0

    try:
        if plan["version"] != PLAN_VERSION or not isinstance(plan["corrections"], list):
            raise ValueError("version du plan d'identités incompatible")
        for correction in plan["corrections"]:
            if correction["kind"] not in ("swap", "split") or not finite(correction["start"]) or not finite(correction["time"]):
                raise ValueError("correction d'identité invalide")
            if correction["start"] > correction["time"] or not correction["tracks"]:
                raise ValueError("correction d'identité invalide")
            if any(type(int(raw)) is not int or type(final) is not int for raw, final in correction["owners"].items()):
                raise ValueError("correction d'identité invalide")
        for values in plan["evidence"].values():
            if any(value not in (None, 0, 1) for value in values):
                raise ValueError("preuves d'identité invalides")
        return plan
    except (KeyError, TypeError, AttributeError) as error:
        raise ValueError("plan d'identités illisible") from error
