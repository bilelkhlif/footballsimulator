# Serveur d'analyse du visualiseur de match

Ce dossier analyse une vidéo de match : il détecte et suit les joueurs, les classe en deux équipes, calibre la caméra, et place chaque joueur sur le terrain. Il produit un document de suivi horodaté, que le visualiseur ([visualizer.html](../visualizer.html)) affiche sur la vidéo, avec le terrain 3D de l'application.

- Composants réutilisés, licences et choix : [docs/opensource-research.md](../docs/opensource-research.md).
- Architecture, format des données et résultats mesurés : [docs/visualiseur-match.md](../docs/visualiseur-match.md).

L'application AR (index.html) n'en dépend pas : elle reste une PWA statique, publiée sur GitHub Pages. Le visualiseur, lui, a besoin de ce serveur, sur l'ordinateur qui fait l'analyse.

## Matériel

| Matériel | Effet |
| --- | --- |
| GPU NVIDIA avec CUDA, 4 Go de mémoire au moins | Mesuré sur une RTX 2050 (4 Go) : 1,8 image analysée par seconde, soit environ 10 fois la durée de la vidéo |
| Processeur seul | Fonctionne, beaucoup plus lentement (non mesuré) |
| Disque | 0,4 Go pour les poids ; 1,6 Go pour CLIP ou 0,8 Go pour SigLIP, au premier usage ; PyTorch à part |

## Installation

Depuis le dossier `analysis/`, dans PowerShell :

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu121
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m football_analysis models
```

Sans GPU NVIDIA, remplacez `cu121` par `cpu`. La dernière commande télécharge les trois poids de Roboflow Sports (environ 410 Mo) dans `data/models/`, depuis les liens publics de leur script `setup.sh`.

`data/` (poids, vidéos téléversées, analyses) n'est pas versionné.

## Utilisation

**Visualiseur.** Lancez le serveur, puis ouvrez l'adresse affichée :

```powershell
.venv\Scripts\python -m football_analysis serve
# Visualiseur de match : http://127.0.0.1:8765/visualizer.html (calcul : cuda:0)
```

Téléversez une vidéo (MP4, WebM, MOV, MKV…) : l'analyse se fait en arrière-plan, sa progression s'affiche, puis la vidéo s'ouvre avec ses annotations et le terrain 3D. Les analyses terminées restent dans la liste « Analyses précédentes ». Le navigateur doit pouvoir lire la vidéo : H.264 ou VP9 conviennent à Chrome et Edge.

**Ligne de commande.** La même analyse, sans interface :

```powershell
.venv\Scripts\python -m football_analysis analyse match.mp4 -o match.tracking.json
```

| Option | Effet |
| --- | --- |
| `--fps 12.5` | Cadence d'analyse ; la vidéo est échantillonnée à cette cadence, quelle que soit la sienne |
| `--teams siglip` ou `--teams clip` | Modèle de plongements des équipes : SigLIP (Apache-2.0, par défaut, comme Roboflow) ou CLIP ViT-L/14 (réservé à la recherche par sa fiche) |
| `--no-ball-model` | Sans le modèle dédié au ballon : plus rapide, ballon moins souvent trouvé |
| `--device cpu` | Force le processeur |
| `--max-seconds 20` | N'analyse que le début |

## Ce qui est mesuré, et ce qui ne l'est pas

Chaque analyse calcule des indicateurs de qualité sans vérité terrain, affichés par le visualiseur : part des images calibrées, erreur de reprojection, part des images avec ballon, indice de fragmentation des trajectoires, part des déplacements invraisemblables (plus de 12 m/s), part des joueurs dont l'équipe est connue, cadence et mémoire.

Quand la calibration échoue, aucune position n'est donnée sur le terrain pour l'image, et le visualiseur le dit. Les numéros de maillot ne sont pas lus. Le détail est dans [docs/visualiseur-match.md](../docs/visualiseur-match.md).

## Licences

- Le code de ce dossier charge Ultralytics et des poids sous **AGPL-3.0**. L'usage universitaire est permis. S'il est distribué, ou proposé comme service en ligne, tout son code source doit être publié sous AGPL-3.0. Le dépôt n'a pas encore de fichier LICENSE : c'est à l'équipe de choisir.
- Roboflow Sports (MIT), supervision (MIT), trackers (Apache-2.0), PySceneDetect (BSD-3-Clause), UMAP et scikit-learn (BSD-3-Clause), OpenCV (Apache-2.0), transformers (Apache-2.0) sont utilisés comme bibliothèques : aucun de leurs fichiers n'est copié dans le dépôt.
- Ultralytics envoie par défaut des statistiques d'usage. Le serveur les coupe avant de charger les modèles : réglage `sync` à `false` dans `%APPDATA%\Ultralytics\settings.json`.

## Tests

```powershell
.venv\Scripts\python -m unittest discover -s tests
```

Ils ne demandent ni GPU ni poids. Le contrat de données, la calibration (homographies synthétiques), les équipes, le suivi, les coupures de plan, les mesures, le serveur et la documentation du code sont testés. Les tests de l'interface sont dans `npm test` (tests/visualizer-tests.mjs et tests/unit/visualizer.test.mjs).
