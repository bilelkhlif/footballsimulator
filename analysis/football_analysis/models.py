"""Poids des modèles : emplacement, téléchargement et empreinte.

Les trois poids viennent de Roboflow Sports (examples/soccer/setup.sh) : liens Google Drive
publics, téléchargés avec gdown comme dans ce script. Ils sont sous AGPL-3.0 (entraînés avec
Ultralytics YOLOv8) et ne sont pas versionnés dans le dépôt : chaque installation les télécharge.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import hashlib
from pathlib import Path

#: Dossier des données locales : poids, analyses (non versionné).
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

#: Dossier des poids par défaut.
MODELS_DIR = DATA_DIR / "models"

#: Nom de fichier et identifiant Google Drive de chaque poids, repris de setup.sh de Roboflow Sports.
MODEL_FILES = {
    "players": ("football-player-detection.pt", "17PXFNlx-jI7VjVo_vQnB1sONjRyvoB-q"),
    "pitch": ("football-pitch-detection.pt", "1Ma5Kt86tgpdjCTKfum79YMgNnSjcoOyf"),
    "ball": ("football-ball-detection.pt", "1isw4wx-MK9h9LMr36VvIWlJD6ppUvw7V"),
}


def model_path(name: str, models_dir: Path = MODELS_DIR) -> Path:
    """Chemin du fichier de poids d'un modèle (« players », « pitch » ou « ball »).

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — poids des modèles
    """
    return Path(models_dir) / MODEL_FILES[name][0]


def missing_models(models_dir: Path = MODELS_DIR, names: tuple[str, ...] = tuple(MODEL_FILES)) -> list[str]:
    """Noms des modèles dont le fichier de poids manque.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — poids des modèles
    """
    return [name for name in names if not model_path(name, models_dir).is_file()]


def download_models(models_dir: Path = MODELS_DIR) -> list[Path]:
    """Télécharge les poids manquants depuis les liens publics de Roboflow Sports.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — poids des modèles
    """
    import gdown

    Path(models_dir).mkdir(parents=True, exist_ok=True)
    downloaded = []
    for name in missing_models(models_dir):
        target = model_path(name, models_dir)
        gdown.download(id=MODEL_FILES[name][1], output=str(target), quiet=False)
        downloaded.append(target)
    return downloaded


def sha256(path: Path) -> str:
    """Empreinte SHA-256 d'un fichier, pour savoir quels poids ont produit une analyse.

    @responsable Bilel Khlif
    @date 2026-11-17
    @role Analyse vidéo — poids des modèles
    """
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()
