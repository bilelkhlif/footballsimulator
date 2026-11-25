"""Poids des modèles : emplacement, téléchargement et empreinte.

Les trois poids viennent de Roboflow Sports (examples/soccer/setup.sh) : liens Google Drive
publics, téléchargés avec gdown comme dans ce script. Ils sont sous AGPL-3.0 (entraînés avec
Ultralytics YOLOv8) et ne sont pas versionnés dans le dépôt : chaque installation les télécharge.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from importlib.metadata import version
from pathlib import Path

# Avant le premier import d'Ultralytics. Aucun repli vers le chargeur pickle non restreint.
os.environ["ULTRALYTICS_SAFE_LOAD"] = "true"
os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"] = "1"

#: Dossier des données locales : poids, analyses (non versionné).
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

#: Dossier des poids par défaut.
MODELS_DIR = DATA_DIR / "models"

#: Nom de fichier et identifiant Google Drive de chaque poids, repris de setup.sh de Roboflow Sports.
MODEL_LOCK = json.loads((Path(__file__).resolve().parent.parent / "models.lock.json").read_text(encoding="utf-8"))
MODEL_FILES = {name: (entry["file"], entry["driveId"]) for name, entry in MODEL_LOCK["yolo"].items()}


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
    for name in MODEL_FILES:
        target = model_path(name, models_dir)
        if target.exists():
            verify_file(target, MODEL_LOCK["yolo"][name])
            continue
        # Le fichier n'est promu à son nom définitif qu'après vérification, sans écraser l'existant.
        with tempfile.TemporaryDirectory(prefix="verification-", dir=models_dir) as temporary:
            candidate = Path(temporary) / target.name
            result = gdown.download(id=MODEL_FILES[name][1], output=str(candidate), quiet=False)
            if not result:
                raise ValueError(f"Téléchargement absent : {name}")
            verify_file(candidate, MODEL_LOCK["yolo"][name])
            candidate.rename(target)
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


def verify_file(path: Path, expected: dict) -> str:
    """Vérifie les octets avant toute désérialisation, avec une empreinte approuvée et versionnée.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — intégrité des modèles
    """
    if path.is_symlink() or not path.is_file() or path.stat().st_size != expected["bytes"]:
        raise ValueError(f"Poids absent, lié ou de taille inattendue : {path.name}")
    digest = sha256(path)
    if digest != expected["sha256"]:
        raise ValueError(f"Empreinte SHA-256 refusée : {path.name}. Aucun modèle n'a été chargé.")
    return digest


def verified_models(models_dir: Path, names: tuple[str, ...]) -> dict:
    """Décrit uniquement les poids locaux vérifiés, avant leur passage à YOLO.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — frontière de confiance des checkpoints
    """
    root = Path(models_dir).resolve()
    result = {}
    for name in names:
        path = model_path(name, models_dir)
        if path.resolve().parent != root:
            raise ValueError(f"Poids hors du dossier : {name}")
        result[name] = {"file": path.name, "sha256": verify_file(path, MODEL_LOCK["yolo"][name])}
    return result


#: Plus ancienne version de PyTorch acceptée : avis d'exécution de code au chargement corrigés.
#: GHSA-53q9-r3pm-6pq6 (≤ 2.5.1, corrigé en 2.6.0) et GHSA-63cw-57p8-fm3p (weights_only=True, ≤ 2.9.1,
#: corrigé en 2.10.0). GHSA-v32g-mr63-3j83 (lecture de fichiers, ≥ 2.14.0, corrigé en 2.15.0) touche la
#: recette 2.14.1 : 2.15.0 n'existe qu'en CUDA 13, que le pilote de l'essai ne prend pas en charge. Il
#: n'est atteignable que par un checkpoint malveillant ; ici, seuls les octets épinglés de
#: models.lock.json sont désérialisés, et ils ne référencent pas la classe exploitée.
MINIMUM_TORCH = (2, 10, 0)


def require_secure_torch() -> str:
    """Refuse les versions de PyTorch touchées par une exécution de code au chargement d'un modèle.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — version du chargeur de modèles
    """
    installed = version("torch")
    parts = re.match(r"^(\d+)\.(\d+)\.(\d+)(?:\+[^ ]+)?$", installed)
    if not parts or tuple(map(int, parts.groups())) < MINIMUM_TORCH:
        raise RuntimeError("PyTorch vulnérable ou non stable : installez la version de analysis/README.md.")
    return installed


def backbone_directory(name: str, download: bool = False) -> Path:
    """Snapshot immuable, safetensors seulement ; aucun téléchargement implicite pendant l'analyse.

    @responsable Bilel Khlif
    @date 2026-11-25
    @role Analyse vidéo — provenance des plongements
    """
    from huggingface_hub import snapshot_download

    expected = MODEL_LOCK["backbones"][name]
    try:
        directory = Path(snapshot_download(expected["repository"], revision=expected["revision"],
                                          allow_patterns=["config.json", "preprocessor_config.json", "model.safetensors"],
                                          local_files_only=not download))
    except Exception as error:
        raise RuntimeError("Plongements indisponibles : lancez « python -m football_analysis models --download ».") from error
    # Le cache HF emploie des liens internes : les octets cibles, pas le nom du lien, font autorité.
    verify_file((directory / expected["file"]).resolve(), expected)
    return directory
