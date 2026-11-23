"""Équipes persistantes : apprentissage borné, puis prédictions sans nouveau regroupement.

Les composants réutilisés sont ceux de teams.py pour les plongements, UMAP et KMeans, puis
KNeighborsClassifier de scikit-learn pour appliquer les groupes figés aux nouvelles images.
Le modèle profond n'est pas enregistré : seuls les petits tableaux du repère appris le sont.
Les votes des trajectoires actives ont une fenêtre et un effectif maximaux explicites.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import hashlib
import io
import json
import math
import zipfile
from collections import Counter, deque
from importlib.metadata import version
from itertools import islice
from typing import Any, Callable

import numpy as np

from .teams import (BACKBONES, MIN_CROPS_TO_FIT, MIN_VOTE_SHARE, TeamAssignment,
                    build_classifier, extract_team_features, team_colour, vote)

#: Bornes du format de reprise ; elles s'appliquent avant la décompression des tableaux.
MAX_SAVED_CROPS = 4096
MAX_FEATURE_DIMENSION = 4096
MAX_ARCHIVE_BYTES = 80 * 1024 * 1024
FORMAT_VERSION = 1


class InsufficientTeamEvidence(ValueError):
    """L'échantillon ne permet pas de distinguer deux groupes de maillots.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse par segments — abstention du repère d'équipe
    """


def _copy_assignment(assignment: TeamAssignment) -> TeamAssignment:
    """Copie un résultat pour que les appelants ne modifient pas le repère partagé.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse par segments — copie des résultats d'équipe
    """
    return TeamAssignment(assignment.team, assignment.confidence, assignment.votes)


def _versions() -> dict[str, str]:
    """Relève les versions nécessaires pour reproduire le regroupement à la reprise.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse par segments — compatibilité du repère d'équipe
    """
    return {name: version(name) for name in ("numpy", "scikit-learn", "umap-learn")}


def _track_id(value: Any) -> int:
    """Valide un identifiant de trajectoire sans convertir silencieusement un texte.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse par segments — validation des trajectoires
    """
    if isinstance(value, bool) or not isinstance(value, (int, np.integer)) or value < 0:
        raise ValueError("identifiant de trajectoire invalide")
    return int(value)


class FrozenTeamModel:
    """Conserve les deux identités apprises une seule fois sur un échantillon borné.

    Le voisinage prédit les étiquettes du regroupement, pas une vérité terrain. Sa part de voix
    sert à refuser les cas partagés ; elle n'est pas une probabilité de bonne reconnaissance.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse par segments — repère persistant des équipes
    """

    def __init__(self, backbone: str, device: str, seed: int = 0, max_fit_crops: int = 512,
                 classifier_factory: Callable = build_classifier):
        """Configure les bornes sans charger de poids avant d'avoir assez d'images.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — configuration des équipes
        """
        if backbone not in BACKBONES:
            raise ValueError("modèle de plongements inconnu")
        if isinstance(max_fit_crops, bool) or not isinstance(max_fit_crops, int) or not MIN_CROPS_TO_FIT <= max_fit_crops <= MAX_SAVED_CROPS:
            raise ValueError("borne d'images d'apprentissage invalide")
        if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**32:
            raise ValueError("graine invalide")
        self.backbone, self.device, self.seed = backbone, device, seed
        self.max_fit_crops = max_fit_crops
        self._factory = classifier_factory
        self._classifier = None
        self._neighbors = None
        self._features = np.empty((0, 0), dtype=np.float32)
        self._owners = np.empty(0, dtype=np.int64)
        self._labels = np.empty(0, dtype=np.int64)
        self._centers = np.empty((0, 0), dtype=np.float64)
        self._assignments: dict[int, TeamAssignment] = {}
        self._teams = [{"id": team, "color": None, "tracks": 0} for team in (0, 1)]

    @property
    def ready(self) -> bool:
        """Indique si le repère est appris ; il ne sera plus réajusté ensuite.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — état du repère d'équipe
        """
        return self._neighbors is not None

    @property
    def assignments(self) -> dict[int, TeamAssignment]:
        """Renvoie les votes initiaux, calculés comme dans l'analyse sans segments.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — équipes initiales
        """
        return {track: _copy_assignment(value) for track, value in self._assignments.items()}

    @property
    def initial_votes(self) -> dict[int, list[int]]:
        """Renvoie les votes du regroupement pour amorcer les trajectoires encore actives.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — amorçage des votes
        """
        return {int(track): self._labels[self._owners == track].tolist() for track in dict.fromkeys(self._owners)}

    @property
    def fingerprint(self) -> str | None:
        """Identifie le repère pour refuser des votes provenant d'une autre analyse.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — identité du repère appris
        """
        if not self.ready:
            return None
        digest = hashlib.sha256(json.dumps([self.backbone, self.seed, self._teams], sort_keys=True).encode())
        for values in (self._features, self._owners, self._labels, self._centers):
            digest.update(str(values.shape).encode())
            digest.update(values.tobytes())
        return digest.hexdigest()

    def teams(self) -> list[dict[str, Any]]:
        """Copie les identités et couleurs fixées par l'échantillon initial.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — résumé des équipes
        """
        return [dict(team) for team in self._teams]

    def _fit_features(self, features: np.ndarray, owners: np.ndarray) -> None:
        """Apprend les groupes puis un voisinage figé, sans modifier les plongements.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — regroupement initial réutilisé
        """
        from sklearn.neighbors import KNeighborsClassifier

        if features.ndim != 2 or not MIN_CROPS_TO_FIT <= len(features) <= self.max_fit_crops:
            raise ValueError("taille des plongements d'apprentissage invalide")
        if not 0 < features.shape[1] <= MAX_FEATURE_DIMENSION or not np.isfinite(features).all():
            raise ValueError("plongements d'apprentissage invalides")
        self._features = np.ascontiguousarray(features, dtype=np.float32)
        self._owners = np.asarray(owners, dtype=np.int64)
        projections = self._classifier.reducer.fit_transform(self._features)
        labels = np.asarray(self._classifier.cluster_model.fit_predict(projections), dtype=np.int64)
        centers = np.asarray(self._classifier.cluster_model.cluster_centers_, dtype=np.float64)
        if labels.shape != (len(features),) or set(labels.tolist()) != {0, 1}:
            raise InsufficientTeamEvidence("le regroupement ne fournit pas deux équipes")
        if centers.ndim != 2 or centers.shape[0] != 2 or not np.isfinite(centers).all():
            raise ValueError("centres des équipes invalides")
        self._labels, self._centers = labels, centers
        self._assignments = {int(track): vote(labels[self._owners == track]) for track in dict.fromkeys(owners)}
        self._neighbors = KNeighborsClassifier(n_neighbors=min(5, len(features)), weights="distance")
        self._neighbors.fit(self._features, labels)

    def fit(self, crops_by_track: dict[int, list[np.ndarray]]) -> dict[int, TeamAssignment]:
        """Apprend une seule fois, sur au plus max_fit_crops images, et garde le vote initial.

        Un échantillon trop petit laisse le repère inconnu et peut être complété pendant
        l'amorçage. Après apprentissage, un nouvel appel est refusé pour conserver les identités.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — apprentissage borné des équipes
        """
        if self.ready:
            raise RuntimeError("le repère des équipes est déjà figé")
        if len(crops_by_track) > self.max_fit_crops:
            raise ValueError("trop de trajectoires dans l'échantillon initial")
        owners, images = [], []
        for raw_track, crops in crops_by_track.items():
            track = _track_id(raw_track)
            for image in crops:
                if len(images) >= self.max_fit_crops:
                    break
                owners.append(track)
                images.append(image)
        self._assignments = {_track_id(track): TeamAssignment(None, None, 0) for track in crops_by_track}
        if len(images) < MIN_CROPS_TO_FIT:
            return self.assignments
        self._classifier = self._factory(self.backbone, self.device, self.seed)
        features = extract_team_features(self._classifier, images)
        try:
            if len(np.unique(features, axis=0)) < 2:
                raise InsufficientTeamEvidence("maillots indiscernables")
            self._fit_features(features, np.asarray(owners, dtype=np.int64))
        except InsufficientTeamEvidence:
            self._features = np.empty((0, 0), dtype=np.float32)
            self._owners = np.empty(0, dtype=np.int64)
            self._classifier = None
            return self.assignments
        for track in crops_by_track:
            self._assignments.setdefault(int(track), TeamAssignment(None, None, 0))
        self._teams = [{"id": team, "color": team_colour([image for image, label in zip(images, self._labels) if label == team]),
                        "tracks": sum(value.team == team for value in self._assignments.values())} for team in (0, 1)]
        return self.assignments

    def predict(self, crops_by_track: dict[int, list[np.ndarray]]) -> dict[int, list[int | None]]:
        """Prédit les nouveaux maillots par voisins, avec refus des voix partagées ou non finies.

        Chaque requête utilise le même échantillon figé ; le découpage en segments ne change
        ni les groupes ni les références. L'extraction ne conserve qu'un lot de plongements.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — prédiction inductive des équipes
        """
        result = {_track_id(track): [None] * len(crops) for track, crops in crops_by_track.items()}
        if not self.ready:
            return result
        samples = ((int(track), index, image) for track, crops in crops_by_track.items() for index, image in enumerate(crops))
        while batch := list(islice(samples, 32)):
            features = extract_team_features(self._classifier, [sample[2] for sample in batch])
            if features.shape != (len(batch), self._features.shape[1]):
                raise ValueError("dimension des nouveaux plongements incompatible")
            finite = np.isfinite(features).all(axis=1)
            indices = np.flatnonzero(finite)
            if not len(indices):
                continue
            probabilities = self._neighbors.predict_proba(features[finite])
            for index, shares in zip(indices, probabilities):
                best = int(np.argmax(shares))
                if float(shares[best]) >= MIN_VOTE_SHARE:
                    track, crop_index, _ = batch[int(index)]
                    result[track][crop_index] = int(self._neighbors.classes_[best])
        return result

    def dump(self) -> bytes:
        """Encode un petit NPZ de tableaux et de JSON, sans objet Python ni poids profonds.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — enregistrement sûr du repère d'équipe
        """
        metadata = {"schema": FORMAT_VERSION, "backbone": self.backbone, "device": self.device,
                    "seed": self.seed, "max_fit_crops": self.max_fit_crops, "ready": self.ready,
                    "versions": _versions(), "teams": self.teams(),
                    "initial_tracks": list(self._assignments), "fingerprint": self.fingerprint}
        payload = io.BytesIO()
        np.savez_compressed(payload, features=self._features, owners=self._owners, labels=self._labels,
                            centers=self._centers, metadata=np.frombuffer(json.dumps(metadata, sort_keys=True).encode(), dtype=np.uint8))
        return payload.getvalue()

    @classmethod
    def load(cls, data: bytes, classifier_factory: Callable = build_classifier,
             device: str | None = None) -> FrozenTeamModel:
        """Recharge les tableaux appris et vérifie leur empreinte, sans réapprendre UMAP.

        Une version incompatible impose de reprendre l'analyse ; aucun modèle arbitraire
        n'est désérialisé par pickle ou joblib. Le voisinage emploie directement les étiquettes
        conservées : aucune permutation des groupes n'est possible à la reprise.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — reprise vérifiée des équipes
        """
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                entries = archive.infolist()
                expected = {name + ".npy" for name in ("features", "owners", "labels", "centers", "metadata")}
                if len(entries) != 5 or {item.filename for item in entries} != expected:
                    raise ValueError("contenu du repère d'équipe invalide")
                if sum(item.file_size for item in entries) > MAX_ARCHIVE_BYTES:
                    raise ValueError("repère d'équipe trop volumineux")
            with np.load(io.BytesIO(data), allow_pickle=False) as stored:
                metadata_bytes = stored["metadata"]
                if metadata_bytes.dtype != np.uint8 or metadata_bytes.ndim != 1 or metadata_bytes.size > 65536:
                    raise ValueError("métadonnées du repère invalides")
                metadata = json.loads(metadata_bytes.tobytes())
                features, owners = stored["features"], stored["owners"]
                labels, centers = stored["labels"], stored["centers"]
            if metadata["schema"] != FORMAT_VERSION or metadata["versions"] != _versions():
                raise ValueError("version du repère d'équipe incompatible")
            model = cls(metadata["backbone"], device or metadata["device"], metadata["seed"],
                        metadata["max_fit_crops"], classifier_factory)
            if features.dtype != np.float32 or owners.dtype != np.int64 or labels.dtype != np.int64 or centers.dtype != np.float64:
                raise ValueError("types des tableaux d'équipe invalides")
            if owners.ndim != 1 or labels.shape != owners.shape or np.any(owners < 0):
                raise ValueError("trajectoires enregistrées invalides")
            teams = metadata["teams"]
            if not isinstance(teams, list) or len(teams) != 2 or [team["id"] for team in teams] != [0, 1]:
                raise ValueError("identités d'équipe enregistrées invalides")
            for team in teams:
                color = team["color"]
                if color is not None and (not isinstance(color, str) or len(color) != 7 or color[0] != "#" or any(c not in "0123456789abcdefABCDEF" for c in color[1:])):
                    raise ValueError("couleur d'équipe invalide")
                if type(team["tracks"]) is not int or not 0 <= team["tracks"] <= model.max_fit_crops:
                    raise ValueError("effectif d'équipe invalide")
            initial_tracks = metadata["initial_tracks"]
            if not isinstance(initial_tracks, list) or len(initial_tracks) > model.max_fit_crops:
                raise ValueError("trajectoires initiales invalides")
            initial_tracks = [_track_id(track) for track in initial_tracks]
            if len(set(initial_tracks)) != len(initial_tracks):
                raise ValueError("trajectoires initiales répétées")
            if metadata["ready"] is True:
                if len(owners) != len(features) or set(owners.tolist()) - set(initial_tracks):
                    raise ValueError("correspondance des images initiales invalide")
                if (features.ndim != 2 or not MIN_CROPS_TO_FIT <= len(features) <= model.max_fit_crops
                        or not 0 < features.shape[1] <= MAX_FEATURE_DIMENSION or not np.isfinite(features).all()
                        or set(labels.tolist()) != {0, 1} or centers.ndim != 2 or centers.shape[0] != 2
                        or not 0 < centers.shape[1] <= MAX_FEATURE_DIMENSION or not np.isfinite(centers).all()):
                    raise ValueError("tableaux du repère d'équipe invalides")
                from sklearn.neighbors import KNeighborsClassifier

                model._classifier = model._factory(model.backbone, model.device, model.seed)
                model._features, model._owners = features, owners
                model._labels, model._centers = labels, centers
                model._assignments = {int(track): vote(labels[owners == track]) for track in dict.fromkeys(owners)}
                model._neighbors = KNeighborsClassifier(n_neighbors=min(5, len(features)), weights="distance")
                model._neighbors.fit(features, labels)
            elif metadata["ready"] is not False or features.shape != (0, 0) or owners.size or labels.size or centers.shape != (0, 0):
                raise ValueError("repère non appris incohérent")
            for track in initial_tracks:
                model._assignments.setdefault(track, TeamAssignment(None, None, 0))
            model._teams = [{key: team[key] for key in ("id", "color", "tracks")} for team in teams]
            if model.fingerprint != metadata["fingerprint"]:
                raise ValueError("empreinte du repère d'équipe incorrecte")
            return model
        except (KeyError, TypeError, AttributeError, UnicodeError, json.JSONDecodeError, zipfile.BadZipFile, EOFError) as error:
            raise ValueError("repère d'équipe illisible ou incomplet") from error


class TeamState:
    """Conserve des votes récents pour un nombre borné de trajectoires actives.

    Les trajectoires expirent ou changent à une coupure ; les deux équipes du modèle persistent.
    Les abstentions occupent une place dans la fenêtre et ne deviennent pas des voix certaines.

    @responsable Bilel Khlif
    @date 2026-11-23
    @role Analyse par segments — votes des trajectoires actives
    """

    def __init__(self, model: FrozenTeamModel, max_active_tracks: int = 128, vote_window: int = 32):
        """Fixe les bornes des trajectoires et de leurs votes.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — configuration des votes
        """
        if type(max_active_tracks) is not int or not 1 <= max_active_tracks <= MAX_SAVED_CROPS:
            raise ValueError("borne de trajectoires actives invalide")
        if type(vote_window) is not int or not 1 <= vote_window <= MAX_SAVED_CROPS:
            raise ValueError("fenêtre de votes invalide")
        self.model = model
        self.max_active_tracks, self.vote_window = max_active_tracks, vote_window
        self._tracks: dict[int, dict[str, Any]] = {}

    def _touch(self, track: int, time: float) -> dict[str, Any]:
        """Actualise une trajectoire, en évacuant la plus ancienne à la borne d'effectif.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — bornage des trajectoires actives
        """
        if track not in self._tracks:
            if len(self._tracks) >= self.max_active_tracks:
                oldest = min(self._tracks, key=lambda key: self._tracks[key]["time"])
                del self._tracks[oldest]
            self._tracks[track] = {"votes": deque(maxlen=self.vote_window), "initial": None, "time": time}
        self._tracks[track]["time"] = time
        return self._tracks[track]

    def set_initial(self, assignments: dict[int, TeamAssignment] | None = None, time: float = 0.0) -> None:
        """Amorce les votes des trajectoires chaudes avec les résultats exacts du regroupement.

        Les votes détaillés disponibles dans le modèle servent aux observations suivantes ;
        le résultat initial complet reste conservé jusqu'à une nouvelle observation.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — amorçage des trajectoires actives
        """
        if not math.isfinite(time) or time < 0:
            raise ValueError("instant des votes invalide")
        initial = self.model.assignments if assignments is None else assignments
        detailed = self.model.initial_votes
        for raw_track, assignment in initial.items():
            track = _track_id(raw_track)
            state = self._touch(track, time)
            state["votes"] = deque(detailed.get(track, [])[-self.vote_window:], maxlen=self.vote_window)
            state["initial"] = _copy_assignment(assignment)

    def assignment(self, track: int) -> TeamAssignment:
        """Résume les votes, en comptant les abstentions dans leur dénominateur.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — équipe d'une trajectoire active
        """
        state = self._tracks.get(_track_id(track))
        if state is None:
            return TeamAssignment(None, None, 0)
        if state["initial"] is not None:
            return _copy_assignment(state["initial"])
        values = list(state["votes"])
        counts = Counter(value for value in values if value is not None)
        if not counts:
            return TeamAssignment(None, None, len(values))
        team, count = counts.most_common(1)[0]
        share = count / len(values)
        return TeamAssignment(team if share >= MIN_VOTE_SHARE else None, share, len(values))

    def update(self, crops_by_track: dict[int, list[np.ndarray]], time: float) -> dict[int, TeamAssignment]:
        """Ajoute seulement les nouveaux votes ; les segments ne réinitialisent pas les équipes.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — mise à jour des votes récents
        """
        if not math.isfinite(time) or time < 0:
            raise ValueError("instant des votes invalide")
        result = {}
        for track, predictions in self.model.predict(crops_by_track).items():
            state = self._touch(track, time)
            if predictions:
                state["initial"] = None
                state["votes"].extend(predictions)
            result[track] = self.assignment(track)
        return result

    def expire(self, active_ids: set[int]) -> None:
        """Libère toutes les trajectoires qui ont dépassé le délai de suivi du demandeur.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — expiration des trajectoires
        """
        active = {_track_id(track) for track in active_ids}
        self._tracks = {track: state for track, state in self._tracks.items() if track in active}

    def new_shot(self) -> None:
        """Termine les trajectoires du plan sans toucher au repère des deux équipes.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — coupure de plan
        """
        self._tracks.clear()

    def snapshot(self) -> dict[str, Any]:
        """Copie un état JSON borné, sans image ni objet de bibliothèque d'apprentissage.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — enregistrement des votes actifs
        """
        return {"schema": FORMAT_VERSION, "model": self.model.fingerprint,
                "max_active_tracks": self.max_active_tracks, "vote_window": self.vote_window,
                "tracks": [{"id": track, "time": state["time"], "votes": list(state["votes"]),
                            "initial": None if state["initial"] is None else dict(vars(state["initial"]))}
                           for track, state in self._tracks.items()]}

    def restore(self, snapshot: dict[str, Any]) -> None:
        """Vérifie les bornes et le repère avant de restaurer tous les votes d'un bloc.

        @responsable Bilel Khlif
        @date 2026-11-23
        @role Analyse par segments — reprise vérifiée des votes actifs
        """
        try:
            if snapshot["schema"] != FORMAT_VERSION or snapshot["model"] != self.model.fingerprint:
                raise ValueError("repère des votes incompatible")
            if snapshot["max_active_tracks"] != self.max_active_tracks or snapshot["vote_window"] != self.vote_window:
                raise ValueError("bornes des votes incompatibles")
            rows = snapshot["tracks"]
            if not isinstance(rows, list) or len(rows) > self.max_active_tracks:
                raise ValueError("trop de trajectoires enregistrées")
            restored = {}
            for row in rows:
                track, time, values = _track_id(row["id"]), row["time"], row["votes"]
                if track in restored or not isinstance(time, (int, float)) or not math.isfinite(time) or time < 0:
                    raise ValueError("trajectoire enregistrée invalide")
                if not isinstance(values, list) or len(values) > self.vote_window or any(value is not None and (type(value) is not int or value not in (0, 1)) for value in values):
                    raise ValueError("votes enregistrés invalides")
                initial = row["initial"]
                if initial is not None:
                    team, confidence, count = initial["team"], initial["confidence"], initial["votes"]
                    if team is not None and (type(team) is not int or team not in (0, 1)):
                        raise ValueError("équipe initiale invalide")
                    if confidence is not None and (isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not math.isfinite(confidence) or not 0 <= confidence <= 1):
                        raise ValueError("part des voix invalide")
                    if type(count) is not int or not 0 <= count <= self.model.max_fit_crops:
                        raise ValueError("nombre de voix invalide")
                    initial = TeamAssignment(team, confidence, count)
                restored[track] = {"votes": deque(values, maxlen=self.vote_window), "initial": initial, "time": time}
            self._tracks = restored
        except (KeyError, TypeError, AttributeError) as error:
            raise ValueError("état des votes illisible ou incomplet") from error
