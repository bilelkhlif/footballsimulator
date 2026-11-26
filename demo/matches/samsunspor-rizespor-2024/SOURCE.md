# Vidéo réelle : Samsunspor–Çaykur Rizespor, 23 février 2024

**Créateur : 𐰇𐱅𐰚𐰤** (compte Wikimedia Commons).

Titre d'origine : « Samsunspor-Çaykur Rizespor maçı (23.2.24) üçüncü gol » (penalty d'Olivier Ntcham).
[Source et déclaration de création personnelle](https://commons.wikimedia.org/wiki/File:Samsunspor-%C3%87aykur_Rizespor_ma%C3%A7%C4%B1_(23.2.24)_%C3%BC%C3%A7%C3%BCnc%C3%BC_gol.webm).
[Licence CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) : crédit, lien de licence, indication des modifications
et même licence pour la vidéo adaptée. Aucun soutien de l'auteur, des équipes ou des organisateurs n'est revendiqué.

## Droits vérifiés

- Page Commons relue par son API le 26 novembre 2026 : source « own » (création personnelle), licence
  « self » CC BY-SA 4.0 posée par l'auteur, aucune demande de suppression ni revue de licence en cours.
- Enregistrement d'un spectateur, pas une retransmission télévisée : le droit d'auteur sur la vidéo appartient
  à la personne qui filme, et c'est elle qui l'a placée sous licence libre. Usage académique, non commercial.
- L'extrait ne montre que le terrain : les plans de supporters, après 20 s, sont exclus.

## Modifications

Extrait de 0 à 19,5 s ; redimensionné en 1280 × 720, H.264, 24 images/s, sans audio. Vidéo adaptée sous CC BY-SA 4.0.
L'affiche (image à 1 s de l'adaptation) et la vignette de la galerie (480 × 270) suivent la même licence.
Le fichier téléchargé était le transcodage VP9 1080p de Wikimedia, pas l'original WebM.
SHA-256 du téléchargement : `02c1018d05986b864ed7e66a247bfd8cc0b221fe4e2844d43ac8f350052fdc56`.
SHA-256 de la vidéo distribuée : `fc4dd5d3c1fcffdb0c22c336bd73e3d0b867290bff3a3a1a4936a6e8320f81b8`.

## Analyse

Vrai pipeline, sans joueur, trajectoire ni mesure inventés : PyTorch 2.14.1+cu126, Ultralytics
8.4.215, GPU NVIDIA RTX 2050 (4 Gio), poids et SigLIP vérifiés avant chargement.
Analyse du 26 novembre 2026, avec la correction des équipes des clips courts (docs/analyse-incrementale.md).
234 images analysées (12,0 images/s) en 129 s,
soit 6,2 fois la durée du clip ; pic mémoire PyTorch 627 Mio,
+876 Mio sur la carte (nvidia-smi), 2652 Mio de mémoire vive au plus.

- Calibration : points clés du terrain stabilisés dans le temps (docs/stabilisation-homographie.md) ;
  99,1 % des images calibrées, 9,9 % des mesures écartées,
  erreur hors échantillon médiane 0,74 m sur les repères du terrain.
- Contrôle visuel de la calibration : rejetée : vue du haut de la tribune, le modèle de points clés prend la surface de réparation pour le rond central et la ligne médiane. Le visualiseur masque positions, vitesses et distances ; détections, suivi et équipes restent affichés sur la vidéo.
- Déplacements de plus de 12 m/s : 6,3 % avec la stabilisation (aucun rejeu sans stabilisation
  pour cette vidéo) ; vitesse médiane 3,0 m/s, sans valeur physique puisque la calibration est fausse.
- Suivi : 43 trajectoires, durée médiane 6,2 s, fragmentation 2,16 ;
  0 coupure(s) de plan détectée(s). Les étiquettes sont des identifiants de suivi, pas des joueurs nommés.
- Équipes connues pour 94 % des observations de joueurs ; dans une image typique,
  57 % des joueurs classés sont dans la même équipe (vers 50 % attendu).
- Contrôle visuel des équipes (quelques erreurs) : Planche d'une vignette par trajectoire suivie au moins 8 images : 28 justes, 1 erreur (l'arbitre en jaune avec les rouge et blanc), 1 trajectoire qui passe d'un joueur à l'autre, 5 sans équipe : deux gardiens et trois stadiers écartés par le groupe « autres ».
- Ballon détecté sur 66 % des images ; il est placé comme s'il était au sol.

Les vitesses et distances sont exploratoires : aucune n'est validée physiquement. Les contrôles visuels
(calibration, équipes) ont été faits par l'assistant IA sur des planches d'images, sans revue humaine.

Assistance IA : préparation de l'extrait, vérification des droits, analyse, export, contrôles et rédaction
effectués par Claude Code sur instruction de Bilel Khlif (ATTRIBUTION.md) ; aucune validation sur téléphone.
