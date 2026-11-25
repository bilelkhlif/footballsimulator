"""Match de démonstration synthétique : vidéo et annotations générées ensemble, sans modèle.

Le mode démo public du visualiseur ne peut pas publier les vidéos de match réelles disponibles
(diffusions de la Bundesliga et de la Coupe du monde, sous licence) ni les poids des modèles. Ce
module fabrique donc une vidéo de match de toutes pièces et le document de suivi qui la décrit :

- une rencontre simulée (deux équipes de onze, un arbitre, un ballon qui circule par passes) ;
- une caméra principale de diffusion qui suit le ballon, puis un plan rapproché après une coupure ;
- des annotations au format de l'analyse réelle (contract.py), écrites dans la base par segments
  (chunk_storage.py), puis exportées pour le navigateur (static_export.py).

Les annotations sont exactes par construction : elles ne mesurent rien de la précision de
l'analyse IA. Pour que l'interface montre les mêmes situations qu'une vraie analyse, elles imitent
le comportement observable du suivi : un joueur caché derrière un autre n'est pas détecté, un
identifiant change après une coupure ou 2,4 s sans détection, et un contact masqué scénarisé est
déclaré d'identité incertaine. Chaque image porte en bas à gauche son numéro en binaire, pour que
les tests vérifient la synchronisation de l'image affichée et des annotations.

Usage : python -m football_analysis demo (ffmpeg avec libx264 requis).

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

from dataclasses import dataclass, field
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile

import cv2
import numpy as np

from . import contract
from .chunk_storage import ChunkStore
from .incremental_metrics import quality_metrics_stream
from .static_export import export_analysis, update_catalog

#: Durée, cadence et taille de la vidéo ; une image analysée sur deux, comme l'analyse réelle.
DURATION, FPS, WIDTH, HEIGHT, STRIDE = 36.0, 25, 960, 540, 2
#: Segments de la base et de l'export, en secondes.
CHUNK_SECONDS = 10.0
#: Graine du hasard : la démonstration est reproductible à l'octet près pour la simulation.
SEED = 2026
#: Plans : instant de début et caméra ; coupures à 24 s (plan rapproché) et à 28 s.
SHOTS = ((0.0, "main"), (24.0, "close"), (28.0, "main"))
#: Croisement scénarisé de deux joueurs adverses (contact masqué), en secondes.
CROSSING = (10.4, 12.8)
#: Délai sans détection après lequel un joueur reçoit un nouvel identifiant (ByteTrack).
LOST_SECONDS = 2.4
#: Version du générateur, notée dans la provenance de l'export.
GENERATOR_VERSION = 1
#: Date de génération de cette version de la démonstration (fixe, pour un export reproductible).
GENERATED_AT = "2026-11-24T00:00:00+00:00"
#: Identifiant et titre de l'export public.
DEMO_ID, DEMO_TITLE = "match-synthetique", "Match synthétique de démonstration"

#: Couleurs (RVB) : maillot, short, gardien.
TEAMS = (
    {"id": 0, "name": "Rouges", "shirt": (214, 58, 52), "shorts": (240, 240, 240), "keeper": (46, 168, 92)},
    {"id": 1, "name": "Bleus", "shirt": (46, 98, 206), "shorts": (24, 30, 64), "keeper": (238, 164, 32)},
)
REFEREE = {"shirt": (232, 212, 46), "shorts": (20, 20, 20)}

#: Dispositifs, pour l'équipe qui défend le but de gauche (x négatif) : 4-3-3 et 4-4-2.
FORMATIONS = (
    [(-50, 0), (-36, -24), (-38, -8), (-38, 8), (-36, 24), (-22, -14), (-24, 0), (-22, 14), (-8, -22), (-6, 0), (-8, 22)],
    [(-50, 0), (-36, -24), (-38, -8), (-38, 8), (-36, 24), (-22, -22), (-24, -7), (-24, 7), (-22, 22), (-8, -6), (-8, 6)],
)

#: Repères du terrain (mètres) : coins, ligne médiane, surfaces, points de penalty, rond central.
KEYPOINTS = [(sx * 52.5, sy * 34) for sx in (-1, 1) for sy in (-1, 1)] + [(0, -34), (0, 34), (0, 0), (0, -9.15), (0, 9.15)] \
    + [(sx * x, sy * y) for sx in (-1, 1) for x in (52.5, 36) for sy in (-1, 1) for y in (20.16,)] \
    + [(sx * x, sy * y) for sx in (-1, 1) for x in (52.5, 47) for sy in (-1, 1) for y in (9.16,)] + [(-41.5, 0), (41.5, 0)]


@dataclass
class Person:
    """Une personne simulée : équipe (None pour l'arbitre), rôle, numéro, place de référence.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — simulation
    """
    team: int | None
    role: str
    number: int
    home: tuple[float, float]
    phase: float
    positions: list[np.ndarray] = field(default_factory=list)


def _direction(team: int) -> int:
    """Sens d'attaque : +1 vers le but de droite pour les Rouges, -1 pour les Bleus.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — simulation
    """
    return 1 if team == 0 else -1


def simulate(seed: int = SEED) -> tuple[list[Person], list[np.ndarray], tuple[int, int]]:
    """Simule la rencontre à 25 images/s : positions des 23 personnes et du ballon, paire du croisement.

    Le ballon passe d'un joueur à l'autre (passes à 15 m/s, une sur sept interceptée) ; les blocs
    suivent le ballon, le défenseur le plus proche presse, les gardiens et l'arbitre suivent le jeu.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — simulation
    """
    rng = np.random.default_rng(seed)
    people: list[Person] = []
    for team, formation in enumerate(FORMATIONS):
        for number, (x, y) in enumerate(formation, start=1):
            home = (x * _direction(team) if team == 0 else -x, y if team == 0 else -y)
            people.append(Person(team, "goalkeeper" if number == 1 else "player", number, home, float(rng.uniform(0, 6.3))))
    people.append(Person(None, "referee", 0, (0.0, 10.0), 0.0))
    count = len(people)
    position = np.array([p.home for p in people], dtype=float)
    position[:, 0] *= 0.55  # coup d'envoi : blocs resserrés
    velocity = np.zeros((count, 2))
    holder, flight = 9, None  # avant-centre des Rouges
    next_pass = 1.5
    ball = position[holder].copy()
    crossing_pair: tuple[int, int] | None = None
    crossing_from: dict[int, np.ndarray] = {}
    balls = []
    steps = int(DURATION * FPS)
    dt = 1 / FPS
    for step in range(steps):
        time = step * dt
        attacking = people[holder].team if flight is None else people[flight["to"]].team
        targets = np.empty((count, 2))
        limits = np.full(count, 5.5)
        accel = np.full(count, 4.5)
        for index, person in enumerate(people):
            if person.role == "referee":
                targets[index] = ball + (-9.0, 11.0)
                limits[index] = 6.5
                continue
            direction = _direction(person.team)
            if person.role == "goalkeeper":
                targets[index] = (-direction * 49.0, 0.22 * ball[1])
                limits[index] = 3.0
                continue
            shift = 0.55 * ball[0] + (7.0 if person.team == attacking else -5.0) * direction
            wander = 1.8 * np.array([math.sin(0.9 * time + person.phase), math.cos(0.7 * time + 1.3 * person.phase)])
            targets[index] = (person.home[0] + shift, person.home[1] * (1.0 if person.team == attacking else 0.8)
                              + 0.22 * ball[1]) + wander
        busy = set(crossing_pair) if crossing_pair and CROSSING[0] - 2.0 <= time < CROSSING[1] else set()
        defenders = [i for i, p in enumerate(people) if p.team not in (None, attacking) and p.role == "player" and i not in busy]
        presser = min(defenders, key=lambda i: np.linalg.norm(position[i] - ball))
        targets[presser], limits[presser] = ball, 7.0
        if flight is None:
            goal = np.array([_direction(people[holder].team) * 52.5, 0.0])
            targets[holder] = position[holder] + 3.0 * (goal - position[holder]) / max(np.linalg.norm(goal - position[holder]), 1)
            limits[holder] = 3.6
        else:
            targets[flight["to"]], limits[flight["to"]] = flight["target"], 7.0
        # Duel scénarisé : deux adversaires proches courent épaule contre épaule, l'un caché par l'autre.
        scripted: dict[int, np.ndarray] = {}
        if CROSSING[0] - 2.0 <= time < CROSSING[1]:
            if crossing_pair is None:
                engaged = {holder, presser, *([flight["to"]] if flight else [])}
                reds = [i for i, p in enumerate(people) if p.team == 0 and p.role == "player" and i not in engaged]
                blues = [i for i, p in enumerate(people) if p.team == 1 and p.role == "player" and i not in engaged]
                crossing_pair = min(((r, b) for r in reds for b in blues),
                                    key=lambda pair: np.linalg.norm(position[pair[0]] - position[pair[1]]))
                centre = (position[crossing_pair[0]] + position[crossing_pair[1]]) / 2
                crossing_from = {crossing_pair[0]: centre + (-3.0, 1.5), crossing_pair[1]: centre + (-2.6, -1.0)}
            red, blue = crossing_pair
            if time < CROSSING[0]:
                for index in crossing_pair:
                    targets[index], limits[index], accel[index] = crossing_from[index], 8.5, 12.0
            else:
                elapsed = time - CROSSING[0]
                duel = min(elapsed, 1.6)
                after = max(0.0, elapsed - 1.6)
                scripted[red] = crossing_from[red] + (4.5 * duel + 4.5 * after, 0.0)
                scripted[blue] = crossing_from[blue] + (4.5 * duel - 3.0 * after, -3.0 * after)
        targets[:, 0] = np.clip(targets[:, 0], -51.0, 51.0)
        targets[:, 1] = np.clip(targets[:, 1], -33.0, 33.0)
        desired = (targets - position) * 1.1
        speed = np.linalg.norm(desired, axis=1, keepdims=True)
        desired *= np.minimum(1.0, limits[:, None] / np.maximum(speed, 1e-9))
        change = desired - velocity
        norm = np.linalg.norm(change, axis=1, keepdims=True)
        velocity += change * np.minimum(1.0, accel[:, None] * dt / np.maximum(norm, 1e-9))
        position += velocity * dt
        for index, point in scripted.items():
            # Suivi du scénario à 8,5 m/s au plus : raccord sans saut, puis suivi exact (le duel va à 4,5 m/s).
            previous = position[index] - velocity[index] * dt
            gap = point - previous
            distance = float(np.linalg.norm(gap))
            position[index] = point if distance <= 8.5 * dt else previous + gap * (8.5 * dt / distance)
            velocity[index] = (position[index] - previous) / dt
        # Ballon : tenu, en l'air (passe) ou intercepté.
        if flight is None:
            heading = velocity[holder] / max(np.linalg.norm(velocity[holder]), 1e-9)
            ball = position[holder] + 0.6 * heading
            if time >= next_pass:
                team = people[holder].team
                ahead = [i for i, p in enumerate(people) if p.team == team and p.role == "player" and i != holder and i not in busy]
                ahead.sort(key=lambda i: -_direction(team) * position[i][0] + 0.4 * np.linalg.norm(position[i] - ball))
                receiver = ahead[int(rng.integers(0, min(4, len(ahead))))]
                target = position[receiver] + velocity[receiver] * 0.8
                if rng.random() < 1 / 7:
                    rivals = [i for i, p in enumerate(people) if p.team not in (None, team) and p.role == "player" and i not in busy]
                    receiver = min(rivals, key=lambda i: np.linalg.norm(position[i] - (ball + target) / 2))
                    target = (ball + target) / 2
                duration = max(np.linalg.norm(target - ball) / 15.0, 0.3)
                flight = {"from": ball.copy(), "target": target, "to": receiver, "start": time, "end": time + duration}
        else:
            share = min((time - flight["start"]) / (flight["end"] - flight["start"]), 1.0)
            ball = flight["from"] + (flight["target"] - flight["from"]) * share
            if share >= 1.0:
                holder, flight = flight["to"], None
                next_pass = time + float(rng.uniform(1.3, 2.7))
        for index, person in enumerate(people):
            person.positions.append(position[index].copy())
        balls.append(ball.copy())
    return people, balls, crossing_pair


@dataclass
class Camera:
    """Caméra à sténopé : centre, matrice de rotation et focale ; projette le repère du terrain.

    Repère du terrain du contrat : x vers le but de droite de l'image, y vers la caméra principale,
    z vers le haut.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — caméra
    """
    centre: np.ndarray
    rotation: np.ndarray
    focal: float

    @classmethod
    def looking_at(cls, target: tuple[float, float], fov_degrees: float, height: float = 14.0, back: float = 25.0) -> Camera:
        """Caméra derrière la ligne de touche proche, qui vise un point du terrain.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Démonstration synthétique — caméra
        """
        # Repère direct (x, -y, z) : la caméra en y = 34 + back du contrat est en -(34 + back).
        centre = np.array([target[0], -(34.0 + back), height])
        forward = np.array([target[0], -target[1], 0.0]) - centre
        forward /= np.linalg.norm(forward)
        right = np.cross(forward, (0.0, 0.0, 1.0))
        right /= np.linalg.norm(right)
        down = np.cross(forward, right)
        focal = (WIDTH / 2) / math.tan(math.radians(fov_degrees) / 2)
        return cls(centre, np.stack([right, down, forward]), focal)

    def project(self, x: float, y: float, z: float = 0.0) -> tuple[float, float, float]:
        """Projette un point du terrain (contrat) : colonne, ligne, profondeur.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Démonstration synthétique — caméra
        """
        point = self.rotation @ (np.array([x, -y, z]) - self.centre)
        return self.focal * point[0] / point[2] + WIDTH / 2, self.focal * point[1] / point[2] + HEIGHT / 2, point[2]

    def image_to_pitch(self) -> list[float]:
        """Homographie de l'image vers le terrain (9 nombres par ligne), comme calibration.py.

        @responsable Bilel Khlif
        @date 2026-11-24
        @role Démonstration synthétique — caméra
        """
        intrinsics = np.array([[self.focal, 0, WIDTH / 2], [0, self.focal, HEIGHT / 2], [0, 0, 1.0]])
        translation = -self.rotation @ self.centre
        pitch_to_image = intrinsics @ np.column_stack([self.rotation[:, 0], -self.rotation[:, 1], translation])
        inverse = np.linalg.inv(pitch_to_image)
        return [float(f"{value:.6g}") for value in (inverse / inverse[2, 2]).ravel()]


def shot_at(time: float) -> tuple[int, str]:
    """Numéro et caméra du plan à cet instant.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — montage
    """
    index = max(i for i, (start, _) in enumerate(SHOTS) if time >= start - 1e-9)
    return index, SHOTS[index][1]


def cameras(balls: list[np.ndarray], holders: list[np.ndarray]) -> list[Camera]:
    """Caméra de chaque image : panoramique lissé sur le ballon, ou plan rapproché sur le jeu.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — caméra
    """
    result, aim = [], float(balls[0][0])
    for step, ball in enumerate(balls):
        _, kind = shot_at(step / FPS)
        wanted = float(np.clip(ball[0], -30.0, 30.0))
        aim += float(np.clip((wanted - aim) * 0.04, -0.32, 0.32))  # au plus 8 m/s de panoramique
        if kind == "close":
            focus = holders[step]
            result.append(Camera.looking_at((float(focus[0]), float(focus[1])), 11.0))
        else:
            result.append(Camera.looking_at((aim, -2.0), 38.0))
    return result


def person_box(camera: Camera, point: np.ndarray, height: float = 1.85) -> tuple[list[float], float]:
    """Boîte englobante d'une personne debout en ce point, et sa profondeur.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — géométrie
    """
    u, v, depth = camera.project(point[0], point[1], 0.0)
    _, top, _ = camera.project(point[0], point[1], height)
    half = 0.21 * (v - top)
    return [u - half, top, u + half, v], depth


def _visible_share(box: list[float]) -> float:
    """Part d'une boîte à l'intérieur de l'image.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — géométrie
    """
    area = max((box[2] - box[0]) * (box[3] - box[1]), 1e-9)
    inside = max(0.0, min(box[2], WIDTH) - max(box[0], 0)) * max(0.0, min(box[3], HEIGHT) - max(box[1], 0))
    return inside / area


def _draw_pitch(image: np.ndarray, camera: Camera) -> None:
    """Dessine tribunes, pelouse rayée, lignes du terrain et panneaux publicitaires.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — rendu
    """
    def poly(points):
        return np.array([camera.project(x, y)[:2] for x, y in points], dtype=np.float32).round().astype(np.int32)

    image[:] = (34, 38, 46)
    for row in range(0, HEIGHT, 6):  # tribunes : bandes de spectateurs stylisées
        shade = 40 + 18 * ((row // 6) % 3)
        image[row:row + 3] = (shade, shade + 4, shade + 12)
    cv2.fillPoly(image, [poly([(-62, -42), (62, -42), (62, 44), (-62, 44)])], (56, 128, 62), cv2.LINE_AA)
    for band in range(20):
        if band % 2:
            x0 = -52.5 + band * 5.25
            cv2.fillPoly(image, [poly([(x0, -34), (x0 + 5.25, -34), (x0 + 5.25, 34), (x0, 34)])], (62, 140, 68), cv2.LINE_AA)
    white = (238, 238, 238)

    def line(points, closed=False):
        cv2.polylines(image, [poly(points)], closed, white, 2, cv2.LINE_AA)

    line([(-52.5, -34), (52.5, -34), (52.5, 34), (-52.5, 34)], closed=True)
    line([(0, -34), (0, 34)])
    line([(9.15 * math.cos(a), 9.15 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 72)], closed=True)
    for side in (-1, 1):
        line([(side * 52.5, -20.16), (side * 36, -20.16), (side * 36, 20.16), (side * 52.5, 20.16)])
        line([(side * 52.5, -9.16), (side * 47, -9.16), (side * 47, 9.16), (side * 52.5, 9.16)])
        arc = [(side * (41.5 - 9.15 * math.cos(a)), 9.15 * math.sin(a)) for a in np.linspace(-0.93, 0.93, 24)]
        line(arc)
        u, v, _ = camera.project(side * 41.5, 0)
        cv2.circle(image, (round(u), round(v)), 2, white, -1, cv2.LINE_AA)
    for index, x0 in enumerate(np.arange(-56, 56, 8.0)):
        top = [camera.project(x, -37.0, 0.9)[:2] for x in (x0, x0 + 7.6)]
        bottom = [camera.project(x, -37.0, 0.0)[:2] for x in (x0 + 7.6, x0)]
        colour = ((205, 46, 52), (30, 86, 170), (250, 250, 250))[index % 3]
        cv2.fillPoly(image, [np.array(top + bottom, dtype=np.float32).round().astype(np.int32)], colour, cv2.LINE_AA)


def _draw_person(image: np.ndarray, box: list[float], shirt: tuple, shorts: tuple) -> None:
    """Dessine une silhouette : ombre, jambes, short, maillot et tête.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — rendu
    """
    x1, y1, x2, y2 = box
    height, centre = y2 - y1, (x1 + x2) / 2
    cv2.ellipse(image, (round(centre), round(y2)), (max(2, round(height * 0.28)), max(1, round(height * 0.06))), 0, 0, 360,
                (36, 84, 40), -1, cv2.LINE_AA)
    legs = (round(centre - height * 0.09), round(y1 + height * 0.62), round(centre + height * 0.09), round(y2))
    cv2.rectangle(image, legs[:2], legs[2:], (226, 186, 150), -1, cv2.LINE_AA)
    cv2.rectangle(image, (round(centre - height * 0.13), round(y1 + height * 0.52)),
                  (round(centre + height * 0.13), round(y1 + height * 0.66)), shorts, -1, cv2.LINE_AA)
    cv2.rectangle(image, (round(centre - height * 0.16), round(y1 + height * 0.2)),
                  (round(centre + height * 0.16), round(y1 + height * 0.54)), shirt, -1, cv2.LINE_AA)
    cv2.circle(image, (round(centre), round(y1 + height * 0.1)), max(2, round(height * 0.09)), (226, 186, 150), -1, cv2.LINE_AA)


def _draw_overlay(image: np.ndarray, frame: int) -> None:
    """Bandeau « démonstration synthétique », chronomètre et numéro d'image en binaire (12 pavés).

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — rendu
    """
    cv2.rectangle(image, (12, 12), (318, 44), (18, 22, 30), -1)
    seconds = frame / FPS
    cv2.putText(image, f"DEMO SYNTHETIQUE  ROU 0-0 BLE  {int(seconds // 60):02d}:{int(seconds % 60):02d}", (20, 34),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (240, 240, 240), 1, cv2.LINE_AA)
    cv2.rectangle(image, (8, HEIGHT - 34), (8 + 12 * 20 + 6, HEIGHT - 6), (0, 0, 0), -1)
    for bit in range(12):
        if frame >> bit & 1:
            x = 12 + bit * 20
            cv2.rectangle(image, (x, HEIGHT - 30), (x + 17, HEIGHT - 10), (255, 255, 255), -1)


def frame_code(image: np.ndarray) -> int:
    """Relit le numéro d'image codé en bas à gauche (outil de vérification de la vidéo encodée).

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — vérification
    """
    return sum(1 << bit for bit in range(12) if image[HEIGHT - 20, 12 + bit * 20 + 8].mean() > 128)


def render_video(path: Path, people: list[Person], balls: list[np.ndarray], views: list[Camera]) -> None:
    """Rend chaque image et l'encode en H.264 (MP4, une image clé par seconde pour l'avance rapide).

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — rendu
    """
    command = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}",
               "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-g", str(FPS),
               "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(path)]
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE)
    image = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    try:
        for step, camera in enumerate(views):
            _draw_pitch(image, camera)
            items = []
            for person in people:
                box, depth = person_box(camera, person.positions[step])
                if depth > 0:
                    if person.team is None:
                        colours = (REFEREE["shirt"], REFEREE["shorts"])
                    else:
                        team = TEAMS[person.team]
                        colours = (team["keeper"] if person.role == "goalkeeper" else team["shirt"], team["shorts"])
                    items.append((depth, "person", box, colours))
            u, v, depth = camera.project(balls[step][0], balls[step][1], 0.11)
            radius = max(1.5, camera.focal * 0.11 / max(depth, 1e-6))
            items.append((depth - 0.3, "ball", (u, v, radius), None))
            for _, kind, shape, colours in sorted(items, key=lambda item: -item[0]):
                if kind == "person":
                    _draw_person(image, shape, *colours)
                else:
                    cv2.circle(image, (round(shape[0]), round(shape[1])), round(shape[2]), (250, 250, 250), -1, cv2.LINE_AA)
            _draw_overlay(image, step)
            encoder.stdin.write(image.tobytes())
    finally:
        encoder.stdin.close()
        if encoder.wait() != 0:
            raise RuntimeError("ffmpeg n'a pas pu encoder la vidéo de démonstration (libx264 requis).")


def annotate(people: list[Person], balls: list[np.ndarray], views: list[Camera], crossing: tuple[int, int] | None,
             rng_seed: int = SEED) -> tuple[list[dict], dict | None]:
    """Annotations d'une image sur deux, au format du contrat, avec le comportement visible du suivi.

    Renvoie les images analysées et la description du contact scénarisé (intervalle, identifiants).

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — annotations
    """
    rng = np.random.default_rng(rng_seed + 1)
    frames, next_id, ids, last_seen, distances, last_point = [], 1, {}, {}, {}, {}
    current_shot, contact_frames = -1, []
    for step in range(0, len(views), STRIDE):
        time = round(step / FPS, 4)
        shot, kind = shot_at(time)
        if shot != current_shot:
            ids, last_seen, current_shot = {}, {}, shot
        camera = views[step]
        boxes = []
        for index, person in enumerate(people):
            box, depth = person_box(camera, person.positions[step])
            if depth > 0 and _visible_share(box) >= 0.4:
                boxes.append((depth, index, box))
        occupancy = np.zeros((HEIGHT // 4 + 1, WIDTH // 4 + 1), dtype=bool)
        detected = []
        for depth, index, box in sorted(boxes):
            x1, y1, x2, y2 = (max(0, int(box[0] // 4)), max(0, int(box[1] // 4)),
                              min(WIDTH // 4, int(box[2] // 4) + 1), min(HEIGHT // 4, int(box[3] // 4) + 1))
            region = occupancy[y1:y2, x1:x2]
            hidden = region.mean() if region.size else 1.0
            region[:] = True
            if hidden < 0.65:
                detected.append((index, box))
        calibrated = kind == "main"
        homography = camera.image_to_pitch() if calibrated else None
        visible_points = int(sum(bool(0 <= camera.project(x, y)[0] < WIDTH and 0 <= camera.project(x, y)[1] < HEIGHT)
                                 for x, y in KEYPOINTS))
        calibration = ({"status": "ok", "keypoints": visible_points, "inliers": visible_points,
                        "homography": homography, "synthetic": True} if calibrated
                       else {"status": "failed", "reason": "too-few-keypoints", "keypoints": min(visible_points, 3)})
        objects = []
        present = {index for index, _ in detected}
        if crossing and CROSSING[0] <= time <= CROSSING[1]:
            red, blue = crossing
            boxes_by_index = {index: box for _, index, box in boxes}
            if red in boxes_by_index and blue in boxes_by_index and (
                    _iou(boxes_by_index[red], boxes_by_index[blue]) >= 0.1 or not {red, blue} <= present):
                contact_frames.append(time)
        for index, box in detected:
            person = people[index]
            if index not in ids or time - last_seen.get(index, -math.inf) > LOST_SECONDS:
                ids[index], next_id = next_id, next_id + 1
                last_point.pop(ids[index], None)
            last_seen[index] = time
            track = ids[index]
            point = person.positions[step]
            pitch = (float(point[0]), float(point[1])) if calibrated else None
            record = contract.make_object(track, person.role, float(rng.uniform(0.8, 0.97)),
                                          [min(max(v, 0), limit) for v, limit in zip(box, (WIDTH, HEIGHT, WIDTH, HEIGHT))],
                                          pitch, "ok" if calibrated else "no-calibration",
                                          person.team, None if person.team is None else 1.0)
            if pitch is not None:
                if track in last_point:
                    distances[track] = distances.get(track, 0.0) + math.dist(last_point[track], pitch)
                last_point[track] = pitch
                record["distanceM"] = round(distances.get(track, 0.0), 3)
            record["_person"] = index
            objects.append(record)
        ball = balls[step]
        u, v, depth = camera.project(ball[0], ball[1], 0.11)
        radius = max(1.5, camera.focal * 0.11 / max(depth, 1e-6))
        ball_box = [u - radius, v - radius, u + radius, v + radius]
        covered = any(box[0] <= u <= box[2] and box[1] <= v <= box[3] and person_depth < depth
                      for person_depth, _, box in boxes)
        ball_record = None
        if 0 <= u < WIDTH and 0 <= v < HEIGHT and not covered:
            ball_record = contract.make_ball(float(rng.uniform(0.55, 0.9)), ball_box,
                                             (float(ball[0]), float(ball[1])) if calibrated else None,
                                             "ok" if calibrated else "no-calibration")
        frames.append(contract.make_frame(step, time, shot, shot > 0 and time == SHOTS[shot][0], calibration, objects, ball_record))
    contact = {"start": min(contact_frames), "end": max(contact_frames), "people": list(crossing)} if contact_frames else None
    for frame in frames:
        for record in frame["objects"]:
            index = record.pop("_person")
            if contact and contact["start"] <= frame["time"] <= contact["end"] and index in contact["people"]:
                record.update(identity="uncertain", team=None, teamConfidence=None)
                contact.setdefault("tracks", set()).add(record["id"])
    if contact:
        contact["tracks"] = sorted(contact.get("tracks", set()))
        del contact["people"]
    return frames, contact


def _iou(a: list[float], b: list[float]) -> float:
    """Recouvrement de deux boîtes (intersection sur union).

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — annotations
    """
    width = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    height = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = width * height
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def track_summaries(frames: list[dict]) -> list[dict]:
    """Résumés des trajectoires, comme ceux de l'analyse : rôle, plan, intervalle, équipe, distance.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — annotations
    """
    tracks: dict[int, dict] = {}
    for frame in frames:
        for record in frame["objects"]:
            track = tracks.setdefault(record["id"], {"id": record["id"], "role": record["role"], "shot": frame["shot"],
                                                     "firstTime": frame["time"], "observations": 0, "team": None,
                                                     "teamConfidence": None, "teamVotes": 0, "distanceM": 0.0})
            track["lastTime"] = frame["time"]
            track["observations"] += 1
            if record.get("team") is not None:
                track.update(team=record["team"], teamConfidence=1.0, teamVotes=track["teamVotes"] + 1)
            if "distanceM" in record:
                track["distanceM"] = record["distanceM"]
    return [tracks[key] for key in sorted(tracks)]


def write_store(database: Path, frames: list[dict], contact: dict | None) -> None:
    """Écrit la démonstration dans une base par segments, comme une analyse terminée.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — stockage
    """
    for suffix in ("", "-wal", "-shm"):
        Path(str(database) + suffix).unlink(missing_ok=True)
    header = {"format": contract.FORMAT, "version": contract.VERSION,
              "source": {"kind": "file", "name": "match-synthetique.mp4", "width": WIDTH, "height": HEIGHT, "fps": FPS,
                         "frameCount": int(DURATION * FPS), "duration": DURATION, "constantFrameRate": True,
                         "timestamps": "nominal"},
              "analysis": {"createdAt": GENERATED_AT, "stride": STRIDE, "fps": FPS / STRIDE, "chunkSeconds": CHUNK_SECONDS,
                           "analysedSeconds": DURATION, "synthetic": True,
                           "models": {"note": "aucun modèle : vidéo et annotations générées ensemble"}},
              "pitch": dict(contract.PITCH)}
    chunks: list[list[dict]] = []
    for frame in frames:
        seq = int(frame["time"] // CHUNK_SECONDS)
        while len(chunks) <= seq:
            chunks.append([])
        chunks[seq].append(frame)
    with ChunkStore(database, header, {"synthetic": True, "generator": GENERATOR_VERSION, "seed": SEED}) as store:
        for seq, chunk in enumerate(chunks):
            store.commit_raw(seq, chunk, None, {"synthetic": True, "seq": seq})
            store.publish(seq, chunk)
        metrics = quality_metrics_stream(store.iter_ready())
        metrics["identity"] = {"checked": False, "synthetic": True,
                               "scriptedContacts": [contact] if contact else []}
        metrics["processing"] = {"synthetic": True, "device": None}
        tracks = track_summaries(frames)
        teams = [{"id": team["id"], "color": "#%02x%02x%02x" % team["shirt"],
                  "tracks": sum(1 for track in tracks if track["team"] == team["id"])} for team in TEAMS]
        limitations = [
            "Démonstration synthétique : la vidéo et les annotations sont générées ensemble par "
            "football_analysis.demo_match ; elles montrent l'interface et le format des données, pas la précision de l'analyse IA.",
            "Aucun modèle n'a tourné : ni détection, ni suivi, ni classement des équipes, ni calibration estimée. "
            "Positions, équipes et calibration sont exactes par construction ; les confiances affichées sont fictives.",
            "Comme avec ByteTrack, un identifiant change après chaque coupure de plan et après 2,4 s sans détection ; "
            "un joueur caché derrière un autre n'est pas détecté.",
            "Plan rapproché de 24 à 28 s : calibration déclarée impossible, donc aucune position sur le terrain 3D.",
        ]
        if contact:
            interval = [f"{contact[key]:.1f}".replace(".", ",") for key in ("start", "end")]
            limitations.append(f"Le contact masqué de {interval[0]} à {interval[1]} s est scénarisé : "
                               "l'identité y est déclarée incertaine, sans vitesse ni équipe, comme après une correction réelle.")
        store.finish(header, {"teams": teams, "metrics": metrics, "limitations": limitations, "tracks": tracks})


def build_demo(output: Path, work: Path) -> dict:
    """Génère la vidéo et la base, exporte la démonstration et met à jour le catalogue.

    Args:
        output: dossier public de la démonstration (catalogue index.json et sous-dossier matches/).
        work: dossier de travail local (base SQLite), hors du dépôt publié.

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — construction
    """
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg est requis pour encoder la vidéo de démonstration.")
    output, work = Path(output), Path(work)
    work.mkdir(parents=True, exist_ok=True)
    people, balls, crossing = simulate()
    holders = [min((p.positions[step] for p in people if p.role != "referee"), key=lambda point: np.linalg.norm(point - ball))
               for step, ball in enumerate(balls)]
    views = cameras(balls, holders)
    frames, contact = annotate(people, balls, views, crossing)
    database = work / "match-synthetique.sqlite"
    write_store(database, frames, contact)
    with tempfile.TemporaryDirectory(dir=work) as directory:
        video = Path(directory) / "match-synthetique.mp4"
        render_video(video, people, balls, views)
        capture = cv2.VideoCapture(str(video))
        capture.set(cv2.CAP_PROP_POS_FRAMES, 5 * FPS)
        ok, poster = capture.read()
        capture.release()
        if not ok:
            raise RuntimeError("Vidéo de démonstration illisible après encodage.")
        poster_path = Path(directory) / "poster.jpg"
        cv2.imwrite(str(poster_path), poster, [cv2.IMWRITE_JPEG_QUALITY, 80])
        # Vignette légère de la galerie du visualiseur (480 × 270), tirée de l'affiche.
        thumbnail_path = Path(directory) / "thumbnail.jpg"
        cv2.imwrite(str(thumbnail_path), cv2.resize(poster, (480, 270), interpolation=cv2.INTER_AREA),
                    [cv2.IMWRITE_JPEG_QUALITY, 74])
        bundle = output / "matches" / DEMO_ID
        manifest = export_analysis(
            database, bundle, video=video, analysis_id=DEMO_ID, title=DEMO_TITLE, overwrite=True,
            provenance={"kind": "synthetic", "exportedAt": GENERATED_AT,
                        "generator": {"name": "football_analysis.demo_match", "version": GENERATOR_VERSION, "seed": SEED},
                        "license": "Vidéo et données générées pour ce dépôt : aucune image réelle, aucun poids de modèle.",
                        "notes": ["Annotations exactes par construction : aucune mesure de précision de l'analyse IA."]},
            extra_files={"poster.jpg": poster_path, "thumbnail.jpg": thumbnail_path})
    update_catalog(output / "index.json", bundle, manifest,
                   "Vidéo de diffusion simulée (36 s) et annotations au format de l'analyse : équipes, coupure, "
                   "plan non calibré et contact masqué d'identité incertaine.",
                   gallery={"order": 3, "category": "Synthétique", "credit": "Généré pour ce dépôt · aucune image réelle",
                            "calibrationCheck": {"verdict": "exact",
                                                 "note": "Vidéo générée avec ses annotations : calibration exacte par construction."}})
    return manifest


def describe(manifest: dict) -> str:
    """Résumé lisible d'un export de démonstration (console).

    @responsable Bilel Khlif
    @date 2026-11-24
    @role Démonstration synthétique — construction
    """
    storage = manifest["storage"]
    return json.dumps({"id": manifest["id"], "frames": storage["frameCount"], "chunks": len(storage["chunks"]),
                       "tracks": storage["tracks"]["count"], "videoBytes": manifest["video"]["bytes"]}, ensure_ascii=False)
