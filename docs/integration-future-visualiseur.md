# Intégration future du visualiseur : note différée

Cette note n’ajoute aucune fonction vidéo à l’application académique et ne modifie pas l’autre branche.

## État préservé

- Branche : `feature/visualiseur-match`.
- [PR #15](https://github.com/bilelkhlif/footballsimulator/pull/15), tête vérifiée `4f6224797e5e9936bf204ea98fd1e8dd29cfc885`.
- Base commune de la reprise : `f7da74fa32a10f7489c4c64fe23c565b896e488c`.
- Aucun merge, rebase, changement de fichier ou de PR effectué sur ce développement pendant la reprise académique.

## Imports partagés à adapter ultérieurement

Relevé dans le code de cette tête de la PR #15 ; les chemins ci-dessous sont relatifs à `src/visualizer/`.

| Import actuel en `.js` | Destination après intégration |
| --- | --- |
| `../events.js` | `../events.mjs` |
| `../config.js` | `../config.mjs` |
| `../ball.js` | `../ball.mjs` |
| `../pitch.js` | `../pitch.mjs` |
| `../players.js` | `../players.mjs` |
| `../pointer-input.js` | `../pointer-input.mjs` |
| `../raycasting.js` | `../raycasting.mjs` |
| `../tactical-arrows.js` | `../tactical-arrows.mjs` |
| `../webgpu.js` | `../webgpu.mjs` |

`overlay-frame.js` importe `events.js` ; `overlay-pitch.js` importe les huit autres. Ses imports JSDoc et les imports entre modules du visualiseur devront aussi suivre la convention retenue. Les fichiers tiers three.js et `OrbitControls.js` restent intacts.

Une intégration séparée devra traiter les conflits de renommage/modification des modules partagés, les cartes d’import HTML, les serveurs/MIME, le contrôle des en-têtes, les tests de résolution et la portée du cache. Le geste tactile et l’API de raycasting partagés devront être rejoués sur la superposition vidéo. Recalculer la coquille académique après résolution ; ne pas mettre les vidéos, modèles ou API locales dans le cache statique.

Vérifications à prévoir à ce moment : suite AR complète, suite du visualiseur, chargement/traitement/reprise d’une vidéo, placement et interaction de la superposition, imports `.mjs`, chargement hors-ligne de l’application académique et absence de cache des données vidéo. Aucun de ces futurs conflits n’a été résolu dans cette branche.

## Troisième référence, en attente de recherche

- Lien fourni : [publication à examiner](https://lnkd.in/p/etNTG4Jg).
- Statut au 23 novembre 2026 : **recherche en attente**. L’ouverture avec l’outil web a échoué ; aucun titre, auteur ou contenu n’est supposé.
- À faire lors de la prochaine phase du visualiseur : résoudre la redirection, lire la source originale, relever auteur/date, distinguer démonstration et résultats reproductibles, évaluer données, licence et pertinence.
- Aucune fonctionnalité dérivée introduite dans l’application académique.
