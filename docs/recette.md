# Recette finale

État au 16 novembre 2026, à la fin du sprint 6, de chaque besoin du cahier des charges (§2.2) et de chaque critère d'acceptation (§4.3). Application : https://bilelkhlif.github.io/footballsimulator/ (publiée depuis `main`).

Trois niveaux de validation sont distingués. Seul le premier vaut pour un critère mesuré sur téléphone :

| Niveau | Ce que c'est |
| --- | --- |
| **Physique** | Essai sur un vrai téléphone, par l'équipe, avec la caméra et ARCore. Seuls les résultats rapportés par l'équipe sont repris ici |
| **Émulée** | Vraie session WebXR de Chrome sur PC, avec l'émulateur IWER : table virtuelle pour le hit test, toucher simulé par une manette visant le point cliqué. Vérifiée par les tests de bout en bout, en WebGPU et en mode test WebGL |
| **Automatisée** | Tests unitaires sous Node.js (WebXR et WebGPU remplacés par des doublures) et tests de bout en bout dans Chrome |

**Résultat automatisé du 16 novembre 2026** : 182 tests unitaires et 79 vérifications de bout en bout, tous réussis (`npm test`).

**Validation automatisée finale du 23 novembre 2026 : 226 tests unitaires et 104 vérifications de navigateur réussis (`npm test`), aucun échec et aucun cas ignoré.** Sont inclus les écrans étroits et en paysage, les sessions AR IWER en WebGPU et en mode test WebGL, les imports/MIME locaux, les en-têtes, la mise à jour cohérente de la PWA, la migration installée (un rechargement, un enregistrement et un cache), puis le démarrage hors-ligne. Aucun essai physique de cette version n’est consigné. Détail : [regles-des-fleches.md](regles-des-fleches.md), [ergonomie.md](ergonomie.md), [migration-mjs.md](migration-mjs.md).

**Version des essais physiques.** Les essais physiques consignés ont été faits les 12 et 14 novembre, sur les versions publiées à ces dates, avant les sprints 5 et 6. La version finale n'a été vérifiée qu'en émulation et par les tests automatisés. Les essais de la partie 5 sont à faire sur elle.

---

## 1. Besoins fonctionnels

| ID | Besoin (priorité) | Automatisée et émulée | Physique | Statut |
| --- | --- | --- | --- | --- |
| BF1 | Démarrer une session AR par « Entrer en AR » (haute) | Session WebGPU ouverte puis fermée, par le bouton et par le système, cinq fois de suite ; échecs signalés (caméra refusée, réglage WebGPU absent) | 12 nov. : entrée en AR, terrain visible et sortie sur deux téléphones Android avec Chrome (Samsung Galaxy S récent, TECNO POVA 6 Pro 5G), en WebGL à l'époque. 14 nov. : AR rendue en WebGPU réussie sur le TECNO POVA 6 Pro 5G ; mode test WebGL réussi sur le Galaxy S10e | **Validé** sur téléphone (versions du 12 et du 14 novembre) ; version finale vérifiée en émulation |
| BF2 | Réticule sur la surface détectée (haute) | Réticule sur la table virtuelle ; aucun réticule hors de la table | 14 nov. : AR réussie sur le TECNO POVA 6 Pro 5G et sur le Galaxy S10e (mode test), sans détail des étapes consigné | Validé en émulation ; à confirmer sur téléphone |
| BF3 | Poser le terrain d'un toucher (haute) | Terrain posé sur la table, puis ancré ; reposé ailleurs, tourné de 25° | Comme BF2 | Validé en émulation ; à confirmer sur téléphone |
| BF4 | Choisir la formation de chaque équipe (haute) | 4-4-2, 4-3-3, 3-5-2 et 4-2-3-1 par les boutons, pour les deux équipes, au millimètre ; en vue 3D et en AR sur le terrain posé | Aucun essai consigné | **Validé** (automatisé, émulé) |
| BF5 | Sélectionner un joueur puis le déplacer (haute) | Placé à 0,000 mm du point visé, en vue 3D, au doigt sur un écran de 360 px, et en AR sur un terrain tourné de 25° | Aucun essai consigné | Validé en émulation ; critère 9 sur 10 à mesurer |
| BF6 | Déplacer le ballon (moyenne) | Placé à 0,000 mm du point visé | Aucun essai consigné | **Validé** (automatisé) |
| BF7 | Tracer une flèche de passe ou de course (moyenne) | Passes et courses (tests unitaires) ; passe avec aperçu en vue 3D et en AR, départ et arrivée à 0,000 mm | Aucun essai consigné | Validé en émulation |
| BF8 | Annuler la dernière action, réinitialiser le terrain (moyenne) | Annuler, Rétablir, Réinitialiser, formations comprises ; places exactes après annulation | Aucun essai consigné | **Validé** (automatisé, émulé) |
| BF9 | Animer une action pas à pas, « Play » (bonus) | Images clés, Lecture, Pause, Recommencer, vitesses ; lecture exacte ; en AR sur le terrain tourné, terrain toujours ancré | Aucun essai consigné | Validé en émulation |

