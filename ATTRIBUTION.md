# 📄 Fichier d'Attribution et d'Origine des Ressources (ATTRIBUTION.md)

**Projet :** Football Simulator

**Équipe :** Iyed Rachdi, Bilel Khlif, Ghassen Dallekji

**Version :** 1.0 — Évaluation SUP'COM (2026/2027)

---

## 1. Modèles 3D, Textures et Assets Graphiques

Tout asset tri-dimensionnel ou visuel importé doit être consigné ci-dessous.

Aucun modèle 3D, aucune texture et aucune police n'est importé d'une source externe : la géométrie est générée par le code avec les primitives de three.js, et les textures sont dessinées à l'exécution sur un canvas. Les éléments visuels présents dans le dépôt sont listés ci-dessous.

*   **Asset :** Terrain (plateau, gazon rayé, lignes, buts et filets)

    * **Source originale :** créé pour le projet, `src/pitch.js`

    * **Auteur / Créateur :** Équipe Football Simulator (conception collective selon le cahier des charges) ; pilotage de la réalisation par Bilel Khlif avec Claude Code.

    * **Licence :** aucune licence choisie à ce jour (pas de fichier `LICENSE` dans le dépôt)

    * **Modifications apportées par l'équipe :** sans objet, asset créé pour le projet ; lignes tracées sur une texture canvas de 1808 × 1216 px selon les mesures des lois du jeu de l'IFAB

*   **Asset :** Pions joueurs, numéros de maillot et ballon

    * **Source originale :** créés pour le projet, `src/players.js` et `src/ball.js` (`CapsuleGeometry`, `SphereGeometry`, sprites dessinés sur canvas)

    * **Auteur / Créateur :** Équipe Football Simulator (conception collective selon le cahier des charges) ; pilotage de la réalisation par Bilel Khlif avec Claude Code.

    * **Licence :** aucune licence choisie à ce jour

    * **Modifications apportées par l'équipe :** sans objet, asset créé pour le projet

*   **Asset :** Réticule de visée de l'AR (anneau doré pulsant)

    * **Source originale :** créé pour le projet au sprint 3, `src/reticle.js` (`RingGeometry` de three.js, matériau écrit en TSL)

    * **Auteur / Créateur :** Claude Code (génération), sous le pilotage de Bilel Khlif.

    * **Licence :** aucune licence choisie à ce jour

    * **Modifications apportées par l'équipe :** sans objet, asset créé pour le projet

*   **Asset :** Icônes de l'application (`assets/icons/icon.svg`, `icon-maskable.svg` et les PNG dérivés)

    * **Source originale :** dessinées pour le projet en SVG, d'après l'illustration de couverture du cahier des charges ; PNG produits avec la bibliothèque sharp

    * **Auteur / Créateur :** Bilel Khlif (direction technique et spécifications), avec assistance de Claude Code pour la réalisation.

    * **Licence :** aucune licence choisie à ce jour

    * **Modifications apportées par l'équipe :** sans objet, asset créé pour le projet

*   **Asset :** Bannière, captures et diapositives de `docs/images/`, captures du manifeste (`assets/screenshots/`), figures de `docs/etat-de-l-art/figures/`

    * **Source originale :** captures de l'application elle-même, prises par script dans Chrome ; diapositives exportées de la présentation d'état de l'art du projet

    * **Auteur / Créateur :** Bilel Khlif (direction technique et spécifications), avec assistance de Claude Code pour la réalisation.

    * **Licence :** aucune licence choisie à ce jour

    * **Modifications apportées par l'équipe :** sans objet, asset créé pour le projet

---

## 2. Bibliothèques tierces et Modules externes (Pinnés)

Rappel : L'usage des versions "latest" depuis les CDN est proscrit.

*   **Bibliothèque :** three.js, build WebGPU

    * **Version fixée :** r187 (npm `three@0.187.0`, publiée le 30 octobre 2026), copie locale dans `src/vendor/three-r187/build/` : `three.webgpu.js`, `three.core.js` et `three.tsl.js`, identiques au paquet npm (empreintes SHA-256 dans `src/vendor/three-r187/README.md`)

    * **Lien CDN de référence :** https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.webgpu.js

    * **Rôle dans le projet :** moteur de rendu 3D en WebGPU depuis le sprint 3 (sans repli WebGL), matériaux à nœuds et TSL, session WebXR rendue en WebGPU par `XRGPUBinding`. Son backend WebGL 2 ne sert qu'au mode test (`?webgl` dans l'adresse), réservé aux tests. Aux sprints 1 et 2 : r186 (`three@0.186.1`), en WebGL, retirée du dépôt au sprint 3

