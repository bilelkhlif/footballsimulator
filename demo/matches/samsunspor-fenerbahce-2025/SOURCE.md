# Vidéo réelle : Samsunspor–Fenerbahçe, 5 octobre 2025

**Créateur : 𐰇𐱅𐰚𐰤** (compte Wikimedia Commons).

Titre d'origine : « Samsunspor-Fenerbahçe SK maçı (5.10.25) dk50 » (coup franc de Samsunspor, 50e minute).
[Source et déclaration de création personnelle](https://commons.wikimedia.org/wiki/File:Samsunspor-Fenerbah%C3%A7e_SK_ma%C3%A7%C4%B1_(5.10.25)_dk50.webm).
[Licence CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) : crédit, lien de licence, indication des modifications
et même licence pour la vidéo adaptée. Aucun soutien de l'auteur, des équipes ou des organisateurs n'est revendiqué.

## Droits vérifiés

- Page Commons relue par son API le 26 novembre 2026 : source « own » (création personnelle), licence
  « self » CC BY-SA 4.0 posée par l'auteur, aucune demande de suppression ni revue de licence en cours.
- Enregistrement d'un spectateur, pas une retransmission télévisée : le droit d'auteur sur la vidéo appartient
  à la personne qui filme, et c'est elle qui l'a placée sous licence libre. Usage académique, non commercial.
- Vue de la tribune basse : seuls les joueurs, l'arbitre et le bord du terrain sont visibles.

## Modifications

Vidéo entière (22,7 s) ; redimensionnée en 1280 × 720, H.264, 30 images/s, sans audio. Vidéo adaptée sous CC BY-SA 4.0.
L'affiche (image à 3 s de l'adaptation) et la vignette de la galerie (480 × 270) suivent la même licence.
Le fichier téléchargé était le transcodage VP9 1080p de Wikimedia (l'original est en 3840 × 2160).
SHA-256 du téléchargement : `8fab00be9ef1aca3a42cb2b73e1805cf60f9ef3021d9e42afa966a4d67a6698d`.
SHA-256 de la vidéo distribuée : `a1ae18fe8d339ed6dcbbb5945bd9655cd219b92e49073421671ec1df225b4579`.

## Analyse

Vrai pipeline, sans joueur, trajectoire ni mesure inventés : PyTorch 2.14.1+cu126, Ultralytics
8.4.215, GPU NVIDIA RTX 2050 (4 Gio), poids et SigLIP vérifiés avant chargement.
Analyse du 26 novembre 2026, avec la correction des équipes des clips courts (docs/analyse-incrementale.md).
341 images analysées (15,0 images/s) en 178 s,
soit 7,5 fois la durée du clip ; pic mémoire PyTorch 627 Mio,
+883 Mio sur la carte (nvidia-smi), 2681 Mio de mémoire vive au plus.

- Calibration : points clés du terrain stabilisés dans le temps (docs/stabilisation-homographie.md) ;
  72,7 % des images calibrées, 41,1 % des mesures écartées,
  erreur hors échantillon médiane 1,05 m sur les repères du terrain.
- Contrôle visuel de la calibration : rejetée : sur cette vue basse et rasante, les lignes projetées par le modèle de points clés ne suivent pas les lignes réelles. Le visualiseur masque positions, vitesses et distances ; détections, suivi et équipes restent affichés sur la vidéo.
- Déplacements de plus de 12 m/s : 25,6 % avec la stabilisation (aucun rejeu sans stabilisation
  pour cette vidéo) ; vitesse médiane 4,0 m/s, sans valeur physique puisque la calibration est fausse.
- Suivi : 101 trajectoires, durée médiane 2,4 s, fragmentation 3,96 ;
  0 coupure(s) de plan détectée(s). Les étiquettes sont des identifiants de suivi, pas des joueurs nommés.
- Équipes connues pour 96 % des observations de joueurs ; dans une image typique,
  56 % des joueurs classés sont dans la même équipe (vers 50 % attendu).
- Contrôle visuel des équipes (quelques erreurs) : Planche d'une vignette par trajectoire suivie au moins 8 images : 53 justes, 3 erreurs (gardien adverse rangé avec les rouge et blanc, arbitre avec les jaunes), 4 trajectoires mêlées dans le mur, 6 sans équipe.
- Ballon détecté sur 39 % des images ; il est placé comme s'il était au sol.

Les vitesses et distances sont exploratoires : aucune n'est validée physiquement. Les contrôles visuels
(calibration, équipes) ont été faits par l'assistant IA sur des planches d'images, sans revue humaine.

Assistance IA : préparation de l'extrait, vérification des droits, analyse, export, contrôles et rédaction
effectués par Claude Code sur instruction de Bilel Khlif (ATTRIBUTION.md) ; aucune validation sur téléphone.
