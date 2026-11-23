"""Mesures historiques exactes par lecture séquentielle et agrégats SQLite temporaires.

Les quantiles et trajectoires sont triés sur disque. Aucun tableau proportionnel à la durée
du match n'est conservé dans Python. La base temporaire est supprimée par SQLite à la fermeture.
Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import math
import sqlite3
from collections import Counter
from typing import Iterable

from .metrics import _share


def quantile(connection: sqlite3.Connection, kind: str, q: float = 0.5, digits: int | None = None) -> float | None:
    """Calcule un quantile interpolé sans matérialiser la série en Python.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse incrémentale — statistiques sur disque
    """
    count = connection.execute("SELECT COUNT(*) FROM samples WHERE kind=?", (kind,)).fetchone()[0]
    if not count:
        return None
    position = (count - 1) * q
    low, high = math.floor(position), math.ceil(position)
    values = [row[0] for row in connection.execute(
        "SELECT value FROM samples WHERE kind=? ORDER BY value LIMIT ? OFFSET ?", (kind, high - low + 1, low))]
    result = values[0] + (values[-1] - values[0]) * (position - low)
    return round(result, digits) if digits is not None else result


def quality_metrics_stream(chunks: Iterable[list[dict]]) -> dict:
    """Produit les mêmes indicateurs que quality_metrics, avec un cache SQLite de 4 Mio.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse incrémentale — qualité sans document monolithique
    """
    connection = sqlite3.connect("")
    connection.executescript("""
        PRAGMA cache_size=-4096;
        PRAGMA temp_store=FILE;
        PRAGMA journal_mode=OFF;
        CREATE TABLE samples(kind TEXT,value REAL);
        CREATE TABLE spans(id INTEGER PRIMARY KEY,first REAL,last REAL,shot INTEGER,role TEXT,
                           pos_time REAL,pos_shot INTEGER,x REAL,y REAL);
        CREATE TABLE memberships(id INTEGER,team TEXT,PRIMARY KEY(id,team));
        CREATE TABLE players(shot INTEGER,id INTEGER,PRIMARY KEY(shot,id));
        CREATE TABLE shots(id INTEGER PRIMARY KEY,peak INTEGER);
    """)
    count = ball = calibrated = observations = placed = outside = pairs = jumps = players = known = 0
    roles, failures = Counter(), Counter()
    try:
        for chunk in chunks:
            samples = []
            with connection:
                for frame in chunk:
                    count += 1
                    ball += frame["ball"] is not None
                    calibration = frame["calibration"]
                    samples.append(("keypoints", calibration.get("keypoints", 0)))
                    if calibration["status"] == "ok":
                        calibrated += 1
                        for key in ("fitErrorPx", "fitErrorM", "holdoutErrorPx", "holdoutErrorM"):
                            if calibration.get(key) is not None:
                                samples.append((key, calibration[key]))
                    else:
                        failures[calibration.get("reason")] += 1
                    classified = Counter()
                    current_players = 0
                    for obj in frame["objects"]:
                        roles[obj["role"]] += 1
                        observations += 1
                        outside += obj["pitchStatus"] == "outside-pitch"
                        previous = connection.execute("SELECT pos_time,pos_shot,x,y FROM spans WHERE id=?", (obj["id"],)).fetchone()
                        connection.execute("INSERT INTO spans(id,first,last,shot,role) VALUES(?,?,?,?,?) "
                            "ON CONFLICT(id) DO UPDATE SET last=excluded.last",
                            (obj["id"], frame["time"], frame["time"], frame["shot"], obj["role"]))
                        if obj["pitch"] is not None:
                            placed += 1
                            if previous and previous[0] is not None and previous[1] == frame["shot"]:
                                gap = frame["time"] - previous[0]
                                if 0 < gap <= 0.5:
                                    speed = math.dist(previous[2:], obj["pitch"]) / gap
                                    samples.append(("speed", speed))
                                    pairs += 1
                                    jumps += speed > 12
                            connection.execute("UPDATE spans SET pos_time=?,pos_shot=?,x=?,y=? WHERE id=?",
                                (frame["time"], frame["shot"], *obj["pitch"], obj["id"]))
                        if obj["role"] != "referee":
                            connection.execute("INSERT OR IGNORE INTO memberships VALUES(?,?)", (obj["id"], str(obj["team"])))
                        if obj["role"] == "player":
                            current_players += 1
                            players += 1
                            known += obj["team"] is not None
                            if obj["team"] is not None:
                                classified[obj["team"]] += 1
                            connection.execute("INSERT OR IGNORE INTO players VALUES(?,?)", (frame["shot"], obj["id"]))
                    connection.execute("INSERT INTO shots VALUES(?,?) ON CONFLICT(id) DO UPDATE SET peak=MAX(peak,excluded.peak)",
                                       (frame["shot"], current_players))
                    if sum(classified.values()) >= 8:
                        samples.append(("majority", max(classified.values()) / sum(classified.values())))
                connection.executemany("INSERT INTO samples VALUES(?,?)", samples)
        connection.execute("INSERT INTO samples SELECT 'duration',last-first FROM spans")
        connection.execute("INSERT INTO samples SELECT 'fragmentation',CAST(COUNT(p.id) AS REAL)/s.peak "
                           "FROM shots s JOIN players p ON p.shot=s.id WHERE s.peak>=5 GROUP BY s.id")
        connection.execute("CREATE INDEX sorted_samples ON samples(kind,value)")
        tracks = connection.execute("SELECT COUNT(*) FROM spans").fetchone()[0]
        return {
            "detection": {"frames": count, "peoplePerFrame": {role: round(roles[role] / count, 2) if count else None
                for role in ("player", "goalkeeper", "referee")}, "ballFrameShare": _share(ball, count)},
            "tracking": {"tracks": tracks, "tracksByRole": dict(connection.execute("SELECT role,COUNT(*) FROM spans GROUP BY role")),
                "shots": connection.execute("SELECT COUNT(*) FROM shots").fetchone()[0],
                "medianTrackSeconds": quantile(connection, "duration", digits=2),
                "shortTrackShare": _share(connection.execute("SELECT COUNT(*) FROM spans WHERE last-first<1").fetchone()[0], tracks),
                "fragmentation": quantile(connection, "fragmentation", digits=2)},
            "calibration": {"calibratedShare": _share(calibrated, count), "failureReasons": dict(failures),
                "medianKeypoints": quantile(connection, "keypoints"),
                "medianFitErrorPx": quantile(connection, "fitErrorPx", digits=2),
                "medianFitErrorM": quantile(connection, "fitErrorM", digits=3),
                "medianHoldoutErrorPx": quantile(connection, "holdoutErrorPx", digits=2),
                "p90HoldoutErrorPx": quantile(connection, "holdoutErrorPx", .9, 2),
                "medianHoldoutErrorM": quantile(connection, "holdoutErrorM", digits=3),
                "p90HoldoutErrorM": quantile(connection, "holdoutErrorM", .9, 3)},
            "positions": {"placedShare": _share(placed, observations), "outsidePitchShare": _share(outside, observations),
                "implausibleSpeedShare": _share(jumps, pairs), "medianSpeed": quantile(connection, "speed", digits=2)},
            "teams": {"tracksByTeam": dict(connection.execute("SELECT team,COUNT(*) FROM memberships GROUP BY team ORDER BY team")),
                "knownTeamShare": _share(known, players), "medianMajorityShare": quantile(connection, "majority", digits=3)},
        }
    finally:
        connection.close()
