# Stabilisation de la calibration et contrôle visuel des démonstrations réelles

Ce document explique deux constats faits le 25 novembre 2026 sur les vidéos réelles du visualiseur,
et ce qui a été changé dans le code pour y répondre. Tous les chiffres viennent des analyses GPU
exportées dans `demo/matches/` (fichiers `manifest.json` et `SOURCE.md`) ou d'un rejeu décrit plus bas.

## 1. Constat : 70,6 % de déplacements invraisemblables sur France–Allemagne

L'analyse publiée de France–Allemagne jugeait 70,6 % des déplacements mesurés au-delà de 12 m/s, avec une
vitesse médiane de 23 m/s : impossible pour des joueurs qui attendent un penalty. La décomposition des
déplacements entre deux images analysées donne la cause :

| Composante (France–Allemagne, avant) | Médiane | 90e centile |
|---|---|---|
| Déplacement mesuré d'un joueur | 22,9 m/s | 75,6 m/s |
| Mouvement commun à tous les joueurs de l'image | 21,9 m/s | 84,8 m/s |
| Résidu propre à chaque joueur | 7,9 m/s | — |

Le mouvement **commun** domine : ce n'est pas le suivi des joueurs qui tremble, c'est le terrain entier.
Chaque homographie image → terrain est estimée sur les points clés d'une seule image ; leur bruit
(environ 1 m sur les repères) fait sauter tout le terrain d'une image à l'autre.

## 2. Correction : `HomographyStabilizer` (filtre complémentaire)

Fichier : `analysis/football_analysis/calibration.py`. Tests : `analysis/tests/test_stabilisation.py`.

1. **Prédiction par le mouvement de la caméra.** Entre deux images analysées, le flux optique de
   Lucas-Kanade suit 400 coins du décor ; une homographie RANSAC en déduit le mouvement de la caméra
   (les joueurs, petits et mobiles, sont écartés comme points aberrants). L'homographie précédente,
   composée avec ce mouvement, prédit celle de l'image courante : un panoramique est suivi sans retard.
2. **Fusion avec la mesure.** Sur douze points d'ancrage de la moitié basse de l'image, la position
   prédite et la position mesurée sont mélangées (poids 0,2 pour la mesure), puis une homographie est
   réajustée. Le bruit de la mesure est moyenné ; la dérive de la prédiction est corrigée par la mesure.
3. **Mesures aberrantes.** Une mesure à plus de 4 m de la prédiction (écart médian sur les ancres) est
   écartée : drapeau devant l'objectif, points clés confondus. Si **trois mesures écartées de suite
   concordent entre elles**, c'est la prédiction qui a décroché (coupure non détectée, mouvement perdu) :
   le filtre repart de la mesure. Des mesures fausses mais dispersées ne prennent jamais la main.
4. **Mouvement introuvable.** Si le décor est masqué, la caméra est supposée immobile ; l'état est gardé.
5. **Coupure de plan** : remise à zéro. **Calibration échouée** : aucune position, jamais d'invention.
6. **Reprise d'une analyse** : la mesure brute de chaque image est enregistrée en pleine précision
   (`measuredHomography`), si bien que la reprise reconstruit exactement le même état.

Chaque image publiée indique si elle a été stabilisée (`stabilized`) et si sa mesure a été écartée
(`measurementRejected`) ; les mesures de qualité donnent la part de mesures écartées.

### Vérification sur des séquences à vérité connue

Les tests filment un décor texturé par une caméra qui panoramique ; l'homographie vraie de chaque image
est connue et la mesure est bruitée d'environ 1 m. Vérifié : erreur divisée par plus de deux, aucun
retard pendant le panoramique (biais signé sous 0,35 m), sauts d'une image à l'autre réduits de plus de
60 %, remise à zéro à la coupure, mesure aberrante isolée ignorée, mesures aberrantes concordantes
acceptées, mesures aberrantes dispersées toutes refusées, état conservé sans mouvement mesurable,
reprise identique à l'octet près.

### Résultats sur les vidéos réelles

Même métrique (déplacement de plus de 12 m/s entre deux images analysées espacées de 0,5 s au plus),
**mêmes détections** : « avant » rejoue les mesures brutes, « après » est l'analyse publiée. Le rejeu
retrouve exactement le chiffre publié avant correction (70,6 % sur France–Allemagne).

| Vidéo | Avant | Après | Vitesse médiane avant → après | Mesures écartées |
|---|---|---|---|---|
| Samsunspor–Altınordu 2023 | 29,2 % | 5,0 % | 6,3 → 2,4 m/s | 8,3 % |
| Brésil–Afrique du Sud 2016 | 52,9 % | 10,9 % | 13,6 → 2,4 m/s | 29,4 % |
| France–Allemagne 2018 | 70,6 % | 11,2 % | 23,2 → 4,2 m/s | 17,1 % |

