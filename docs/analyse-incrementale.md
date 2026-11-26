# Analyse incrémentale du visualiseur

État : 23 novembre 2026. Assistance à l'implémentation : voir ATTRIBUTION.md (§4).

## 1. Chemin de traitement

La commande et le serveur utilisent désormais `analyse_to_store`, dans
`analysis/football_analysis/incremental_pipeline.py`. L'ancienne fonction `analyse_video`
reste disponible pour les comparaisons sur petits clips. Elle construit toujours un document
en mémoire ; elle n'est plus appelée par le serveur ni par la commande habituelle.

1. Vérifier l'empreinte de la source, des poids, du code d'analyse, des options et des dépendances.
2. Décoder séquentiellement, détecter, suivre et calibrer. Valider un segment SQLite à la fois.
3. Publier aussitôt ses images avec équipes inconnues : elles sont consultables avant la fin.
4. Relire une réserve initiale de maillots et apprendre les deux équipes une seule fois, avec un groupe
   « autres » sans équipe quand il est démontré (arbitres, stadiers).
5. Classer les segments, conserver les votes récents et calculer les distances cumulées.
6. Calculer les indicateurs par lecture séquentielle ; valider ensuite le marqueur de fin.

L'étape d'équipes suit actuellement la détection complète. La vidéo et les positions peuvent
être consultées pendant la détection ; les équipes sont publiées dans une seconde passe.
Ce choix libère les modèles YOLO avant SigLIP sur la RTX 2050. Il ne constitue pas une chaîne
de classification en direct déjà opérationnelle.

## 2. Stockage et bornes

| Élément | Borne en mémoire / persistance |
| --- | --- |
| Images vidéo | Une image décodée et le petit contexte de PySceneDetect ; aucune image dans SQLite |
| Segments | 10 s par défaut, configurables entre 0,5 et 30 s ; garde-fou de 7 200 images analysées |
| Maillots | 64 trajectoires × 8 images au maximum ; dimension maximale de 256 px ; sélection et torse SigLIP conservés |
| Référence des équipes | Au plus 512 plongements et leurs étiquettes dans un NPZ sans objets Python ; aucun poids profond sauvegardé |
| Votes récents | 128 trajectoires × 32 votes au maximum ; les références des deux équipes persistent |
| Associations ByteTrack | Correspondances vivantes uniquement ; compteur global croissant, sans réutilisation d'ID |
| Trajectoires terminées | Résumés sur disque, lus par identifiant ; aucun dictionnaire Python de tout le match |
| Mesures de qualité | SQLite temporaire avec cache de 4 Mio ; quantiles exacts triés sur disque |
| Navigateur | Une fenêtre de 17 s au plus, plus les deux images voisines ; requêtes dépassées annulées |

La base conserve les segments bruts, les détections nécessaires à leur relecture, les segments
publiés, les trajectoires résumées et les petits états de reprise. Les segments JSON sont
compressés par zlib. SQLite utilise WAL, `synchronous=FULL` et un cache de 8 Mio. Les fichiers
`-wal` et `-shm` appartiennent à la base ouverte : ne pas copier ou supprimer isolément une base
en cours d'écriture. Le fichier principal est autonome après fermeture normale de ses connexions.

Le volume disque augmente avec la durée. La réserve de maillots, les plongements, les votes et
les images décodées n'augmentent pas avec le nombre de segments. Le suivi synthétique de charge
et son journal sont inclus dans les mesures de taille ci-dessous.

## 3. Reprise et identité

La transaction d'un segment brut contient ses images, ses détections, les votes de rôle et son
point de reprise. Numéros de segments, indices et instants doivent être strictement croissants.
Un arrêt entre cette transaction et l'aperçu est réparé à la prochaine ouverture de traitement.
Une création de base interrompue peut également être recommencée tant qu'elle ne contient aucune donnée.

