# Vidéo réelle : Samsunspor–Trabzonspor, 4 janvier 2025

**Créateur : 𐰇𐱅𐰚𐰤** (compte Wikimedia Commons).

Titre d'origine : « Samsunspor-Trabzonspor maçı (4.1.25) ikinci gol » (deuxième but de Samsunspor, sur corner).
[Source et déclaration de création personnelle](https://commons.wikimedia.org/wiki/File:Samsunspor-Trabzonspor_ma%C3%A7%C4%B1_(4.1.25)_ikinci_gol.webm).
[Licence CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) : crédit, lien de licence, indication des modifications
et même licence pour la vidéo adaptée. Aucun soutien de l'auteur, des équipes ou des organisateurs n'est revendiqué.

## Droits vérifiés

- Page Commons relue par son API le 26 novembre 2026 : source « own » (création personnelle), licence
  « self » CC BY-SA 4.0 posée par l'auteur, aucune demande de suppression ni revue de licence en cours.
- Enregistrement d'un spectateur, pas une retransmission télévisée : le droit d'auteur sur la vidéo appartient
  à la personne qui filme, et c'est elle qui l'a placée sous licence libre. Usage académique, non commercial.
- La vidéo montre le corner, le but et la joie des joueurs ; des mains de spectateurs passent au premier plan.

## Modifications

Vidéo entière (15,3 s) ; redimensionnée en 1280 × 720, H.264, 30 images/s, sans audio. Vidéo adaptée sous CC BY-SA 4.0.
L'affiche (image à 1,5 s de l'adaptation) et la vignette de la galerie (480 × 270) suivent la même licence.
Le fichier téléchargé était le transcodage VP9 1080p de Wikimedia, pas l'original WebM.
SHA-256 du téléchargement : `e2c96376b8192edcaf61c20de0522053650b7c69d21fef6eb9f21c0af1401bd3`.
SHA-256 de la vidéo distribuée : `d993021f1c0e5afd84943f97e9e8f622e7a0d2bcd705d21d3a2ecc51b45eb8ae`.

## Analyse

Vrai pipeline, sans joueur, trajectoire ni mesure inventés : PyTorch 2.14.1+cu126, Ultralytics
8.4.215, GPU NVIDIA RTX 2050 (4 Gio), poids et SigLIP vérifiés avant chargement.
Analyse du 26 novembre 2026, avec la correction des équipes des clips courts (docs/analyse-incrementale.md).
230 images analysées (15,0 images/s) en 146 s,
soit 9,0 fois la durée du clip ; pic mémoire PyTorch 627 Mio,
+886 Mio sur la carte (nvidia-smi), 2619 Mio de mémoire vive au plus.

- Calibration : points clés du terrain stabilisés dans le temps (docs/stabilisation-homographie.md) ;
  59,6 % des images calibrées, 56,9 % des mesures écartées,
  erreur hors échantillon médiane 0,92 m sur les repères du terrain.
- Contrôle visuel de la calibration : rejetée : filmé en biais, le modèle de points clés place la surface de réparation et le rond central loin des lignes réelles. Le visualiseur masque positions, vitesses et distances ; détections, suivi et équipes restent affichés sur la vidéo.
- Déplacements de plus de 12 m/s : 33,5 % avec la stabilisation (aucun rejeu sans stabilisation
  pour cette vidéo) ; vitesse médiane 6,8 m/s, sans valeur physique puisque la calibration est fausse.
- Suivi : 162 trajectoires, durée médiane 0,9 s, fragmentation 7,11 ;
  0 coupure(s) de plan détectée(s). Les étiquettes sont des identifiants de suivi, pas des joueurs nommés.
- Équipes connues pour 93 % des observations de joueurs ; dans une image typique,
  62 % des joueurs classés sont dans la même équipe (vers 50 % attendu).
- Contrôle visuel des équipes (quelques erreurs) : Planche d'une vignette par trajectoire suivie au moins 8 images : 73 justes, 3 erreurs (gardien en vert sur deux trajectoires et drapeau de corner rangés avec les rouge et blanc), 3 trajectoires qui passent d'un joueur à l'autre dans les duels, 6 sans équipe.
- Ballon détecté sur 69 % des images ; il est placé comme s'il était au sol.

Les vitesses et distances sont exploratoires : aucune n'est validée physiquement. Les contrôles visuels
(calibration, équipes) ont été faits par l'assistant IA sur des planches d'images, sans revue humaine.

Assistance IA : préparation de l'extrait, vérification des droits, analyse, export, contrôles et rédaction
effectués par Claude Code sur instruction de Bilel Khlif (ATTRIBUTION.md) ; aucune validation sur téléphone.
