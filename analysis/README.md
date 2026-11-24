# Serveur d'analyse du visualiseur de match

Ce dossier analyse une vidéo de match : il détecte et suit les joueurs, les classe en deux équipes, calibre la caméra, et place chaque joueur sur le terrain. Il produit un document de suivi horodaté, que le visualiseur ([visualizer.html](../visualizer.html)) affiche sur la vidéo, avec le terrain 3D de l'application.

- Composants réutilisés, licences et choix : [docs/opensource-research.md](../docs/opensource-research.md).
- Architecture, format des données et résultats mesurés : [docs/visualiseur-match.md](../docs/visualiseur-match.md).
- Équipes sous soleil et ombre : [recherche et variantes comparées](../docs/equipes-lumiere-recherche.md).
- Segments, reprise, mémoire et migration `.mjs` : [analyse incrémentale](../docs/analyse-incrementale.md).
- Références sportives étudiées : [recherche et licences](../docs/sports-analytics-references.md).

L'application AR (index.html) n'en dépend pas : elle reste une PWA statique, publiée sur GitHub Pages. Le visualiseur, lui, a besoin de ce serveur, sur l'ordinateur qui fait l'analyse.

## Matériel

| Matériel | Effet |
| --- | --- |
| GPU NVIDIA avec CUDA, 4 Go de mémoire au moins | Nouveau passage sur une RTX 2050 (4 Go), vidéos de 30 s : traitement de 6,72 à 7,13 fois leur durée, dont 55,99 à 61,69 s pour les équipes ; pic alloué par PyTorch de 627 Mio avec SigLIP. Mesures uniques, comparaison et limites : [partie 6.7](../docs/visualiseur-match.md#67-fiabilisation-des-équipes-17-novembre-2026) |
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

Téléversez une vidéo (MP4, WebM, MOV, MKV…) : l'analyse se fait en arrière-plan et les premiers segments disponibles s'ouvrent automatiquement. Le terrain 3D reste superposé à la vidéo. La page indique la partie déjà analysée ; les équipes arrivent dans une seconde passe. « Interrompre » arrête l'analyse au lot d'images suivant ; les analyses interrompues, ou coupées par un arrêt du serveur, restent consultables et disposent d'un bouton de reprise. Le navigateur doit pouvoir lire la vidéo : H.264 ou VP9 conviennent à Chrome et Edge.

La page a deux modes : « Analyser ma vidéo » (ce serveur) et « Explorer la démo » (exports statiques de `demo/`, sans serveur). Depuis une page publique, comme GitHub Pages, ajoutez `?serveur=http://127.0.0.1:8765/` à l'adresse du visualiseur et acceptez la demande d'accès de Chrome aux applications de cet appareil ; la page servie par ce serveur reste le moyen le plus simple. Sécurité, restrictions des navigateurs et démonstration : [docs/visualiseur-modes.md](../docs/visualiseur-modes.md).

**Ligne de commande.** La même analyse, sans interface :

```powershell
.venv\Scripts\python -m football_analysis analyse match.mp4 -o match.tracking.sqlite --chunk-seconds 10
# Rejouer la même commande reprend la base avec les mêmes options.
# Une sortie .json conserve aussi une base .sqlite et exporte le document séquentiellement.
```

| Option | Effet |
| --- | --- |
| `--fps 12.5` | Cadence d'analyse ; la vidéo est échantillonnée à cette cadence, quelle que soit la sienne |
| `--teams siglip` ou `--teams clip` | Modèle de plongements des équipes : SigLIP (Apache-2.0, par défaut, comme Roboflow) ou CLIP ViT-L/14 (réservé à la recherche par sa fiche) |
| `--no-ball-model` | Sans le modèle dédié au ballon : plus rapide, ballon moins souvent trouvé |
| `--device cpu` | Force le processeur |
| `--max-seconds 20` | N'analyse que le début |
| `--chunk-seconds 10` | Segments de 0,5 à 30 s ; mémoire indépendante de la durée totale |
| `--team-fit-seconds 30` | Réserve initiale des équipes sur 1 à 120 s, bornée à 512 images de maillots |
| `serve --jobs data/jobs-test` | Dossier distinct pour un essai isolé, sans relancer les anciennes vidéos en file |
| `serve --allow-origin https://exemple.test` | Page publique autorisée à utiliser le serveur (par défaut `https://bilelkhlif.github.io`) ; répétable |
| `serve --allow-network` | Écoute sur une autre adresse que la boucle locale : déconseillé, vidéos et analyses privées |

**Export statique et démonstration.** Une analyse terminée devient des fichiers lisibles sans serveur (mode démo) :

```powershell
.venv\Scripts\python -m football_analysis export data\jobs\<id>\tracking.sqlite export\mon-match --title "Mon match"
.venv\Scripts\python -m football_analysis verify-export export\mon-match
# Démonstration publique synthétique (vidéo générée, aucune image réelle) : régénère ../demo/
.venv\Scripts\python -m football_analysis demo
```

Ne publiez l'export d'une vidéo réelle que si vous avez le droit de diffuser cette vidéo et ses données : les exemples de Roboflow Sports (concours DFL) et les diffusions télévisées ne le permettent pas. Vérification complète du mode local avec le vrai pipeline : `node tests/visualizer-local-ai.mjs <vidéo>` (GPU et poids requis).

## Ce qui est mesuré, et ce qui ne l'est pas

Chaque analyse calcule des indicateurs de qualité sans vérité terrain, affichés par le visualiseur : part des images calibrées, erreur d'ajustement et erreur hors échantillon de la calibration (sur les repères du terrain, pas sur les joueurs), part des images avec ballon, indice de fragmentation des trajectoires, part des déplacements invraisemblables (plus de 12 m/s), part des joueurs dont l'équipe est connue, équilibre des équipes dans chaque image, lenteur rapportée à la durée de la vidéo, et mémoire.

Quand la calibration échoue, aucune position n'est donnée sur le terrain pour l'image, et le visualiseur le dit. Les numéros de maillot ne sont pas lus.

**Identités.** Après la référence des équipes, un contrôle examine les contacts masqués entre joueurs (boîtes qui se chevauchent, l'un disparaissant au moins une image). Il compare les maillots 2 s avant et 2 s après : un échange entre maillots différents est corrigé, un changement isolé donne un nouvel identifiant, et pendant le contact l'identité est marquée incertaine. Les échanges entre coéquipiers ne sont pas détectés. Méthode et mesures : [docs/identites-contacts.md](../docs/identites-contacts.md). Le détail est dans [docs/visualiseur-match.md](../docs/visualiseur-match.md).

## Licences

- Ce serveur importe Ultralytics (avec ultralytics-thop et ultralytics-platform) et charge des poids sous **AGPL-3.0**. L'usage sur sa propre machine n'impose rien. S'il est transmis avec ces composants (copie, image, installateur), ou offert comme service en ligne, l'ensemble relève de l'AGPL : code source complet et mêmes droits pour les utilisateurs. Les fichiers de ce dossier peuvent alors garder une licence compatible (MIT, Apache-2.0, BSD ou AGPL). La page du visualiseur et l'application AR, séparées, ne sont pas concernées. Le dépôt n'a pas encore de fichier LICENSE : c'est à l'équipe de choisir. Détail et inventaire de toutes les licences : [docs/opensource-research.md](../docs/opensource-research.md), parties 6 et 7.
- Roboflow Sports (MIT), supervision (MIT), trackers (Apache-2.0), PySceneDetect (BSD-3-Clause), UMAP et scikit-learn (BSD-3-Clause), OpenCV (Apache-2.0), transformers (Apache-2.0) sont utilisés comme bibliothèques : aucun de leurs fichiers n'est copié dans le dépôt.
- Ultralytics envoie par défaut des statistiques d'usage. Le serveur les coupe avant de charger les modèles : réglage `sync` à `false` dans `%APPDATA%\Ultralytics\settings.json`.

## Tests

```powershell
.venv\Scripts\python -m unittest discover -s tests
```

Les tests fonctionnent sans GPU ni poids. Ils couvrent le contrat, les modèles simulés, les maillots, les transactions, les interruptions et reprises sans doublon, les coupures, les horodatages VFR, les bornes mémoire, les mesures et l'API, ainsi que le contrôle d'identité : contacts, preuves, échange et séparation, coéquipiers, coupures, reprise, et un échange réel de ByteTrack corrigé dans la chaîne complète. Les tests du navigateur sont dans `npm test`, avec lecture par fenêtres et interactions du terrain 3D. Les [résultats datés](../docs/validation-incrementale-2026-11-23.json) distinguent ces fixtures des contrôles sur vidéos réelles.

L'[audit interne des équipes](validation/README.md) conserve les annotations textuelles de 446 observations lisibles, leurs vidéos de référence et un script de comparaison avant/après. Pour les identités : `python -m validation.validate_chunked_teams`, puis `python -m validation.summarise_identity` (suivis figés), `python -m validation.compare_full_runs` (chaîne complète), `python -m validation.compare_trackers` (suiveurs rejoués) et `python -m validation.profile_pipeline` (temps par étape). Les vidéos et les résultats complets restent dans `data/`, hors du dépôt.