Pour restaurer ByteTrack et PySceneDetect, le traitement redécode le préfixe de la vidéo et rejoue
les détections enregistrées. Les modèles de détection ne sont pas réexécutés sur ce préfixe.
Les identifiants, instants et coupures rejoués sont comparés au journal. Un écart arrête la reprise
et conserve les données. Cette restauration consomme un temps proportionnel au préfixe ; elle
n'est pas instantanée, mais ne demande pas une mémoire proportionnelle à sa durée.

La transaction de classification conserve ensemble images publiées, distances, votes et curseur.
Les images d'un segment peuvent remplacer son aperçu sans être ajoutées une deuxième fois.
Un arrêt après finalisation SQLite et avant l'état du travail ne force aucune nouvelle inférence.
Une base n'est marquée complète qu'après publication de tous les segments et classement des équipes.

La référence des équipes est rechargée à partir des tableaux déjà appris, sans nouvel UMAP ou
KMeans : les étiquettes 0 et 1 ne peuvent pas être permutées par un réapprentissage à la reprise.
Ces étiquettes ne signifient pas automatiquement domicile et extérieur. Les gardiens gardent
le vote géométrique existant. Les nouvelles observations utilisent des voisins pondérés dans
le même espace SigLIP et un vote temporel borné. La part des votes n'est pas une probabilité
calibrée de bonne reconnaissance. Les observations ambiguës ou insuffisantes restent inconnues.

Un changement de caméra termine les trajectoires de ce plan et efface leur contexte de mouvement.
Les références de maillots restent communes. Il n'y a pas de réidentification d'un joueur entre
plans. Depuis le 24 novembre, un contrôle aux contacts masqués corrige, avant la publication des
équipes, les échanges d'identifiants entre joueurs de maillots différents quand les maillots le
prouvent ([identites-contacts.md](identites-contacts.md)) ; un échange entre coéquipiers peut
encore se produire sans être vu. Une tenue nouvelle peut aussi être mal classée : le vote ne
constitue pas un détecteur général de données hors distribution.

## 4. Horodatages et contrat

Les messages gardent le contrat `football-tracking`, version 1 : `index` est le numéro source,
`time` l'instant du conteneur en secondes, `shot` le plan, avec boîtes et positions inchangées.
Le découpage est fondé sur les instants, pas sur une durée calculée seulement depuis les indices.
ByteTrack reçoit désormais ces instants réels, y compris à cadence variable.

`FrameClock` refuse les valeurs non finies ou non croissantes. Son repli à la cadence nominale
reste monotone et est déclaré dans `source.timestamps`. En cas de repli, la cadence fixe n'est
pas présumée et la synchronisation VFR ne peut pas être garantie. Même avec des instants valides,
le navigateur sans rappel d'image à l'arrêt conserve la limite de synchronisation documentée
pour les vidéos VFR. La dernière durée est estimée avec une durée d'image nominale.

`distanceM` est une donnée additive facultative : distance cumulée au moment de cette observation,
sans saut >12 m/s, sans trou >0,5 s et sans liaison entre plans. Elle évite de recalculer le passé
d'un joueur à partir de la seule fenêtre actuellement chargée. Elle ne garantit pas son identité.

## 5. API et lecture

| Adresse | Réponse |
| --- | --- |
| `GET /api/analyses/<id>/manifest` | En-tête compact, équipes, qualité si disponible, `complete`, disponibilité et révision ; aucune liste intégrale d'images ou de trajectoires |
| `GET /api/analyses/<id>/frames?from=12&to=29&selected=7` | Fenêtre d'au plus 30 s, deux voisines pour l'interpolation, résumés présents et sélection |
| `POST /api/analyses/<id>/resume` | Reprise explicite d'un travail interrompu ou en échec avec base récupérable ; 409 s'il est déjà en file/en cours |
| `GET /api/analyses/<id>/tracking` | Export JSON séquentiel après finalisation seulement ; 409 si incomplet |
| `GET /api/analyses/<id>/video` | Vidéo originale avec Range, sans changement |

