# 📄 Fichier d'Attribution et d'Origine des Ressources (ATTRIBUTION.md)

**Projet :** Football Simulator\
**Équipe :** Iyed Rachdi, Bilel Khlif, Ghassen Dallekji\
**Responsable du sprint 1 :** Bilel Khlif\
**Version :** 1.0 — Évaluation SUP'COM (2026/2027)

---

## 1. Modèles 3D, Textures et Assets Graphiques

Tout asset tri-dimensionnel ou visuel importé doit être consigné ci-dessous.

Aucun modèle 3D, aucune texture et aucune police n'est importé d'une source externe : la géométrie est générée par le code avec les primitives de three.js, et les textures sont dessinées à l'exécution sur un canvas. Les éléments visuels présents dans le dépôt sont listés ci-dessous.

*   **Asset :** Terrain (plateau, gazon rayé, lignes, buts et filets)
    *   **Source originale :** créé pour le projet, `src/pitch.js`
    *   **Auteur / Créateur :** Bilel Khlif et Claude, co-auteurs : pilotage et décisions par Bilel Khlif
    *   **Licence :** aucune licence choisie à ce jour (pas de fichier `LICENSE` dans le dépôt)
    *   **Modifications apportées par l'équipe :** sans objet, asset créé pour le projet ; lignes tracées sur une texture canvas de 1808 × 1216 px selon les mesures des lois du jeu de l'IFAB

*   **Asset :** Pions joueurs, numéros de maillot et ballon
    *   **Source originale :** créés pour le projet, `src/players.js` et `src/ball.js` (`CapsuleGeometry`, `SphereGeometry`, sprites dessinés sur canvas)
    *   **Auteur / Créateur :** Bilel Khlif et Claude, co-auteurs : pilotage et décisions par Bilel Khlif,
    *   **Licence :** aucune licence choisie à ce jour
    *   **Modifications apportées par l'équipe :** sans objet, asset créé pour le projet

*   **Asset :** Icônes de l'application (`assets/icons/icon.svg`, `icon-maskable.svg` et les PNG dérivés)
    *   **Source originale :** dessinées pour le projet en SVG, d'après l'illustration de couverture du cahier des charges ; PNG produits avec la bibliothèque sharp
    *   **Auteur / Créateur :** Bilel Khlif et Claude, co-auteurs : dessin par Claude (section 4), dans le sprint piloté par Bilel Khlif
    *   **Licence :** aucune licence choisie à ce jour
    *   **Modifications apportées par l'équipe :** sans objet, asset créé pour le projet

*   **Asset :** Bannière, captures et diapositives de `docs/images/`, figures de `docs/etat-de-l-art/figures/`
    *   **Source originale :** captures de l'application elle-même ; diapositives exportées de la présentation d'état de l'art du projet
    *   **Auteur / Créateur :** Bilel Khlif et Claude, co-auteurs : refonte du README et des présentations orientée par Bilel Khlif ; captures automatisées et mise en page par Claude (section 4)
    *   **Licence :** aucune licence choisie à ce jour
    *   **Modifications apportées par l'équipe :** sans objet, asset créé pour le projet

---

## 2. Bibliothèques tierces et Modules externes (Pinnés)

Rappel : L'usage des versions "latest" depuis les CDN est proscrit.

*   **Bibliothèque :** three.js
    *   **Version fixée :** r186 (npm `three@0.186.1`), copie locale dans `src/vendor/three/build/`
    *   **Lien CDN de référence :** https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js
    *   **Rôle dans le projet :** moteur de rendu 3D (WebGL) : scène, caméra, géométries, matériaux ; session WebXR à partir du sprint 2

*   **Bibliothèque :** OrbitControls (module complémentaire de three.js)
    *   **Version fixée :** r186 (npm `three@0.186.1`), copie locale dans `src/vendor/three/examples/jsm/controls/`
    *   **Lien CDN de référence :** https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/controls/OrbitControls.js
    *   **Rôle dans le projet :** rotation, zoom et déplacement de la vue 3D hors AR

