# Vidéo réelle : Brésil–Afrique du Sud, Jeux olympiques de Rio, 4 août 2016

**Créateur : Rodrigogomesonetwo** (compte Wikimedia Commons).

Titre d'origine : « Neymar takes a free kick - BRA v. RSA, Rio 2016 » (coup franc de Neymar).
[Source et déclaration de création personnelle](https://commons.wikimedia.org/wiki/File:Neymar_takes_a_free_kick_-_BRA_v._RSA,_Rio_2016.ogv).
[Licence CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) : crédit, lien de licence, indication des modifications
et même licence pour la vidéo adaptée. Aucun soutien de l'auteur, des équipes ou des organisateurs n'est revendiqué.

## Droits vérifiés

- Page Commons relue par son API le 25 novembre 2026 : source « own » (création personnelle), licence
  « self » CC BY-SA 4.0 posée par l'auteur, aucune demande de suppression ni revue de licence en cours.
- Enregistrement d'un spectateur, pas une retransmission télévisée : le droit d'auteur sur la vidéo appartient
  à la personne qui filme, et c'est elle qui l'a placée sous licence libre. Usage académique, non commercial.
- Vidéo prise du haut de la tribune ; seuls les joueurs, l'arbitre et le bord du terrain sont visibles.

## Modifications

Vidéo entière (26,1 s) ; redimensionnée en 1280 × 720, H.264, 30 images/s, sans audio. Vidéo adaptée sous CC BY-SA 4.0.
L'affiche (image à 12 s de l'adaptation) et la vignette de la galerie (480 × 270) suivent la même licence.
Le fichier téléchargé était le transcodage VP9 1080p de Wikimedia, pas l'original Theora.
SHA-256 du téléchargement : `5a66a58f3ad0b4c0b008ee5bc89f45f1868cd68fcfb032ca960578ec8601ede8`.
SHA-256 de la vidéo distribuée : `4cec9258b74ddfd12f17964b8d779007b441c96851e369092f612de1fc7379d9`.

## Analyse

Vrai pipeline, sans joueur, trajectoire ni mesure inventés : PyTorch 2.14.1+cu126, Ultralytics
8.4.215, GPU NVIDIA RTX 2050 (4 Gio), poids et SigLIP vérifiés avant chargement.
392 images analysées (15,0 images/s) en 196 s,
soit 7,1 fois la durée du clip ; pic mémoire PyTorch 627 Mio,
+1210 Mio sur la carte (nvidia-smi), 2693 Mio de mémoire vive au plus.

- Calibration : points clés du terrain stabilisés dans le temps (docs/stabilisation-homographie.md) ;
  83,4 % des images calibrées, 29,4 % des mesures écartées,
  erreur hors échantillon médiane 0,70 m sur les repères du terrain.
- Contrôle visuel de la calibration : rejetée : sur cette vue plongeante, le modèle de points clés place la surface de réparation le long des panneaux publicitaires. Le visualiseur masque positions, vitesses et distances ; détections et suivi restent affichés sur la vidéo.
- Déplacements de plus de 12 m/s : 52,9 % sans stabilisation, 10,9 % avec,
  sur les mêmes détections ; vitesse médiane 13,6 m/s puis 2,4 m/s.
- Suivi : 179 trajectoires, durée médiane 0,6 s, fragmentation 6,16 ;
  0 coupure(s) de plan détectée(s). Les étiquettes sont des identifiants de suivi, pas des joueurs nommés.
- Équipes connues pour 52 % des observations de joueurs ; dans une image typique,
  67 % des joueurs classés sont dans la même équipe (vers 50 % attendu).
- Ballon détecté sur 94 % des images ; il est placé comme s'il était au sol.

Les vitesses et distances sont exploratoires : aucune n'est validée physiquement.

Assistance IA : préparation de l'extrait, vérification des droits, analyse, export, contrôles et rédaction
effectués par Claude Code sur instruction de Bilel Khlif (ATTRIBUTION.md) ; aucune validation sur téléphone.