Le visualiseur utilise le manifeste et les fenêtres. L'export complet sert à la compatibilité
des outils, pas à la lecture des nouvelles analyses. Les anciens petits résultats JSON restent
lisibles avec le chemin historique ; ils ne sont pas convertis automatiquement.

Le rendu ne bloque pas pendant une lecture réseau. Une réponse dépassée ne remplace pas la
dernière recherche. Une fenêtre ancienne n'est pas dessinée à un instant éloigné. La sélection,
les traces, la vitesse et le placement automatique restent synchronisés. Le panneau Three.js
reste **dans la vidéo**. Le téléversement ouvre automatiquement les premiers segments disponibles.
Une analyse interrompue indique la plage disponible et permet sa reprise avec le bouton dédié.

Au redémarrage, les vidéos déjà en attente restent remises en file. Un ancien travail en cours
avec base devient `interrupted`, avec reprise proposée : il n'est pas relancé en boucle. Les
réglages, versions et source doivent correspondre au point de reprise. Les traitements sont
toujours sérialisés par un seul travailleur.

## 6. Mesures du 23 novembre 2026

Preuves chiffrées et protocoles : `docs/validation-incrementale-2026-11-23.json` et
`analysis/validation/`. Aucune vidéo privée ni poids ne figure dans le dépôt.

### Vidéo réelle, chaîne complète

RTX 2050, clip `573e61_0`, 30 s à 25 images vidéo/s, échantillonnage à 12,5 images/s, SigLIP.
Référence historique `1734b8b`, puis nouvelle chaîne, processus distincts, aucune autre analyse
GPU lancée simultanément. Un premier passage incrémental exploratoire a précédé le passage final.

| Mesure | JSON historique | Segments SQLite |
| --- | ---: | ---: |
| Images analysées | 375 | 375 |
| Temps modèles + images + équipes | 221,63 s | 193,57 s |
| Temps d'images | 150,67 s | 132,56 s |
| Images analysées par seconde de l'étape d'images | 2,49 | 2,83 |
| Images analysées par seconde, modèles et équipes inclus | 1,69 | 1,94 |
| Temps de traitement / durée vidéo | 7,39 | 6,45 |
| Pic RAM échantillonné du processus | 2 636 Mio | 2 643 Mio |
| Pic GPU alloué par PyTorch | 627 Mio | 627 Mio |
| Fichier de résultats | 1 453 447 octets | 1 196 032 octets |
| Audit interne des maillots | 61 justes, 0 fausse, 0 inconnue | 61 justes, 0 fausse, 0 inconnue |

La petite hausse de RAM n'est pas un gain mémoire sur ce clip. TensorFlow visible par UMAP
dans cet environnement domine toujours la mémoire du processus. Les temps proviennent de
passages uniques, avec caches et environnement de bureau non contrôlés. Aucun gain algorithmique
de détection n'est attribué à l'écart observé. Les phases mesurées n'incluent pas le lancement
de Python, la vérification initiale des empreintes ni l'export JSON facultatif. Le pic GPU est
une allocation PyTorch, pas la mémoire totale du pilote et des applications du bureau.

Le contrôle complet du clip conserve les 375 images, instants, coupures, détections, rôles,
calibrations, positions et ballons identiques, hors nouvelle distance cumulée et données d'équipe.

Deux autres passages complets utilisent des segments de 5 s : le montage de 24 s conserve ses
coupures à **8,00 et 16,00 s** et ses 51 maillots audités sans erreur ni inconnue ; la vidéo VFR
de 10,021 s conserve 37 maillots justes et 4 inconnus sur 41. Les instants des **375 + 300 + 167
images analysées** ont aussi été comparés aux PTS d'un décodage indépendant PyAV : écart maximal
mesuré **0 s**, à la précision des instants stockés. Le nombre d'IDs VFR passe de 32 à 26 ; ce
nombre seul ne mesure pas la précision d'identité.

