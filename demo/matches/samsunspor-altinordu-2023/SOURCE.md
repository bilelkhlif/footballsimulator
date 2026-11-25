# Vidéo réelle : Samsunspor–Altınordu, 24 mars 2023

**Créateur : 𐰇𐱅𐰚𐰤** (compte Wikimedia Commons).

Titre d'origine : « Samsunspor-Altınordu maçı (24.3.23) penaltı golü » (penalty de Douglas Tanque, 68e minute).
[Source et déclaration de création personnelle](https://commons.wikimedia.org/wiki/File:Samsunspor-Alt%C4%B1nordu_ma%C3%A7%C4%B1_(24.3.23)_penalt%C4%B1_gol%C3%BC.webm).
[Licence CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) : crédit, lien de licence, indication des modifications
et même licence pour la vidéo adaptée. Aucun soutien de l'auteur, des équipes ou des organisateurs n'est revendiqué.

## Droits vérifiés

- Page Commons relue par son API le 25 novembre 2026 : source « own » (création personnelle), licence
  « self » CC BY-SA 4.0 posée par l'auteur, aucune demande de suppression ni revue de licence en cours.
- Enregistrement d'un spectateur, pas une retransmission télévisée : le droit d'auteur sur la vidéo appartient
  à la personne qui filme, et c'est elle qui l'a placée sous licence libre. Usage académique, non commercial.
- L'extrait ne montre que le terrain : les plans rapprochés de supporters, après 43 s, sont exclus.

## Modifications

Extrait de 13,0 à 42,8 s ; redimensionné en 1280 × 720, H.264, 30 images/s, sans audio. Vidéo adaptée sous CC BY-SA 4.0.
L'affiche (image à 24 s de l'adaptation) et la vignette de la galerie (480 × 270) suivent la même licence.
Le fichier téléchargé était le transcodage VP9 1080p de Wikimedia, pas l'original WebM.
SHA-256 du téléchargement : `d0c6459669e654c894ac106ecc3eb5ef3a6dc2faa0fd162d08a77c8ae0395566`.
SHA-256 de la vidéo distribuée : `d0deee315c00843d58106be27eafb3e22d9448f4b80f300234798262d991baf3`.

## Analyse

Vrai pipeline, sans joueur, trajectoire ni mesure inventés : PyTorch 2.14.1+cu126, Ultralytics
8.4.215, GPU NVIDIA RTX 2050 (4 Gio), poids et SigLIP vérifiés avant chargement.
447 images analysées (15,0 images/s) en 222 s,
soit 7,1 fois la durée du clip ; pic mémoire PyTorch 627 Mio,
+1183 Mio sur la carte (nvidia-smi), 2669 Mio de mémoire vive au plus.

- Calibration : points clés du terrain stabilisés dans le temps (docs/stabilisation-homographie.md) ;
  100,0 % des images calibrées, 8,3 % des mesures écartées,
  erreur hors échantillon médiane 0,67 m sur les repères du terrain.
- Contrôle visuel de la calibration : approximative : lignes projetées proches des lignes réelles sur six images contrôlées (écart estimé de 1 à 3 m), sans vérité terrain mesurée. Positions 3D affichées.
- Déplacements de plus de 12 m/s : 29,2 % sans stabilisation, 5,0 % avec,
  sur les mêmes détections ; vitesse médiane 6,3 m/s puis 2,4 m/s.
- Suivi : 125 trajectoires, durée médiane 2,1 s, fragmentation 4,71 ;
  0 coupure(s) de plan détectée(s). Les étiquettes sont des identifiants de suivi, pas des joueurs nommés.
- Équipes connues pour 88 % des observations de joueurs ; dans une image typique,
  89 % des joueurs classés sont dans la même équipe (vers 50 % attendu).
- Ballon détecté sur 79 % des images ; il est placé comme s'il était au sol.

Les vitesses et distances sont exploratoires : aucune n'est validée physiquement.

Assistance IA : préparation de l'extrait, vérification des droits, analyse, export, contrôles et rédaction
effectués par Claude Code sur instruction de Bilel Khlif (ATTRIBUTION.md) ; aucune validation sur téléphone.
