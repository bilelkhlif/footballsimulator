# Composants tiers et périmètre de distribution

Ce document est un inventaire, pas une licence du code propre à Football Simulator.

- **three.js r187** : copyright des auteurs de three.js, licence MIT conservée dans
  [`src/vendor/three-r187/LICENSE`](src/vendor/three-r187/LICENSE), avec les fichiers livrés sans modification.
- **IWER** : émulateur MIT chargé depuis jsDelivr uniquement sur demande de développement ; non livré
  comme capacité native du téléphone. **Playwright** : outil de tests Apache-2.0, pas un actif du site.
- **Démo synthétique** : images et données générées par le projet, sans match télévisé ni poids IA.
- **Serveur optionnel** : PyTorch, Ultralytics, Roboflow Sports, trackers, modèles de plongements et
  leurs dépendances sont installés séparément. Aucun paquet Python, checkpoint, vidéo privée ou base
  SQLite n'est inclus dans l'artefact statique. Leurs notices restent applicables à toute distribution
  future ; la voie de licence du projet et du serveur est en attente de décision du propriétaire.

Sources officielles, distinction code/poids/service, restrictions de recherche, options et décision
en attente : [revue des licences du dépôt](https://github.com/bilelkhlif/footballsimulator/blob/main/docs/licences-et-distribution.md).