### Équipes sur huit vidéos réelles

Le protocole `validate_chunked_teams.py` fige les détections/IDs des huit résultats v4 et relit les
maillots des vidéos. Il préserve **3 erreurs et 13 inconnues sur 446 observations annotées**,
contre les mêmes nombres avant segmentation. Aucun clip ne régresse dans cet audit interne.
Il s'agit de petites séquences déjà utilisées : cela ne prouve pas la généralisation à des matchs
inédits, à des tenues absentes de l'amorçage, ni la précision d'identité.

Un essai distinct limite l'amorçage à 10 s et prédit les images suivantes avec les références
figées. Sur les **269 observations strictement après 10 s**, les deux méthodes font zéro erreur,
mais les inconnus passent de **6 à 9**. Sur les 446 observations, comprenant celles de l'amorçage,
le total devient zéro erreur et 13 inconnus. Deux clips ajoutent toutefois des abstentions,
dont une sur le clip soleil/ombre : le critère strict de non-régression par clip échoue.
**L'amorçage de 30 s reste donc la valeur par défaut.** Ce contrôle limité ne garantit pas
la reconnaissance de tenues ou angles absents du début d'un match.

### Équipes des clips courts et groupe « autres » (26 novembre 2026)

**Défaut corrigé.** La réserve d'apprentissage des maillots s'arrête à 64 trajectoires. Un joueur
apparu ensuite n'avait aucun vote tant que l'amorçage (30 s) n'était pas fini, donc jusqu'à la fin
d'un clip plus court que l'amorçage. Il restait sans équipe sur toute sa durée. Sur Samsunspor–Trabzonspor (15,3 s,
suivi très fragmenté), la réserve était pleine dès 4,3 s. 46 joueurs suivis au moins huit images
restaient alors sans équipe, et seules 44,8 % des observations de joueurs avaient une équipe. Pendant
l'amorçage, ces joueurs sont désormais prédits par les voisins figés, comme après l'amorçage
(`classify_chunks`, `BoundedCrops(wanted=…)`). Le contrôle des masquages compte toujours toutes les
boîtes de l'image. Après correction, 93,0 % des observations de ce clip ont une équipe. Test de
non-régression : `test_players_beyond_the_fit_reserve_get_a_team_during_warmup`, qui échoue sur
l'ancien code. Mêmes détections, même référence : 86,7 → 96,2 % sur Samsunspor–Fenerbahçe et
52,5 → 89,7 % sur Brésil–Afrique du Sud. Les clips dont tous les joueurs entrent dans la réserve
(Samsunspor–Rizespor, France–Allemagne) ne changent pas.

**Groupe « autres ».** Le détecteur range parfois gardiens, arbitres et stadiers parmi les joueurs.
Un regroupement en trois est essayé (`split_teams`). Son plus petit groupe ne vote pour aucune équipe
s'il réunit au plus 15 % des images et si les deux grands groupes ne sont pas plus proches entre eux que
de lui. Sur Samsunspor–Rizespor, deux gardiens en noir et trois stadiers quittent ainsi l'équipe
blanche et rouge, et aucun joueur n'est écarté. Sur les huit vidéos de l'audit, le plus petit des trois
groupes réunit 17,6 à 26,0 % des images : la règle ne s'y applique pas.
**Limite constatée** sur Samsunspor–Altınordu : les deux équipes (blanche, rayée noir et rouge) sont
plus proches l'une de l'autre que des arbitres en cyan. Le regroupement en deux y oppose donc
« arbitres » et « joueurs », et les équipes restent fausses. Le verdict « équipes fausses » est affiché
dans la galerie. Isoler ce groupe malgré tout traiterait de la même façon une petite équipe face à une
équipe coupée en deux par l'ombre ; un détecteur d'arbitres fiable reste la vraie solution.

