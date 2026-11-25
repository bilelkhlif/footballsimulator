# Composants tiers de Football Simulator

Inventaire au 25 novembre 2026. Les licences propres au projet sont décrites dans
[LICENSING.md](https://github.com/bilelkhlif/footballsimulator/blob/main/LICENSING.md). Chaque
composant ci-dessous reste sous sa propre licence. Les liens pointent vers les sources officielles.

## Livré dans le site (GitHub Pages)

**Vidéo réelle France–Allemagne 2018 :** Like tears in rain, CC BY-SA 4.0, création personnelle
publiée sur [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Match_de_football_France-Allemagne_-_16_octobre_2018_-_Penalty_d%27Antoine_Griezmann.ogv).
Extrait de 2 à 28 s, réduit en 1280 × 720, H.264 à 25 images/s, sans audio ; poster extrait de la
vidéo adaptée, sous la même licence. [Crédit, transformations et empreintes](demo/matches/france-allemagne-2018/SOURCE.md),
[licence](https://creativecommons.org/licenses/by-sa/4.0/). Aucune approbation du projet par le
créateur ou les équipes n'est revendiquée. Le code garde sa licence distincte.

| Composant | Version | Licence et titulaire | Emplacement |
| --- | --- | --- | --- |
| three.js, build WebGPU, avec `OrbitControls` | r187 | MIT, « Copyright © 2010-2026 three.js authors » ; texte conservé | `src/vendor/three-r187/` (inchangé) |

Le site ne charge aucune autre bibliothèque, police ou ressource tierce en usage normal.

## Chargé seulement pendant le développement

| Composant | Version | Licence | Usage |
| --- | --- | --- | --- |
| IWER (Meta) | 2.7.0 | MIT | Émulateur WebXR chargé depuis jsDelivr avec `?iwer`, pour les essais sur PC ; ce n'est pas une capacité du téléphone |
| playwright-core (Microsoft) | 1.64.1 | Apache-2.0 | Tests automatisés ; absent du site |

## Installé séparément : serveur d'analyse facultatif

Le projet ne redistribue aucun paquet Python. L'utilisateur les installe depuis PyPI et l'index de
PyTorch, selon [analysis/requirements.txt](https://github.com/bilelkhlif/footballsimulator/blob/main/analysis/requirements.txt).
Les principaux :

| Composant | Version | Licence |
| --- | --- | --- |
| [Ultralytics](https://github.com/ultralytics/ultralytics/blob/v8.4.215/LICENSE), avec ultralytics-thop et ultralytics-platform | 8.4.215 | AGPL-3.0 |
| [PyTorch](https://github.com/pytorch/pytorch/blob/v2.14.1/LICENSE) et torchvision | 2.14.1, 0.29.1 | BSD-3-Clause (avec les notices de leurs composants) |
| [Roboflow Sports](https://github.com/roboflow/sports/blob/42c80c06b6b65a7f89455b89fe31cdf4c38ba227/LICENSE) (`sports`) | commit `42c80c0` | MIT |
| supervision, trackers (ByteTrack), PySceneDetect | 0.31.7, 2.7.0, 0.7.3 | MIT, Apache-2.0, BSD-3-Clause |
| transformers, OpenCV, scikit-learn, umap-learn, NumPy | 5.13.0, 4.14.0.94, 1.6.1, 0.6.0, 2.4.6 | Apache-2.0, Apache-2.0, BSD-3-Clause, BSD-3-Clause, BSD-3-Clause |
| gdown | 5.2.2 | MIT |

L'inventaire des 88 paquets de l'environnement validé, dépendances transitives comprises, est dans
[docs/inventaire-licences-python.md](https://github.com/bilelkhlif/footballsimulator/blob/main/docs/inventaire-licences-python.md).
Aucune licence incompatible avec l'AGPL-3.0, propriétaire ou non commerciale n'y figure. Les codecs
FFmpeg embarqués par `opencv-python` et `av` sont sous LGPL.

## Modèles : jamais distribués par le projet

Chaque utilisateur les télécharge depuis la source officielle avec
`python -m football_analysis models --download`. Leurs octets sont vérifiés contre
[analysis/models.lock.json](https://github.com/bilelkhlif/footballsimulator/blob/main/analysis/models.lock.json).

| Modèle | Source | Droits établis | Décision |
| --- | --- | --- | --- |
| `football-player-detection.pt`, `football-ball-detection.pt`, `football-pitch-detection.pt` | Liens Google Drive de [`setup.sh`](https://github.com/roboflow/sports/blob/42c80c06b6b65a7f89455b89fe31cdf4c38ba227/examples/soccer/setup.sh) de Roboflow Sports | Roboflow ne publie aucune licence pour ces poids ; le MIT du dépôt couvre son code. Selon [Ultralytics](https://www.ultralytics.com/license), les modèles entraînés avec son logiciel relèvent de l'AGPL-3.0 par défaut. Les licences de leurs jeux d'entraînement (Roboflow Universe) n'ont pas pu être lues : pages refusées (HTTP 403) | Non redistribués ; téléchargement par l'utilisateur, empreinte vérifiée |
| SigLIP base, `google/siglip-base-patch16-224`, révision `7fd15f0` | Hugging Face | Apache-2.0, déclaré dans la fiche du modèle | Modèle par défaut des équipes ; non redistribué |
| CLIP ViT-L/14, `openai/clip-vit-large-patch14`, révision `32bd642` | Hugging Face | Fiche sans licence ; elle déclare « Any deployed use case of the model […] is currently out of scope » | Réservé à la recherche (`--teams clip`), jamais par défaut ni dans la démo |

## Données

- **Démonstration publique** (`demo/`) : vidéo et suivi synthétiques, générés par le code du projet ; ni image de match télévisé, ni sortie des poids.
- **Vidéos de match réelles** : jamais versionnées ni publiées. Aucune licence de bibliothèque, ni aucune empreinte, ne donne de droit de diffusion sur une vidéo.
- **Logo de SUP'COM** (`docs/presentation/`) : propriété de SUP'COM.