## 2. Critères d'acceptation (cahier §4.3)

| Critère | Validé si | Automatisée et émulée | Physique | Statut |
| --- | --- | --- | --- | --- |
| Le terrain se pose sur une surface réelle | Stable pendant 1 minute | Le terrain suit son ancre ; sa pose est inchangée pendant l'interaction et la lecture d'une séquence ; suivi interrompu, puis rétabli | Non mesuré | **À valider sur téléphone** (P2) |
| La formation choisie s'applique correctement | 11 joueurs bien placés | Pour les 4 formations et les 2 équipes : numéros 1 à 11, chacun dans sa moitié et hors du rond central, aucun chevauchement (écart minimal 7,1 cm) ; boutons au millimètre, en vue 3D et en AR | Non mesuré | **Validé** (automatisé) |
| Un joueur peut être sélectionné et déplacé | Réussite sur 9 essais sur 10 | 0,000 mm à chaque essai automatisé, en vue 3D et en AR émulée | Non mesuré | **À valider sur téléphone** (P3) |
| L'application reste fluide | Au moins 30 images par seconde | Banc de mesure sur PC, processeur ralenti 4 fois : 62,5 images par seconde en AR émulée, 76,9 à 90,1 en vue 3D ([sprint-6.md](sprint-6.md#3-performance--mesurer-puis-optimiser)). Indicatif seulement | Non mesuré | **À valider sur téléphone** (P4) |
| L'application se lance hors-ligne | Après une première visite | Rechargement hors-ligne, à la racine et sous le sous-chemin de GitHub Pages ; page prête en 1,1 s quand le serveur met 30 s à répondre ; hors-ligne après une mise à jour | Non mesuré | **Validé** (automatisé) ; à confirmer sur téléphone (P7) |

## 3. Besoins non fonctionnels (cahier §2.3) et exigences de l'enseignant

| Exigence | Preuve | Statut |
| --- | --- | --- |
| Performance : 30 images par seconde | Voir le critère « fluide » | À valider sur téléphone |
| Ergonomie : gros boutons, une seule main | Outils de 52 px sur téléphone et en paysage court, 46 px sur bureau ; commandes secondaires à partir de 38 px. Sept dimensions contrôlées, dont 320 × 568 et 568 × 320 ; aide et panneaux défilants | Validé (automatisé) ; confort à juger sur téléphone |
| Accessibilité : simple URL, sans installation obligatoire | GitHub Pages ; installation possible (PWA) | Validé |
| Disponibilité : hors-ligne après le premier chargement | Voir le critère « hors-ligne » | Validé (automatisé) |
| Sécurité : HTTPS exclusivement | GitHub Pages en HTTPS ; WebXR et le Service Worker exigent un contexte sécurisé | Validé |
| Rendu WebGPU sans repli WebGL | Aucun contexte WebGL créé ; WebGPU retiré : message, pas de repli ; `?webgl` réservé aux tests | Validé (automatisé) ; AR WebGPU réussie sur le TECNO POVA 6 Pro 5G |
| Hors périmètre respecté (§2.5) | Ni simulation de match, ni multijoueur, ni compte, ni serveur | Validé |

## 4. Ce qui reste à faire sur téléphone

