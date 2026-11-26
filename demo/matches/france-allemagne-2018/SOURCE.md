# Vidéo réelle : France–Allemagne, 16 octobre 2018

**Créateur : Like tears in rain** (compte Wikimedia Commons).

Titre d'origine : « Match de football France-Allemagne - 16 octobre 2018 - Penalty d'Antoine Griezmann ».
[Source et déclaration de création personnelle](https://commons.wikimedia.org/wiki/File:Match_de_football_France-Allemagne_-_16_octobre_2018_-_Penalty_d%27Antoine_Griezmann.ogv).
[Licence CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) : crédit, lien de licence, indication des modifications
et même licence pour la vidéo adaptée. Aucun soutien de l'auteur, des équipes ou des organisateurs n'est revendiqué.

## Droits vérifiés

- Page Commons relue par son API le 26 novembre 2026 : source « own » (création personnelle), licence
  « self » CC BY-SA 4.0 posée par l'auteur, aucune demande de suppression ni revue de licence en cours.
- Enregistrement d'un spectateur, pas une retransmission télévisée : le droit d'auteur sur la vidéo appartient
  à la personne qui filme, et c'est elle qui l'a placée sous licence libre. Usage académique, non commercial.
- Vue basse derrière le but, à travers des drapeaux de supporters ; photographes et stadiers au bord du terrain.

## Modifications

Extrait de 2 à 28 s ; redimensionné en 1280 × 720, H.264, 25 images/s, sans audio. Vidéo adaptée sous CC BY-SA 4.0.
L'affiche (image extraite à 10 s de l'adaptation) et la vignette de la galerie (480 × 270) suivent la même licence.
Le fichier téléchargé était le transcodage VP9 1080p de Wikimedia, pas l'original Theora.
SHA-256 du téléchargement : `3f56ca9e22067eebda78299de039828265ac6cf4530198fcc275c7f6024492ee`.
SHA-256 de la vidéo distribuée : `777a9914fee5e0c3cd42239032c0d4d4157968d4f859297ae88de689a6bdf5d8`.

## Analyse

Vrai pipeline, sans joueur, trajectoire ni mesure inventés : PyTorch 2.14.1+cu126, Ultralytics
8.4.215, GPU NVIDIA RTX 2050 (4 Gio), poids et SigLIP vérifiés avant chargement.
Analyse du 26 novembre 2026, avec la correction des équipes des clips courts (docs/analyse-incrementale.md).
325 images analysées (12,5 images/s) en 149 s,
soit 5,4 fois la durée du clip ; pic mémoire PyTorch 627 Mio,
+877 Mio sur la carte (nvidia-smi), 2512 Mio de mémoire vive au plus.

- Calibration : points clés du terrain stabilisés dans le temps (docs/stabilisation-homographie.md) ;
  95,4 % des images calibrées, 17,1 % des mesures écartées,
  erreur hors échantillon médiane 1,25 m sur les repères du terrain.
- Contrôle visuel de la calibration : rejetée : filmé derrière le but, le modèle de points clés prend la ligne de but pour la ligne médiane et l'arc de la surface pour le rond central ; l'erreur hors échantillon (1,25 m) ne le révèle pas. Le visualiseur masque positions, vitesses et distances ; détections et suivi restent affichés.
- Déplacements de plus de 12 m/s : 70,6 % sans stabilisation, 11,2 % avec,
  sur les mêmes détections ; vitesse médiane 23,2 m/s puis 4,2 m/s.
- Suivi : 56 trajectoires, durée médiane 2,8 s, fragmentation 1,51 ;
  1 coupure(s) de plan détectée(s). Les étiquettes sont des identifiants de suivi, pas des joueurs nommés.
- Équipes connues pour 85 % des observations de joueurs ; dans une image typique,
  70 % des joueurs classés sont dans la même équipe (vers 50 % attendu).
- Contrôle visuel des équipes (quelques erreurs) : Planche d'une vignette par trajectoire suivie au moins 8 images : 28 justes, 2 erreurs (les deux arbitres avec la France), 1 trajectoire mêlée, 3 sans équipe.
- Ballon détecté sur 84 % des images ; il est placé comme s'il était au sol.

Les vitesses et distances sont exploratoires : aucune n'est validée physiquement. Les contrôles visuels
(calibration, équipes) ont été faits par l'assistant IA sur des planches d'images, sans revue humaine.

Assistance IA : préparation de l'extrait, vérification des droits, analyse, export, contrôles et rédaction
effectués par Claude Code sur instruction de Bilel Khlif (ATTRIBUTION.md) ; aucune validation sur téléphone.