*   **Bibliothèque :** IWER, Immersive Web Emulation Runtime (Meta, licence MIT)
    *   **Version fixée :** 2.7.0 (la 2.8.0, publiée la veille du sprint 1, n'a pas été retenue)
    *   **Lien CDN de référence :** https://cdn.jsdelivr.net/npm/iwer@2.7.0/build/iwer.module.js
    *   **Rôle dans le projet :** émulation WebXR sur PC, chargée seulement avec le paramètre d'adresse `?iwer`, en développement

*   **Bibliothèque :** playwright-core (Microsoft, licence Apache 2.0)
    *   **Version fixée :** 1.64.1 (`package.json` et `package-lock.json`)
    *   **Lien de référence (npm) :** https://www.npmjs.com/package/playwright-core/v/1.64.1
    *   **Rôle dans le projet :** pilote Chrome pour les tests `npm test` ; outil de développement, jamais chargé par l'application

Outils utilisés hors du projet, non distribués avec l'application : Google Chrome pour les tests et les captures, le lanceur de tests intégré à Node.js (`node --test`) pour les tests unitaires, sharp pour les icônes PNG, Python et Pillow pour le traitement des images, pptxgenjs et PowerPoint pour la présentation, MiKTeX (pdfLaTeX, polices Latin Modern) pour le rapport.

---

## 3. Extraits de code copiés ou adaptés (StackOverflow, Tutoriels, Dépôts tiers)

L'usage de code tiers sans citation est un motif d'annulation de la note technique.

*   **Fonction / Fichier :** `src/dev-emulator.js`, fonction `installEmulatorIfRequested` (lignes 29 à 43)
    *   **Source du code original :** guide de démarrage d'IWER, https://meta-quest.github.io/immersive-web-emulation-runtime/getting-started.html
    *   **Auteur :** Meta (licence MIT)
    *   **Adaptation effectuée :** les deux lignes du guide (`new XRDevice(metaQuest3)` puis `installRuntime()`) sont encadrées par un chargement conditionnel (paramètre `?iwer` et absence d'AR native), un import dynamique depuis jsDelivr en version épinglée, et l'option `forceInstall`, nécessaire car Chrome sur PC expose déjà un `navigator.xr` sans AR.

*   **Fonction / Fichier :** `index.html`, carte d'import (lignes 20 à 27)
    *   **Source du code original :** manuel de three.js, page « Installation », https://threejs.org/manual/#en/installation
    *   **Auteur :** contributeurs de three.js (licence MIT)
    *   **Adaptation effectuée :** les adresses du CDN sont remplacées par la copie locale de `src/vendor/three/`.

En dehors de ces deux adaptations, aucun extrait de StackOverflow, de tutoriel ou de dépôt tiers n'a été copié dans le sprint 1. Les dimensions du terrain dans `src/pitch.js` reprennent les lois du jeu de l'IFAB (données, pas du code).

Sprint 2 : aucun extrait copié. L'enchaînement de la session suit l'API de WebXR et celle de three.js r186 (`WebXRManager.setSession`), lue dans la copie locale de `src/vendor/three/` ; l'exemple `ARButton.js` de three.js n'a pas été utilisé.

Les briques prévues pour les sprints suivants (exemple `webxr_ar_hittest` de three.js, échantillon `hit-test-anchors` du W3C Immersive Web, formations de boardx) seront consignées ici au moment de leur intégration.

---

## 4. Déclaration de l'usage des Assistants IA (Copilot, ChatGPT, Claude)

L'utilisation d'IA est un outil de complétion. Elle doit être documentée et maîtrisée.

Assistant utilisé : **Claude** (Anthropic), via Claude Code, modèle Claude Opus 5.5, du 5 au 12 novembre 2026.

### Répartition du travail

Les livrables du sprint 1 ont été coproduits par Bilel Khlif et Claude :

*   **Bilel Khlif**, responsable du sprint 1 : pilotage des sessions, consignes et décisions, retours sur les livrables, revue du code à travers son guide et validation finale ;
*   **Claude** : génération du code, des tests et des documents, à partir du cahier des charges de l'équipe et des consignes de Bilel Khlif.

Au sprint 2, le code a de même été généré par Claude, sur les consignes détaillées fournies par Bilel Khlif. Aucune ligne n'en a été écrite ou modifiée à la main par l'équipe : voir le détail par composant. Les tests sur appareils réels ont été faits par Bilel Khlif.

Contributions de Bilel Khlif :

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

### Détail par composant

*   **Composant ou Shader concerné :** code du sprint 1 : `index.html`, `manifest.json`, `sw.js`, `src/*.js` et `src/styles.css` (hors `src/vendor/`), tests (`tests/`, `package.json`) et fichiers de configuration du dépôt (`.editorconfig`, `.gitattributes`, `.gitignore`)
    *   **Prompt ou usage principal :** génération du code à partir du cahier des charges rédigé par l'équipe, sur consigne de Bilel Khlif de réaliser le sprint 1 et de le publier sur GitHub : périmètre du sprint (§5.3), patrons Strategy et Factory (§3.4), règles de code (§7.1). Les commits de la pull request #1 sont issus de ces sessions.
    *   **Axe de vérification appliqué :**
        *   `npm test` : 11 vérifications de bout en bout dans Chrome, que chacun peut rejouer : chargement sans erreur sur bureau (1280 × 800), sur mobile (390 × 844) et sous un sous-chemin comme sur GitHub Pages ; trois formations conformes au critère « 11 joueurs bien placés » du cahier (§4.3), avec les numéros 1 à 11, chaque joueur dans sa moitié et hors du rond central, et un écart minimal de 7,1 cm entre deux joueurs ; badge d'état de l'AR ; Service Worker et rechargement hors-ligne ; session `immersive-ar` émulée avec IWER. Résultat le 9 novembre 2026 : 11 réussies sur 11 ;
        *   le test des formations a lui-même été contrôlé par une erreur volontaire (deux joueurs du 4-3-3 avec le même numéro) : il échoue comme attendu ;
        *   ces vérifications ont révélé deux défauts, corrigés avant le commit : un cadrage de caméra qui coupait le terrain, et IWER qui refusait de s'installer sur Chrome PC ;
        *   revue du code par Bilel Khlif à partir du guide du code (`docs/guide-du-code.md`), qui explique chaque fichier et chaque fonction avec les réponses aux questions probables du jury : guide lu et approuvé le 9 novembre 2026 ;
        *   la pull request #1 a été validée par Bilel Khlif et fusionnée dans `main` le 9 novembre 2026 ;
        *   le test sur un téléphone Android, prévu avec l'ouverture de la session AR (cahier §4.2), a été fait le 12 novembre 2026 : voir l'entrée du sprint 2 ci-dessous.

*   **Composant ou Shader concerné :** code du sprint 2, généré en deux sessions : étapes 0 à 2 le 9 novembre 2026 (bouton « Entrer en AR » dans `index.html` et `src/main.js`, activation de WebXR dans `src/scene.js`), puis étapes 3 à 6 les 9 et 10 novembre 2026 (`src/events.js`, `src/xr-session.js`, `src/ar-view.js`, `src/ar-placement.js`, `src/render-loop.js`, modifications de `src/main.js`, `src/scene.js`, `index.html`, `src/styles.css` et `sw.js`, tests unitaires de `tests/unit/`, parcours AR de `tests/run-tests.mjs` et `package.json`)
    *   **Prompt ou usage principal :** consignes détaillées fournies par Bilel Khlif pour chaque groupe d'étapes (périmètre, contraintes techniques, tests attendus), et cahier des charges (§5.3, §3.4, §7.1). Aucune ligne de ce code n'a été écrite ou modifiée à la main par l'équipe : les commits de la branche `feature/sprint-2` sont tous issus de ces sessions.
    *   **Axe de vérification appliqué :**
        *   `npm test` : 28 tests unitaires, où WebXR et three.js sont remplacés par des doublures (détection, entrée réussie, session refusée, échec de l'espace de référence et de la couche de rendu, fin de session, notifications, restauration de la scène, contrôles d'orbite en pause, placement du terrain), puis 18 vérifications de bout en bout, dont 7 pour le parcours AR complet avec l'émulateur IWER. Résultat le 10 novembre 2026 : 46 réussies sur 46 ;
        *   deux erreurs introduites volontairement (contrôles d'orbite actifs en AR, session laissée ouverte quand `local-floor` manque) ont fait échouer 3 tests, puis le code a été restauré ;
        *   l'enchaînement de la session (`renderer.xr.setSession`, couche `XRWebGLLayer`, espace de référence) a été vérifié dans le code de three.js r186 de la copie locale ;
        *   le fonctionnement est expliqué dans `docs/sprint-2.md`, avec les réponses aux questions probables du jury ;
        *   tests sur appareils réels par Bilel Khlif, le 12 novembre 2026, sur le site publié : entrée en AR, terrain visible et sortie conformes sur deux téléphones Android avec Chrome (Samsung Galaxy S récent, TECNO POVA 6 Pro 5G) ; vue 3D conforme sur iPhone 15 avec Safari, sans AR comme prévu, et sur PC ASUS TUF A15 avec Chrome. Résultats et protocole dans `docs/sprint-2.md`.

*   **Composant ou Shader concerné :** icônes (`assets/icons/`), bannière et captures (`docs/images/`, dont celles du sprint 2), figures du rapport (`docs/etat-de-l-art/figures/`)
    *   **Prompt ou usage principal :** dessin des icônes en SVG d'après la couverture du cahier des charges, captures automatisées de l'application, mise en page de la bannière dans le style de la présentation d'état de l'art
    *   **Axe de vérification appliqué :** contrôle visuel de chaque rendu ; les captures sont prises par script sur l'application réelle ; le motif de l'icône « maskable » tient dans la zone sûre d'Android (un cercle de 80 % de la largeur).

*   **Composant ou Shader concerné :** documentation : `README.md`, `docs/architecture.md`, `docs/sprint-1.md`, `docs/sprint-2.md`, `docs/guide-du-code.md`, `docs/etat-de-l-art/README.md`, `src/vendor/three/README.md` et ce fichier
    *   **Prompt ou usage principal :** rédaction en français à partir du code et du cahier des charges. Le README a été refait à la demande de Bilel Khlif, dans le style du rapport et de la présentation d'état de l'art, avec des captures et la synthèse de la veille ; ce fichier suit le modèle fourni par l'enseignant.
    *   **Axe de vérification appliqué :** dimensions, valeurs et résultats de tests repris du code source et des sorties de `npm test` ; renvois aux sections du cahier (§) contrôlés sur le cahier des charges ; ce fichier a été relu en entier par Bilel Khlif le 9 novembre 2026, avant l'ajout du sprint 2.

*   **Composant ou Shader concerné :** état de l'art : rapport LaTeX (`docs/etat-de-l-art/`) et présentation PowerPoint
    *   **Prompt ou usage principal :** consigne de Bilel Khlif de lire le cahier des charges et de chercher des projets existants sur la même idée, pour s'appuyer dessus ; recherche web (dépôts, applications, articles, jeux de données) à partir de ce cahier et de la publication LinkedIn qu'il a fournie, puis rédaction du rapport et de la présentation.
    *   **Axe de vérification appliqué :**
        *   les faits du rapport proviennent de pages citées parmi ses 29 références, toutes consultées le 5 novembre 2026 ; la fiche de Sports Tactics Board a été corrigée après vérification de sa page ;
        *   la première version de la présentation a été refusée par Bilel Khlif, jugée trop générique, puis refaite d'après les trois présentations de référence qu'il a fournies (BlurUAV, Trust before you trade, GreenBench) ;
        *   le rapport a été demandé en LaTeX par Bilel Khlif, au format PDF ;
        *   le projet a été renommé Football Simulator dans tous les documents, à la demande de Bilel Khlif.
