# Références d'analyse football : enquête du 23 novembre 2026

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).

## 1. Sources effectivement consultées

Les deux publications et leurs vidéos publiques ont été accessibles sans compte. Le premier
accès direct au CDN a renvoyé 403 ; une requête publique avec l'en-tête de référence de la
publication a ensuite fonctionné. Trois instants de chaque vidéo ont été examinés, ainsi que
les descriptions et commentaires visibles. Les médias restent dans `analysis/data/`, ignoré
par Git. Aucun visuel ni code des démonstrations n'est incorporé à l'application.

### Rodrigo Fernández Moro — possession à partir d'un suivi existant

[Publication et démonstration](https://www.linkedin.com/posts/rodrigo-fernandez-moro_morethanahack-barcainnovationhub-sportsanalytics-ugcPost-7530322162558193665-AqxU/).
La vidéo accessible dure 62,83 s. Elle montre des positions sur un terrain, les états domicile,
extérieur et arrêt de jeu, des probabilités et trois chronologies : référence, modèle et baseline.
Le ballon peut être absent. Les scores affichés évoluent pendant la démonstration ; ils ne
mesurent ni notre chaîne, ni sa précision de détection. Il ne s'agit pas d'une extraction de
joueurs depuis une vidéo brute : le suivi est une donnée d'entrée.

Le commentaire de l'auteur fournit le [dépôt public](https://github.com/rodrifdezz/404-Possession-Not-Found),
consulté à la révision `ead83bb0c9d9e1ee844a6aab5fa9ddcfb0937fb5`.
Le [document technique](https://github.com/rodrifdezz/404-Possession-Not-Found/blob/ead83bb0c9d9e1ee844a6aab5fa9ddcfb0937fb5/docs/TECHNICAL.md)
décrit deux étages de gradient boosting et un décodage Viterbi. Les caractéristiques exploitent
distances, vitesses relatives, forme des équipes et touches du ballon. Certaines fenêtres
regardent le futur : une transposition directe au temps réel ne serait pas causale.

Le [README](https://github.com/rodrifdezz/404-Possession-Not-Found/blob/ead83bb0c9d9e1ee844a6aab5fa9ddcfb0937fb5/README.md)
explique la reproduction, les modèles `.pkl` déjà entraînés et la validation par matchs distincts.
Les données de compétition ne sont pas redistribuées. Le dépôt s'intitule « More than a Hack 2027 » ;
ce millésime est celui de la source. Les résultats annoncés restent des résultats de ses auteurs,
non reproduits ici. L'[explication de la démo](https://github.com/rodrifdezz/404-Possession-Not-Found/blob/ead83bb0c9d9e1ee844a6aab5fa9ddcfb0937fb5/docs/DEMO.md)
précise la génération de la page et distingue données publiques et fenêtre de compétition.

**Licence :** l'API GitHub renvoie `license: null`, la racine ne contient pas de fichier de licence
et le README ne fournit pas d'autorisation de réutilisation. Publication du code et droit de
redistribution sont deux questions distinctes. Aucun code ni poids de ce dépôt n'est repris.

### Shabahang Shayegan — annotations d'une diffusion Arsenal–Chelsea

[Publication et démonstration](https://www.linkedin.com/posts/shabahang-shayegan-5150b5117_ai-computervision-premierleague-ugcPost-7523153165299490816-h6cP/).
La vidéo accessible dure 22,20 s. Elle montre les joueurs colorés et détourés, des noms et numéros,
le ballon ou son absence, des pourcentages de possession, des listes d'effectif et un polygone
de champ caméra sur une carte 2D. Le pied de la vidéo mentionne YOLO11-seg, ByteTrack, les modèles
ballon et repères Roboflow, et une homographie ajustée aux lignes. Ces mentions sont visibles ;
l'architecture et le caractère automatique des noms ne sont pas vérifiables sans code.

Des commentaires signalent des échanges d'identité, notamment Neto/Fofana, et demandent le dépôt,
les modèles et le temps d'inférence. Les recherches GitHub et web au nom du créateur n'ont pas
permis d'identifier un dépôt associé de façon certaine. Aucun poids, jeu de données ou protocole
de précision propre à cette démonstration n'a été trouvé. Aucun résultat de notre projet ne
peut donc être déduit des apparences de cette vidéo.

## 2. Évaluation des idées

Les coûts ci-dessous sont une appréciation d'intégration, pas des mesures de débit.

| Idée et bénéfice | Écart avec notre visualiseur | Composants disponibles | GPU et durée | Fiabilité et effort | Adaptation au direct / décision |
| --- | --- | --- | --- | --- | --- |
| Chronologie de disponibilité : savoir où le suivi existe | Le JSON imposait d'attendre puis charger tout le résultat | SQLite, compression zlib, API de fenêtres | Aucun GPU ajouté ; petites lectures de disque | Transactions et fenêtres testables ; effort moyen | Horodatages réutilisables ; **implémenté** |
| Équipes cohérentes dans le temps : couleurs lisibles et durables | Regroupement unique sur tous les maillots conservés | SigLIP, Roboflow Sports, UMAP/KMeans, voisins scikit-learn | Même SigLIP en cache ; réserve limitée, inférences suivantes par lots | Deux identités figées ; inconnus si preuves insuffisantes ; validation réelle nécessaire | Repère et votes bornés réutilisables ; **implémenté** |
| Distance individuelle malgré le chargement partiel | Une distance calculée dans une fenêtre perdrait tout le passé | Somme incrémentale des déplacements plausibles | Aucun GPU ; coût par observation | Coupures, trous et sauts >12 m/s exclus ; ne prouve pas l'identité | Calcul causal ; **implémenté** |
| Possession, probabilités et chronologie des séquences | Notre ballon est intermittent et la caméra ne montre pas tous les joueurs | Méthode publiée de 404, données Metrica/DFL à examiner séparément | Gradient boosting sur CPU possible ; entraînement et validation non mesurés | Pas de licence de réutilisation identifiée pour 404 ; changement de distribution majeur | Fenêtres futures et Viterbi par mi-temps à adapter ; **différé** |
| Distinguer terrain observé et hors champ | Homographie disponible, mais pas de polygone caméra affiché | Inversion d'homographie OpenCV/Three.js | Aucun nouveau modèle ; coût géométrique faible | Calibration et intersections à valider ; ne pas extrapoler les joueurs hors champ | Compatible avec le panneau **3D dans la vidéo** ; différé |
| Segmentation des silhouettes : annotations plus fines | Boîtes déjà synchronisées et sélectionnables | YOLO segmentation ; modèle spécialisé à trouver et licencier | Masques plus coûteux en GPU et disque ; coût RTX 2050 non mesuré | Gain tactique faible pour cette phase ; effort moyen/fort | Possible sans stocker tous les masques ; différé |
| Noms et numéros : recherche par joueur réel | Nos étiquettes sont des identifiants de suivi | OCR spécialisé, effectif vérifié, association et réidentification | Nouveaux modèles et inférences ; coût non mesuré | Les échanges visibles dans la référence interdisent de présumer une identité fiable | Évidence temporelle nécessaire ; différé |
| Réduire les échanges d'identité après masquage ou mouvement de caméra | ByteTrack peut fragmenter ou échanger des trajectoires | BoT-SORT avec compensation caméra ; OC-SORT | Compensation sur CPU possible ; ReID ajouterait mémoire et latence | Nécessite vérité terrain et mesure IDF1/HOTA, pas seulement un compte d'IDs | Tester hors de la chaîne stable ; aucun modèle ReID lourd ajouté |

La carte 2D sous la diffusion n'est pas retenue. Le terrain Three.js reste directement dans
la vidéo, avec placement automatique, déplacement, taille, rotation, zoom, verrou et réduction.
Les métriques d'équipe entière ou une possession certaine ne sont pas déduites de joueurs
partiellement visibles.

## 3. Composants et licences vérifiés

| Composant | Source primaire / licence déclarée | Usage décidé |
| --- | --- | --- |
| SigLIP base patch16 224 | [Fiche Hugging Face](https://huggingface.co/google/siglip-base-patch16-224), Apache-2.0 | Modèle déjà en cache ; cadrage sur le torse conservé |
| Roboflow Sports | [Licence](https://github.com/roboflow/sports/blob/master/LICENSE), MIT | Extraction et regroupement existants conservés |
| Roboflow Trackers | [Licence](https://github.com/roboflow/trackers/blob/develop/LICENSE), Apache-2.0 | ByteTrack 2.7.0 déjà installé ; horodatages et journal de relecture |
| ByteTrack original | [Dépôt officiel](https://github.com/FoundationVision/ByteTrack), MIT | Référence de la méthode ; aucune nouvelle dépendance |
| BoT-SORT original | [Dépôt officiel](https://github.com/NirAharon/BoT-SORT), MIT | Piste de compensation caméra ; licences des poids ReID à contrôler séparément |
| OC-SORT | [Dépôt officiel](https://github.com/noahcao/OC_SORT), MIT | Piste fondée sur le mouvement, sans modèle d'apparence obligatoire |
| scikit-learn | [Voisins](https://scikit-learn.org/stable/modules/neighbors.html), BSD-3-Clause | Dépendance existante ; prédiction des groupes figés |
| SQLite / zlib | [SQLite](https://www.sqlite.org/copyright.html), domaine public ; bibliothèque standard Python | Persistance transactionnelle et compression ; aucune installation ajoutée |
| Détection football sur Hugging Face | [gianpaj/football-players-detection-1](https://huggingface.co/gianpaj/football-players-detection-1), AGPL-3.0 annoncée | Alternative étudiée, non téléchargée ; pas de preuve de gain sur nos vidéos |
| Poids football actuels | [Recherche existante](opensource-research.md) | Conservés ; aucune licence n'est déduite de celle d'une interface de démonstration |

Aucun nouveau paquet ni poids n'a été téléchargé. Les licences d'un outil, de ses poids et
de ses données doivent être examinées séparément. Les conditions des anciennes vidéos DFL
restent non vérifiées : fichiers privés, aucune nouvelle redistribution.

## 4. Validation et suites

Les mesures et leurs limites sont consignées dans [l'architecture incrémentale](analyse-incrementale.md).
Les fixtures synthétiques servent aux transactions, horloges, interruptions et bornes mémoire.
Les vidéos réelles servent au contrôle des maillots et au temps d'analyse. Ces deux protocoles
ne sont pas interchangeables.

La prochaine étape de recherche utile est une comparaison de suivi sur des séquences annotées,
puis une évaluation de possession distincte, avec partage des matchs entre apprentissage et test.
Elle ne doit pas retarder la fiabilisation du stockage et de la lecture actuels.
