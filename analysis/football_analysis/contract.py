"""Format des données de suivi, commun à la vidéo téléversée et au futur flux en direct.

Un document de suivi se découpe en trois sortes de messages :

- « header » : la source (dimensions, cadence), l'analyse (modèles, pas d'échantillonnage) et le
  repère du terrain ;
- « frame » : une image analysée, horodatée, avec la calibration, les personnes suivies et le
  ballon. Chaque image se suffit à elle-même : équipe et confiance y sont recopiées ;
- « summary » : les trajectoires, les équipes, les mesures de qualité et les limites constatées.

Pour une vidéo téléversée, le document JSON réunit les trois (en-tête, puis « frames », puis
résumé). Pour un flux en direct, les mêmes objets circulent un par un : document_to_messages et
messages_to_document passent de l'un à l'autre.

Champs facultatifs d'une personne : « distanceM » (distance cumulée) et « identity » : « uncertain »
pendant un contact où le suivi a échangé deux joueurs puis a été corrigé (identity.py) ; qui est
qui n'y est pas connu, et l'équipe y est absente. Version 1 inchangée : ces champs s'ajoutent.

Repère du terrain : origine au point central, en mètres ; x le long du terrain, vers le but de
droite de l'image ; y le long de la largeur, vers la caméra principale. Une position absente
(None) n'est jamais remplacée par une valeur inventée : « pitchStatus » en donne la cause.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import math
from typing import Any, Iterable, Iterator

FORMAT = "football-tracking"
VERSION = 1

#: Rôles des personnes suivies, d'après les classes du détecteur de Roboflow.
ROLES = ("player", "goalkeeper", "referee")

#: Dimensions du gabarit de terrain, en mètres (dimensions réglementaires les plus courantes).
PITCH = {"length": 105.0, "width": 68.0, "origin": "centre", "units": "m"}

#: Causes d'une position absente sur le terrain.
PITCH_STATUSES = ("ok", "no-calibration", "outside-pitch")

#: Champs de l'en-tête, recopiés tels quels entre document et messages.
HEADER_FIELDS = ("source", "analysis", "pitch")

#: Champs du résumé, connus seulement à la fin d'une analyse de fichier.
SUMMARY_FIELDS = ("teams", "tracks", "metrics", "limitations")


def _rounded(value: float, digits: int) -> float:
    """Arrondit une valeur pour un JSON compact.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — format des données de suivi
    """
    return round(float(value), digits)


def make_object(track_id: int, role: str, confidence: float, box: Iterable[float],
                pitch: tuple[float, float] | None, pitch_status: str,
                team: int | None = None, team_confidence: float | None = None) -> dict[str, Any]:
    """Construit l'enregistrement d'une personne suivie dans une image.

    Args:
        track_id: identifiant de la trajectoire, unique dans la vidéo.
        role: une valeur de ROLES.
        confidence: confiance du détecteur, entre 0 et 1.
        box: boîte englobante [x1, y1, x2, y2], en pixels de la vidéo source.
        pitch: position des pieds sur le terrain, en mètres, ou None.
        pitch_status: une valeur de PITCH_STATUSES, qui explique une position absente.
        team: 0 ou 1, ou None si l'équipe est inconnue.
        team_confidence: part des votes pour cette équipe, ou None.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — format des données de suivi
    """
    record: dict[str, Any] = {
        "id": int(track_id),
        "role": role,
        "confidence": _rounded(confidence, 3),
        "box": [_rounded(v, 1) for v in box],
        "pitch": None if pitch is None else [_rounded(pitch[0], 2), _rounded(pitch[1], 2)],
        "pitchStatus": pitch_status,
        "team": team,
        "teamConfidence": None if team_confidence is None else _rounded(team_confidence, 3),
    }
    return record


def make_ball(confidence: float, box: Iterable[float], pitch: tuple[float, float] | None,
              pitch_status: str) -> dict[str, Any]:
    """Construit l'enregistrement du ballon dans une image (la détection la plus sûre).

    La position sur le terrain suppose le ballon au sol : un ballon en l'air est projeté plus loin.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — format des données de suivi
    """
    return {
        "confidence": _rounded(confidence, 3),
        "box": [_rounded(v, 1) for v in box],
        "pitch": None if pitch is None else [_rounded(pitch[0], 2), _rounded(pitch[1], 2)],
        "pitchStatus": pitch_status,
    }


def make_frame(index: int, time: float, shot: int, cut: bool, calibration: dict[str, Any],
               objects: list[dict[str, Any]], ball: dict[str, Any] | None) -> dict[str, Any]:
    """Construit le message d'une image analysée.

    Args:
        index: numéro de l'image dans la vidéo source, à partir de 0.
        time: instant de l'image, en secondes depuis le début de la vidéo.
        shot: numéro du plan, incrémenté à chaque coupure.
        cut: vrai pour la première image d'un nouveau plan.
        calibration: résultat de la calibration (voir calibration.CalibrationResult.to_dict).
        objects: personnes suivies (make_object).
        ball: ballon (make_ball), ou None s'il n'est pas détecté.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — format des données de suivi
    """
    return {
        "index": int(index),
        "time": _rounded(time, 4),
        "shot": int(shot),
        "cut": bool(cut),
        "calibration": calibration,
        "objects": objects,
        "ball": ball,
    }


def document_to_messages(document: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Découpe un document de suivi en messages, dans l'ordre d'un flux en direct.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — format des données de suivi (fichier et direct)
    """
    yield {"type": "header", "format": document["format"], "version": document["version"],
           **{key: document[key] for key in HEADER_FIELDS}}
    for frame in document["frames"]:
        yield {"type": "frame", **frame}
    yield {"type": "summary", **{key: document.get(key) for key in SUMMARY_FIELDS}}


