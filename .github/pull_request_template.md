## Ce que change cette pull request

<!-- Une ou deux phrases : le besoin de l'entraîneur ou le défaut corrigé. -->

## Comment c'est fait

<!-- Fichiers principaux ; patron utilisé (Strategy, Command, Observer, Factory). -->

## Vérifications

- [ ] Chaque changement d'état passe par une commande annulable (saisie → interaction → Command → TacticsBoard → TacticalView)
- [ ] Aucun repli WebGL ajouté ; `src/vendor/` et `sw.js` non modifiés
- [ ] En-têtes `@responsable`, `@date`, `@role` sur chaque nouvelle fonction ; nouveau fichier renvoyant à ATTRIBUTION.md (§4)
- [ ] Nouveau fichier chargé par l'application ajouté à `APP_SHELL`, puis `npm run shell-version`
- [ ] `npm test` réussi sur un PC avec WebGPU (unitaires + bout en bout) ; résultat :
- [ ] Vérifié en 3D et en AR émulée (`?iwer`) ; sur téléphone : oui / non / à faire
- [ ] Documentation mise à jour (`docs/technique.md`, guide du code, manuel) ; ATTRIBUTION.md si un assistant d'IA a servi

## Captures

<!-- Avant / après, si l'interface change. -->
