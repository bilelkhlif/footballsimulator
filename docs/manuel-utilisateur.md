# Manuel utilisateur

Football Simulator pose un mini-terrain de football en 3D sur votre table, à travers la caméra de votre téléphone. Vous y placez deux équipes, déplacez les joueurs et le ballon, tracez des passes et des courses, puis animez l'action. Tout se fait d'un doigt, sans compte ni installation obligatoire.

> Les captures de ce manuel sont prises sur un ordinateur, avec l'émulateur de réalité augmentée : le fond y est sombre. Sur un téléphone, l'image de la caméra remplace ce fond, et le terrain apparaît sur votre vraie table.

**Sommaire**

1. [Ce qu'il vous faut](#1-ce-quil-vous-faut)
2. [Ouvrir et installer l'application](#2-ouvrir-et-installer-lapplication)
3. [Activer l'AR de Chrome (une seule fois)](#3-activer-lar-de-chrome-une-seule-fois)
4. [Poser le terrain sur la table](#4-poser-le-terrain-sur-la-table)
5. [Choisir les formations](#5-choisir-les-formations)
6. [Déplacer un joueur ou le ballon](#6-déplacer-un-joueur-ou-le-ballon)
7. [Tracer une passe ou une course](#7-tracer-une-passe-ou-une-course)
8. [Annuler, rétablir, réinitialiser](#8-annuler-rétablir-réinitialiser)
9. [Animer une action](#9-animer-une-action)
10. [Quitter l'AR](#10-quitter-lar)
11. [Sans AR : la vue 3D](#11-sans-ar--la-vue-3d)
12. [Mesurer la fluidité](#12-mesurer-la-fluidité)
13. [En cas de problème](#13-en-cas-de-problème)

---

## 1. Ce qu'il vous faut

| Pour | Il faut |
| --- | --- |
| La réalité augmentée (AR) | Un téléphone Android compatible ARCore, sous Android 12 ou plus, avec Chrome à jour et les Services Google Play pour la RA |
| La vue 3D seulement | Chrome ou Edge à jour sur ordinateur, Chrome sur Android, ou Safari 26 sur iPhone |

Pour l'AR, choisissez une table bien éclairée, avec un peu de texture : bois, nappe à motifs, journal posé dessus. Une surface blanche et unie se détecte mal.

## 2. Ouvrir et installer l'application

1. Ouvrez **https://bilelkhlif.github.io/footballsimulator/** dans Chrome, ou scannez ce QR code avec l'appareil photo du téléphone :

   <img src="images/qr-code.png" alt="QR code vers https://bilelkhlif.github.io/footballsimulator/" width="160">

2. Facultatif : touchez « Installer l'application », ou menu ⋮ → « Installer l'application ». L'icône « Football Sim » apparaît sur l'écran d'accueil, et l'application s'ouvre ensuite sans barre d'adresse.

Après une première ouverture, l'application se lance aussi **sans réseau** : le badge « Hors-ligne » s'affiche alors. Quand une nouvelle version est publiée, l'avis « Nouvelle version installée. » apparaît : touchez « Recharger ».

## 3. Activer l'AR de Chrome (une seule fois)

L'application dessine l'AR avec WebGPU. Chrome propose encore cette fonction derrière un réglage :

1. Dans la barre d'adresse de Chrome, ouvrez `chrome://flags/#webxr-webgpu-binding`.
2. Choisissez « Enabled », puis touchez « Relaunch ».

Sans ce réglage, l'application affiche le badge « AR : réglage WebGPU à activer » et un bouton « Copier l'adresse du réglage ». Quand tout est prêt, le badge indique « AR disponible (WebGPU) » et le bouton « Entrer en AR » apparaît.

## 4. Poser le terrain sur la table

1. Touchez **« Entrer en AR »** et autorisez l'accès à la caméra.
2. Visez la table à environ 60 cm, en déplaçant lentement le téléphone. Un **cercle doré** apparaît sur la surface détectée.
3. **Touchez l'écran** : le terrain se pose sur le cercle, sa longueur face à vous. Il reste accroché à la table.

<table>
  <tr>
    <td width="50%"><img src="images/sprint3-reticule.jpg" alt="Le cercle doré sur la table détectée, aide « Touchez l'écran pour poser le terrain sur le cercle »"></td>
    <td width="50%"><img src="images/sprint3-terrain-pose.jpg" alt="Le terrain posé sur la table, avec les boutons Déplacer le terrain et Quitter l'AR"></td>
  </tr>
  <tr>
    <td align="center"><sub>Le cercle doré montre où le terrain sera posé</sub></td>
    <td align="center"><sub>Un toucher pose le terrain, qui reste en place</sub></td>
  </tr>
</table>

Tournez autour de la table : vous voyez la tactique sous tous les angles, et le terrain ne bouge pas. Pour le poser ailleurs, touchez **« Déplacer le terrain »**, puis recommencez à l'étape 2.

## 5. Choisir les formations

Touchez **« Formations »** : une ligne de boutons par équipe, 4-4-2, 4-3-3, 3-5-2 et 4-2-3-1. Les joueurs rejoignent leurs nouvelles places en glissant. La formation de chaque équipe est rappelée en haut à droite.

![Le panneau des formations sur le terrain posé : Bleus en 4-4-2, Rouges en 4-3-3](images/sprint4-ar-formations.jpg)

## 6. Déplacer un joueur ou le ballon

Le mode **« Déplacer »** est actif au départ.

1. **Touchez un joueur.** Un anneau doré l'entoure, et l'aide indique par exemple « Le n° 9 des Bleus sélectionné : touchez sa nouvelle place. »
2. **Touchez sa nouvelle place** sur le terrain : il y glisse.

Le ballon se déplace de la même façon. Pour annuler une sélection, touchez à nouveau l'objet sélectionné ; pour en choisir un autre, touchez-le directement. Un toucher hors du terrain est refusé : « Hors du terrain : touchez une place sur le plateau. »

## 7. Tracer une passe ou une course

| Bouton | Flèche | Sens |
| --- | --- | --- |
| « Passe » | Pleine et dorée | Le trajet du ballon |
| « Course » | En tirets et blanche | Le déplacement d'un joueur |

Touchez le point de départ, puis le point d'arrivée. Un départ ou une arrivée sur un joueur s'accroche à lui : la flèche relie exactement deux joueurs. Une flèche trop courte est refusée : « Flèche trop courte : touchez un point plus loin. » Touchez « Déplacer » pour revenir aux déplacements.

![Une passe dorée du n° 6 au n° 11 des Bleus, une course en tirets blancs, le n° 9 sélectionné avec un anneau doré, et la barre d'outils](images/sprint5-tactique.jpg)

## 8. Annuler, rétablir, réinitialiser

- **« Annuler »** défait la dernière action : déplacement, flèche, formation, image clé de la séquence.
- **« Rétablir »** refait l'action annulée.
- **« Réinitialiser »** remet les formations de départ, les joueurs à leurs places, le ballon au centre, et retire les flèches. « Annuler » rétablit tout.

## 9. Animer une action

Touchez **« Séquence »**. Le principe est celui d'un dessin animé : vous enregistrez des **images clés**, et la lecture fait glisser les joueurs de l'une à l'autre.

1. Placez joueurs et ballon au départ de l'action, puis touchez **« Image clé »**.
2. Déplacez des joueurs ou le ballon, puis **« Image clé »** à nouveau. Recommencez pour chaque temps de l'action, jusqu'à 12 images clés.
3. Touchez **« Lecture »** : l'action se joue. Le même bouton devient « Pause ».
4. **« Recommencer »** revient au début ; **0,5×**, **1×** et **2×** règlent la vitesse.
5. **« Effacer »** vide la séquence ; « Annuler » la rétablit.

La ligne du haut du panneau indique où vous en êtes, par exemple « Lecture : étape 1 sur 2, vitesse 1×. »

<table>
  <tr>
    <td width="60%"><img src="images/sprint6-sequence.jpg" alt="Lecture en pause à mi-chemin : le ballon entre le rond central et le n° 7, le n° 9 en pleine course ; panneau de la séquence ouvert"></td>
    <td width="40%"><img src="images/sprint6-ar-sequence.jpg" alt="La même action jouée en AR, sur le terrain posé"></td>
  </tr>
  <tr>
    <td align="center"><sub>Une contre-attaque en trois images clés, mise en pause au milieu de la première passe</sub></td>
    <td align="center"><sub>En AR, l'action se joue sur la table</sub></td>
  </tr>
</table>

Bon à savoir :

- Tracez d'abord les passes et les courses : les flèches montrent le plan, et la séquence joue les déplacements.
- Pendant la lecture, vous pouvez tourner autour de la table : l'action reste sur le terrain.
- Déplacer un joueur pendant la lecture l'arrête, et chacun rejoint la place enregistrée.
- La séquence n'est pas gardée quand la page est rechargée.

## 10. Quitter l'AR

Touchez **« Quitter l'AR »**, ou le bouton retour du téléphone. Vous retrouvez la vue 3D, avec votre tactique : formations, places, flèches et séquence.

## 11. Sans AR : la vue 3D

Sur ordinateur, sur iPhone, ou avant d'entrer en AR, le terrain s'affiche en 3D. Les mêmes outils y fonctionnent, à la souris ou au doigt. Glissez pour tourner la vue, pincez ou utilisez la molette pour zoomer ; « Recentrer » ramène la vue de départ.

<table>
  <tr>
    <td width="72%"><img src="images/app-desktop.jpg" alt="Vue 3D sur ordinateur : terrain, Bleus en 4-3-3, Rouges en 4-4-2"></td>
    <td width="28%"><img src="images/app-mobile.png" alt="Vue 3D sur téléphone, en portrait"></td>
  </tr>
  <tr>
    <td align="center"><sub>Sur ordinateur</sub></td>
    <td align="center"><sub>Sur téléphone, en portrait</sub></td>
  </tr>
</table>

## 12. Mesurer la fluidité

Ajoutez `?diagnostics` à l'adresse : `https://bilelkhlif.github.io/footballsimulator/?diagnostics`. Un panneau affiche les images par seconde, la durée d'une image, le temps de calcul par image, le rendu utilisé, l'état de la session AR, les appels de dessin, les triangles et la mémoire graphique, aussi pendant l'AR. L'application est fluide à partir de 30 images par seconde.

<img src="images/sprint6-diagnostics.jpg" alt="Le panneau du mode diagnostic sur un écran de téléphone : images par seconde, durée d'une image, CPU par image, rendu WebGPU, session XR, appels de dessin, triangles, mémoire GPU" width="300">

*Capture prise sur un ordinateur : les valeurs d'un téléphone seront plus basses.*

## 13. En cas de problème

| Message ou symptôme | Que faire |
| --- | --- |
| « Football Simulator a besoin de WebGPU, absent de ce navigateur… » | Mettez à jour Chrome, ou ouvrez l'application dans Chrome ou Edge sur ordinateur, ou Safari 26 sur iPhone |
| « WebGPU est présent, mais aucun processeur graphique compatible n'a été trouvé sur cet appareil. » | L'appareil ne permet pas WebGPU, par exemple un téléphone sous Android 11 ou plus ancien : utilisez un autre appareil |
| Badge « AR : réglage WebGPU à activer » | Activez le réglage de Chrome (partie 3) |
| « Session AR refusée : autorisez l'accès à la caméra et vérifiez que les Services Google Play pour la RA sont installés. » | Autorisez la caméra pour Chrome (Paramètres → Applications → Chrome → Autorisations), et installez « Services Google Play pour la RA » depuis le Play Store |
| Badge « AR indisponible : vue 3D » | Ce navigateur ne propose pas l'AR (ordinateur, iPhone) : la vue 3D reste disponible |
| Le cercle doré n'apparaît pas | Ajoutez de la lumière, visez une surface texturée, déplacez lentement le téléphone d'un côté à l'autre |
| Le terrain s'est décalé | Touchez « Déplacer le terrain », puis posez-le à nouveau |
| L'application paraît ancienne | Ouvrez-la avec le réseau, puis touchez « Recharger » quand l'avis « Nouvelle version installée. » apparaît |
