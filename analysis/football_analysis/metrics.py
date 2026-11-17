"""Mesures de qualité d'une analyse, sans vérité terrain.

Aucune annotation de référence n'accompagne une vidéo téléversée : les mesures ci-dessous sont des
indicateurs, calculés sur le document de suivi lui-même, et nommés comme tels.

- Détection : personnes par image selon le rôle, part des images où le ballon est vu.
- Suivi : nombre de trajectoires, durée, part des trajectoires brèves, et un indice de
  fragmentation (trajectoires de joueurs par plan, rapportées au plus grand nombre de joueurs vus
  ensemble) : 1 si chaque joueur garde un seul identifiant dans son plan, davantage s'il en change.
- Calibration : part des images calibrées, causes d'échec, erreur d'ajustement (sur les points de
  l'estimation, optimiste) et erreur hors échantillon (chaque point prédit sans lui). Aucune des
  deux n'est une précision des positions de joueurs, faute de vérité terrain.
- Positions : part des observations placées sur le terrain, et part des déplacements
  invraisemblables (plus de 12 m/s entre deux analyses rapprochées du même joueur), qui trahissent
  un tremblement de la calibration ou un échange d'identifiants.
- Équipes : trajectoires par équipe, part des observations de joueurs dont l'équipe est connue, et
  équilibre des équipes dans chaque image. Sur une vidéo de télévision, chaque image montre à peu
  près autant de joueurs de chaque équipe : sur les sept vidéos justes, l'équipe majoritaire d'une
  image en réunit 50 à 55 % (médiane), contre 80 % sur la vidéo où soleil et ombre ont faussé les
  équipes. Les votes, eux, y étaient unanimes : la confiance du vote ne repère pas ce défaut.

Les mesures de traitement (durée, mémoire) sont ajoutées par le pipeline.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict
from statistics import median
from typing import Any

#: Vitesse au-delà de laquelle un déplacement est jugé invraisemblable, en m/s.
MAX_PLAUSIBLE_SPEED = 12.0

#: Écart maximal entre deux analyses pour juger une vitesse, en secondes.
MAX_SPEED_GAP_S = 0.5

#: Durée en dessous de laquelle une trajectoire est jugée brève, en secondes.
SHORT_TRACK_S = 1.0

#: Part médiane de l'équipe majoritaire par image au-delà de laquelle les équipes sont suspectes.
MAX_MAJORITY_SHARE = 0.65

#: Nombre minimal de joueurs classés dans une image pour juger de l'équilibre des équipes.
MIN_PLAYERS_FOR_BALANCE = 8


def _quantile(values: list[float], q: float) -> float | None:
    """Quantile par interpolation linéaire, ou None pour une liste vide.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — mesures de qualité
    """
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    low, high = math.floor(position), math.ceil(position)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def _share(part: int, total: int) -> float | None:
    """Part arrondie à 3 décimales, ou None si le total est nul.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — mesures de qualité
    """
    return None if total == 0 else round(part / total, 3)


def detection_metrics(frames: list[dict[str, Any]]) -> dict[str, Any]:
    """Personnes par image selon le rôle, et part des images avec ballon.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — mesures de qualité (détection)
    """
    per_role: dict[str, list[int]] = defaultdict(list)
    for frame in frames:
        counts = Counter(obj["role"] for obj in frame["objects"])
        for role in ("player", "goalkeeper", "referee"):
            per_role[role].append(counts.get(role, 0))
    count = len(frames)
    return {
        "frames": count,
        "peoplePerFrame": {role: round(sum(values) / count, 2) if count else None for role, values in per_role.items()},
        "ballFrameShare": _share(sum(1 for frame in frames if frame["ball"]), count),
    }


def _track_spans(frames: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    """Début, fin, nombre d'observations, plan et rôles de chaque trajectoire.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — mesures de qualité (suivi)
    """
    spans: dict[int, dict[str, Any]] = {}
    for frame in frames:
        for obj in frame["objects"]:
            span = spans.setdefault(obj["id"], {"first": frame["time"], "last": frame["time"], "count": 0,
                                                "shot": frame["shot"], "role": obj["role"]})
            span["last"] = frame["time"]
            span["count"] += 1
    return spans


def tracking_metrics(frames: list[dict[str, Any]]) -> dict[str, Any]:
    """Trajectoires : nombre, durées, part des brèves, indice de fragmentation par plan.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — mesures de qualité (suivi)
    """
    spans = _track_spans(frames)
    durations = [span["last"] - span["first"] for span in spans.values()]
    players_by_shot: dict[int, set[int]] = defaultdict(set)
    most_together: dict[int, int] = defaultdict(int)
    for frame in frames:
        players = [obj["id"] for obj in frame["objects"] if obj["role"] == "player"]
        players_by_shot[frame["shot"]].update(players)
        most_together[frame["shot"]] = max(most_together[frame["shot"]], len(players))
    ratios = [len(ids) / most_together[shot] for shot, ids in players_by_shot.items() if most_together[shot] >= 5]
    return {
        "tracks": len(spans),
        "tracksByRole": dict(Counter(span["role"] for span in spans.values())),
        "shots": len({frame["shot"] for frame in frames}),
        "medianTrackSeconds": None if not durations else round(median(durations), 2),
        "shortTrackShare": _share(sum(1 for d in durations if d < SHORT_TRACK_S), len(durations)),
        "fragmentation": None if not ratios else round(median(ratios), 2),
    }


def calibration_metrics(frames: list[dict[str, Any]]) -> dict[str, Any]:
    """Part des images calibrées, causes d'échec, erreurs de reprojection.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — mesures de qualité (calibration)
    """
    calibrations = [frame["calibration"] for frame in frames]
    ok = [c for c in calibrations if c["status"] == "ok"]
    fit_px = [c["fitErrorPx"] for c in ok]
    fit_m = [c["fitErrorM"] for c in ok]
    holdout_px = [c["holdoutErrorPx"] for c in ok if c.get("holdoutErrorPx") is not None]
    holdout_m = [c["holdoutErrorM"] for c in ok if c.get("holdoutErrorM") is not None]
    return {
        "calibratedShare": _share(len(ok), len(calibrations)),
        "failureReasons": dict(Counter(c.get("reason") for c in calibrations if c["status"] != "ok")),
        "medianKeypoints": None if not calibrations else median(c.get("keypoints", 0) for c in calibrations),
        "medianFitErrorPx": None if not fit_px else round(median(fit_px), 2),
        "medianFitErrorM": None if not fit_m else round(median(fit_m), 3),
        "medianHoldoutErrorPx": None if not holdout_px else round(median(holdout_px), 2),
        "p90HoldoutErrorPx": None if not holdout_px else round(_quantile(holdout_px, 0.9), 2),
        "medianHoldoutErrorM": None if not holdout_m else round(median(holdout_m), 3),
        "p90HoldoutErrorM": None if not holdout_m else round(_quantile(holdout_m, 0.9), 3),
    }


def position_metrics(frames: list[dict[str, Any]]) -> dict[str, Any]:
    """Part des observations placées sur le terrain, et part des déplacements invraisemblables.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — mesures de qualité (positions)
    """
    observations = placed = outside = 0
    last: dict[int, tuple[float, int, list[float]]] = {}
    pairs = jumps = 0
    speeds: list[float] = []
    for frame in frames:
        for obj in frame["objects"]:
            observations += 1
            if obj["pitchStatus"] == "outside-pitch":
                outside += 1
            if obj["pitch"] is None:
                continue
            placed += 1
            previous = last.get(obj["id"])
            if previous and previous[1] == frame["shot"] and 0 < frame["time"] - previous[0] <= MAX_SPEED_GAP_S:
                distance = math.dist(previous[2], obj["pitch"])
                speed = distance / (frame["time"] - previous[0])
                speeds.append(speed)
                pairs += 1
                jumps += speed > MAX_PLAUSIBLE_SPEED
            last[obj["id"]] = (frame["time"], frame["shot"], obj["pitch"])
    return {
        "placedShare": _share(placed, observations),
        "outsidePitchShare": _share(outside, observations),
        "implausibleSpeedShare": _share(jumps, pairs),
        "medianSpeed": None if not speeds else round(median(speeds), 2),
    }


def team_metrics(frames: list[dict[str, Any]]) -> dict[str, Any]:
    """Trajectoires par équipe et part des observations de joueurs dont l'équipe est connue.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — mesures de qualité (équipes)
    """
    tracks_by_team: dict[str, set[int]] = defaultdict(set)
    players = known = 0
    majority_shares = []
    for frame in frames:
        counts = Counter()
        for obj in frame["objects"]:
            if obj["role"] == "referee":
                continue
            tracks_by_team[str(obj["team"])].add(obj["id"])
            if obj["role"] == "player":
                players += 1
                known += obj["team"] is not None
                if obj["team"] is not None:
                    counts[obj["team"]] += 1
        classified = sum(counts.values())
        if classified >= MIN_PLAYERS_FOR_BALANCE:
            majority_shares.append(max(counts.values()) / classified)
    return {
        "tracksByTeam": {team: len(ids) for team, ids in sorted(tracks_by_team.items())},
        "knownTeamShare": _share(known, players),
        "medianMajorityShare": None if not majority_shares else round(median(majority_shares), 3),
    }


def quality_metrics(frames: list[dict[str, Any]]) -> dict[str, Any]:
    """Toutes les mesures de qualité d'un document de suivi.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — mesures de qualité
    """
    return {
        "detection": detection_metrics(frames),
        "tracking": tracking_metrics(frames),
        "calibration": calibration_metrics(frames),
        "positions": position_metrics(frames),
        "teams": team_metrics(frames),
    }


def describe_limitations(metrics: dict[str, Any]) -> list[str]:
    """Traduit les mesures en limites lisibles, affichées par le visualiseur.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — mesures de qualité (limites)
    """
    notes = ["Les numéros de maillot ne sont pas lus : les étiquettes sont des identifiants de suivi."]
    calibration = metrics["calibration"]
    share = calibration["calibratedShare"]
    if share is not None and share < 1:
        reasons = ", ".join(f"{reason} ({count})" for reason, count in sorted(
            calibration["failureReasons"].items(), key=lambda item: -item[1]))
        notes.append(f"Calibration impossible sur {round((1 - share) * 100)} % des images analysées "
                     f"({reasons}) : aucune position sur le terrain n'est donnée pour ces images.")
    ball = metrics["detection"]["ballFrameShare"]
    if ball is not None and ball < 0.9:
        notes.append(f"Ballon détecté sur {round(ball * 100)} % des images analysées seulement.")
    fragmentation = metrics["tracking"]["fragmentation"]
    if fragmentation is not None and fragmentation > 1.2:
        notes.append(f"Indice de fragmentation de {fragmentation} : sans réidentification, un joueur "
                     "masqué ou sorti du champ revient souvent avec un nouvel identifiant.")
    jumps = metrics["positions"]["implausibleSpeedShare"]
    if jumps:
        notes.append(f"{round(jumps * 100, 1)} % des déplacements mesurés dépassent {MAX_PLAUSIBLE_SPEED:g} m/s : "
                     "tremblement de la calibration ou échange d'identifiants.")
    majority = metrics["teams"].get("medianMajorityShare")
    if majority is not None and majority > MAX_MAJORITY_SHARE:
        notes.append(f"Équipes probablement fausses : dans une image typique, {round(majority * 100)} % des joueurs "
                     "classés sont dans la même équipe, au lieu d'environ la moitié. La lumière (soleil et ombre) "
                     "peut l'emporter sur la couleur des maillots.")
    known = metrics["teams"]["knownTeamShare"]
    if known is not None and known < 0.95:
        notes.append(f"Équipe inconnue pour {round((1 - known) * 100)} % des observations de joueurs "
                     "(votes partagés ou trajectoire trop brève).")
    notes.append("Le ballon est placé sur le terrain comme s'il était au sol : en l'air, il est projeté plus loin.")
    return notes
