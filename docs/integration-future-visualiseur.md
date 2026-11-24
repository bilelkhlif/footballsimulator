# Intégration future du visualiseur : note différée

> Intégration réalisée : voir le [compte rendu d'intégration](integration-visualiseur.md). Cette note reste comme trace de la décision différée.

Cette note n’ajoute aucune fonction vidéo à l’application académique et ne modifie pas l’autre branche.

## Frontières après la revue de la PR nº 17

La tête de la PR nº 15 vérifiée le 24 novembre 2026 est
`e8ae5c0b4731107801f73c0a7b9b4c27d4372fb7`. Les références suivantes au relevé du
23 novembre restent historiques ; ses imports devront être relus sur la tête retenue au moment
d'une future intégration. Cette revue ne change ni ses fichiers ni son historique.

Un éventuel espace Vidéo devra utiliser le contrôleur d'espaces existant pour la navigation,
avec une propriété explicite de la scène, du tableau, de l'historique et de la saisie. Il ne doit
pas installer un second gestionnaire de pointeur ou une seconde boucle sur le terrain académique.
Une transition devra désactiver proprement le propriétaire de la saisie précédent, et conserver
ou isoler explicitement les positions calculées par la vidéo. La migration des imports vers
`.mjs` sera traitée dans ce lot séparé, avec ses propres tests.

Le cache académique reste limité à sa coquille statique. Vidéos, modèles, résultats d'analyse
et réponses du backend ne doivent pas entrer dans `APP_SHELL`. Les modes AR, la portée GitHub
Pages et le cache hors ligne devront être rejoués après cette future intégration.

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
