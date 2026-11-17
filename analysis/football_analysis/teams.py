"""Équipes : une équipe par trajectoire, votée sur plusieurs images du joueur.

Composant réutilisé : sports.common.team.TeamClassifier de Roboflow Sports (MIT), qui extrait les
plongements d'un modèle de vision (SigLIP par défaut), les réduit avec UMAP et les regroupe en
deux équipes avec KMeans. Aucun entraînement : les groupes sont appris sur la vidéo elle-même.

Adaptations :

- l'exemple de Roboflow prédit l'équipe de chaque joueur à chaque image ; ici, chaque trajectoire
  vote sur quelques images bien séparées des autres joueurs, et reçoit l'équipe majoritaire avec
  sa part des votes. Un joueur ne change donc plus de couleur d'une image à l'autre ;
- les plongements sont calculés une seule fois pour l'apprentissage et les votes ;
- UMAP et KMeans reçoivent une graine : deux analyses de la même vidéo donnent les mêmes équipes ;
- CLIP ViT-L/14 peut remplacer SigLIP (option « clip ») ; sa fiche le réserve à la recherche ;
- les gardiens rejoignent l'équipe dont le centre est le plus proche, comme chez Roboflow, mais
  par un vote sur toutes les images de leur trajectoire.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any, Iterable

import numpy as np

#: Modèles de plongements proposés : identifiant Hugging Face de chacun.
BACKBONES = {
    "siglip": "google/siglip-base-patch16-224",
    "clip": "openai/clip-vit-large-patch14",
}

#: Part minimale des votes pour attribuer une équipe ; en dessous, l'équipe reste inconnue.
MIN_VOTE_SHARE = 2 / 3

#: Nombre minimal d'images de joueurs pour apprendre les deux groupes.
MIN_CROPS_TO_FIT = 20


@dataclass
class TeamAssignment:
    """Équipe d'une trajectoire : 0, 1 ou None, avec la part des votes et leur nombre.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — équipes (résultat)
    """

    team: int | None
    confidence: float | None
    votes: int


def overlap_share(box: np.ndarray, others: np.ndarray) -> float:
    """Plus grande part de la boîte couverte par une autre boîte.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — équipes (choix des images)
    """
    if len(others) == 0:
        return 0.0
    x1 = np.maximum(box[0], others[:, 0])
    y1 = np.maximum(box[1], others[:, 1])
    x2 = np.minimum(box[2], others[:, 2])
    y2 = np.minimum(box[3], others[:, 3])
    intersection = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
    area = max((box[2] - box[0]) * (box[3] - box[1]), 1e-6)
    return float(intersection.max() / area)


@dataclass
class CropCollector:
    """Garde quelques images de chaque joueur, prises à intervalles réguliers de sa trajectoire.

    Une image n'est gardée que si le joueur est assez grand et peu masqué par un autre : deux
    maillots mélangés fausseraient le vote.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — équipes (choix des images)
    """

    max_per_track: int = 6
    every: int = 4
    min_height: int = 24
    max_overlap: float = 0.3
    crops: dict[int, list[np.ndarray]] = field(default_factory=lambda: defaultdict(list))
    seen: Counter = field(default_factory=Counter)

    def offer(self, frame: np.ndarray, track_ids: Iterable[int], boxes: np.ndarray) -> None:
        """Propose les joueurs d'une image ; seuls certains sont gardés.

        @responsable Bilel Khlif
        @date 2026-11-17
        @role Analyse vidéo — équipes (choix des images)
        """
        height, width = frame.shape[:2]
        for index, track_id in enumerate(track_ids):
            observation = self.seen[track_id]
            self.seen[track_id] += 1
            if observation % self.every or len(self.crops.get(track_id, ())) >= self.max_per_track:
                continue
            box = boxes[index]
            if box[3] - box[1] < self.min_height:
                continue
            if overlap_share(box, np.delete(boxes, index, axis=0)) > self.max_overlap:
                continue
            x1, y1 = max(int(box[0]), 0), max(int(box[1]), 0)
            x2, y2 = min(int(box[2]), width), min(int(box[3]), height)
            if x2 > x1 and y2 > y1:
                self.crops[track_id].append(frame[y1:y2, x1:x2].copy())


def build_classifier(backbone: str, device: str, seed: int = 0) -> Any:
    """Construit le TeamClassifier de Roboflow Sports, avec le modèle de plongements choisi.

    Args:
        backbone: une clé de BACKBONES.
        device: « cuda » ou « cpu ».
        seed: graine d'UMAP et de KMeans.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — équipes (classifieur réutilisé)
    """
    import umap
    from sklearn.cluster import KMeans
    from sports.common.team import TeamClassifier

    if backbone == "siglip":
        classifier = TeamClassifier(device=device)
    elif backbone == "clip":
        from transformers import CLIPImageProcessor, CLIPVisionModel

        # Même interface que SigLIP (pixel_values, last_hidden_state) : extract_features de
        # TeamClassifier s'applique tel quel. __init__ est contourné pour ne pas charger SigLIP.
        classifier = TeamClassifier.__new__(TeamClassifier)
        classifier.device = device
        classifier.batch_size = 32
        classifier.features_model = CLIPVisionModel.from_pretrained(BACKBONES["clip"]).to(device)
        classifier.processor = CLIPImageProcessor.from_pretrained(BACKBONES["clip"])
    else:
        raise ValueError(f"modèle de plongements inconnu : {backbone}")
    classifier.reducer = umap.UMAP(n_components=3, random_state=seed)
    classifier.cluster_model = KMeans(n_clusters=2, n_init=10, random_state=seed)
    return classifier


def cluster_crops(classifier: Any, crops: list[np.ndarray]) -> np.ndarray:
    """Apprend les deux groupes sur les images et renvoie le groupe de chacune.

    Les plongements sont calculés une fois : apprentissage et votes portent sur les mêmes images.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — équipes (classifieur réutilisé)
    """
    features = classifier.extract_features(crops)
    projections = classifier.reducer.fit_transform(features)
    return classifier.cluster_model.fit_predict(projections)


def vote(labels: Iterable[int], min_share: float = MIN_VOTE_SHARE) -> TeamAssignment:
    """Attribue l'équipe majoritaire si elle réunit assez de votes.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — équipes (vote par trajectoire)
    """
    counts = Counter(int(label) for label in labels)
    total = sum(counts.values())
    if total == 0:
        return TeamAssignment(None, None, 0)
    team, best = counts.most_common(1)[0]
    share = best / total
    return TeamAssignment(team if share >= min_share else None, share, total)


def assign_player_teams(classifier: Any, crops: dict[int, list[np.ndarray]]) -> tuple[dict[int, TeamAssignment], dict[int, list[np.ndarray]]]:
    """Attribue une équipe à chaque trajectoire de joueur.

    Returns:
        les équipes par trajectoire, et les images de chaque équipe (pour leurs couleurs).

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — équipes (vote par trajectoire)
    """
    owners = [track for track, images in crops.items() for _ in images]
    images = [image for track_images in crops.values() for image in track_images]
    if len(images) < MIN_CROPS_TO_FIT:
        return {track: TeamAssignment(None, None, 0) for track in crops}, {}
    labels = cluster_crops(classifier, images)
    by_track: dict[int, list[int]] = defaultdict(list)
    by_team: dict[int, list[np.ndarray]] = defaultdict(list)
    for owner, label, image in zip(owners, labels, images):
        by_track[owner].append(int(label))
        by_team[int(label)].append(image)
    return {track: vote(by_track.get(track, [])) for track in crops}, by_team


def resolve_goalkeepers(frames: list[dict[str, Any]], goalkeepers: set[int], teams: dict[int, int | None]) -> dict[int, TeamAssignment]:
    """Attribue à chaque gardien l'équipe dont le centre est le plus proche, par vote sur ses images.

    Le centre d'une équipe est la moyenne des positions de ses joueurs dans l'image ; les positions
    sur le terrain sont prises quand tous les joueurs concernés en ont une, sinon les pieds dans
    l'image, comme chez Roboflow.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — équipes (gardiens)
    """
    votes: dict[int, list[int]] = defaultdict(list)
    for frame in frames:
        players = [obj for obj in frame["objects"] if obj["role"] == "player" and teams.get(obj["id"]) is not None]
        keepers = [obj for obj in frame["objects"] if obj["id"] in goalkeepers]
        if not keepers:
            continue
        use_pitch = all(obj["pitch"] is not None for obj in players + keepers)
        position = (lambda o: np.array(o["pitch"])) if use_pitch else (
            lambda o: np.array([(o["box"][0] + o["box"][2]) / 2, o["box"][3]]))
        centres = {}
        for team in (0, 1):
            members = [position(obj) for obj in players if teams[obj["id"]] == team]
            if len(members) >= 2:
                centres[team] = np.mean(members, axis=0)
        if len(centres) < 2:
            continue
        for keeper in keepers:
            distances = {team: np.linalg.norm(position(keeper) - centre) for team, centre in centres.items()}
            votes[keeper["id"]].append(min(distances, key=distances.get))
    return {keeper: vote(votes.get(keeper, []), min_share=0.6) for keeper in goalkeepers}


def team_colour(images: list[np.ndarray]) -> str | None:
    """Couleur dominante du maillot d'une équipe : médiane du haut du torse de ses joueurs.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — équipes (couleurs)
    """
    samples = []
    for image in images:
        height, width = image.shape[:2]
        torso = image[int(height * 0.15):int(height * 0.5), int(width * 0.25):int(width * 0.75)]
        if torso.size:
            samples.append(torso.reshape(-1, 3))
    if not samples:
        return None
    blue, green, red = np.median(np.concatenate(samples), axis=0).astype(int)
    return f"#{red:02x}{green:02x}{blue:02x}"