Ce qui reste au-delà de 12 m/s mêle le bruit propre au pied de chaque boîte, des échanges
d'identifiants et les erreurs résiduelles de calibration. Les vitesses et distances restent
exploratoires : aucune n'est validée par une mesure physique (pas de GPS, pas de vérité terrain).

## 3. Constat : une calibration fausse que les mesures internes ne voient pas

Superposer à l'image les lignes du terrain projetées par la calibration (contrôle fait image par image,
lignes vertes et rouges sur la vidéo) a révélé un défaut plus grave que le tremblement :

- **France–Allemagne** est filmé en bas de la tribune, **derrière le but** (le gardien est vu à travers
  le filet). Le modèle de points clés, appris sur des vues de télévision, prend la ligne de but pour la
  ligne médiane et l'arc de la surface pour le rond central.
- **Brésil–Afrique du Sud** est filmé à la verticale de la surface : le modèle place la surface de
  réparation le long des panneaux publicitaires.
- **Samsunspor–Altınordu**, vue large du haut de la tribune, proche des vues de télévision : les lignes
  projetées suivent les lignes réelles, avec un écart estimé de 1 à 3 m.
- **Samsunspor–Trabzonspor, –Rizespor et –Fenerbahçe**, ajoutées le 26 novembre pour leurs équipes :
  calibration fausse sur les trois. Sur le corner filmé en biais, la surface et le rond central sont
  projetés loin des lignes réelles. Sur le penalty vu d'en haut, la surface est prise pour le rond
  central. Sur la vue rasante du coup franc, aucune ligne ne suit le terrain. Rizespor illustre le piège
  décrit ci-dessous : 99,1 % d'images calibrées et 6,3 % de déplacements invraisemblables, pour un
  terrain pourtant décalé.

Ces confusions sont **cohérentes entre elles** : l'erreur hors échantillon reste faible (1,25 m sur
France–Allemagne, 0,70 m sur le Brésil), alors que tout le terrain est décalé de plusieurs dizaines de
mètres. Aucune mesure interne ne pouvait le révéler ; le contrôle visuel l'a révélé.

## 4. Réponse : verdict affiché, positions masquées, référence possible

- **Verdict du contrôle visuel dans le catalogue** (`calibrationCheck` de `demo/index.json`) :
  `approximate` pour Altınordu, `rejected` pour France–Allemagne, le Brésil et les trois vidéos du
  26 novembre, `exact` pour la vidéo synthétique. Le contrôle des équipes a son propre verdict
  (`teamCheck`, [visualiseur-demos-reelles.md](visualiseur-demos-reelles.md)). Le verdict et sa raison s'affichent sur la carte de la galerie et dans « Qualité de
  l'analyse ».
- **Positions masquées** quand le verdict est `rejected` : le terrain 3D ne reçoit qu'une copie non
  calibrée des images, la fiche du joueur indique « masquée (calibration rejetée) » pour la position, la
  vitesse et la distance. Détections, suivi et équipes restent affichés sur la vidéo. Aucune donnée n'est
  supprimée ni modifiée : le masquage est fait à l'affichage (`maskUncalibrated`).
- **La démonstration ouverte par défaut** devient Samsunspor–Altınordu, la seule dont la calibration
  passe le contrôle.
- **Calibration de référence** (`analysis/football_analysis/reference_calibration.py`, option
  `--reference-calibration`) : une personne annote sur une image clé au moins cinq repères dont la position
  réglementaire est connue ; l'homographie est ajustée avec les contrôles de la calibration automatique,
  puis suivie par le mouvement de la caméra. Une image clé suivante mesure la dérive ; une coupure sans
  image clé arrête le suivi. La calibration automatique reste calculée et son écart à la référence est
  publié : c'est la mesure de sa justesse qui manquait. Testé sur séquences à vérité connue ;
  **pas encore appliqué aux démonstrations** : l'annotation précise de ces vues basses demande un outil
  d'annotation que ce travail n'a pas livré.

## 5. Coût

Le filtre ajoute un flux optique sur une image réduite à 640 px par image analysée. Sur la RTX 2050, les
analyses complètes de 26 à 30 s ont pris 173 à 222 s (6,3 à 7,1 fois la durée du clip, comme avant la
stabilisation : 158,6 s de traitement sur France–Allemagne avant, 163,2 s après). Pic mémoire PyTorch :
627 Mio dans les deux cas.