Toute la partie 5, sur la version finale : environ 1 heure, par un membre de l'équipe, avec le téléphone et une table. Les quatre mesures du cahier sont en P2 (stabilité), P3 (9 essais sur 10), P4 (30 images par seconde) et P7 (hors-ligne). P8 à P10 vérifient les changements faits après l'évaluation : règles des flèches et visée au doigt, interface hors AR, passage d'une installation existante à `sw.mjs`.

---

## 5. Protocole de validation physique

Chaque essai donne un résultat simple, réussi ou non, avec sa mesure. **Ne noter « réussi » que pour ce qui a été vu sur le téléphone.** Un enregistrement d'écran du téléphone pendant les essais sert de preuve ; il est facultatif.

### P0. Préparation (10 minutes)

1. Téléphone Android compatible ARCore, sous Android 12 ou plus. Chrome et les « Services Google Play pour la RA » sont à jour (Play Store).
2. Dans Chrome, ouvrir `chrome://flags/#webxr-webgpu-binding`, choisir « Enabled », puis toucher « Relaunch ».
3. Avec le réseau, ouvrir `https://bilelkhlif.github.io/footballsimulator/?diagnostics`. Attendre les badges « Rendu WebGPU » et « AR disponible (WebGPU) ». Si l'avis « Nouvelle version installée » apparaît, toucher « Recharger ».
4. Noter le modèle du téléphone, la version d'Android et celle de Chrome (`chrome://version`).
5. Préparer une table bien éclairée, avec un peu de texture, une pièce de monnaie et un chronomètre.

### P1. Détection de la surface et pose du terrain (BF1, BF2, BF3)

1. Toucher « Entrer en AR », puis autoriser la caméra.
2. Viser la table à environ 60 cm, en déplaçant lentement le téléphone. Attendu : un cercle doré sur la table, et l'aide « Touchez l'écran pour poser le terrain sur le cercle. »
3. Toucher l'écran. Attendu : le terrain se pose sur le cercle, sa longueur face à soi ; la barre d'outils, « Formations » et « Séquence » apparaissent.
4. Viser un mur ou le vide : pas de cercle ; un toucher ne pose rien.
5. « Déplacer le terrain », viser un autre endroit de la table, toucher. Faire 3 poses en tout.

**Réussi si** les 3 poses tombent sur la table, à l'endroit du cercle.

### P2. Stabilité pendant 60 secondes (critère du cahier)

1. Terrain posé, poser la pièce sur la table, exactement sous un coin du plateau vu à l'écran.
2. Lancer le chronomètre. Pendant 60 secondes, tourner lentement autour de la table en gardant le terrain à l'écran ; déplacer un joueur en chemin.
3. Revenir au point de départ.

**Réussi si** le coin du plateau est toujours sur la pièce, à moins de 1 cm, sans saut visible pendant la minute.

### P3. Sélection et déplacement : au moins 9 essais sur 10 (critère du cahier)

1. Debout à environ 60 cm de la table, mode « Déplacer ».
2. Faire 10 essais, sur ces objets dans l'ordre : Bleus n° 1, 5, 9 et 11 ; Rouges n° 2, 6 et 10 ; le ballon ; Bleus n° 7 ; Rouges n° 8. Pour chacun, toucher l'objet, puis une place libre du terrain.
3. Un essai réussit si l'objet touché est entouré de l'anneau doré dès le premier toucher, **et** s'il rejoint la place touchée, à moins d'une largeur de pion.
4. « Réinitialiser », puis « Confirmer ? » après au moins 0,4 s, puis refaire les 10 essais à environ 1 m de la table.

**Réussi si** chaque série compte au moins 9 réussites sur 10.

### P4. Fluidité : au moins 30 images par seconde (critère du cahier)

