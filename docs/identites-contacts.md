# Échanges d'identifiants : diagnostic et contrôle aux contacts

État : 24 novembre 2026. Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
Preuves chiffrées : [validation-identites-2026-11-24.json](validation-identites-2026-11-24.json) ;
vidéos et bases dans `analysis/data/`, hors du dépôt.

## 1. Diagnostic

L'audit interne des maillots ([analysis/validation/](../analysis/validation/README.md), 446
observations lisibles sur huit clips) gardait **3 équipes fausses et 13 inconnues**. Elles
viennent toutes de quatre paires de trajectoires dont le maillot annoté change entre deux instants
de l'audit, en sens inverse pour les deux trajectoires de la paire :

| Clip | Paire (identifiants v4) | Contact | Effet dans l'audit |
| --- | --- | --- | --- |
| `roboflow-dfl-2e57b9_0` | 1 et 15 | 6,56 à 8,88 s | 2 fausses |
| `roboflow-dfl-2e57b9_0-720p30` | 12 et 19 | 11,00 à 11,73 s | 6 inconnues |
| `test-vfr-2e57b9` | 1 et 7 | 6,52 à 8,88 s | 4 inconnues |
| `roboflow-dfl-121364_0` | 4 et 22 | 8,16 à 8,88 s | 1 fausse, 3 inconnues |

Les trois clips `2e57b9` montrent la même scène (original, copie 720p, copie à cadence variable).
Chaque fois, les deux joueurs, de maillots différents :

1. se rapprochent à moins d'un mètre sur le terrain ;
2. ont des boîtes qui se chevauchent (IoU de 0,1 à 0,5), avec une confiance de détection en baisse ;
3. ne sont plus vus qu'une fois par le détecteur pendant au moins une image (détection fusionnée) ;
4. se séparent : ByteTrack, qui n'associe que par position, rend l'identifiant au mauvais joueur.

Aucun saut de position ne trahit l'échange : les deux joueurs sont côte à côte. Le filtre des
déplacements de plus de 12 m/s ne le voit donc pas. Après l'échange, la trace, la vitesse, la
distance cumulée et la sélection vidéo/3D suivent l'autre joueur, sans signal. Les mouvements de
caméra et les coupures ne sont pas en cause dans ces quatre cas : un seul plan, caméra lente.

**Fréquence.** Avec IoU ≥ 0,1, les huit clips de 30 s comptent 9 à 47 contacts ; ceux où un joueur
disparaît pendant le contact sont 4 à 10 par clip (environ un toutes les 4 s). Les quatre échanges
en font partie.

## 2. Composants éprouvés évalués

| Composant | Ce qu'il apporte | Décision |
| --- | --- | --- |
| BoT-SORT, OC-SORT, C-BIoU, McByte | Déjà dans `trackers` 2.7.0 (Apache-2.0) : compensation de caméra, observations corrigées, IoU tamponné | Rejoués sur les détections enregistrées (§5) |
| GTA-Link (Sun et al., ACCV 2024, MIT) | Sépare les trajectoires qui contiennent deux identités, puis relie les fragments | Idée du séparateur reprise ; son code exige `torchreid` et des poids OSNet : non installés |
| Réidentification (OSNet, BoT-SORT ReID) | Apparence générale, utile même entre coéquipiers | Nouveau modèle et nouveaux téléchargements : écartée sans preuve de besoin |

**Suiveurs rejoués** (`python -m validation.compare_trackers`). Les détections enregistrées des deux
clips d'origine sont rejouées sur le processeur, avec les réglages par défaut et une reprise à
chaque coupure. « Mixtes » : identités qui portent deux maillots annotés dans l'audit. Le nombre
d'identifiants mesure la fragmentation, pas la précision.

