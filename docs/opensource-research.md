# Recherche open source : visualiseur de match par IA

Phase A du visualiseur de match : ce qui existe déjà pour passer d'une vidéo de football à des positions de joueurs sur le terrain, et ce que le prototype réutilise.

**Vérifié le 17 novembre 2026.** Les licences, les dates d'activité et les nombres d'étoiles viennent de l'API GitHub (`license.spdx_id`, `pushed_at`), de PyPI et de l'API Hugging Face. Les fichiers de licence ambigus ont été lus. Les précisions publiées viennent des dépôts, des fiches de modèles et des sorties des carnets d'entraînement : aucune n'a été mesurée ici. Les mesures du prototype sont dans [visualiseur-match.md](visualiseur-match.md).

Ce qui n'a pas pu être vérifié est signalé comme tel. paperswithcode.com redirige désormais vers Hugging Face Papers : ses classements par tâche ne sont plus consultables.

---

## 1. En bref

- **Le point de départ est Roboflow Sports.** Il couvre presque toute la chaîne : détection des joueurs, des gardiens, des arbitres et du ballon ; 32 points clés du terrain pour la calibration ; classement des équipes ; passage aux coordonnées du terrain. Ses poids sont publics, son code est sous MIT, ses poids sous AGPL-3.0.
- **Le suivi vient de `trackers` (Roboflow, Apache-2.0).** C'est la réécriture maintenue de ByteTrack, que supervision ne fournit plus. Sur SoccerNet, ByteTrack y obtient le meilleur HOTA, 84,0.
- **Aucune brique libre et prête à l'emploi ne lit les numéros de maillot.** La seule chaîne complète est sous licence non commerciale et très lourde : le prototype ne lit pas les numéros.
- **La licence change la donne.** Les modèles entraînés avec Ultralytics sont sous AGPL-3.0. L'usage universitaire est permis ; toute diffusion du serveur d'analyse, ou tout service en ligne, impose de publier tout son code source sous AGPL-3.0. Le dépôt n'a aujourd'hui aucun fichier LICENSE : c'est une décision pour l'équipe (partie 6).
- **Il faut encore adapter et écrire** : le vote des équipes par trajectoire, une homographie robuste avec ses mesures de qualité, le format de données commun au fichier et au direct, le serveur, et toute l'interface de superposition 3D.

---

## 2. Fiches des projets

Pour chaque projet : ce qu'il fait, ses poids, sa licence, son activité, son installation, son besoin de GPU, les preuves publiées, la difficulté d'intégration, et son usage possible pour une vidéo téléversée ou un flux en direct.

### 2.1 Chaîne complète pour le football

#### Roboflow Sports