**Non-régression.** Le protocole `validate_chunked_teams.py` a été relancé sur le code final, avec les
mêmes suivis figés et les mêmes annotations : **444 justes, 0 erreur, 2 inconnus sur 446 observations**,
identique clip par clip au contrôle du 24 novembre ; aucun échec du critère strict par clip. Sur ces huit
clips, 21 à 64 joueurs apparaissent pendant l'amorçage : tous tiennent dans la réserve, et la correction
des clips courts n'y change rien. Elle est contrôlée par le test ci-dessus et par les démonstrations.
Le groupe « autres » ne s'y applique pas non plus (plus petit des trois groupes entre 17,6 et 26,0 %). Résultats :
[validation-equipes-2026-11-26.json](validation-equipes-2026-11-26.json).

### Charge de stockage synthétique, sans modèle

22 objets par image, 25 images vidéo/s, 12,5 images de suivi/s. Chaque cas tourne dans un
processus neuf. La génération est contrôlée, avec des positions mobiles ; ce ne sont pas des
trajectoires football ni une mesure d'inférence. Les bases gardent aussi le journal de suivi.

| Durée représentée | Format | Images de suivi | Pic RAM | Stockage | Génération et écriture |
| --- | --- | ---: | ---: | ---: | ---: |
| 180 s | JSON en mémoire | 2 250 | 74,80 Mio | 7 691 610 octets | 0,575 s |
| 5 400 s | JSON en mémoire | 67 500 | 1 279,60 Mio | 230 901 941 octets | 24,276 s |
| 180 s | SQLite par segments | 2 250 | 41,38 Mio | 2 801 664 octets | 3,054 s |
| 5 400 s | SQLite par segments | 67 500 | 49,60 Mio | 82 665 472 octets | 128,741 s |

L'écriture durable et les résumés incrémentaux coûtent davantage dans ce test de stockage.
Le bénéfice recherché est la mémoire bornée et la récupération des segments validés. Les tailles
ne prédisent pas exactement celles d'un vrai match, dont les détections et le journal varient.

### Vérifications automatiques

Les tests Python contrôlent transactions, interruption de création, arrêt entre validation et
aperçu, reprise de détection et d'équipes sans doublon, votes persistants, coupure au milieu d'un
segment, timestamps VFR, repli monotone, limite des maillots et libération des IDs terminés.
Les mesures séquentielles sont comparées aux indicateurs historiques exacts.

Les tests Node parcourent 100 instants d'un suivi synthétique de 90 minutes en gardant au plus
215 images et une trajectoire. Ils contrôlent annulation des réponses tardives, erreurs réseau,
interpolation, coupures, passé cumulé et refus de données futures.

Chrome vérifie les interactions existantes du terrain 3D et une fixture de 36 s : chargement
par fenêtres, déplacement éloigné et retour rapide, absence d'anciennes annotations, résultat
incomplet, reprise et anciens JSON. Ces essais sont automatisés ; aucun essai physique sur
téléphone n'est ajouté.

Résultat final : **68 tests Python, 204 tests Node et 101 vérifications Chrome**, dont 79 AR et
22 visualiseur. La lecture est exacte sur les 133 images peintes du dernier passage. Le contrôle
de coquille conserve `SHELL_VERSION = 0cabdc0abc04da44`. Un premier passage complet avait donné
5 échecs et 16 contrôles ignorés ; la répétition complète passe sans modification des fichiers AR.
La cause du premier échec n'est pas établie. Les deux résultats sont conservés dans le rapport JSON.

## 7. Commandes

Depuis `analysis/` :

