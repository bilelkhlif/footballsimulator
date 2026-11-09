# Sprint 1 : dépôt, PWA et scène 3D hors AR

Terminé le 5 novembre 2026. Responsable principal : Bilel Khlif (scène three.js, terrain, joueurs, formations).

Objectif du cahier des charges (§5.3) : structure du dépôt GitHub et de la PWA ; scène three.js de base, avec le terrain 3D et les joueurs visibles à l'écran, hors AR.

## Réalisé

- [x] Arborescence `/src`, `/assets` et `/docs` (cahier §7.2), règles d'édition communes.
- [x] three.js r186 copié dans le dépôt : aucun CDN, lancement possible hors-ligne.
- [x] Terrain à l'échelle de la table (60 × 39 cm) : lignes IFAB tracées sur une texture, plateau, buts et filets.
- [x] Groupe racine `pitchGroup` qui contient tout le terrain (cahier §3.2).
- [x] 22 joueurs numérotés, tournés vers le but adverse, et le ballon au point central.
- [x] Formations 4-4-2, 4-3-3 et 3-5-2 (patron Strategy). Démarrage sur le scénario de démonstration : Bleus en 4-3-3, Rouges en 4-4-2.
- [x] Fabrique de joueurs (patron Factory), avec une zone de sélection invisible élargie pour le raycasting du sprint 5 (cahier §6.3).
- [x] Vue 3D hors AR : rotation, zoom et recentrage, cadrage automatique en paysage et en portrait.
- [x] Badge d'état de l'AR : disponible, émulée ou indisponible.
- [x] Émulateur IWER activable avec `?iwer`.
- [x] PWA : manifeste, icônes, Service Worker et lancement hors-ligne.
- [x] Ajoutés le 9 novembre 2026 : tests automatisés (`npm test`) et [guide du code](guide-du-code.md).

## Tests réalisés

Chrome 156 sur PC, sans interface graphique, avec un serveur local.

| Test | Résultat |
| --- | --- |
| Chargement sans erreur dans la console, en 1280 × 800 et en 390 × 844 (mobile) | Réussi |
| Formations : 11 joueurs, numéros 1 à 11, dans leur moitié, hors du rond central, sans chevauchement | Réussi pour les trois |
| Service Worker actif, puis rechargement hors-ligne | Réussi |
| Application servie sous un sous-chemin, comme sur GitHub Pages | Réussi |
| Avec `?iwer` : ouverture d'une session `immersive-ar` avec `local-floor` et les ancres | Réussi |
| Avec `?iwer` : hit test | Refusé, demande le module `@iwer/sem` |

Les cinq premières lignes sont automatisées : `npm test` les rejoue, avec le badge d'état de l'AR en plus (11 vérifications, toutes réussies le 9 novembre 2026). Voir la partie « Tests » du [guide du code](guide-du-code.md#6-tests).

Pas encore testé : un vrai smartphone Android avec ARCore, puisqu'aucune fonction AR n'est active, et la fluidité de 30 images par seconde, à mesurer au sprint 6.

## Écarts et décisions

- **Émulateur** : l'Immersive Web Emulator prévu au §4.2 est archivé depuis le 1er octobre 2026. Il est remplacé par son moteur, IWER 2.7.0 ; la version 2.8.0, publiée la veille, n'a pas été retenue.
- **Hit test sur PC** : IWER seul ne l'émule pas. Au sprint 3, choisir entre intégrer `@iwer/sem` (environ 10 Mo, avec sa propre copie de three.js) et tester le hit test uniquement sur téléphone.
- **Formations** : les trois formations sont déjà codées pour placer les joueurs. Le sprint 4 ajoute les boutons pour en changer.
- **Taille des pions** : exagérée (2,8 cm de haut) pour rester lisible et sélectionnable sur une table.

## Pour le sprint 2

- Ajouter `examples/jsm/webxr/ARButton.js` de three.js r186 dans `src/vendor/three/`, puis dans `APP_SHELL`.
- Activer `renderer.xr.enabled` dans `src/scene.js` ; la boucle `setAnimationLoop` est déjà en place.
- Demander `immersive-ar` avec `local-floor`, et en options `hit-test`, `anchors` et `dom-overlay`, avec `#overlay` comme racine du DOM Overlay.
- En AR, masquer la table (`table`) et le fond (`scene.background = null`), et désactiver les contrôles d'orbite.
- Tester d'abord sur PC avec `?iwer`, puis sur Android via GitHub Pages.

Réalisé au sprint 2, avec un écart : la session est ouverte par notre module `src/xr-session.js` plutôt que par `ARButton.js`, et `hit-test` et `anchors` attendent le sprint 3. Voir [sprint-2.md](sprint-2.md).
