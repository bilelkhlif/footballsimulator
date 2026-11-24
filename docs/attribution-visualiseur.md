# Attribution du visualiseur de match (extension, PR #15)

Ce document détaille qui a fait quoi pour le **visualiseur de match par IA**, et sur quelles preuves.
Le visualiseur est une **extension postérieure au projet évalué** : il vit sur la branche
`feature/visualiseur-match` (pull request #15, non fusionnée) et ne fait pas partie de la version
notée de l'application AR. Le résumé déclaratif reste dans [ATTRIBUTION.md](../ATTRIBUTION.md)
(entrées « visualiseur de match ») ; ce fichier en est le détail vérifiable.

Convention : le champ `@responsable` des en-têtes désigne la personne qui porte la responsabilité du
code (consignes, revue, décision de fusion), pas son auteur. Les commits sont tous publiés sous le
nom de Bilel Khlif ; ce nom ne prouve pas à lui seul qui a écrit le code.

## Rôles

| Contributeur | Rôle documenté sur le visualiseur | Preuves |
| --- | --- | --- |
| **Bilel Khlif** | Demande de l'extension (17 novembre 2026) ; exigences : réutiliser les solutions libres, ne jamais inventer de position, publier seulement ce qui est redistribuable ; demande de revue critique avant toute fusion ; références fournies (trois publications LinkedIn) ; priorités et contraintes des travaux du 23 et du 24 novembre (analyse reprenable, échanges d'identifiants, mode démo et mode local, isolement des branches) ; fusion réservée à son accord | ATTRIBUTION.md (contributions 23 et 24), descriptions de la PR #15, [sports-analytics-references.md](sports-analytics-references.md) |
| **Claude Code** (Anthropic, modèle Claude Opus 5.5 d'après le journal de développement) | Recherche des composants libres ; architecture ; code Python et JavaScript ; tests ; validations sur vidéos réelles ; documentation ; diagnostics et corrections ; le 24 novembre 2026, reprise des corrections de Codex interrompu par sa limite d'usage : reproduction indépendante sur le code d'origine, compléments, vérification complète et commits | Commits de la branche (tableau ci-dessous) ; journaux de validation datés dans `docs/` |
| **OpenAI Codex** | Deux revues indépendantes, puis, à la demande de Bilel Khlif le 24 novembre 2026, corrections commencées et laissées sans commit à sa limite d'usage : interruption atomique, normalisation des routes, confinement des exports, réponses asynchrones et remise à zéro des panneaux ; tests de non-régression et plan d'intégration. Correction du Service Worker préparée séparément depuis `main` | Tests de non-régression dans `analysis/tests/` et `tests/visualizer-modes-tests.mjs`, historique des corrections après `84463ad`, [visualiseur-modes.md](visualiseur-modes.md). Travail académique antérieur dans les PR #16 et #17 ; proposition académique de la PR #18 non modifiée |
| **ChatGPT** | Aucun usage connu sur le visualiseur | — |
| **Iyed Rachdi, Ghassen Dalleji** | Aucune contribution consignée au visualiseur ; leur rôle dans le projet évalué est décrit dans ATTRIBUTION.md | — |

## Contributions et preuves

Niveaux de vérification : **A** automatisée (tests), **R** réelle (vrai pipeline sur GPU, vraie vidéo,
dans Chrome), **P** physique (téléphone) ; aucune vérification P n'est faite pour le visualiseur.

| Travail | Décision et responsabilité humaines | Réalisation assistée | Preuves (commits, fichiers, tests) | Vérification |
| --- | --- | --- | --- | --- |
| Recherche des solutions libres | Demande de réutiliser l'existant, critères de licence et de maintenance | Comparaison des projets, licences relevées dans les métadonnées | `ae96ead` ; [opensource-research.md](opensource-research.md) | Documentaire |
| Serveur et chaîne d'analyse : détection YOLOv8 (poids Roboflow Sports), suivi ByteTrack, coupures, calibration RANSAC | Exigence : aucune position sans calibration | Code et tests | `15744f9`, `89fb187`, `bf8cb47`, `4d92011` ; `analysis/football_analysis/` ; `analysis/tests/` | A, R |
| Équipes : SigLIP, UMAP, KMeans, vote par trajectoire, cadrage des maillots | Revue critique demandée le 17 novembre | Diagnostic et corrections (pelouse, votes) | `0faf219`, `c0cafa4`, `d127e54`, `829b3b7` ; [validation-equipes-2026-11-17.json](validation-equipes-2026-11-17.json) | A, R (audit interne de 446 observations) |
| Terrain 3D dans la vidéo, sélection, panneau, placement automatique | Exigence d'un terrain 3D inséré dans la vidéo, pas d'une vue 2D séparée | Code et tests de bout en bout | `1c81934`, `4c284be`, `eee9ef3`, `40185bc` ; `src/visualizer/` ; `tests/visualizer-tests.mjs` | A |
| Analyse par segments SQLite, reprise, chargement par fenêtres | Travaux du 23 novembre | Code, tests, mesures | `4f62247` ; [analyse-incrementale.md](analyse-incrementale.md) ; `test_chunks.py` ; [validation-incrementale-2026-11-23.json](validation-incrementale-2026-11-23.json) | A, R |
| Correction des échanges d'identifiants aux contacts masqués | Priorité donnée le 24 novembre ; consigne : identité « incertaine » plutôt qu'un lien inventé | Diagnostic (4 échanges), contrôle d'après les maillots, tests | `91e15c6`, `39a15db`, `5bf01ff`, `e8ae5c0` ; [identites-contacts.md](identites-contacts.md) ; `test_identity.py` | A, R (audit interne : 3 erreurs à 0, sur les vidéos qui ont servi à la mise au point) |
| Détection des coupures plus rapide | — | Réduction des images comme PySceneDetect | `2c38da4` ; `test_tracking.py` | A, R |
| Démonstration publique et export statique | Consignes du 24 novembre : démo utilisable sans Python, aucune vidéo non redistribuable | Générateur synthétique, exportateur, schémas, source statique | `demo_match.py`, `static_export.py`, `src/visualizer/static-source.mjs`, `schemas/`, `demo/` ; `test_static_export.py`, `visualizer-sources.test.mjs`, `visualizer-modes-tests.mjs` | A, R (export d'une analyse réelle relu sans serveur) |
| Mode local, sécurité, interruption | Consignes : boucle locale par défaut, aucune opération annoncée que le serveur ne sait pas faire | Origines, hôte, CORS, accès au réseau local, interruption coopérative, états | `server.py`, `jobs.py`, `src/visualizer/local-source.mjs` ; `test_server_security.py` ; `tests/visualizer-local-ai.mjs` | A, R (Chrome 158, page publique réelle, vrai pipeline) |
| Audit des licences de redistribution | Exigence : ne rien publier dont la licence n'est pas lue | Métadonnées des paquets installés | [visualiseur-modes.md](visualiseur-modes.md), partie 6 | Documentaire |
| Corrections des deux revues indépendantes | Bilel Khlif autorise Codex, puis Claude Code après la limite d'usage de Codex, à corriger, tester, commettre et pousser ; aucune fusion autorisée | Codex : reproductions déterministes, corrections des cinq défauts du visualiseur, tests et plan d'intégration ; correction du Service Worker sur une branche séparée. Claude Code : reproduction des défauts sur le code d'origine (25 contrôles Python et 4 vérifications Chrome en échec), alignement du contrôle des adresses du navigateur, vérifications complètes, commits | Commits après `84463ad`, `analysis/tests/`, `tests/visualizer-async-regressions.mjs`, `tests/unit/visualizer-sources.test.mjs` ; [visualiseur-modes.md](visualiseur-modes.md) | A ; aucun nouveau contrôle du pipeline réel ni essai physique revendiqué |

## Déclarations écartées, faute de preuve

- Qui a téléversé, le 17 novembre, le résumé de la finale de la Coupe du monde 2022 présent dans les
  analyses locales : l'opération est visible, son auteur non.
- Une relecture humaine ligne à ligne du code du visualiseur : aucune trace n'en est consignée.
- Toute contribution d'Iyed Rachdi ou de Ghassen Dalleji au visualiseur : aucune n'est documentée.
- Toute précision de l'analyse au-delà des audits internes cités : aucune vérité terrain indépendante.
- Tout essai du visualiseur sur téléphone : aucun n'est consigné.

## Points à confirmer par l'équipe

- Orthographe confirmée par Bilel Khlif le 24 novembre 2026 : **Ghassen Dalleji**. ATTRIBUTION.md et
  d'autres documents historiques écrivent encore « Dallekji » ; ils sont listés pour relecture dans la
  proposition d'attribution académique (PR #18), sans être corrigés ici.
- Si le visualiseur doit un jour entrer dans la version évaluée : l'inscrire alors dans ATTRIBUTION.md
  de `main`, avec ce tableau et les commits de la fusion.