| Critère | Constat |
| --- | --- |
| Adresse | <https://github.com/roboflow/sports> |
| Ce qui existe | Un paquet Python `sports` : gabarit du terrain à 32 points clés (`SoccerPitchConfiguration`), homographie (`ViewTransformer`), classement des équipes (`TeamClassifier` : SigLIP, UMAP, KMeans), suivi du ballon, dessin du terrain en 2D. Un exemple `examples/soccer/main.py` enchaîne les modes détection du terrain, des joueurs et du ballon, suivi, équipes et « radar ». Trois carnets d'entraînement |
| Poids | Trois modèles YOLOv8, téléchargeables sans compte par `setup.sh` (liens Google Drive) : joueurs (4 classes : ballon, gardien, joueur, arbitre), points clés du terrain (32 points, YOLOv8 pose), ballon |
| Licence | Code : MIT. Poids : entraînés avec Ultralytics ; le README indique la licence AGPL-3.0 pour YOLOv8, et Ultralytics l'applique à tout modèle entraîné avec son code. Jeux de données Roboflow Universe : CC BY 4.0 d'après leurs copies sur Universe (la page d'origine refuse l'accès automatique). Vidéos d'origine : concours Kaggle « DFL – Bundesliga Data Shootout », **conditions non vérifiées** (page Kaggle illisible sans navigateur) |
| Activité | Branche `main` : dernier commit le 27/05/2025 (liens du README), dernier changement de code le 19/08/2024. Branches de travail non fusionnées poussées jusqu'au 28/08/2026 (vitesse et distance des joueurs, basket). 5 500 étoiles |
| Installation | Facile : `pip install git+https://github.com/roboflow/sports.git` (pas de paquet PyPI), puis `ultralytics` et `gdown` |
| GPU | Recommandé : YOLOv8x en 1280 px. Le processeur seul fonctionne, lentement |
| Preuves publiées | Sorties des carnets d'entraînement, sur l'ensemble de validation en 1280 px : détection des joueurs, mAP50 0,88 et mAP50-95 0,673 sur 43 images et 1 025 objets (joueur 0,994, arbitre 0,977, gardien 0,948, **ballon 0,599, rappel 0,48**). Points clés du terrain : mAP50 des poses 0,97 sur 30 images. Ballon, modèle dédié : mAP50 0,932 sur 121 images. Petits ensembles, tous issus de la même source (Bundesliga, caméra principale) |
| Intégration | Faible à moyenne. Les classes se réutilisent telles quelles. L'exemple est une démonstration d'un seul tenant : il prédit l'équipe à chaque image et produit une vidéo, pas des données. Son homographie (moindres carrés, sans RANSAC) lève une exception sous 4 points. Sa feuille de route note le scintillement du radar |
| Fichier / direct | Fichier : oui. Direct : possible sur un bon GPU ; le classement des équipes demande une phase d'apprentissage au début du flux |

#### SoccerNet Game State Reconstruction et TrackLab

| Critère | Constat |
| --- | --- |
| Adresses | <https://github.com/SoccerNet/sn-gamestate>, <https://github.com/TrackingLaboratory/tracklab> |
| Ce qui existe | La référence de la recherche : détection (YOLOv11), réidentification (PRTReid, BPBReID), suivi (StrongSORT), calibration (TVCalib ; NBJW et PnLCalib depuis juillet 2024), numéros de maillot (MMOCR), équipes, métrique GS-HOTA. TrackLab fournit la partie générique : détecteurs (YOLO, YOLOX, RTMDet, RT-DETR), poses, réidentification, suiveurs |
| Poids | Téléchargés par le cadre. Données : SoccerNet est hébergé sur Hugging Face, et les jeux de données qui contiennent des vidéos protégées exigent l'accord de confidentialité (NDA) de SoccerNet |
| Licence | sn-gamestate : GPL-3.0. TrackLab : MIT. Composants : YOLOv11 sous AGPL-3.0, MMOCR sous Apache-2.0, TVCalib sous MIT |
| Activité | sn-gamestate : 02/05/2026 (passage à TrackLab 1.3.24). TrackLab : 01/05/2026 |
| Installation | Lourde : une des options du README crée un environnement conda Python 3.9 avec PyTorch 1.13.1 et CUDA 11.7. Configuration Hydra |
| GPU | Indispensable : plusieurs grands modèles par image |
| Preuves publiées | Résultats complets sur SoccerNet-GSR, dans l'article (non repris ici) ; états du suiveur de référence publiés sur Zenodo |
| Intégration | Forte : un cadre de recherche entier, configuré par fichiers, qui produit son propre format |
| Fichier / direct | Fichier seulement, en pratique |

### 2.2 Détection

#### Ultralytics YOLO