*   **Bibliothèque :** OrbitControls (module complémentaire de three.js)

    * **Version fixée :** r187 (npm `three@0.187.0`), copie locale dans `src/vendor/three-r187/examples/jsm/controls/`

    * **Lien CDN de référence :** https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/controls/OrbitControls.js

    * **Rôle dans le projet :** rotation, zoom et déplacement de la vue 3D hors AR

*   **Bibliothèque :** IWER, Immersive Web Emulation Runtime (Meta, licence MIT)

    * **Version fixée :** 2.7.0 (la 2.8.0, publiée la veille du sprint 1, n'a pas été retenue)

    * **Lien CDN de référence :** https://cdn.jsdelivr.net/npm/iwer@2.7.0/build/iwer.module.js

    * **Rôle dans le projet :** émulation WebXR sur PC, chargée seulement avec le paramètre d'adresse `?iwer`, en développement ; complétée au sprint 3 par notre module `src/dev-xr-emulation.js` (liaison WebXR/WebGPU et hit test émulés)

*   **Bibliothèque :** playwright-core (Microsoft, licence Apache 2.0)

    * **Version fixée :** 1.64.1 (`package.json` et `package-lock.json`)

    * **Lien CDN de référence :** sans objet (outil de développement installé via npm) ; référence : https://www.npmjs.com/package/playwright-core/v/1.64.1

    * **Rôle dans le projet :** pilote Chrome pour les tests `npm test` ; outil de développement, jamais chargé par l'application

Outils utilisés hors du projet, non distribués avec l'application : Google Chrome pour les tests et les captures, le lanceur de tests intégré à Node.js (`node --test`) pour les tests unitaires, sharp pour les icônes PNG, Python et Pillow pour le traitement des images, pptxgenjs et PowerPoint pour la présentation, MiKTeX (pdfLaTeX, polices Latin Modern) pour le rapport.

---

## 3. Extraits de code copiés ou adaptés (StackOverflow, Tutoriels, Dépôts tiers)

L'usage de code tiers sans citation est un motif d'annulation de la note technique.

*   **Fonction / Fichier :** `src/dev-emulator.js`, fonction `installEmulatorIfRequested`

    * **Source du code original :** guide de démarrage d'IWER, https://meta-quest.github.io/immersive-web-emulation-runtime/getting-started.html

    * **Auteur :** Meta (licence MIT)

    * **Adaptation effectuée :** les deux lignes du guide (`new XRDevice(metaQuest3)` puis `installRuntime()`) sont encadrées par un chargement conditionnel (paramètre `?iwer` et absence d'AR native), un import dynamique depuis jsDelivr en version épinglée, et l'option `forceInstall`, nécessaire car Chrome sur PC expose déjà un `navigator.xr` sans AR.

*   **Fonction / Fichier :** `index.html`, carte d'import

    * **Source du code original :** manuel de three.js, page « Installation », https://threejs.org/manual/#en/installation ; au sprint 3, les entrées `three/webgpu` et `three/tsl` des exemples WebGPU de three.js

    * **Auteur :** contributeurs de three.js (licence MIT)

    * **Adaptation effectuée :** les adresses du CDN sont remplacées par la copie locale (`src/vendor/three-r187/` depuis le sprint 3), et `three` pointe vers le build WebGPU.

*   **Fonction / Fichier :** `src/webgpu.js`, constructeur de la classe `WebGpuOnlyRenderer` (sprint 3)

    * **Source du code original :** constructeur de `WebGPURenderer` de three.js r187 (`src/renderers/webgpu/WebGPURenderer.js` dans le dépôt de three.js ; même code dans `src/vendor/three-r187/build/three.webgpu.js`)

    * **Auteur :** contributeurs de three.js (licence MIT)

    * **Adaptation effectuée :** trois instructions reprises : création du backend `WebGPUBackend`, bibliothèque `StandardNodeLibrary` et drapeau `isWebGPURenderer`. La branche qui crée un backend WebGL de secours (`getFallback`) est retirée et remplacée par `getFallback: null`.

En dehors des adaptations recensées pour le sprint 1, aucun extrait de StackOverflow, de tutoriel ou de dépôt tiers n'a été copié dans le sprint 1. Les dimensions du terrain dans `src/pitch.js` reprennent les lois du jeu de l'IFAB (données, pas du code).

Sprint 2 : aucun extrait copié. L'enchaînement de la session suit l'API de WebXR et celle de three.js r186 (`WebXRManager.setSession`), lue dans la copie locale de `src/vendor/three/` ; l'exemple `ARButton.js` de three.js n'a pas été utilisé.

Sprint 3 : en dehors du constructeur de `WebGpuOnlyRenderer` ci-dessus, aucun extrait copié. Le hit test, le réticule et l'ancre (`src/ar-surface.js`, `src/reticle.js`) suivent les spécifications WebXR Hit Test et WebXR Anchors : source de hit test depuis l'espace `viewer`, matrice du réticule lue dans la pose du résultat. C'est le même enchaînement que dans l'exemple `webxr_ar_hittest` de three.js, mais sans reprise de son code ; l'échantillon `hit-test-anchors` n'a pas été utilisé. Le correctif de la cible de rendu XR (`matchXrTargetToViews`) et l'émulation (`src/dev-xr-emulation.js`) sont propres au projet, écrits après lecture du code de three.js r187 et d'IWER 2.7.0.

Sprint 4 : les formations sont propres au projet ; aucun code ni aucune donnée de boardx n’a été repris, selon le journal du sprint.

---

## 4. Déclaration de l'usage des Assistants IA (Copilot, ChatGPT, Claude)

L'utilisation d'IA est un outil de complétion. Elle doit être documentée et maîtrisée.

Assistants utilisés : **Claude Code** (Anthropic), du 5 au 14 novembre 2026 (modèle indiqué dans le journal de développement : Claude Opus 5.5), pour l’implémentation, les tests et la documentation ; **ChatGPT** pour la reformulation de ce fichier d’attribution.

**Bilel Khlif — Responsable du sprint 1, pilotage technique, intégration WebXR/WebGPU et validation.** Responsable du sprint 1, il assure la conduite technique documentée des sprints 1 à 4 : découpage des travaux, formalisation des contraintes, interaction avec l’assistant de développement, revue des livrables, essais sur appareils physiques et intégration sur GitHub. Son rôle couvre notamment les arbitrages entre rendu WebGPU de production et mode WebGL de test, ainsi que la traduction des exigences pédagogiques en critères de validation.

**Iyed Rachdi et Ghassen Dallekji — Contribution au cadrage collectif.** Avec Bilel Khlif, ils participent au cahier des charges de référence, qui définit les fonctionnalités, les contraintes d’architecture et les scénarios de démonstration. La répartition individuelle des autres travaux n’est pas détaillée dans le journal initial. Les essais collectifs sur téléphone prévus aux sprints 3 et 4 restent à mener.

**Modalité de développement.** Le travail d’implémentation, notamment la génération du code des sprints 1 à 4, des tests et de la documentation, a été réalisé avec Claude Code à partir du cahier des charges collectif et sous le pilotage technique de Bilel Khlif. Les sprints 2 et 3 sont documentés comme intégralement générés par l’assistant. La contribution étudiante porte sur les spécifications, la direction des travaux, les arbitrages, la revue des livrables, les essais physiques et l’intégration.

**Traçabilité :** le champ « Prompt ou usage principal » décrit les usages documentés et le périmètre technique de l’assistance pour chaque composant ; il ne reproduit pas un historique de conversation. Les essais physiques sont distingués des vérifications automatisées et émulées.

**Contributions documentées de Bilel Khlif :**

1.  **Pilotage du sprint 1** (5 au 9 novembre 2026) : périmètre fixé d'après le cahier des charges (§5.3), consignes données à l'assistant, publication sur le dépôt GitHub du projet.

2.  **Veille** : une publication LinkedIn sur l'analyse vidéo de match, fournie comme point de départ, à l'origine de la partie « vision par ordinateur » du rapport d'état de l'art.

3.  **Direction des présentations** : première version de la présentation refusée, jugée trop générique ; refonte demandée sur le modèle de trois présentations de référence qu'il a fournies (BlurUAV, Trust before you trade, GreenBench), avec des transitions soignées entre les diapositives.

4.  **Format du rapport** : rapport d'état de l'art exigé en LaTeX, au format PDF.

5.  **Nom du projet** : choix de « Football Simulator », appliqué au code, au rapport, à la présentation et à la documentation.

6.  **Documentation** : refonte du README dans le style des livrables, avec captures et synthèse de l'état de l'art ; demande d'une documentation et d'une explication complètes du code, d'où le guide du code et les tests automatisés.

7.  **Conformité** : mise en place de ce fichier selon le modèle de l'enseignant, puis relecture intégrale le 9 novembre 2026.

8.  **Revue du code** : lecture et approbation du guide du code (`docs/guide-du-code.md`), qui détaille chaque fichier et chaque fonction, le 9 novembre 2026.

9.  **Validation** : pull request #1 validée et fusionnée dans `main` le 9 novembre 2026.

10. **Sprint 2** : consignes détaillées fournies à l'assistant pour les étapes 0 à 2, puis 3 à 6 (périmètre, contraintes techniques, tests attendus et exigences d'attribution), les 9 et 10 novembre 2026.

11. **Tests sur appareils réels** : application testée le 12 novembre 2026 sur le site publié, sur deux téléphones Android avec Chrome (Samsung Galaxy S récent et TECNO POVA 6 Pro 5G), un iPhone 15 avec Safari et un PC ASUS TUF A15 avec Chrome.

12. **Mise en ligne** : pull request #3 du sprint 2 validée et fusionnée dans `main`, puis publication sur GitHub Pages, le 12 novembre 2026.

13. **Signalement d'un défaut** : AR qui ne se lançait plus après des problèmes de réseau, signalé le 12 novembre 2026 avec la demande de la rétablir ; à l'origine du correctif du réseau lent (`sw.js`).

14. **Sprint 3** : transmission des demandes de l'enseignant, le 14 novembre 2026 : rendu WebGPU sans repli sur WebGL, application installable (PWA), explication de la boucle de rendu dans le README, et un nouveau sprint.

15. **Tests sur appareils réels du sprint 3**, le 14 novembre 2026, sur le site publié :

    * PC ASUS TUF A15 avec Chrome : vue 3D en WebGPU ;

    * Samsung Galaxy S10e sous Android 9, avec Brave puis Chrome 138 : WebGPU bloqué, rapport `chrome://gpu` fourni ; essai du réglage `#enable-unsafe-webgpu` ; mise à jour d'Android vérifiée ;

    * iPhone sous iOS 18 : pas d'AR, comme prévu.

16. **Mode test WebGL** : demande d'un moyen de tester l'AR sur son seul téléphone disponible, et décision que ce rendu WebGL serve uniquement aux tests, sans être un repli.

17. **Test du mode test WebGL** sur le Galaxy S10e, le 14 novembre 2026, sur le site publié : tout fonctionne, AR comprise.

18. **Sprint 4** : demande de réaliser le sprint 4 du cahier des charges, le 14 novembre 2026.

19. **Test de l'AR rendue en WebGPU sur téléphone** : test physique réussi sur le TECNO POVA 6 Pro 5G, rapporté le 14 novembre 2026.

**Déclaration détaillée par composant**

*   **Composant ou Shader concerné :** code du sprint 1 : `index.html`, `manifest.json`, `sw.js`, `src/*.js` et `src/styles.css` (hors `src/vendor/`), tests (`tests/`, `package.json`) et fichiers de configuration du dépôt (`.editorconfig`, `.gitattributes`, `.gitignore`)

    * **Prompt ou usage principal :** génération du code à partir du cahier des charges rédigé par l'équipe, sur consigne de Bilel Khlif de réaliser le sprint 1 et de le publier sur GitHub : périmètre du sprint (§5.3), patrons Strategy et Factory (§3.4), règles de code (§7.1).

        **Périmètre technique :** Architecture modulaire, séparation de la scène et de la logique métier, génération procédurale du terrain et des textures Canvas, formations Strategy, création des objets 3D par Factory, dépendances versionnées et préparation de l’intégration XR. Vérifications de géométrie, de cadrage, de chargement et de compatibilité avec IWER et GitHub Pages.

    * **Axe de vérification appliqué par l’étudiant :** Bilel Khlif a relu le guide du code et validé la PR #1. Vérifications techniques consignées dans le journal du sprint (tests et contrôles réalisés avec l’assistant) :

        * `npm test` : 11 vérifications de bout en bout dans Chrome, que chacun peut rejouer : chargement sans erreur sur bureau (1280 × 800), sur mobile (390 × 844) et sous un sous-chemin comme sur GitHub Pages ; trois formations conformes au critère « 11 joueurs bien placés » du cahier (§4.3), avec les numéros 1 à 11, chaque joueur dans sa moitié et hors du rond central, et un écart minimal de 7,1 cm entre deux joueurs ; badge d'état de l'AR ; Service Worker et rechargement hors-ligne ; session `immersive-ar` émulée avec IWER. Résultat le 9 novembre 2026 : 11 réussies sur 11 ;

        * le test des formations a lui-même été contrôlé par une erreur volontaire (deux joueurs du 4-3-3 avec le même numéro) : il échoue comme attendu ;

        * ces vérifications ont révélé deux défauts, corrigés avant le commit : un cadrage de caméra qui coupait le terrain, et IWER qui refusait de s'installer sur Chrome PC ;

        * revue du code par Bilel Khlif à partir du guide du code (`docs/guide-du-code.md`), qui explique chaque fichier et chaque fonction avec les réponses aux questions probables du jury : guide lu et approuvé le 9 novembre 2026 ;

        * la pull request #1 a été validée par Bilel Khlif et fusionnée dans `main` le 9 novembre 2026 ;

        * le test sur un téléphone Android, prévu avec l'ouverture de la session AR (cahier §4.2), a été fait le 12 novembre 2026 : voir l'entrée du sprint 2 ci-dessous.

*   **Composant ou Shader concerné :** code du sprint 2, généré en deux sessions : étapes 0 à 2 le 9 novembre 2026 (bouton « Entrer en AR » dans `index.html` et `src/main.js`, activation de WebXR dans `src/scene.js`), puis étapes 3 à 6 les 9 et 10 novembre 2026 (`src/events.js`, `src/xr-session.js`, `src/ar-view.js`, `src/ar-placement.js`, `src/render-loop.js`, modifications de `src/main.js`, `src/scene.js`, `index.html`, `src/styles.css` et `sw.js`, tests unitaires de `tests/unit/`, parcours AR de `tests/run-tests.mjs` et `package.json`)

    * **Prompt ou usage principal :** génération assistée sur instructions détaillées de Bilel Khlif pour chaque groupe d’étapes (périmètre, contraintes techniques, tests attendus) et cahier des charges (§5.3, §3.4, §7.1).

        **Périmètre technique :** Cycle de vie de la session immersive : détection de capacité, ouverture et fermeture, espace de référence `local-floor`, gestion des contrôles de caméra, restauration de la scène et traitement des échecs d’initialisation. Intégration progressive et vérifications avec IWER et tests unitaires.

    * **Axe de vérification appliqué par l’étudiant :** Bilel Khlif a fourni les contraintes par étape, validé la PR #3 et effectué les essais physiques du 12 novembre. Vérifications automatisées avec l’assistant :

        * `npm test` : 28 tests unitaires, où WebXR et three.js sont remplacés par des doublures (détection, entrée réussie, session refusée, échec de l'espace de référence et de la couche de rendu, fin de session, notifications, restauration de la scène, contrôles d'orbite en pause, placement du terrain), puis 18 vérifications de bout en bout, dont 7 pour le parcours AR complet avec l'émulateur IWER. Résultat le 10 novembre 2026 : 46 réussies sur 46 ;

        * deux erreurs introduites volontairement (contrôles d'orbite actifs en AR, session laissée ouverte quand `local-floor` manque) ont fait échouer 3 tests, puis le code a été restauré ;

        * l'enchaînement de la session (`renderer.xr.setSession`, couche `XRWebGLLayer`, espace de référence) a été vérifié dans le code de three.js r186 de la copie locale ;

        * le fonctionnement est expliqué dans `docs/sprint-2.md`, avec les réponses aux questions probables du jury ;

        * tests sur appareils réels par Bilel Khlif, le 12 novembre 2026, sur le site publié : entrée en AR, terrain visible et sortie conformes sur deux téléphones Android avec Chrome (Samsung Galaxy S récent, TECNO POVA 6 Pro 5G) ; vue 3D conforme sur iPhone 15 avec Safari, sans AR comme prévu, et sur PC ASUS TUF A15 avec Chrome. Résultats et protocole dans `docs/sprint-2.md`.

*   **Composant ou Shader concerné :** correctif du réseau lent, le 12 novembre 2026 : délai d'attente du réseau dans `sw.js`, retard simulé dans `tests/serve.mjs` (`setLatency`) et test « Lancement sur réseau très lent » dans `tests/run-tests.mjs`

    * **Prompt ou usage principal :** demande de Bilel Khlif de rétablir l'AR, qui ne se lançait plus après des problèmes de réseau. Diagnostic, code et test générés par l'assistant.

        **Périmètre technique :** Diagnostic de l’initialisation après un incident réseau, gestion du délai d’attente du Service Worker et reproduction du défaut par latence artificielle. Vérification de non-régression avant et après correction.

    * **Axe de vérification appliqué par l’étudiant :** Bilel Khlif a constaté et signalé la régression sur le site publié. Reproduction et validation automatisées par l’assistant :

        * site publié contrôlé avant toute modification : les 28 fichiers de `APP_SHELL` répondent (code 200) dans la version de `main`, et les 7 vérifications du parcours AR avec IWER réussissent sur le site publié ; seul le test séparé de l'émulateur a dépassé son délai, le CDN d'IWER ayant tardé à répondre ;

        * le nouveau test fait échouer l'ancien `sw.js` (page toujours pas prête après 30 secondes) et réussit avec le correctif (page prête en 3,7 secondes, serveur retardé de 30 secondes) ;

        * `npm test` le 12 novembre 2026 : 28 tests unitaires réussis sur 28, puis 19 vérifications de bout en bout réussies sur 19 ;

        * explication dans `docs/sprint-2.md` (partie 12) et dans `docs/guide-du-code.md` ; confirmation sur téléphone à faire une fois le correctif publié.

*   **Composant ou Shader concerné :** code du sprint 3, le 14 novembre 2026 : `src/webgpu.js`, `src/ar-surface.js`, `src/reticle.js`, `src/dev-xr-emulation.js` ; modifications de `src/main.js`, `src/scene.js`, `src/pitch.js`, `src/xr-session.js`, `src/xr-support.js`, `src/ar-view.js`, `src/ar-placement.js`, `src/render-loop.js`, `src/pwa.js`, `src/dev-emulator.js`, `src/styles.css`, `index.html`, `manifest.json` et `sw.js` ; copie de three.js r187 ; tests (`tests/unit/`, `tests/run-tests.mjs`, `package.json`)

    * **Prompt ou usage principal :** demandes de l'enseignant transmises par Bilel Khlif (WebGPU sans repli WebGL, PWA, boucle expliquée dans le README, nouveau sprint) et sprint 3 du cahier des charges (§5.3 : hit testing, réticule, pose par un tap ; §4.3 : terrain stable).

        **Périmètre technique :** Migration WebGPU sans repli automatique, étude du chemin XR via `XRGPUBinding`, compatibilité des cibles de rendu avec le nombre de vues, réticule TSL, hit test, placement et ancrage du terrain, PWA et documentation de la boucle de rendu. Contrôles du backend, de l’émulation et de la stabilité spatiale.

    * **Axe de vérification appliqué par l’étudiant :** Bilel Khlif a vérifié la vue WebGPU sur PC, testé la compatibilité de ses téléphones et fourni le rapport GPU. Les vérifications suivantes sont documentées dans le journal de l’assistant :

        * faisabilité vérifiée aux sources avant le code. Dans three.js r187, le chemin WebGPU de `XRManager` (`XRGPUBinding`, fonctionnalité `webgpu`) a été lu dans la copie locale. Chez Chrome, la fiche Chrome Platform Status de la liaison WebXR/WebGPU a été consultée (mise à jour du 26 octobre 2026, aucune version de livraison). Dans le code de Chromium : le réglage `webxr-webgpu-binding`, proposé sous Windows et Android, et sa prise en charge par le périphérique ARCore depuis octobre 2024 ;

        * `npm test` le 14 novembre 2026 : 67 tests unitaires réussis sur 67, puis 26 vérifications de bout en bout réussies sur 26. Elles comprennent un rendu WebGPU sans aucun contexte WebGL, un message sans repli quand WebGPU est retiré, et le parcours AR émulé complet : session WebGPU, réticule, pose et ancre du terrain, déplacement, sorties, messages d'échec, aucune erreur dans la console ;

        * trois erreurs introduites volontairement, puis retirées. Le retour au `WebGPURenderer` de three.js avec son repli WebGL fait échouer 1 test unitaire et 2 de bout en bout ; la suppression de l'alignement de la cible XR, 1 test unitaire et 1 de bout en bout ; l'absence d'ancre, 6 tests unitaires ;

        * un défaut de three.js r187 a été trouvé par ces tests : une cible de rendu XR à deux couches, qui provoque des erreurs WebGPU sur un appareil à une seule vue comme un téléphone. Il est contourné par l'API publique de three.js, et la copie de three.js reste identique au paquet npm ;

        * captures prises par script sur l'application réelle et contrôlées à l'œil ;

        * fonctionnement expliqué dans `docs/sprint-3.md` et dans la partie « La boucle de rendu » du README ;

        * test physique de l'AR rendue en WebGPU réussi sur le TECNO POVA 6 Pro 5G, rapporté par Bilel Khlif le 14 novembre 2026 ; protocole et résultats dans `docs/sprint-3.md` (partie 13).

*   **Composant ou Shader concerné :** mode test WebGL, le 14 novembre 2026 : `src/webgl-test-mode.js` ; modifications de `src/main.js`, `src/scene.js`, `src/xr-session.js`, `src/xr-support.js`, `src/render-loop.js`, `src/dev-xr-emulation.js`, `src/styles.css` et `sw.js` ; tests (`tests/unit/`, `tests/run-tests.mjs`)

    * **Prompt ou usage principal :** demande de Bilel Khlif de pouvoir tester l'AR sur son seul téléphone disponible, un Galaxy S10e sous Android 9 où Chrome bloque WebGPU, avec la consigne que ce rendu WebGL soit réservé aux tests et ne soit pas un repli.

        **Périmètre technique :** Isolement du chemin WebGL de test par `?webgl`, distinction des backends, réutilisation des interactions et vérification de l’absence de repli automatique en production.

    * **Axe de vérification appliqué par l’étudiant :** Bilel Khlif a imposé la séparation production/test et validé l’AR WebGL sur son Galaxy S10e. Contrôles automatisés avec l’assistant :

        * le mode ne démarre qu'avec `?webgl` dans l'adresse. Aucun bouton n'y mène, et l'écran d'erreur sans WebGPU ne propose rien : un test de bout en bout vérifie l'absence de lien ou de bouton vers WebGL et de tout contexte WebGL ;

        * `npm test` le 14 novembre 2026 : 73 tests unitaires réussis sur 73, puis 37 vérifications de bout en bout réussies sur 37, dont le parcours AR émulé rejoué en mode test ;

        * un défaut propre à l'émulateur a été trouvé et contourné : IWER fournit un framebuffer nul, que le backend WebGL de three.js r187 refuse. Il est sans effet sur un vrai téléphone ;

        * test sur le Galaxy S10e par Bilel Khlif, le 14 novembre 2026, sur le site publié : tout fonctionne, AR comprise.

*   **Composant ou Shader concerné :** code du sprint 4, le 14 novembre 2026 : `src/tactics-board.js`, `src/formation-transition.js`, `src/formation-panel.js` ; modifications de `src/formations.js` (4-2-3-1), `src/team.js`, `src/render-loop.js`, `src/main.js`, `index.html`, `src/styles.css` et `sw.js` ; tests (`tests/unit/`, `tests/run-tests.mjs`)

    * **Prompt ou usage principal :** demande de Bilel Khlif de réaliser le sprint 4, à partir du cahier des charges : §5.3 (système de formations, deux équipes, ballon, boutons HTML), BF4, scénario de démonstration (§4.1, étape 5), patrons Strategy et Observer (§3.4).

        **Périmètre technique :** Système tactique : deux équipes, quatre formations, Strategy et Observer, transitions par numéro de maillot, interpolation dans le temps, placement final exact, mise à jour dans la boucle de rendu et préférence de réduction des animations.

    * **Axe de vérification appliqué par l’étudiant :** Bilel Khlif a lancé le sprint à partir des critères collectifs définis avec Iyed Rachdi et Ghassen Dallekji. Les résultats ci-dessous sont automatisés ; la validation physique par l’équipe reste à réaliser :

        * `npm test` le 14 novembre 2026 : 94 tests unitaires réussis sur 94, puis 44 vérifications de bout en bout réussies sur 44. Elles couvrent les règles de placement des quatre formations, le changement de formation par les boutons pour les deux équipes au millimètre, la transition animée, le scénario de démonstration, la préférence « réduire les animations », et les formations en AR émulée sur le terrain posé, en WebGPU et en mode test WebGL ;

        * trois erreurs introduites volontairement, puis retirées. Sans avancée des déplacements dans la boucle de rendu : 1 test unitaire en échec. Avec les joueurs associés par leur rang au lieu de leur numéro : 1 test unitaire. Avec le panneau désabonné du tableau tactique : 2 vérifications de bout en bout ;

        * une erreur d'arrondi en fin de transition, révélée par un test unitaire, a été corrigée : la dernière image pose chaque joueur exactement sur sa place ;

        * affichage mobile contrôlé visuellement sur captures automatisées (largeurs de viewport 390 et 360 px) et en AR émulée ;

        * aucun code ni aucune donnée de boardx n'a été repris : les formations sont propres au projet ;

        * fonctionnement expliqué dans `docs/sprint-4.md` ; test sur téléphone à faire par l'équipe.

*   **Composant ou Shader concerné :** documentation des fonctions, le 14 novembre 2026 : en-têtes `@responsable`, `@date` et `@role` dans `src/*.js` (hors `src/vendor/`), `sw.js` et `tests/`, renvoi à ATTRIBUTION.md en tête de chaque fichier, test `tests/unit/documentation.test.mjs` et `docs/convention-de-documentation.md`

    * **Prompt ou usage principal :** demande de Bilel Khlif d'ajouter à chaque fonction un en-tête standard (responsable, date, rôle technique) d'après les contributions documentées et l'historique Git, sans répéter l'attribution de l'IA dans chaque fonction. En-têtes, test et documentation générés par l'assistant.

        **Périmètre technique :** Datation de chaque fonction par le premier commit où sa déclaration apparaît (`git log -S`), rôle technique par module, contrôle automatique de la convention. Seuls des commentaires changent dans le code.

    * **Axe de vérification appliqué par l'étudiant :** Bilel Khlif a défini le contenu des en-têtes et les contraintes (ATTRIBUTION.md et bibliothèques tierces inchangés, fonctionnement préservé). Vérifications automatisées par l'assistant : `npm test` le 14 novembre 2026, 97 tests unitaires et 44 vérifications de bout en bout réussis ; diff du code limité aux commentaires ; le nouveau test échoue quand une balise ou un renvoi manque.

*   **Composant ou Shader concerné :** icônes (`assets/icons/`), bannière et captures (`docs/images/`, dont celles des sprints 2 à 4, et `assets/screenshots/`), figures du rapport (`docs/etat-de-l-art/figures/`)

    * **Prompt ou usage principal :** dessin des icônes en SVG d'après la couverture du cahier des charges, captures automatisées de l'application, mise en page de la bannière dans le style de la présentation d'état de l'art

        **Périmètre technique :** Création des icônes SVG et PNG, variante maskable, captures automatisées et cohérence de l’identité visuelle ; absence d’asset 3D ou de texture externe.

    * **Axe de vérification appliqué par l’étudiant :** critères graphiques issus du cahier des charges collectif ; contrôles visuels consignés par l’assistant : les captures sont prises par script sur l'application réelle ; le motif de l'icône « maskable » tient dans la zone sûre d'Android (un cercle de 80 % de la largeur).

*   **Composant ou Shader concerné :** documentation : `README.md`, `docs/architecture.md`, `docs/sprint-1.md`, `docs/sprint-2.md`, `docs/sprint-3.md`, `docs/sprint-4.md`, `docs/guide-du-code.md`, `docs/etat-de-l-art/README.md`, `src/vendor/three-r187/README.md` et ce fichier

    * **Prompt ou usage principal :** rédaction en français à partir du code et du cahier des charges. Le README a été refait à la demande de Bilel Khlif, dans le style du rapport et de la présentation d'état de l'art, avec des captures et la synthèse de la veille. Au sprint 3, ses parties « Rendu WebGPU », « La boucle de rendu » et « Application installable » répondent aux demandes de l'enseignant transmises par Bilel Khlif. Ce fichier suit le modèle fourni par l'enseignant.

        **Périmètre technique :** Description de l’architecture, des responsabilités des modules, de la boucle de rendu, des limites matérielles, des tests reproductibles et des sources externes conformément au modèle d’attribution.

    * **Axe de vérification appliqué par l’étudiant :** relecture de Bilel Khlif et contrôle documentaire assisté : dimensions, valeurs et résultats de tests repris du code source et des sorties de `npm test` ; renvois aux sections du cahier (§) contrôlés sur le cahier des charges ; ce fichier a été relu en entier par Bilel Khlif le 9 novembre 2026, avant l'ajout du sprint 2.

*   **Composant ou Shader concerné :** état de l'art : rapport LaTeX (`docs/etat-de-l-art/`) et présentation PowerPoint

    * **Prompt ou usage principal :** consigne de Bilel Khlif de lire le cahier des charges et de chercher des projets existants sur la même idée, pour s'appuyer dessus ; recherche web (dépôts, applications, articles, jeux de données) à partir de ce cahier et de la publication LinkedIn qu'il a fournie, puis rédaction du rapport et de la présentation.

        **Périmètre technique :** Veille sur les applications tactiques, projets XR et travaux de vision par ordinateur ; rapport LaTeX et présentation révisée selon les références graphiques fournies par Bilel Khlif.

    * **Axe de vérification appliqué par l’étudiant :** Bilel Khlif a orienté la veille, rejeté la première présentation et fourni les références de refonte ; le contrôle bibliographique est documenté dans le journal initial.

        * les faits du rapport proviennent de pages citées parmi ses 29 références, toutes consultées le 5 novembre 2026 ; la fiche de Sports Tactics Board a été corrigée après vérification de sa page ;

        * la première version de la présentation a été refusée par Bilel Khlif, jugée trop générique, puis refaite d'après les trois présentations de référence qu'il a fournies (BlurUAV, Trust before you trade, GreenBench) ;

        * le rapport a été demandé en LaTeX par Bilel Khlif, au format PDF ;

        * le projet a été renommé Football Simulator dans tous les documents, à la demande de Bilel Khlif.

**Synthèse des validations documentées**

| Étape | Vérifications réussies | Contribution humaine documentée |
|---|---:|---|
| Sprint 1 | 11/11 | Cadrage, revue du guide, validation PR #1 |
| Sprint 2 | 46/46 | Spécifications, essais multi-appareils, validation PR #3 |
| Correctif réseau | 47/47 | Signalement du défaut en conditions réelles |
| Sprint 3 | 93/93 | Transmission des exigences, essais de compatibilité GPU, AR WebGPU réussie sur TECNO POVA 6 Pro 5G |
| Mode test WebGL | 110/110 | Arbitrage production/test et validation AR sur Galaxy S10e |
| Sprint 4 | 138/138 | Lancement du sprint à partir du cahier des charges collectif |
| Documentation des fonctions | 141/141 | Contenu des en-têtes et contraintes définis |

**État de validation matérielle au 14 novembre 2026 :** rendu 3D WebGPU vérifié sur le PC ASUS TUF A15 ; parcours AR WebGPU vérifié en émulation ; AR rendue en WebGPU vérifiée sur un téléphone, le TECNO POVA 6 Pro 5G (essai physique réussi) ; AR sur Galaxy S10e vérifiée uniquement dans le mode de test WebGL. Aucune validation physique du sprint 4 n’est consignée à cette date. Les résultats automatisés ci-dessus proviennent du journal de développement.