```powershell
.venv\Scripts\python -m football_analysis analyse match.mp4 -o match.tracking.sqlite --chunk-seconds 10
# La même commande reprend la même base avec les mêmes options.
.venv\Scripts\python -m football_analysis analyse match.mp4 -o match.tracking.json
# Conserve une base match.tracking.sqlite et exporte le JSON sans matérialiser tout le suivi.
.venv\Scripts\python -m football_analysis serve --chunk-seconds 10 --team-fit-seconds 30
.venv\Scripts\python -m football_analysis serve --jobs data/jobs-test --port 8766
.venv\Scripts\python -m unittest discover -s tests
.venv\Scripts\python -m validation.validate_chunked_teams
.venv\Scripts\python -m validation.measure_chunk_storage sqlite --seconds 5400 --output data/runs/charge.sqlite
```

Pour refaire une mesure dans un processus neuf, choisir un nouveau chemin de sortie ; une base
terminée est volontairement réutilisée sans refaire d'inférence. Les vidéos de validation et
les anciens résultats v4 doivent déjà exister pour le contrôle des équipes. Aucune commande
ne télécharge automatiquement ces vidéos.

## 8. Portée et direct futur

Le stockage et la lecture ont une validation de charge synthétique de 90 minutes. L'inférence
sur un vrai match de cette durée, les longs changements de tenue et les nombreux retours après
masquage restent non validés. La segmentation ne rend pas les modèles temps réel sur la RTX 2050.

Le contrat horodaté, le repère d'équipes persistant, le traitement par segments et la lecture
bornée préparent une ingestion continue. Il faudra ensuite intercaler l'amorçage et les votes
dans l'ingestion, sans attendre la fin du fichier, choisir la latence acceptable et mesurer les
pertes de suivi. Aucun serveur de diffusion, WebSocket ou prédicteur de possession n'est ajouté.

## 9. Travail parallèle et migration `.mjs`

Le travail continue dans `footballsimulator`, branche `feature/visualiseur-match`. Claude dispose
de `../fs-ux`, branche `feature/ux-fleches-mjs`. Aucun changement de branche dans son dossier,
aucune suppression de modifications, fusion, rebase ou cherry-pick n'a été effectué.

| Import direct du visualiseur | Consommateur | Effet possible de la migration |
| --- | --- | --- |
| `src/config.js` | `overlay-pitch.js` | Mettre à jour le chemin ; contrôler dimensions et échelles |
| `src/ball.js` | `overlay-pitch.js` | Chemin et contrat de création du ballon |
| `src/pitch.js` | `overlay-pitch.js` | Chemin, dimensions et structure du terrain |
| `src/players.js` | `overlay-pitch.js` | Chemin, groupes et sélection des joueurs |
| `src/pointer-input.js` | `overlay-pitch.js` | Chemin et sémantique de `isTap` après les corrections tactiles |
| `src/raycasting.js` | `overlay-pitch.js` | Chemin et fonctions de sélection |
| `src/tactical-arrows.js` | `overlay-pitch.js` | Chemin et contrat de `buildArrowGeometry`, distinct des commandes AR |
| `src/webgpu.js` | `overlay-pitch.js` | Chemin et création WebGPU, sans repli WebGL |
| `src/events.js` | `overlay-frame.js` | Chemin et émetteur d'événements |

Les imports transitifs de ces fichiers utilisent aussi `config.js` et `raycasting.js`. Les fichiers
vendor Three.js restent des bibliothèques tierces `.js`. Aucun de ces neuf fichiers partagés
n'est modifié ni renommé ici. Le nouveau magasin paginé appartient au visualiseur et utilise
`.mjs` ; le serveur reconnaît ce type MIME. Les modules existants restent à leurs chemins actuels.

Au relevé des branches en cours, les deux chemins communs aux diffs de PR #15 et de Claude sont
`tests/run-tests.mjs` et `tests/unit/documentation.test.mjs`. Ils ne sont pas modifiés dans ce suivi,
mais leur rapprochement futur devra conserver l'appel des tests du visualiseur et le contrôle
de ses en-têtes. Les modifications actuelles de Claude continuent indépendamment de ce relevé.