| Suiveur | `2e57b9_0` : mixtes / identifiants / temps | `121364_0` : mixtes / identifiants / temps |
| --- | --- | --- |
| ByteTrack (actuel) | 2 / 31 / 1,6 s | 2 / 27 / 1,8 s |
| BoT-SORT + compensation de caméra | 1 / 29 / 13,9 s | 1 / 35 / 13,5 s |
| OC-SORT | 0 / **67** / 2,6 s | 0 / 36 / 2,3 s (1 observation annotée non suivie) |
| OC-SORT + compensation de caméra | 1 / 31 / 12,9 s | 1 / 32 / 12,5 s (1 non suivie) |
| C-BIoU | 2 / 33 / 2,4 s | 0 / 26 / 2,6 s |
| McByte + compensation (sans masques) | 2 / 28 / 6,0 s | 1 / 29 / 5,8 s |
| **ByteTrack + contrôle aux contacts** | **0 / 31** / 1,6 s + 6,0 s de contrôle | **0 / 27** / 1,8 s + 6,7 s |

Aucun suiveur installé ne supprime les deux échanges sans contrepartie. OC-SORT les évite en
fragmentant (67 identifiants contre 31 sur `2e57b9_0`) ; C-BIoU ne corrige qu'un clip ; BoT-SORT et
McByte en laissent un, pour 4 à 8 fois le temps de suivi. Changer de suiveur demanderait aussi de
revalider tout le reste. ByteTrack est donc conservé, avec le contrôle aux contacts.

## 3. Méthode retenue

Le contrôle (`analysis/football_analysis/identity.py`) s'exécute après la référence des équipes et
avant la publication des équipes. Il réutilise le repère de maillots déjà appris (SigLIP et voisins
figés) : aucun nouveau modèle.

1. **Contacts masqués.** Deux joueurs dont les boîtes se chevauchent (IoU ≥ 0,1). Le contact se
   prolonge tant qu'elles se rechevauchent dans les 0,5 s, ou qu'un des deux est absent depuis moins
   de 1 s. Seuls les contacts pendant lesquels un joueur disparaît au moins une image sont gardés. Un
   contact ne traverse jamais une coupure de plan.
2. **Fenêtres de preuve.** Pour chaque joueur : 2 s avant et 2 s après le contact, dans le même plan,
   sans déborder sur son contact précédent ou suivant. Quatre maillots nets au plus par fenêtre
   (24 px de haut au moins, 30 % au plus masqués), classés par le repère figé.
3. **Verdict d'une fenêtre.** Trois votes nets au moins, et 75 % pour une équipe, abstentions
   comprises ; sinon, la fenêtre ne décide rien.
4. **Décision.**
   - Les deux joueurs changent de maillot en sens inverse : **échange**, les identités sont
     rétablies après le contact.
   - Un seul change : la suite reçoit un **nouvel identifiant**, sans lien deviné vers l'autre.
   - Maillots identiques, preuve insuffisante, ou contact simultané avec un troisième joueur
     (« crowded ») : **rien ne change**.
5. **Pendant un contact corrigé**, qui est qui n'est pas connu : l'observation porte
   `"identity": "uncertain"` et n'a pas d'équipe. Le visualiseur n'y affiche pas de vitesse, et
   signale la distance comme une estimation.
6. **Équipes des identités corrigées.** Elles sont tirées de leurs seuls votes de preuve. Le vote
   du regroupement initial d'une trajectoire échangée mélange deux joueurs : il est remplacé.

Le plan (corrections, preuves, résumé) et les résumés des trajectoires corrigées sont validés dans
une seule transaction SQLite, avant toute publication d'équipe. Une reprise le relit sans refaire
de prédiction. Les identifiants finaux sont appliqués image par image : un segment repris au milieu
de l'analyse retrouve les mêmes identifiants. Les nouveaux identifiants commencent après le plus
grand identifiant enregistré.

## 4. Résultats sur l'audit interne (suivis v4 figés)

Protocole `python -m validation.validate_chunked_teams` : mêmes détections et identifiants v4,
segments de 10 s, référence des équipes sur 30 s, SigLIP, puis `python -m validation.summarise_identity`.
Les observations annotées sont retrouvées par leur boîte, puisqu'une identité corrigée change de numéro.