| Critère | Constat |
| --- | --- |
| Adresse | <https://github.com/ultralytics/ultralytics> |
| Ce qui existe | YOLOv8, YOLO11, YOLO26 : détection, pose, segmentation, suivi intégré (ByteTrack, BoT-SORT), export (ONNX, TensorRT, OpenVINO) |
| Poids | Poids officiels COCO (classes « person » et « sports ball ») ; aucun poids officiel pour le football. Beaucoup de poids football de la communauté, dont ceux de Roboflow |
| Licence | AGPL-3.0. D'après <https://www.ultralytics.com/license> : « All Ultralytics YOLO trained models fall under the AGPL-3.0 License by default. » L'usage universitaire et les projets entièrement publiés sont gratuits ; sinon, licence Enterprise payante |
| Activité | Version 8.4.215 sur PyPI ; poussé le 17/11/2026 ; 63 500 étoiles |
| Installation | Très facile : `pip install ultralytics` |
| GPU | Facultatif ; CUDA ou MPS accélèrent fortement |
| Preuves publiées | Mesures COCO dans la documentation (non reprises ici) |
| Intégration | Très facile ; supervision convertit ses résultats |
| Fichier / direct | Les deux, en temps réel sur GPU |

#### RF-DETR

| Critère | Constat |
| --- | --- |
| Adresse | <https://github.com/roboflow/rf-detr> |
| Ce qui existe | Détecteur temps réel à transformeur : détection, segmentation, points clés |
| Poids | COCO, publics. Aucun poids football officiel. Poids de la communauté : [julianzu9612/RFDETR-Soccernet](https://huggingface.co/julianzu9612/RFDETR-Soccernet) (RF-DETR-Large, 128 M de paramètres, affiné sur SoccerNet-Tracking, dernière mise à jour le 29/07/2025) |
| Licence | Apache-2.0 pour le paquet et les tailles N, S, M, L, la segmentation et les points clés ; tailles A, F, P, XL et 2XL sous licence Roboflow PML 1.0. Le modèle SoccerNet de la communauté est marqué Apache-2.0, mais ses données d'entraînement sont sous NDA : les conditions de réutilisation de ses poids sont incertaines |
| Activité | Poussé le 16/11/2026 ; 10 100 étoiles |
| Installation | Facile : `pip install rfdetr` |
| GPU | Recommandé |
| Preuves publiées | README : RF-DETR-N, AP50:95 COCO 48,4 à 2,3 ms ; RF-DETR-S, 53,0 à 3,5 ms (latences annoncées). Modèle SoccerNet : mAP50 85,7 annoncé par son auteur |
| Intégration | Moyenne : autre interface, compatible supervision |
| Fichier / direct | Les deux |

**Intérêt :** c'est la voie qui évite l'AGPL. Il faudrait toutefois affiner un modèle sur les jeux de données football de Roboflow (CC BY 4.0), donc entraîner. Le prototype ne le fait pas (partie 6).

#### Modèles football de Hugging Face

| Modèle | Licence affichée | Remarque |
| --- | --- | --- |
| [uisikdag/yolo-v8-football-players-detection](https://huggingface.co/uisikdag/yolo-v8-football-players-detection) | aucune | Ultralytics 8.0.25 (2023) ; ballon, gardien, joueur, arbitre ; mAP50 0,785 annoncé |
| [HLouy/yolov26m-sportsmot-football](https://huggingface.co/HLouy/yolov26m-sportsmot-football) | Apache-2.0 | Entraîné avec Ultralytics, donc AGPL-3.0 selon Ultralytics ; SportsMOT ; mAP50 0,97 annoncé |
| [rudrasinghm/dfine-football-detector](https://huggingface.co/rudrasinghm/dfine-football-detector) | Apache-2.0 | D-FINE ; données d'entraînement non décrites, aucune mesure autre que la perte : inutilisable comme preuve |
| [julianzu9612/RFDETR-Soccernet](https://huggingface.co/julianzu9612/RFDETR-Soccernet) | Apache-2.0 | Voir RF-DETR |

### 2.3 Suivi multi-objets

#### ByteTrack

| Critère | Constat |
| --- | --- |
| Adresse | <https://github.com/FoundationVision/ByteTrack> (anciennement ifzhang/ByteTrack) |
| Ce qui existe | Association en deux temps, qui garde aussi les détections peu sûres, avec un détecteur YOLOX |
| Poids | Détecteurs YOLOX entraînés sur des piétons (MOT17), sans intérêt pour le football |
| Licence | MIT |
| Activité | Dernière poussée le 19/06/2024 : plus maintenu |
| Installation | Difficile : ancienne pile YOLOX |
| GPU | Pour le détecteur seulement ; l'association tourne sur le processeur |
| Preuves publiées | MOT17 (test) : MOTA 80,3, IDF1 77,3, HOTA 63,1, à 29,6 images/s sur un V100 |
| Intégration | Par une réécriture plutôt que par ce dépôt |
| Fichier / direct | Les deux (suivi en ligne) |

#### trackers (Roboflow)

| Critère | Constat |
| --- | --- |
| Adresse | <https://github.com/roboflow/trackers> |
| Ce qui existe | Réécritures propres (« clean room ») de SORT, ByteTrack et OC-SORT, avec leur évaluation (HOTA, CLEAR, Identity) |
| Poids | Aucun pour le suivi par mouvement ; réidentification en option |
| Licence | Apache-2.0 |
| Activité | Version 2.7.0 ; poussé le 16/11/2026 ; 4 000 étoiles |
| Installation | Facile, mais exige numpy ≥ 2.0.2 et supervision ≥ 0.31 |
| GPU | Non |
| Preuves publiées | HOTA, paramètres par défaut. SoccerNet : SORT 81,6, **ByteTrack 84,0**, OC-SORT 78,4. SportsMOT : 70,9, 73,0, 71,7. MOT17 : 58,4, 60,1, 61,9 |
| Intégration | Très facile : prend et rend des `sv.Detections` |
| Fichier / direct | Les deux |

supervision fournissait `sv.ByteTrack` ; sa branche de développement ne contient plus de module de suivi, qui vit désormais dans `trackers`.

#### BoT-SORT et BoxMOT

| Critère | BoT-SORT | BoxMOT |
| --- | --- | --- |
| Adresse | <https://github.com/NirAharon/BoT-SORT> | <https://github.com/mikel-brostrom/boxmot> |
| Ce qui existe | ByteTrack, plus compensation du mouvement de la caméra, filtre de Kalman amélioré et réidentification facultative | BoT-SORT, StrongSORT, DeepOCSORT, ByteTrack…, avec poids de réidentification |
| Licence | MIT | AGPL-3.0 |
| Activité | 08/08/2024 (plus maintenu) | 12/11/2026 ; 8 300 étoiles |
| Preuves publiées | MOT17 (test) : MOTA 80,5, IDF1 80,2, HOTA 65,0 | — |
| Intérêt | La compensation du mouvement aide avec une caméra de télévision qui suit le jeu : piste d'amélioration | Réidentification prête à l'emploi, sous AGPL |

### 2.4 Calibration de la caméra et repère du terrain

| Projet | Licence | Activité | Méthode | Verdict |
| --- | --- | --- | --- | --- |
| Points clés Roboflow + OpenCV | AGPL-3.0 (poids) + Apache-2.0 | voir plus haut | 32 points du terrain par image, puis homographie | **Retenu** |
| [SoccerNet/sn-calibration](https://github.com/SoccerNet/sn-calibration) | **aucune** | 18/06/2024 | Base du défi de calibration SoccerNet | Code non réutilisable : sans licence, tous droits réservés |
| [No Bells, Just Whistles (NBJW)](https://github.com/mguti97/No-Bells-Just-Whistles) | GPL-2.0, sans « or later » | 25/10/2024 | Points et lignes du terrain (CVPRW 2024) | Incompatible avec l'AGPL-3.0 dans un même programme |
| [PnLCalib](https://github.com/mguti97/PnLCalib) | GPL-2.0 ou ultérieure | 26/10/2026 | Optimisation points et lignes ; intégré à sn-gamestate | Piste d'amélioration ; poids et conditions de leurs données à vérifier |
| [TVCalib](https://github.com/MM4SPA/tvcalib) | MIT | 27/04/2024 | Segmentation, puis optimisation par image | Lent : une optimisation par image |
| [OpenCV](https://github.com/opencv/opencv) | Apache-2.0 | 17/11/2026 | `findHomography` (RANSAC), `perspectiveTransform`, lecture vidéo par FFmpeg | **Retenu** |

### 2.5 Équipes et numéros de maillot

| Projet | Licence | Activité | Remarque |
| --- | --- | --- | --- |
| `TeamClassifier` de Roboflow Sports | MIT | voir plus haut | Plongements SigLIP, réduits par UMAP, regroupés par KMeans : aucun entraînement. **Retenu, adapté** |
| [SigLIP base patch16-224](https://huggingface.co/google/siglip-base-patch16-224) | Apache-2.0 | 26/09/2024 | Poids de 813 Mo, téléchargés par transformers. Modèle par défaut du prototype, comme chez Roboflow |
| [CLIP ViT-L/14](https://huggingface.co/openai/clip-vit-large-patch14) | aucune sur la fiche ; code d'OpenAI sous MIT | 15/09/2023 | Même rôle que SigLIP. La fiche le réserve à la recherche : « Any deployed use case of the model […] is currently out of scope. » Option du prototype, utilisée pour la validation parce qu'il était déjà sur la machine (partie 4 de [visualiseur-match.md](visualiseur-match.md)) |
| [UMAP](https://github.com/lmcinnes/umap) et [scikit-learn](https://github.com/scikit-learn/scikit-learn) | BSD-3-Clause | 17/11/2026 | Réduction de dimension et KMeans |
| [jersey-number-pipeline](https://github.com/mkoshkina/jersey-number-pipeline) | Creative Commons **non commerciale** | 07/10/2024 | Lisibilité, pose (ViTPose), lecture (PARSeq) : chaîne lourde, non commerciale. Non retenue |
| [SoccerNet/sn-jersey](https://github.com/SoccerNet/sn-jersey) | **aucune** | 02/07/2024 | Trousse du défi ; non réutilisable |

### 2.6 Découpage en plans, données de suivi, visualisation

| Projet | Licence | Activité | Rôle |
| --- | --- | --- | --- |
| [PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | BSD-3-Clause | 17/11/2026 ; version 0.7.3 | Détection des coupures de plan, image par image (`ContentDetector`). **Retenu** |
| [supervision](https://github.com/roboflow/supervision) | MIT | 16/11/2026 ; version 0.31.7 | Détections, points clés, annotations, lecture vidéo. **Retenu** |
| [kloppy](https://github.com/PySport/kloppy) | BSD-3-Clause | 06/11/2026 | Modèle standard des données de suivi et d'événements : cible d'export future |
| [mplsoccer](https://github.com/andrewRowlinson/mplsoccer) | MIT | 27/10/2026 | Terrains 2D (matplotlib). Inutile : le projet a déjà son terrain 3D |
| [Roboflow Inference](https://github.com/roboflow/inference) | mixte (Apache-2.0 et dossier « enterprise ») | 17/11/2026 | Serveur de modèles ; les modèles hébergés exigent une clé d'API. Non retenu |

### 2.7 Autres projets de bout en bout

| Projet | Licence | Activité | Constat |
| --- | --- | --- | --- |
| [Eagle](https://github.com/nreHieW/Eagle) | **aucune** | 13/05/2026 | Vidéo de télévision vers données de suivi ; code non réutilisable |
| [football_analysis](https://github.com/abdullahtarek/football_analysis) | **aucune** | 23/04/2024 | Tutoriel populaire (1 000 étoiles) : YOLO, couleurs des maillots, flot optique, 4 points de perspective saisis à la main ; code non réutilisable |
| [SportsLabKit](https://github.com/AtomScott/SportsLabKit) | GPL-3.0 | 19/12/2023 | Plus maintenu |
| [Narya](https://github.com/DonsetPG/narya) | MIT | 25/03/2023 | Plus maintenu (époque TensorFlow) |
| [FootAndBall](https://github.com/jac99/FootAndBall) | MIT | 05/07/2023 | Détecteur léger de 2020 ; plus maintenu |

---

## 3. Matrice de comparaison

GPU : « + » utile, « ++ » nécessaire en pratique. Direct : « oui » si l'outil travaille image par image, sans passe sur toute la vidéo.

| Composant | Rôle | Licence du code | Poids et données | Poids publics | Activité | Installation | GPU | Preuves | Direct | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Roboflow Sports | chaîne football | MIT | AGPL-3.0 ; CC BY 4.0 ; DFL à vérifier | oui | code 2024, branches 2026 | facile | + | carnets d'entraînement | oui, après apprentissage des équipes | **retenu** |
| Ultralytics | inférence YOLO | AGPL-3.0 | AGPL-3.0 | COCO | 17/11/2026 | très facile | + | documentation | oui | **retenu** (exigé par les poids) |
| RF-DETR | détection | Apache-2.0 | Apache-2.0 / PML | COCO | 16/11/2026 | facile | + | README | oui | piste sans AGPL (entraînement requis) |
| supervision | outils | MIT | — | — | 16/11/2026 | très facile | non | — | oui | **retenu** |
| trackers | suivi | Apache-2.0 | — | — | 16/11/2026 | facile | non | HOTA 84,0 sur SoccerNet | oui | **retenu** |
| ByteTrack (original) | suivi | MIT | piétons | oui | 2024 | difficile | + | MOT17 | oui | remplacé par trackers |
| BoT-SORT | suivi + caméra | MIT | — | — | 2024 | difficile | + | MOT17 | oui | piste |
| BoxMOT | suivi + réidentification | AGPL-3.0 | réidentification | oui | 12/11/2026 | facile | ++ | — | oui | piste |
| sn-gamestate + TrackLab | état du jeu complet | GPL-3.0 / MIT | NDA SoccerNet | oui | 2026 | lourde | ++ | GS-HOTA | non | trop lourd |
| NBJW | calibration | GPL-2.0 seule | — | à vérifier | 2024 | moyenne | ++ | article | oui | incompatible AGPL |
| PnLCalib | calibration | GPL-2.0+ | à vérifier | à vérifier | 26/10/2026 | moyenne | ++ | article | oui | piste |
| TVCalib | calibration | MIT | — | — | 2024 | moyenne | ++ | article | non (lent) | non retenu |
| OpenCV | homographie, vidéo | Apache-2.0 | — | — | 17/11/2026 | très facile | non | — | oui | **retenu** |
| SigLIP + UMAP + KMeans | équipes | Apache-2.0 / BSD | Apache-2.0 | oui | 2024–2026 | facile | + | démonstration Roboflow | après apprentissage | **retenu** |
| jersey-number-pipeline | numéros | CC non commerciale | — | oui | 2024 | lourde | ++ | article | non | non retenu |
| PySceneDetect | coupures de plan | BSD-3-Clause | — | — | 17/11/2026 | très facile | non | — | oui | **retenu** |
| kloppy | format de données | BSD-3-Clause | — | — | 06/11/2026 | facile | non | — | — | export futur |

---

## 4. Combinaison retenue

| Étape | Choix | Licence | Raison |
| --- | --- | --- | --- |
| Lecture de la vidéo | OpenCV (`VideoCapture`, FFmpeg) | Apache-2.0 | Toute cadence et toute résolution ; horodatage de chaque image |
| Coupures de plan | PySceneDetect `ContentDetector`, image par image | BSD-3-Clause | Remet le suivi à zéro à chaque nouveau plan |
| Joueurs, gardiens, arbitres | Poids Roboflow `football-player-detection` (YOLOv8x), par Ultralytics | AGPL-3.0 | Quatre classes propres au football ; mAP50 0,994 pour les joueurs |
| Ballon | Poids Roboflow `football-ball-detection` | AGPL-3.0 | mAP50 0,932, contre 0,599 pour la classe ballon du modèle des joueurs |
| Suivi | `trackers`, ByteTrack | Apache-2.0 | Meilleur HOTA sur SoccerNet parmi les réécritures ; en ligne |
| Équipes | `TeamClassifier` de Roboflow Sports (SigLIP, UMAP, KMeans) | MIT, Apache-2.0, BSD | Aucun entraînement |
| Calibration | Poids Roboflow `football-pitch-detection` (32 points) et `cv2.findHomography` avec RANSAC | AGPL-3.0, Apache-2.0 | Une homographie par image suit le panoramique et le zoom |
| Repère du terrain | `SoccerPitchConfiguration` aux dimensions réglementaires (105 × 68 m) | MIT | Même ordre de points que le modèle |
| Annotations, conversions | supervision | MIT | Interface commune des détecteurs et suiveurs |
| Rendu | Les modules three.js WebGPU du projet | — | Terrain, joueurs, ballon, raycasting, flèches |

---

## 5. Ce qui est réutilisé, adapté ou créé

**Réutilisé tel quel :** OpenCV, PySceneDetect, supervision, `trackers` (ByteTrack), l'inférence Ultralytics, les trois poids Roboflow, `SoccerPitchConfiguration` et `TeamClassifier` de Roboflow Sports, SigLIP. Côté navigateur : le moteur de rendu WebGPU, le terrain, la fabrique de joueurs et ses maillages instanciés, le ballon, les outils de raycasting et la géométrie des flèches du projet.

**Adapté :**

- **Équipes, par trajectoire.** L'exemple de Roboflow prédit l'équipe de chaque joueur à chaque image : la couleur d'un même joueur peut changer d'une image à l'autre. Le prototype apprend les groupes sur un échantillon d'images de joueurs, puis vote une fois par trajectoire, avec un indice de confiance. Les gardiens rejoignent l'équipe la plus proche, comme chez Roboflow, mais une fois par trajectoire.
- **Homographie robuste.** `ViewTransformer` fait des moindres carrés sur tous les points et lève une exception sous 4 points. Le prototype garde les points sûrs, rejette les points aberrants (RANSAC), mesure l'erreur de reprojection, et déclare l'échec avec sa cause au lieu d'inventer des positions.
- **Gabarit réglementaire.** La configuration par défaut de Roboflow mesure 120 × 70 m, avec une surface de réparation de 41 × 20,15 m. Le prototype garde l'ordre de ses 32 points, mais avec les dimensions réglementaires : 105 × 68 m, surface de réparation de 40,32 × 16,5 m.
- **Remise à zéro du suivi** à chaque coupure de plan.
- **Ballon** : le modèle dédié est appliqué à l'image entière en 1280 px, la résolution de sa validation, au lieu du découpage en tuiles de 640 px de l'exemple, quatre fois plus coûteux.

**Créé, faute de composant existant :**

- un format de données horodaté, avec confiance et causes d'échec, commun au fichier et au futur direct ;
- le serveur local, sa file d'analyses, et la lecture partielle de la vidéo ;
- la superposition interactive : le terrain 3D dans la vidéo, déplaçable, redimensionnable, réductible et verrouillable ; le choix automatique de la zone la moins encombrée ; la synchronisation à l'image près ; les étiquettes sur la vidéo ; les traces, les flèches de déplacement et les mesures ;
- les mesures de qualité sans vérité terrain (partie 4 de [visualiseur-match.md](visualiseur-match.md)).

---

## 6. Risques et décisions à prendre

- **AGPL-3.0.** Le serveur d'analyse charge Ultralytics et des poids sous AGPL-3.0. C'est permis pour un travail universitaire. S'il est un jour distribué, ou proposé comme service en ligne, tout son code source doit être publié sous AGPL-3.0. **Le dépôt n'a pas de fichier LICENSE** : à l'équipe de choisir. Sans AGPL, il faudrait affiner RF-DETR (Apache-2.0) sur les jeux de données CC BY 4.0 de Roboflow, détection et points clés, donc entraîner des modèles.
- **Données d'entraînement.** Les vidéos du concours DFL, dont viennent les jeux de données de Roboflow, ont des conditions que nous n'avons pas pu lire. Les vidéos SoccerNet sont sous NDA. Le dépôt ne contient aucune de ces vidéos, et les poids sont téléchargés au moment de l'installation.
- **Domaine.** Les trois modèles ont appris sur la caméra principale de la Bundesliga. Une vidéo filmée des tribunes, un match amateur ou un plan serré sortent de ce domaine : la calibration y échoue souvent, et le prototype le montre au lieu de le cacher.
- **Identités.** Sans réidentification, ByteTrack change d'identifiant après une longue occlusion ou une sortie du champ. Le prototype mesure la fragmentation au lieu de prétendre la corriger.
- **Numéros de maillot.** Non lus : aucune brique libre ne convient (partie 2.5).
- **Dimensions du terrain.** Le gabarit suppose 105 × 68 m. Sur un autre terrain, les positions restent justes par rapport aux lignes, mais les distances et les vitesses s'écartent d'autant, quelques pour cent.

---

## Sources

Dépôts et fichiers lus le 17 novembre 2026 :

- Roboflow Sports : [README de l'exemple football](https://github.com/roboflow/sports/blob/main/examples/soccer/README.md), [setup.sh](https://github.com/roboflow/sports/blob/main/examples/soccer/setup.sh), [main.py](https://github.com/roboflow/sports/blob/main/examples/soccer/main.py), [carnets d'entraînement](https://github.com/roboflow/sports/tree/main/examples/soccer/notebooks), [team.py](https://github.com/roboflow/sports/blob/main/sports/common/team.py), [view.py](https://github.com/roboflow/sports/blob/main/sports/common/view.py), [soccer.py](https://github.com/roboflow/sports/blob/main/sports/configs/soccer.py)
- Licence Ultralytics : <https://www.ultralytics.com/license>
- RF-DETR : [README](https://github.com/roboflow/rf-detr) (licences par taille, tableau COCO)
- trackers : [README](https://github.com/roboflow/trackers) (tableau HOTA), [pyproject.toml](https://github.com/roboflow/trackers/blob/develop/pyproject.toml)
- ByteTrack : [README](https://github.com/FoundationVision/ByteTrack) ; BoT-SORT : [README](https://github.com/NirAharon/BoT-SORT)
- SoccerNet : [sn-gamestate](https://github.com/SoccerNet/sn-gamestate), [page des données](https://www.soccer-net.org/data)
- Fichiers de licence : [NBJW](https://github.com/mguti97/No-Bells-Just-Whistles/blob/main/LICENSE), [PnLCalib](https://github.com/mguti97/PnLCalib/blob/main/LICENSE), [jersey-number-pipeline](https://github.com/mkoshkina/jersey-number-pipeline/blob/main/license.txt)
- Hugging Face : [recherche « football »](https://huggingface.co/models?search=football) et les fiches citées ; [SigLIP](https://huggingface.co/google/siglip-base-patch16-224)
- Jeux de données Roboflow : copies sur Universe affichant CC BY 4.0, par exemple [football-players-detection-3zvbc (copie)](https://universe.roboflow.com/chanjinkim/football-players-detection-3zvbc-x4y9s)
- Concours DFL : [présentation de la Bundesliga](https://bundesliga.com/en/aws-bundesliga-data-shootout) ; règles Kaggle non lisibles sans navigateur
- Vidéos libres de test : [Wikimedia Commons](https://commons.wikimedia.org/) (licences dans [visualiseur-match.md](visualiseur-match.md))
