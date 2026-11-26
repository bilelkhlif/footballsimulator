# Guide de démonstration pour la soutenance

Déroulé en vingt étapes, 17 minutes, qui suit le scénario du cahier des charges (§4.1, étapes 1 à 8)
puis les extensions. Chaque étape a un **repli** si quelque chose échoue : la démonstration ne dépend
jamais d'un seul appareil ni du réseau.

## Avant la séance

| Vérifier | Comment |
|---|---|
| Application en cache sur le téléphone et sur le PC | Ouvrir https://bilelkhlif.github.io/footballsimulator/ une fois avec du réseau ; recharger en mode avion : l'application doit démarrer. |
| AR disponible sur le téléphone | Chrome Android, ARCore (« Services Google Play pour la RA ») et le réglage WebXR/WebGPU de Chrome si le téléphone l'exige ; badge « AR disponible » visible. |
| Surface de démonstration | Table mate et texturée, bien éclairée (le hit test échoue sur une surface brillante ou unie). |
| Repli PC | Chrome sur PC, onglet préparé avec `?iwer` (AR émulée) ; second onglet sur `visualizer.html`. |
| Captures et vidéo de secours | `docs/images/` (captures avant/après dans `docs/images/glass/`) ; vidéo de démonstration si elle est tournée. |
| Durées | Chronomètre : 11 min 30 pour le cahier (étapes 1 à 16), 3 min 30 pour le visualiseur (17 à 19), 2 min pour les preuves (20). |

## Déroulé

| N° | Durée | Action | À dire | Résultat attendu | Repli |
|---:|---:|---|---|---|---|
| 1 | 0:45 | Montrer le QR code, ouvrir l'URL sur le téléphone | Une PWA : un lien, pas d'installation obligatoire (§2.3) | Terrain 3D, 22 joueurs, badge de rendu WebGPU | Si WebGPU est bloqué sur le téléphone : continuer sur le PC et le dire (WebGPU sans repli est une exigence du professeur) |
| 2 | 0:45 | Parcourir le rail : sept espaces ; passer en thème clair puis sombre (Réglages) | Une seule scène, un seul historique ; thème automatique ou choisi | Panneaux de verre, terrain toujours dégagé | Rester en thème sombre |
| 3 | 1:00 | Équipes et formations : Bleus en 4-3-3, Rouges en 3-5-2 | Patron Strategy ; transitions animées (BF4) | Les joueurs rejoignent leurs places | Rechargement de la page : formations par défaut |
| 4 | 0:45 | Déplacer le n° 9 (toucher, puis destination) | Raycasting commun souris, doigt et AR (BF5) | Joueur déplacé, sélection visible | Utiliser la souris sur le PC |
| 5 | 0:30 | Déplacer le ballon | `MoveBallCommand` (BF6) | Ballon déplacé | — |
| 6 | 1:00 | Passe du porteur vers un partenaire ; tenter une passe impossible | Règles vérifiées avant la commande : aperçu rouge, rien n'est ajouté (BF7) | Flèche jaune ; aperçu rouge refusé | Montrer [regles-des-fleches.md](regles-des-fleches.md) |
| 7 | 0:30 | Course d'un joueur | Flèche en tirets dans le repère du terrain | Flèche de course | — |
| 8 | 0:45 | Annuler, rétablir, réinitialiser | Patron Command : un historique unique (BF8) | Retour exact à chaque état | — |
| 9 | 1:00 | Animation : deux images clés, lecture, pause, vitesse | Bonus BF9 : interpolation dans la boucle de rendu | Joueurs animés entre les deux images | Montrer `docs/sprint-6.md` |
| 10 | 0:45 | Téléphone : « Entrer en AR » | Session `immersive-ar` en WebGPU (BF1) | Caméra ouverte, invitation à viser une surface | **Repli AR** : PC avec `?iwer`, même parcours émulé, en le disant |
| 11 | 0:30 | Viser la table | Hit test depuis l'espace `viewer` (BF2) | Réticule doré sur la table | Mieux éclairer ; viser une surface texturée |
| 12 | 0:45 | Toucher pour poser, puis tourner autour | Pose et `XRAnchor` : le terrain reste en place (BF3, §4.3) | Terrain de 60 × 39 cm ancré | Reposer (bouton de repositionnement) |
| 13 | 0:45 | En AR, déplacer un joueur au doigt | Rayon du `targetRaySpace`, point ramené dans le repère du terrain | Joueur déplacé sur la table | Repli PC émulé |
| 14 | 0:30 | Toucher un bouton du DOM Overlay, puis « Quitter l'AR » | `beforexrselect` : un bouton n'atteint pas la scène | Vue 3D restaurée, tactique conservée | — |
| 15 | 0:45 | Mode avion, recharger | Service Worker à version de contenu (§2.3, §4.3) | Application démarrée hors-ligne | Montrer le test « coquille rechargée hors ligne » |
| 16 | 0:30 | `?diagnostics` | Images par seconde, temps CPU, appels de dessin | Panneau de mesures | Citer le banc : 62,5 images/s en AR émulée (indicatif) |
| 17 | 1:30 | Rail : « Analyse de match (Bêta) » → galerie, Samsunspor–Altınordu | Vraie vidéo CC BY-SA, analysée sur GPU ; terrain 3D synchronisé ; vitesses exploratoires | Joueurs placés sur le terrain 3D, sélection d'un joueur | Démo synthétique de la galerie |
| 18 | 1:00 | Ouvrir Samsunspor–Trabzonspor | Équipes rouge et blanc contre bleu ciel séparées sur la vidéo (93 % des observations classées, 3 erreurs au contrôle visuel) ; calibration fausse : positions masquées plutôt que fausses | Joueurs colorés par équipe sur la vidéo, terrain 3D vide avec l'avertissement | France–Allemagne ; [visualiseur-demos-reelles.md](visualiseur-demos-reelles.md) |
| 19 | 1:00 | Panneau « Qualité de l'analyse » | Stabilisation : 70,6 % → 11,2 % de déplacements invraisemblables, mêmes détections | Indicateurs et limites affichés | Tableau du document de stabilisation |
| 20 | 2:00 | Dossier d'évaluation, matrice de conformité, tests | 54 exigences tracées ; ce qui reste demande un téléphone ; ATTRIBUTION.md et contributions | [dossier-evaluation.md](dossier-evaluation.md) ouvert | Captures de `docs/images/glass/` |