1. En AR, avec `?diagnostics` dans l'adresse, terrain posé : le panneau affiche « Images/s » et « CPU / image ».
2. Pendant 60 secondes, en manipulant (déplacements, changement de formation, lecture d'une séquence), noter « Images/s » toutes les 10 secondes : 6 lectures.
3. Noter une fois « CPU / image » et « Appels de dessin ».

**Réussi si** les 6 lectures sont toutes d'au moins 30 images par seconde. Sinon, « CPU / image » aide à trouver la cause : proche de la durée d'une image, c'est le processeur central ; faible, c'est le processeur graphique.

### P5. Formations, flèches, annulation et interface (BF4, BF7, BF8, DOM Overlay)

1. « Formations » : Bleus en 3-5-2 et Rouges en 4-2-3-1, puis, comme dans le scénario du cahier, Bleus en 4-3-3 et Rouges en 4-4-2. Attendu, à chaque fois : 11 joueurs par équipe, chacun dans sa moitié, numéros 1 à 11 lisibles.
2. « Déplacer » : poser le ballon au pied du n° 6 des Bleus. « Passe » : toucher le ballon, puis le n° 11 des Bleus. Attendu : une flèche dorée du ballon au n° 11. « Course » : toucher le n° 9, puis un point devant lui. Attendu : une flèche blanche en tirets.
3. « Annuler » : la course disparaît. « Rétablir » : elle revient.
4. « Réinitialiser » : le bouton devient « Confirmer ? » ; le toucher de nouveau. Attendu : formations de départ, sans flèche. « Annuler » : tout revient.
5. Sélectionner un joueur, puis toucher chaque bouton de la barre d'outils. Attendu : aucun joueur ne bouge.

**Réussi si** chaque étape donne le résultat attendu.

### P6. Séquence animée en AR réelle (BF9)

1. « Séquence », puis « Image clé ».
2. Déplacer le n° 9 et le ballon, puis « Image clé » ; déplacer le n° 7, puis « Image clé ». Attendu : « 3 images clés ».
3. « Lecture » à 1× : les joueurs glissent d'une image à l'autre. « Pause », puis « Lecture » ; « 2× » ; « Recommencer ».
4. Pendant une lecture, tourner autour de la table. Attendu : l'action reste sur le terrain, et le terrain reste en place.
5. Pendant une lecture, déplacer un joueur. Attendu : la lecture s'arrête, et chacun rejoint sa place enregistrée.
6. « Annuler » : la dernière image clé est retirée (« 2 images clés »).

**Réussi si** chaque étape donne le résultat attendu.

### P7. Hors-ligne, installation et mise à jour (critère du cahier)

1. Menu ⋮ → « Installer l'application », ou bouton « Installer l'application ». L'ouvrir par son icône « Football Sim ». Attendu : pas de barre d'adresse.
2. Fermer l'application, activer le mode avion, la rouvrir par son icône. Attendu : le terrain s'affiche, avec le badge « Hors-ligne ».
3. Toujours en mode avion : « Entrer en AR », poser le terrain.
4. Mise à jour, seulement après une nouvelle publication sur `main` : rouvrir l'application avec le réseau. Attendu : l'avis « Nouvelle version installée. » ; « Recharger » donne la nouvelle version.

**Réussi si** les étapes 1 à 3 donnent le résultat attendu. L'étape 4 est notée « non applicable » s'il n'y a pas eu de nouvelle publication.

### P8. Règles des flèches et visée au doigt, en AR

Terrain posé, ballon au pied du n° 9 des Bleus (outil « Déplacer »).

1. « Passe », puis toucher le n° 7 des Bleus, qui n'a pas le ballon. Attendu : message rouge « Une passe part du ballon… » ; rien ne commence.
2. Toucher le ballon. Attendu : « Passe du n° 9 des Bleus… » et le bouton « Abandonner le tracé ».
3. Poser le doigt sur un point du gazon et le garder posé, puis le glisser au-delà de la ligne de touche, sans relâcher. Attendu : l'aperçu suit le doigt, doré sur le terrain, rouge au-delà de la ligne.
4. Relâcher au-delà de la ligne. Attendu : message rouge « Arrivée hors du terrain… » ; aucune flèche ; le départ reste posé.
5. Toucher le n° 4 des Rouges. Attendu : message rouge « Passe vers un adversaire… ». Puis toucher le n° 10 des Bleus. Attendu : flèche dorée, message « Passe vers le n° 10 des Bleus tracée. ».
6. Placer un joueur entre le téléphone et le ballon, téléphone bas, près de la table, puis toucher le ballon. Attendu : la passe part du ballon.
7. « Course », toucher le ballon. Attendu : message rouge « Une course part d'un joueur… ».
8. Lisibilité, en lumière du jour : bandeau, barre d'outils et messages lisibles sur l'image de la caméra.

**Réussi si** chaque étape donne le résultat attendu.

### P9. Interface hors AR, au doigt

1. Première ouverture (ou données du site effacées) : la carte « Bienvenue » s'affiche. « Commencer » la ferme ; « ? » la rouvre.
2. Après recentrage, panneaux fermés : le terrain entier est visible entre le bandeau et la barre d'outils, en portrait et en paysage, au repos, avec un joueur sélectionné et pendant une passe. Sous 380 px, vérifier la croix d’abandon et son nom avec TalkBack.
3. Toucher un joueur, puis poser le doigt sur le gazon et le glisser. Attendu : un anneau suit le doigt ; le joueur va là où le doigt est relâché.
4. Pendant qu'un joueur est sélectionné : tourner la vue à deux doigts, et zoomer. Attendu : la vue tourne et zoome ; le joueur ne bouge pas.
5. « Passe », toucher le ballon, puis deux fois rapidement une même arrivée valide, différente du départ. Attendu : une seule flèche. Recommencer un départ, puis « Abandonner le tracé » : aucune autre flèche.
6. En portrait et paysage, ouvrir l’aide, les formations et la séquence ; faire défiler leur contenu, les refermer. Attendu : outils, « Commencer », messages et sortie AR accessibles ; aucun contrôle sous la barre système.
7. Tracer au moins 12 flèches réparties sur le terrain, puis tourner la vue, changer d’outil, annuler et rétablir. Attendu : distinction trait plein/tirets, aperçu et sélection lisibles ; pas de déplacement involontaire.

**Réussi si** chaque étape donne le résultat attendu.

### P10. Passage d'une installation existante à la nouvelle version

À faire une seule fois, sur un téléphone où l'application était installée **avant** la fusion de cette version dans `main`.

1. Ouvrir l'application installée, avec le réseau, une fois la nouvelle version publiée. Attendu : l'application se recharge seule, ou après « Recharger », et montre la nouvelle barre d'outils à icônes.
2. Fermer l'application, activer le mode avion, la rouvrir. Attendu : la nouvelle version se lance hors-ligne.

**Réussi si** les deux étapes donnent le résultat attendu. Noter « non applicable » si aucun téléphone n'avait l'ancienne version installée.

### Fiche de résultats

Appareil : ____________________ · Android : ______ · Chrome : ______ · Date et heure : __________ · Testeur : ______________

Version / commit testé : ____________________ · URL : ____________________ · Portrait (largeur × hauteur CSS) : __________ · Paysage : __________

Installation ancienne avant fusion : oui / non · Ancienne version connue : __________ · Lien vers preuve (capture, vidéo ou relevé) : ____________________

| Essai | Mesure à noter | Résultat | Réussi ? |
| --- | --- | --- | --- |
| P1 Pose du terrain | Poses réussies sur 3 | | |
| P2 Stabilité, 60 s | Écart du coin avec la pièce (cm) ; saut visible ? | | |
| P3 Sélection, 60 cm | Réussites sur 10 (essais 1 à 10 : ✓ ou ✗) | | |
| P3 Sélection, 1 m | Réussites sur 10 | | |
| P4 Fluidité | 6 lectures d'images/s ; CPU / image ; appels de dessin | | |
| P5 Formations, flèches, annulation, interface | Étapes conformes sur 5 | | |
| P6 Séquence en AR | Étapes conformes sur 6 | | |
| P7 Hors-ligne, installation, mise à jour | Étapes conformes sur 3, et étape 4 | | |
| P8 Règles des flèches, visée au doigt, en AR | Étapes conformes sur 8 | | |
| P9 Interface hors AR, au doigt | Étapes conformes sur 7, dimensions et lisibilité des 12 flèches | | |
| P10 Passage à sw.mjs | Étapes conformes sur 2, ou « non applicable » | | |

Les résultats se reportent dans ce tableau, et les statuts des parties 1 et 2 ne passent à « Validé » qu'avec leur mesure.

Pour chaque échec, noter l’étape, l’orientation, le message exact, la fréquence (sur 10 essais si applicable) et la preuve. Ne pas lancer P8–P10 sur l’ancien site : attendre la publication de la branche après fusion autorisée. La vidéo finale reste à réaliser par l’équipe.
