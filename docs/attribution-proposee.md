# Propositions d’ajout à ATTRIBUTION.md

Texte à relire et à intégrer par l’équipe si elle l’approuve. **`ATTRIBUTION.md` est resté inchangé.** Ces propositions décrivent des travaux des assistants, sans attribuer à un étudiant une vérification qu’il n’a pas rapportée.

## Claude Code — retours d’évaluation, 23 novembre 2026

- **Composants concernés :** 36 modules applicatifs renommés en `.mjs`, `sw.mjs`, script de migration `sw.js`, règles pures de `arrow-rules.mjs`, interaction et aperçu, saisie tactile, interface à icônes, aide de première visite, raccourcis, tests, captures et première rédaction des documents d’ergonomie, de règles et de migration.
- **Usage principal :** demandes de Bilel Khlif relayant les trois exigences du professeur : améliorer l’ergonomie mobile/AR, empêcher les flèches incohérentes et utiliser `.mjs`. Six commits sur `feature/ux-fleches-mjs`, de `1fb4fc4` à `770d1e8` ; arrêt sur limite d’usage alors que les documents étaient encore modifiés sans commit.
- **Vérifications de l’assistant :** 225 tests unitaires rapportés sur le dernier correctif ; 95 vérifications de navigateur rapportées sur une version antérieure. Ces résultats historiques ont été repris et vérifiés par la suite avec Codex. Captures obtenues sur l’application dans Chrome, AR émulée avec IWER. Aucune nouvelle mesure physique attribuée à l’équipe.
- **Contribution humaine attestée :** Bilel Khlif a fourni les consignes, les contraintes de préservation de l’autre branche et la demande de reprise. Relecture finale, validation sur téléphone et décision de fusion restent à consigner par l’équipe.

## Codex — reprise et vérification, 23 novembre 2026

- **Composants concernés :** disposition HTML/CSS des panneaux et outils, cadrage hors AR dans `scene.mjs`, sélection du porteur cohérente entre les règles et le départ d’une passe, tests adaptatifs et AR, vérification du cycle de migration PWA, documentation actuelle et historique, nouvelles captures, notes d’intégration future.
- **Usage principal :** reprendre le travail interrompu dans le même worktree, préserver les modifications, corriger les défauts démontrés, terminer les documents, vérifier puis préparer une PR distincte sans la fusionner. Aucun code d’analyse vidéo ajouté et aucune modification de la PR #15.
- **Vérifications de l’assistant :** sauvegarde des modifications héritées ; reproduction du débordement de l’aide à 320 × 568 et d’un bouton inaccessible à 568 × 320 ; correction et tests sur sept dimensions ; 226 tests unitaires et 104 vérifications de navigateur réussis sans échec ni cas ignoré, AR WebGPU et mode test WebGL compris. Migration installée de l’ancien `sw.js` vers `sw.mjs`, un rechargement, un seul enregistrement/cache, puis démarrage hors-ligne. Contrôle des imports, en-têtes, coquille et liens documentaires. Aucune mesure sur téléphone réel.
- **Contribution humaine attestée :** périmètre et interdiction de fusion définis par Bilel Khlif ; `ATTRIBUTION.md` réservé à sa relecture. Ne pas transformer les vérifications automatisées ou émulées en résultats humains ou matériels.

La vidéo de démonstration et les essais P0–P10 restent des livrables de l’équipe. Les anciens noms `.js` des déclarations historiques restent valables pour les versions qu’elles décrivent ; leur correspondance actuelle est dans [migration-mjs.md](migration-mjs.md).