## Ce qu'il ne faut pas affirmer

- Que l'AR de la version actuelle a été validée sur téléphone : seules des versions antérieures l'ont été
  (12 et 14 novembre). Les essais P0 à P10 de [recette.md](recette.md) restent à faire.
- Que les vitesses et distances du visualiseur sont des mesures sportives : aucune vérité terrain.
- Que le classement des équipes est validé : il a été contrôlé visuellement par l'assistant IA, et les
  équipes de Samsunspor–Altınordu, la démonstration ouverte par défaut, sont fausses (verdict affiché).
- Qu'Iyed Rachdi ou Ghassen Dalleji ont réalisé une partie précise sans leur confirmation
  ([matrice des contributions](matrice-contributions-academiques.md)).

## Questions probables du jury

| Question | Réponse courte | Où le montrer |
|---|---|---|
| Pourquoi pas de repli WebGL ? | Exigence du professeur ; un repli masquerait l'absence de WebGPU. Le mode `?webgl` ne sert qu'aux tests. | `src/webgpu.mjs` |
| Comment le terrain reste-t-il en place ? | `XRAnchor` créé au toucher ; le suivi interrompu garde l'ancre. | `src/ar-surface.mjs` |
| Comment annulez-vous une action ? | Chaque action est une commande avec `execute` et `undo` ; un seul historique. | `src/commands.mjs` |
| Que fait l'IA dans le projet ? | Rien dans le tableau tactique (hors périmètre §2.5). Le visualiseur analyse une vidéo : détection, suivi, équipes, calibration. | [explications-techniques.md](explications-techniques.md) |
| Comment savez-vous que la calibration est juste ? | Erreur hors échantillon, puis contrôle visuel des lignes projetées ; il a révélé deux calibrations fausses, désormais masquées. | [stabilisation-homographie.md](stabilisation-homographie.md) |
| Qui a écrit le code ? | Les assistants d'IA, sur les consignes de Bilel Khlif, qui a relu, testé sur téléphone et fusionné ; tout est déclaré. | [ATTRIBUTION.md](../ATTRIBUTION.md) |