| Mesure, 446 observations | Avant (segments) | Après |
| --- | ---: | ---: |
| Maillots justes | 430 | **444** |
| Faux | 3 | **0** |
| Inconnus | 13 | **2** |
| Identités portant deux maillots annotés | 8 | **0** |
| Observations marquées incertaines | 0 | 2 |
| Échanges corrigés | — | 4 (les quatre connus) |
| Séparations | — | 0 |

Les deux inconnues restantes sont l'instant 8,0 s de la copie à cadence variable : il tombe **dans**
le contact corrigé (6,52 à 8,88 s), où l'identité est volontairement incertaine. Aucun clip ne
régresse ; les quatre clips sans échange ne reçoivent aucune correction.

### Chaîne complète, détections neuves

Les deux clips d'origine contenant un échange ont été analysés deux fois par la chaîne complète,
dans des processus neufs, sans autre analyse GPU simultanée (RTX 2050, segments de 10 s, SigLIP) :
la version `4f62247` (avant), puis la version avec contrôle (après). Comparaison :
`python -m validation.compare_full_runs`.

| Clip | Faux | Inconnus | Identités à deux maillots | Contrôle d'identité | Traitement total |
| --- | ---: | ---: | ---: | ---: | ---: |
| `roboflow-dfl-2e57b9_0` | 2 → 0 | 0 → 0 | 2 → 0 | 6,04 s | 238,0 s → 218,2 s |
| `roboflow-dfl-121364_0` | 1 → 0 | 3 → 0 | 2 → 0 | 6,69 s | 208,4 s → 228,7 s |

Le même échange est retrouvé sur les détections neuves (identifiants 1 et 15, contact de 6,56 à
8,88 s ; identifiants 4 et 22 dans `121364_0`). Le contrôle coûte 6 à 7 s, environ 3 % du
traitement. L'écart du temps total, dans un sens puis dans l'autre, vient surtout de l'étape
d'images, dont le code n'a pas changé : ce sont des passages uniques, pas une mesure appariée.
Pics mesurés inchangés : mémoire vive 2 640 à 2 671 Mio, allocation PyTorch 627 Mio.

**Distances cumulées.** Seules les deux identités corrigées changent ; les 29 et 25 autres gardent
exactement la même distance :

| Clip | Identité | Avant | Après |
| --- | ---: | ---: | ---: |
| `roboflow-dfl-2e57b9_0` | 1 | 90,84 m | 109,18 m |
| `roboflow-dfl-2e57b9_0` | 15 | 111,68 m | 92,99 m |
| `roboflow-dfl-121364_0` | 4 | 100,57 m | 102,62 m |
| `roboflow-dfl-121364_0` | 22 | 103,32 m | 101,28 m |

Avant, chaque identité comptait après le contact le trajet de l'autre joueur. Ces distances
restent des sommes de positions calibrées, sans vérité terrain : elles ne valident pas la précision
des positions.

**Portée.** La méthode a été conçue après examen de ces quatre échanges, sur les clips où ils ont
été trouvés. Ce n'est pas une mesure de généralisation à des matchs inédits, ni une précision
d'identité (il n'existe pas de vérité terrain d'identité pour ces clips) : l'audit ne voit que les
échanges entre maillots différents.

## 5. Effets sur les mesures

| Mesure | Avant | Après |
| --- | --- | --- |
| Distance cumulée (`distanceM`) | Après un échange, cumule le trajet de l'autre joueur | Suit le même joueur ; inchangée pour les identités sans correction |
| Vitesse et trace (navigateur) | Suivent l'autre joueur après l'échange | Suivent le même joueur ; pas de vitesse affichée pendant le contact incertain |
| Équipe | Vote mélangé : fausse ou inconnue pour toute la trajectoire | Équipe des preuves ; inconnue seulement pendant le contact |
| Sélection vidéo et 3D | Même identifiant des deux côtés, mais joueur changé | Même identifiant, même joueur, pour les échanges corrigés |
| Coupures et segments | Suivi repris à chaque coupure | Inchangé : aucun contact ni preuve ne traverse une coupure ; segments continus |