def messages_to_document(messages: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Reconstitue un document de suivi à partir des messages d'un flux.

    Raises:
        ValueError: si le premier message n'est pas un en-tête.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — format des données de suivi (fichier et direct)
    """
    document: dict[str, Any] | None = None
    for message in messages:
        kind = message.get("type")
        body = {key: value for key, value in message.items() if key != "type"}
        if document is None:
            if kind != "header":
                raise ValueError("le flux doit commencer par un en-tête")
            document = {**body, "frames": [], **{key: None for key in SUMMARY_FIELDS}}
        elif kind == "frame":
            document["frames"].append(body)
        elif kind == "summary":
            document.update(body)
    if document is None:
        raise ValueError("flux vide")
    return document


def _check_number(value: Any, minimum: float | None = None, maximum: float | None = None) -> bool:
    """Indique si une valeur est un nombre fini dans les bornes données.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — format des données de suivi (validation)
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return False
    if minimum is not None and value < minimum:
        return False
    return maximum is None or value <= maximum


def _frame_problems(frame: dict[str, Any], position: int, previous_time: float) -> list[str]:
    """Liste les défauts d'une image du document.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — format des données de suivi (validation)
    """
    where = f"frames[{position}]"
    problems = []
    if not _check_number(frame.get("time"), 0) or frame["time"] < previous_time:
        problems.append(f"{where}.time absent, négatif ou non croissant")
    status = (frame.get("calibration") or {}).get("status")
    if status not in ("ok", "failed"):
        problems.append(f"{where}.calibration.status invalide : {status!r}")
    for k, obj in enumerate(frame.get("objects", [])):
        if obj.get("role") not in ROLES:
            problems.append(f"{where}.objects[{k}].role invalide : {obj.get('role')!r}")
        if obj.get("pitchStatus") not in PITCH_STATUSES:
            problems.append(f"{where}.objects[{k}].pitchStatus invalide")
        if (obj.get("pitch") is None) != (obj.get("pitchStatus") != "ok"):
            problems.append(f"{where}.objects[{k}] : position et pitchStatus incohérents")
        if status != "ok" and obj.get("pitch") is not None:
            problems.append(f"{where}.objects[{k}] : position sans calibration")
        box = obj.get("box")
        if not (isinstance(box, list) and len(box) == 4 and all(_check_number(v) for v in box)):
            problems.append(f"{where}.objects[{k}].box invalide")
        if obj.get("team") not in (None, 0, 1):
            problems.append(f"{where}.objects[{k}].team invalide")
        # Champ facultatif : présent seulement pendant un contact corrigé (identity.py).
        if "identity" in obj and (obj["identity"] != "uncertain" or obj.get("team") is not None):
            problems.append(f"{where}.objects[{k}].identity invalide")
    return problems


def validate_document(document: dict[str, Any]) -> list[str]:
    """Vérifie un document de suivi ; renvoie la liste des défauts, vide s'il est valide.

    Contrôles : format et version, en-tête, images horodatées dans l'ordre, rôles, boîtes, et
    surtout aucune position sur le terrain sans calibration réussie.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — format des données de suivi (validation)
    """
    problems = []
    if document.get("format") != FORMAT or document.get("version") != VERSION:
        problems.append(f"format attendu : {FORMAT} version {VERSION}")
    source = document.get("source") or {}
    for key in ("width", "height", "fps"):
        if not _check_number(source.get(key), 0) or source.get(key) == 0:
            problems.append(f"source.{key} absent ou nul")
    frames = document.get("frames")
    if not isinstance(frames, list):
        return problems + ["frames absent"]
    previous_time = -1.0
    for position, frame in enumerate(frames):
        problems.extend(_frame_problems(frame, position, previous_time))
        if _check_number(frame.get("time")):
            previous_time = frame["time"]
    return problems
