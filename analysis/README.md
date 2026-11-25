# Serveur d'analyse du visualiseur de match

Ce dossier analyse une vidéo de match : il détecte et suit les joueurs, les classe en deux équipes, calibre la caméra, et place chaque joueur sur le terrain. Il produit un document de suivi horodaté, que le visualiseur ([visualizer.html](../visualizer.html)) affiche sur la vidéo, avec le terrain 3D de l'application.

- Composants réutilisés, licences et choix : [docs/opensource-research.md](../docs/opensource-research.md).
- Architecture, format des données et résultats mesurés : [docs/visualiseur-match.md](../docs/visualiseur-match.md).
- Équipes sous soleil et ombre : [recherche et variantes comparées](../docs/equipes-lumiere-recherche.md).
- Segments, reprise, mémoire et migration `.mjs` : [analyse incrémentale](../docs/analyse-incrementale.md).
- Références sportives étudiées : [recherche et licences](../docs/sports-analytics-references.md).

L'application AR reste une PWA statique. Le visualiseur lit la démo publique sans ce serveur ; seule l'analyse de vos vidéos utilise le serveur local et votre matériel. La démo de la branche d'intégration n'est pas annoncée comme déjà déployée. [Licences, composants livrés et décision du propriétaire](../docs/licences-et-distribution.md).

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
.venv\Scripts\python -m pip install torch==2.14.1 torchvision==0.29.1 --index-url https://download.pytorch.org/whl/cu126
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m pip check
.venv\Scripts\python -m football_analysis models --download
.venv\Scripts\python -m football_analysis models   # vérification seule, sans réseau
```

Sans GPU NVIDIA, remplacez `cu126` par `cpu` ; le vrai parcours CPU complet n'est pas mesuré. Le couple torch/torchvision vient de la [recette officielle](https://pytorch.org/get-started/previous-versions/). CUDA 12.6 convient au pilote 566.07 et à la RTX 2050 (4 Go) de l'essai ; le test d'inférence réel reste la vérification utile, pas le seul numéro affiché par `nvidia-smi`.

`models --download` autorise explicitement le téléchargement des trois poids de Roboflow Sports (environ 410 Mo) et du snapshot SigLIP (environ 813 Mo). Les adresses, révisions et SHA-256 sont figés dans [models.lock.json](models.lock.json). Les poids existants sont vérifiés ; les nouveaux sont mis en quarantaine puis promus après contrôle. L'analyse ne télécharge rien implicitement. Un cache Hugging Face absent doit être préparé avec cette commande.

**Migration de sécurité :** recréez un environnement séparé à partir de cette recette si vous utilisez encore torch 2.5.1. Cette version est affectée par [GHSA-53q9-r3pm-6pq6](https://github.com/pytorch/pytorch/security/advisories/GHSA-53q9-r3pm-6pq6), corrigé à partir de 2.6.0 pour cet avis. Ne remplacez pas un environnement partagé sans conserver sa version précédente. Le chargeur refuse ce plancher vulnérable, active le mode restreint d'Ultralytics et force `weights_only=True`, sans repli permissif. Les octets approuvés sont vérifiés **avant** YOLO. Les plongements utilisent safetensors, une révision immuable et `trust_remote_code=False`. Un hash ne prouve ni les droits de licence ni l'absence de tout risque dans un modèle ; n'éditez pas le verrou pour accepter un fichier reçu d'un tiers.

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

## Sécurité

Le serveur est fait pour votre machine, vos propres vidéos et la boucle locale ; il n'est pas prévu pour
un service public.

**Modèles.** Seuls des octets approuvés sont désérialisés :

- avant tout import d'Ultralytics, chaque poids est comparé à [models.lock.json](models.lock.json) (taille et SHA-256) ; un fichier absent, lié, déplacé ou modifié est refusé, et aucun modèle n'est chargé ;
- le chargement passe ensuite par le mode restreint d'Ultralytics (`ULTRALYTICS_SAFE_LOAD`, liste de classes de modèle autorisées) et par `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1`. Si ce mode n'est pas disponible, l'analyse s'arrête : aucun repli vers le chargeur ordinaire. Un checkpoint piégé, dont le dépickling exécute du code, est refusé sans exécution ; le même fichier, chargé sans ces garde-fous, l'exécute (test `test_malicious_pickle_is_refused_by_the_project_loader`) ;
- les plongements SigLIP ou CLIP viennent d'une révision Hugging Face figée, en safetensors, avec `trust_remote_code=False` et sans téléchargement pendant l'analyse.

**Provenance des empreintes.** Roboflow ne publie pas d'empreinte pour ses trois poids. Le verrou fige les octets servis par les liens Google Drive de son `setup.sh` (commit `42c80c0`) : téléchargés le 17 novembre puis de nouveau le 25 novembre 2026, ils sont identiques, et les analyses du 17 au 23 novembre avaient enregistré les mêmes empreintes. Ce n'est pas une signature de l'éditeur. Les empreintes et tailles de SigLIP et CLIP sont celles que le Hub publie pour la révision figée ; cette révision est aussi celle de leur branche principale le 25 novembre 2026.

**PyTorch 2.14.1.** Cette version corrige [GHSA-53q9-r3pm-6pq6](https://github.com/pytorch/pytorch/security/advisories/GHSA-53q9-r3pm-6pq6) (≤ 2.5.1) et [GHSA-63cw-57p8-fm3p](https://github.com/pytorch/pytorch/security/advisories/GHSA-63cw-57p8-fm3p) (≤ 2.9.1), deux exécutions de code au chargement ; une analyse refuse de démarrer sous 2.10.0. Elle est touchée par [GHSA-v32g-mr63-3j83](https://github.com/pytorch/pytorch/security/advisories/GHSA-v32g-mr63-3j83) (≥ 2.14.0) : un checkpoint malveillant peut lire des fichiers texte même avec `weights_only=True`, par la classe `traceback.FrameSummary`. La correction, 2.15.0, n'est publiée qu'en CUDA 13.2 et 13.4 ; le pilote de l'essai (566.07) ne va que jusqu'à CUDA 12.7. Ici, seuls les trois poids épinglés atteignent `torch.load`, et aucun ne référence cette classe. Passer à 2.15.0 demande une mise à jour du pilote NVIDIA, puis une nouvelle validation.

**Serveur HTTP.** Le serveur refuse :

- les chemins et encodages hostiles (traversée, séparateurs Windows, lecteurs, UNC, double encodage, octets de contrôle, UTF-8 invalide) ;
- les liens qui sortent de la racine, les cibles absolues et HTTP/0.9 ;
- les longueurs ambiguës et `Transfer-Encoding` ;
- les noms de fichier qui ne sont pas un simple nom.

Il borne les connexions à 16 et les téléversements simultanés à 2, coupe une connexion inactive au bout de 30 s et garde 256 Mio de disque libre ; un téléversement incomplet est effacé.

**Ce qui reste à votre charge.** N'autorisez que des origines de pages en lesquelles vous avez confiance : une page autorisée peut lire vos analyses et demander du calcul. Le décodage vidéo natif n'est pas un bac à sable contre une vidéo malveillante. N'éditez pas le verrou pour accepter un poids reçu d'un tiers : une empreinte ne prouve pas non plus les droits de licence.

## Licences

- Ce serveur importe Ultralytics et charge des poids relevant de sa politique AGPL/Enterprise. L'exécution locale n'est pas une exemption automatique. La portée d'une combinaison, les obligations de redistribution/service, les droits sur les poids et la licence propre au projet nécessitent une décision des ayants droit. Aucun paquet serveur installé ni poids n'est publié par cette finalisation. Comparaison concrète, sources officielles et option recommandée dans [licences-et-distribution.md](../docs/licences-et-distribution.md). Les conclusions trop catégoriques de l'étude initiale sont rectifiées dans ce document.
- Roboflow Sports (MIT), supervision (MIT), trackers (Apache-2.0), PySceneDetect (BSD-3-Clause), UMAP et scikit-learn (BSD-3-Clause), OpenCV (Apache-2.0), transformers (Apache-2.0) sont utilisés comme bibliothèques : aucun de leurs fichiers n'est copié dans le dépôt.
- Ultralytics envoie par défaut des statistiques d'usage. Le serveur les coupe avant de charger les modèles : réglage `sync` à `false` dans `%APPDATA%\Ultralytics\settings.json`.

## Tests

```powershell
.venv\Scripts\python -m pip install -r requirements-test.txt
.venv\Scripts\python -m unittest discover -s tests
```

Les tests de sécurité du serveur et des modèles sont dans `tests/test_server_security.py` et
`tests/test_model_security.py` ; la section [Sécurité](#sécurité) décrit ce qu'ils garantissent.

Les tests fonctionnent sans GPU ni poids. Ils couvrent le contrat, les modèles simulés, les maillots, les transactions, les interruptions et reprises sans doublon, les coupures, les horodatages VFR, les bornes mémoire, les mesures et l'API, ainsi que le contrôle d'identité : contacts, preuves, échange et séparation, coéquipiers, coupures, reprise, et un échange réel de ByteTrack corrigé dans la chaîne complète. Les tests du navigateur sont dans `npm test`, avec lecture par fenêtres et interactions du terrain 3D. Les [résultats datés](../docs/validation-incrementale-2026-11-23.json) distinguent ces fixtures des contrôles sur vidéos réelles.

L'[audit interne des équipes](validation/README.md) conserve les annotations textuelles de 446 observations lisibles, leurs vidéos de référence et un script de comparaison avant/après. Pour les identités : `python -m validation.validate_chunked_teams`, puis `python -m validation.summarise_identity` (suivis figés), `python -m validation.compare_full_runs` (chaîne complète), `python -m validation.compare_trackers` (suiveurs rejoués) et `python -m validation.profile_pipeline` (temps par étape). Les vidéos et les résultats complets restent dans `data/`, hors du dépôt.