## 6. Performances

**Profil d'une analyse complète** (`python -m validation.profile_pipeline`, `2e57b9_0`, 30 s,
375 images analysées). Chronomètres posés à l'exécution ; un passage, GPU partagé avec le bureau.

| Étape | Avant la réduction des coupures | Après |
| --- | ---: | ---: |
| Référence des équipes : relecture, SigLIP, UMAP, KMeans | 70,4 s | 71,2 s |
| Modèle des personnes (YOLO, 149 ms/image) | 55,9 s | 57,4 s |
| Modèle du ballon (YOLO, 132 ms/image) | 49,4 s | 50,9 s |
| Calibration (modèle et homographie) | 22,3 s | 23,1 s |
| **Détection des coupures (PySceneDetect)** | **19,7 s** | **0,8 s** |
| Contrôle d'identité | 6,9 s | 6,3 s |
| Décodage, ByteTrack, SQLite, mesures | 6,8 s | 6,9 s |
| **Durée totale (horloge)** | **239,3 s** | **224,4 s** |

`CutDetector` passait l'image entière à `ContentDetector` ; elle est désormais réduite comme le
fait par défaut le `SceneManager` de PySceneDetect (largeur visée 256 px). Sur les huit clips, aux
mêmes images analysées, les coupures sont identiques (`python -m validation.compare_cut_detection`) ;
les 375 images publiées sont strictement identiques entre les deux analyses. Seules deux coupures
franches figurent dans ces clips : les fondus ne sont pas couverts.

**Pistes non retenues ici.** Le modèle du ballon coûte presque autant que celui des personnes ;
l'espacer ou réduire sa résolution changerait la détection d'un objet de quelques pixels : à
valider séparément. La référence des équipes inclut le chargement de TensorFlow par UMAP dans cet
environnement (voir [analyse-incrementale.md](analyse-incrementale.md)). Les deux modèles YOLO
pourraient partager un lot d'images ; le gain n'est pas mesuré sur la RTX 2050.

## 7. Tests du 24 novembre 2026

| Suite | Résultat |
| --- | --- |
| Python (`analysis/`, sans GPU ni poids) | 85 réussis, dont 16 pour le contrôle d'identité et 1 pour la réduction des coupures |
| Node (`npm run test:unit`) | 206 réussis, dont 2 pour les libellés d'identité du visualiseur |
| Chrome (`npm run test:e2e`) | 1er passage : 101 réussis, 1 échec (émulateur IWER : page non prête en 20 s ; fichiers AR inchangés) ; 2e passage sans modification : **102 réussis**, dont 79 AR et 23 visualiseur |

Tests d'identité ajoutés : échange pendant un masquage, coéquipiers croisés, coupure de caméra,
continuité entre segments et à la reprise, identité inconnue plutôt que devinée, trois joueurs
mêlés, distances jamais en baisse et sans pas invraisemblable, et dans Chrome, joueur incertain
sélectionné sur la vidéo. La synchronisation (images 25, 47 et 91 exactes à l'arrêt, au plus une
image d'écart en lecture) et la sélection vidéo/3D restent vérifiées par les tests existants.

## 8. Limites

- Un échange entre **coéquipiers** (même maillot) n'est pas détecté : le repère de maillots ne les
  distingue pas. Il faudrait une réidentification d'apparence ou la lecture des numéros.
- Un échange **sans disparition** d'un des deux joueurs, ou loin d'un contact, n'est pas contrôlé.
- Trois joueurs mêlés : pas de correction (« crowded »).
- La durée du contact reste incertaine en entier : l'instant exact de l'échange n'est pas estimé.
- Les identifiants restent ceux du suivi, pas des identités de joueurs réels.
