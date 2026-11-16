# Script de la vidéo de démonstration

Exigences du cahier des charges (§5.4 et §7.3) : **5 minutes au plus**, **voix off**, **sans musique de fond**, démonstration réelle sur smartphone ou sur émulateur, et **diapositive d'ouverture obligatoire** avec le titre, l'équipe et la date.

Le déroulé suit le scénario de démonstration du cahier (§4.1, étapes 1 à 8), puis montre le bonus BF9, la fluidité et le fonctionnement hors-ligne. Durée prévue : **4 min 45 s**, soit 15 s de marge.

---

## 1. Préparation

**Matériel.** Un téléphone Android compatible ARCore, chargé, en mode « Ne pas déranger ». Une table bien éclairée, avec un peu de texture. Un PC pour le montage et pour la scène des tests.

**Téléphone, la veille du tournage :**

1. Activer `chrome://flags/#webxr-webgpu-binding` (« Enabled »), puis relancer Chrome.
2. Ouvrir l'application une fois avec le réseau, et l'installer (menu ⋮ → « Installer l'application ») : la scène hors-ligne en a besoin.
3. Faire un essai complet, chronomètre en main.

**Enregistrement.**

- Image : l'enregistreur d'écran d'Android (réglages rapides → « Enregistrer l'écran »), sans le son. Une seconde caméra peut filmer le téléphone devant la table, pour montrer que le terrain est posé sur une vraie table ; c'est facultatif.
- Voix off : enregistrée à part, au calme, puis posée au montage sur les images. Une seule voix, ou une voix par membre de l'équipe, au choix.
- **Aucune musique**, ni en fond, ni en ouverture, ni en fin.
- Export en 1080p ; vérifier la durée finale : 5:00 au plus.

**Sans téléphone disponible** (le cahier §7.3 autorise l'émulateur) : chaque scène AR se tourne sur PC, dans Chrome, avec `?iwer` dans l'adresse. Un clic remplace le toucher, et le fond reste sombre au lieu de l'image de la caméra. Le dire dans la voix off.

**Règle de la voix off.** Ne dire que ce qui se voit ou a été mesuré. Les images par seconde se lisent à l'écran pendant le tournage : la voix off donne cette valeur-là, et aucune autre.

---

## 2. Déroulé

| Temps | À l'écran | Voix off | Couvre |
| --- | --- | --- | --- |
| 0:00 – 0:10 | **Diapositive d'ouverture** : « Football Simulator — Tableau tactique de football en réalité augmentée » ; Iyed Rachdi, Bilel Khlif, Ghassen Dallekji ; encadrant : Dr. Ing. Mohamed-Bécha Kaâniche ; SUP'COM, module Réalité Étendue ; **date du tournage** | « Football Simulator : un tableau tactique de football en réalité augmentée. Un projet du module de réalité étendue de SUP'COM. » | §7.3 |
| 0:10 – 0:30 | Un schéma tactique dessiné à la main sur une feuille ou un tableau blanc, puis le téléphone devant une table vide | « Pour expliquer une tactique, un entraîneur amateur utilise souvent un tableau blanc : une vue de dessus, en 2D, où les déplacements se montrent mal. Notre application pose un terrain en 3D sur une vraie table, depuis un simple lien web. » | §1.2, §1.3 |
| 0:30 – 0:50 | Chrome : saisie de l'adresse, chargement ; badges « Rendu WebGPU » et « AR disponible (WebGPU) » | « On ouvre le lien dans Chrome, sur Android. Rien à installer. La scène est dessinée en WebGPU, sans repli sur WebGL. » | §4.1, étape 1 |
| 0:50 – 1:20 | « Entrer en AR », autorisation de la caméra, le cercle doré qui suit la table, le toucher, le terrain posé | « “Entrer en AR” ouvre une session WebXR immersive. ARCore détecte la table, et le cercle doré montre la surface trouvée par le hit test. Un toucher pose le terrain ; une ancre spatiale le garde à sa place. » | BF1, BF2, BF3 ; §4.1, étapes 2 à 4 |
| 1:20 – 1:45 | « Formations » : 4-3-3 pour les Bleus, 4-4-2 pour les Rouges ; les joueurs glissent vers leurs places | « On choisit 4-3-3 pour les Bleus et 4-4-2 pour les Rouges. Chaque formation est une classe, selon le patron Strategy : elle calcule les places des onze joueurs. » | BF4 ; §4.1, étape 5 |
| 1:45 – 2:15 | Toucher le n° 9 des Bleus (anneau doré), puis une place ; puis le ballon, et sa nouvelle place | « Je touche un joueur : il est sélectionné. Je touche sa nouvelle place : il y va. Le toucher devient un rayon, lancé depuis la source d'entrée WebXR. Il trouve le joueur, puis le point du terrain, calculé dans le repère du terrain, quelle que soit la position de l'ancre. Le ballon se déplace de la même façon. » | BF5, BF6 ; §4.1, étape 6 |
| 2:15 – 2:40 | « Passe » : du n° 6 au n° 11 ; « Course » : un appel du n° 9 ; puis « Annuler » | « Une passe, en doré ; une course, en tirets blancs. Chaque action est une commande, selon le patron Command : “Annuler” défait la dernière. » | BF7, BF8 ; §4.1, étape 7 |
| 2:40 – 3:25 | « Séquence » : trois images clés, en déplaçant le n° 9, le n° 7 et le ballon entre elles ; « Lecture » à 1×, puis à 2× | « En bonus, on anime l'action. J'enregistre une image clé, je déplace des joueurs, j'en enregistre une autre. La lecture fait glisser les joueurs d'une image à l'autre, selon le temps écoulé, dans le repère du terrain. Pause, reprise, vitesse double. » | BF9 |
| 3:25 – 3:45 | Le téléphone tourne autour de la table pendant une lecture | « Je tourne autour de la table : le terrain reste en place, et l'action se joue toujours dessus. » | §4.1, étape 8 ; §4.3, stabilité |
| 3:45 – 4:05 | Application ouverte avec `?diagnostics`, en AR : le panneau des mesures | « Le mode diagnostic affiche la fluidité, mesurée sur ce téléphone : [valeur lue à l'écran] images par seconde. Au dernier sprint, regrouper les pions des joueurs en maillages instanciés a divisé par deux le nombre d'appels de dessin. » | §2.3, §4.3, fluidité |
| 4:05 – 4:20 | Mode avion activé ; l'application lancée depuis son icône ; badge « Hors-ligne » | « En mode avion, l'application se lance depuis le cache de son Service Worker : une seule version, complète et cohérente. » | §2.3, §4.3, hors-ligne |
| 4:20 – 4:35 | PC : `npm test` qui se termine ; « 182 » tests unitaires, « 79 réussi(s) » | « Sur PC, 261 tests automatisés vérifient le code à chaque modification, dont le parcours AR complet dans un émulateur. » | §7.1 |
| 4:35 – 4:45 | Diapositive de fin : « Le terrain tient sur votre table : à vous de jouer la tactique ! » et l'adresse de l'application | « Le terrain tient sur votre table : à vous de jouer la tactique ! » | Conclusion du cahier |

---

## 3. Vérifications avant de rendre la vidéo

- [ ] Diapositive d'ouverture : titre, équipe et date.
- [ ] Durée totale de 5:00 au plus.
- [ ] Voix off audible sur toute la vidéo ; aucune musique.
- [ ] Les huit étapes du scénario du cahier (§4.1) apparaissent.
- [ ] Chaque chiffre dit par la voix off se voit à l'écran ou vient des tests.
- [ ] Si une scène est tournée dans l'émulateur, la voix off le dit.