### Relevé du 24 novembre 2026, après la fusion académique (PR #16, `main` = `27eff23`)

`main` utilise désormais les modules `.mjs`. Codex travaille sur la barre latérale académique dans
`../fs-sidebar` (branche `feature/espaces-coaching-sidebar`) ; ce dossier, `main` et
`../fs-main-deployment` ne sont pas modifiés par ce suivi. Aucune fusion, rebase ni
cherry-pick de `main` ou de cette branche n'est fait ici. Exigences vérifiées pour l'intégration future :

| Point | État sur `main` | Adaptation nécessaire |
| --- | --- | --- |
| Neuf imports partagés | `config.mjs`, `ball.mjs`, `pitch.mjs`, `players.mjs`, `pointer-input.mjs`, `raycasting.mjs`, `tactical-arrows.mjs`, `webgpu.mjs`, `events.mjs` | Changer seulement les chemins dans `overlay-pitch.js` et `overlay-frame.js` |
| Exports utilisés | `isTap`, `pickTarget`, `pointerToNdc`, `setRayFromCamera`, `buildArrowGeometry`, `createWebGpuRenderer`, `createBall`, `createPitch`, `PlayerFactory`, `EventEmitter`, constantes de `config` : présents, mêmes signatures | Aucune ; `findTargetOnRay` et `INVALID_COLOR` sont des ajouts non utilisés ici |
| Contrôle `tests/unit/migration-mjs.test.mjs` | Refuse tout `.js` du projet hors `sw.js` et `src/vendor` | Renommer aussi les modules du visualiseur (`src/visualizer/*.js`) en `.mjs`, puis `visualizer.html`, les tests et le contrôle documentaire |
| `tests/unit/documentation.test.mjs` | Portée `sw.m?js`, `src/*.mjs`, `tests/` | Ajouter `src/visualizer/*.mjs`, `visualizer.html` et `src/visualizer/visualizer.css` |
| `tests/run-tests.mjs` | Lanceur AR étendu (règles des flèches, interface, migration du Service Worker) | Conserver l'appel des tests du visualiseur |
| Service Worker | `sw.mjs` (module) et script de migration `sw.js` à la racine | Aucun : le serveur Python ne sert que `visualizer.html`, `src/` et `assets/` ; ni `sw.js` ni `sw.mjs` ne peuvent s'y installer |
| Test unitaire du visualiseur | Importe `../../src/config.js` | Passer à `config.mjs` |

**Après la fusion académique décidée par l'utilisateur :** créer un travail d'intégration distinct,
relever les nouveaux exports, adapter seulement les imports consommateurs du visualiseur, traiter
les éventuels conflits du lanceur et du contrôle documentaire, puis refaire les tests AR et
visualiseur. Les commandes et contraintes des flèches AR ne doivent pas être contournées pour
accommoder les flèches de vitesse du visualiseur. La fusion de PR #15 reste une décision explicite
de l'utilisateur. `main`, son Service Worker et `ATTRIBUTION.md` ne sont pas modifiés ici.


### Compléments du 24 novembre 2026 : démonstration, Service Worker et sept espaces

Relevés sans modifier `main` (détail : [visualiseur-modes.md](visualiseur-modes.md), partie 8) :

- **Service Worker** : `sw.mjs` de `main` met en cache toute réponse `GET` réussie de la même origine,
  réponses partielles `206` comprises, que `cache.put` refuse. Sous son contrôle, la lecture des vidéos
  du visualiseur échouerait. Il faut le faire passer à côté des requêtes `Range`, de `demo/` et de
  `api/`, puis recalculer `SHELL_VERSION` et rejouer la démonstration sous son contrôle.
- **Sept espaces de travail** : le visualiseur reste une page séparée ; un lien depuis « Plus
  d'outils » suffit. Aucune scène ni historique tactique partagés.
- **Démonstration** : `demo/` (2,2 Mo, données synthétiques seulement) devient public avec `main`.
