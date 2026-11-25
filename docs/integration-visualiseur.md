# Intégration du visualiseur de match : compte rendu

Répétition locale du 24 novembre 2026, sur la branche `repetition/integration-visualiseur`, non publiée.
Elle réunit `main`, la correction du Service Worker (PR #19) et le visualiseur de match (PR #15).
`main` et les branches des PR #15, #18 et #19 ne sont pas modifiées. Aucune fusion n'a été faite sur GitHub.

Cette note remplace, pour l'intégration, la [note différée](integration-future-visualiseur.md), qui reste
comme trace historique.

Complément du 25 novembre : l'échec intermittent du lecteur est expliqué et pris en charge dans
la [correction de perte du GPU](#perte-du-gpu--cause-correction-et-validation-du-25-novembre-2026).
La PR #20 reste un brouillon et dépend toujours de la PR #19 ; aucune fusion supplémentaire n'est autorisée.

## Points de départ

| Référence | Commit |
| --- | --- |
| `main` (PR #17 fusionnée) | `48c293d` |
| PR #19, `fix/service-worker-video` | `47d4a75` |
| PR #15, `feature/visualiseur-match` | `801ffc9` |
| Base commune de la PR #15 et de `main` | `f7da74f` |

## Étapes

1. Fusion de la PR #19, sans avance rapide : aucun conflit.
2. Fusion de la PR #15, sans avance rapide : trois conflits, résolus à la main (tableau ci-dessous).
3. Migration en `.mjs` des neuf modules du visualiseur.
4. Accès au visualiseur depuis l'application, et tests de l'ensemble.

Chaque étape est un commit séparé : l'historique des deux PR reste entier, et `git log --follow` suit
chaque module renommé jusqu'à sa création.

## Conflits résolus

| Fichier | Résolution |
| --- | --- |
| `README.md` | Version de `main` pour les trois blocs. Ajouts : le visualiseur, `analysis/` et `demo/` dans l'arborescence ; les tests du visualiseur et du Service Worker ; l'accès depuis Plus d'outils. |
| `tests/run-tests.mjs` | Lanceur de `main` conservé : espaces de coaching, mises en page, AR, Service Worker, passage de `sw.js` à `sw.mjs`. S'y ajoutent les deux suites du visualiseur. La version plus ancienne de la PR #15 n'est pas reprise. |
| `tests/unit/documentation.test.mjs` | Portée de `main` : `sw.mjs`, `sw.js` et les `.mjs`. S'y ajoute `src/visualizer/`, aux mêmes règles. `visualizer.html` et `visualizer.css` restent contrôlés. |

## Migration en `.mjs`

Renommés avec `git mv` : `analytics`, `api-client`, `auto-placement`, `format`, `overlay-frame`,
`overlay-pitch`, `tracking-store`, `video-annotations` et `visualizer-main`.

Modifications nécessaires, et rien d'autre :

- les imports des neuf modules partagés de l'application : `events`, `config`, `ball`, `pitch`, `players`,
  `pointer-input`, `raycasting`, `tactical-arrows` et `webgpu`, imports JSDoc compris ;
- les imports entre modules du visualiseur, y compris dans `local-source.mjs` et `paged-tracking-store.mjs`,
  déjà en `.mjs` ;
- le point d'entrée de `visualizer.html` ;
- trois tests unitaires et deux commentaires.

Les exports et les signatures des modules partagés sont identiques entre la base `f7da74f` et `main`.
La migration n'a donc changé aucun appel. Restent intacts : three.js r187 et `OrbitControls.js` dans
`src/vendor/`, et `sw.js`, le script de migration. Le test de la migration le vérifie toujours : aucun
fichier `.js` du projet hors de `src/vendor/`, sauf `sw.js`.

## Accès depuis l'application, sept espaces conservés

Côté application, l'intégration ajoute une ligne à `index.html` et deux règles à `src/styles.css`.
Aucun module de l'application n'est modifié : espaces, scène, tableau, historique, saisie et AR.

- **Accès.** Une carte « Analyse de match (IA) » dans l'espace Plus d'outils ouvre `visualizer.html`, par
  un lien relatif, donc valable à la racine comme sous `/footballsimulator/`.
- **Nouvel onglet.** Le visualiseur a son propre moteur WebGPU et sa propre saisie. Dans un autre onglet,
  il n'installe ni second gestionnaire de pointeur ni seconde boucle sur le terrain de l'application.
  La tactique, l'historique et l'espace ouvert restent tels quels. C'est la frontière fixée par la note
  différée.
- **AR.** La carte est masquée pendant une session AR.
- **Retour.** Le lien « Tableau tactique » du visualiseur ramène à `index.html`. Il est masqué quand la
  page vient du serveur d'analyse : ce serveur ne sert pas `index.html`, pour que le Service Worker ne
  s'installe pas sur son origine.
- **Modes du visualiseur.** Les deux sont inchangés : Explorer la démo, sans serveur, et Analyser ma
  vidéo, avec le serveur local. Il n'y a pas de serveur GPU distant.

## Service Worker et application installable

- `APP_SHELL` ne change pas : le visualiseur n'est pas promis hors ligne. Seul `SHELL_VERSION` est
  recalculé (`d8d1fcf84bd5635f`), parce que `index.html` et `styles.css` changent.
- Les requêtes Range passent au navigateur, et les réponses 206 ne sont pas stockées (PR #19). La vidéo de
  démonstration se lit donc par de vraies plages d'octets, et aucune vidéo n'entre dans le cache.
- Les autres fichiers du visualiseur (page, modules, JSON de la démonstration) suivent la règle des pages
  hors coquille : réseau d'abord, copie dans le cache d'exécution. La page pourrait donc se rouvrir hors
  ligne après une visite. Ce n'est ni promis ni testé.
- Le serveur d'analyse local a une autre origine (`127.0.0.1:8765`) : le Service Worker n'intercepte
  jamais ses réponses.

## Résultats du 24 novembre 2026

Sur PC (Windows 11, Chrome en mode sans interface, WebGPU), avec la vraie démonstration synthétique :

| Suite | Résultat |
| --- | --- |
| `npm run test:unit` | 267 tests, tous réussis |
| `npm run test:e2e` | 197 vérifications dans Chrome, toutes réussies, aucune ignorée |
| Tests Python du serveur (`analysis/`) | 113 tests, tous réussis |
| Vrai pipeline sur GPU (`tests/visualizer-local-ai.mjs`) | 12 étapes, toutes réussies |

Les vérifications dans Chrome couvrent l'application :

- les sept espaces ;
- le parcours d'un entraîneur jusqu'à l'AR émulée (IWER) ;
- les mises en page mobiles émulées ;
- le passage de `sw.js` à `sw.mjs`, le hors-ligne et la mise à jour sur réseau lent.

Elles couvrent aussi le visualiseur :

- la démonstration sous `/footballsimulator/` ;
- la synchronisation après des déplacements, le terrain 3D et la sélection ;
- l'identité incertaine pendant un contact, les coupures de plan et un export abîmé ;
- les états de l'analyse locale : en cours, interrompue, reprise, serveur arrêté puis redémarré ;
- les réponses tardives d'une analyse fermée.

Sept vérifications portent sur l'intégration elle-même :

- la démonstration de 36 s lue sous le contrôle du Service Worker : déplacée aux images 800, 125 et 450,
  chaque fois retrouvée, par des réponses 206, sans vidéo en cache ;
- l'ouverture depuis Plus d'outils dans un nouvel onglet, tactique et espace conservés ;
- la carte masquée en AR ;
- le retour au tableau ;
- le lien de retour absent quand la page vient du serveur d'analyse ;
- aucune erreur dans la console, sous le Service Worker comme pendant la navigation (deux vérifications).

### Vrai pipeline sur GPU

`node tests/visualizer-local-ai.mjs`, lancé dans l'arbre intégré, sur un GPU NVIDIA (`cuda:0`). La vidéo
est un extrait local de 10 s, dont l'usage est autorisé. Elle reste hors du dépôt, comme les poids des
modèles : rien n'est versionné ni publié. Résultat : 12 étapes réussies en 184 s.

- Page servie par le serveur Python : mode local connecté, sans lien vers `index.html`.
- Téléversement, puis résultats partiels affichés au bout de 18 s : 23 objets, dont 16 placés sur le terrain.
- Interruption, puis analyse reprenable.
- Serveur arrêté brutalement : « indisponible » affiché en 79 ms. Au redémarrage, l'analyse est retrouvée
  « interrompue », puis reprise jusqu'à la fin (159 s en tout).
- Lecture : annotations, terrain 3D dans la vidéo et sélection d'un joueur, en WebGPU.
- Seules erreurs de la console : celles de l'arrêt volontaire du serveur.
- Depuis l'origine publique, sans l'autorisation « réseau local » : serveur indisponible, aide affichée.
  Avec elle : analyse ouverte, vidéo en CORS, terrain 3D.
- Export statique de l'analyse réelle (125 images, 5 segments, 25 trajectoires), vérifié, puis lu en mode
  démonstration, serveur arrêté. L'export reste dans un dossier temporaire, supprimé à la fin.

## Perte du GPU : cause, correction et validation du 25 novembre 2026

### Origine de l'échec

Le parcours manuel arrête volontairement le serveur Python pendant un calcul CUDA : `server.kill()`
emploie `TerminateProcess` sous Windows. Sur le GPU partagé RTX 2050, cet arrêt a coïncidé avec des
événements NVIDIA `nvlddmkm` 153. Dans le parcours instrumenté en échec, les deux entrées du journal
Système sont datées du 24 novembre à 21:29:36, près de l'arrêt du serveur.

La panne observée dans Chrome est la perte de son processus GPU : le périphérique WebGPU devient
inutilisable et le décodeur vidéo matériel se déconnecte. Le déplacement ou `play()` suivant déclenche
une erreur média de code 3 (`PIPELINE_ERROR_DISCONNECTED`, parfois `PIPELINE_ERROR_DECODE`). Chrome met
alors la vidéo en pause **en interne** et rejette la promesse avec `AbortError: The play() request was
interrupted by a call to pause()`.

La trace vérifiée suit `play()` → `seeking` → `play` → `waiting` → erreur média → événement `pause` →
rejet de la promesse. Elle ne contient, à ce moment, aucun appel JavaScript à `pause()` ou `load()`, ni
changement de `src`. Le clip H.264 de 10 s ne contient aucune piste audio. Ce diagnostic ne repose donc
pas sur une pause audio ou sur une pause appelée par le visualiseur.

Le déclencheur se situe dans l'environnement et l'arrêt forcé du harnais. Le défaut de l'application
était différent : aucune prise en charge d'une erreur vidéo ou de la perte WebGPU, donc vidéo et terrain
3D devenaient inutilisables sans explication. Les événements du pilote étayent le lien avec l'arrêt CUDA ;
la reproduction DevTools démontre directement la chaîne de panne au niveau du navigateur.

### Preuves et correction

- Diagnostic du 24 novembre : deux échecs sur sept parcours GPU complets. Les 25 lectures ciblées sans
  nouveau calcul GPU (dont réouverture, transition vers « terminée », interruption et reprise) sont
  passées ; certaines recouvraient pourtant `play()`, `openAnalysis(keepVideo)` et le déplacement vidéo.
- `Browser.crashGpuProcess` reproduit la panne sans serveur Python : perte WebGPU, erreur média et pause
  interne. Le nouvel essai sur `a42b429`, avec uniquement le fichier de test ajouté, échoue sur **4 des 5
  vérifications**. Seul le rechargement complet de la page rétablit le terrain.
- Sur l'arbre corrigé, **10 répétitions sur 10 passent : 50 vérifications réussies, zéro échec**.

Dans `visualizer-main.mjs` :

- `VIDEO_ERRORS` explique les causes usuelles du lecteur.
- `#recoverVideo`, relié à l'événement `error`, recharge la même vidéo une fois par source pour le code 3.
  L'instant est restauré après `loadedmetadata`, seulement si la source est toujours la même. Le message
  demande de relancer la lecture. Une erreur répétée ou un autre code affiche sa cause sans boucle de
  rechargement ; `#showVideo` réarme la récupération quand la source change.
- `#stopOverlay`, relié à `renderer.onDeviceLost`, journalise la perte, arrête le rendu et indique que le
  terrain 3D demande un rechargement de page. La vidéo, les annotations et la sélection restent
  utilisables. Aucun repli WebGL n'est ajouté : le comportement suit celui de l'application académique.
- `snapshot()` expose `gpuLost` et `videoError` pour les diagnostics.

### Test de régression et harnais réel

`testVisualizerGpuReset` lance son propre navigateur, pour que l'arrêt de son processus GPU ne touche
pas les autres vérifications. Ses cinq contrôles portent sur :

1. le terrain arrêté et le message de rechargement ;
2. l'erreur du décodeur, le rechargement vidéo à l'image 450 et la reprise de lecture ;
3. la synchronisation aux images 125 et 800, ainsi que la sélection sur la vidéo ;
4. le retour du terrain 3D après rechargement de la page ;
5. l'absence d'autres erreurs de console.

Les attentes d'événements vidéo sont bornées. L'essai sur l'ancienne version a révélé une attente sans
fin quand l'erreur était déjà survenue ; le test rapporte maintenant cette erreur et échoue au lieu de
rester bloqué.

Dans `tests/visualizer-local-ai.mjs`, un rejet de `play()` reste un échec et inclut le code/message de
`video.error`, `snapshot().gpuLost` et le texte de `#job-status`. Si la perte du GPU est déjà constatée
après l'analyse terminée, le harnais exige d'abord le message « rechargez la page », consigne ce cas,
recharge la même analyse et exige le retour de WebGPU avant de continuer. Les erreurs ne sont pas
supprimées du journal ; seul le message de perte WebGPU ainsi confirmé est attendu. Toute autre erreur reste fatale.
L'arrêt brutal et l'ordre du parcours ne sont pas supprimés pour faire passer le test.

### Résultats de la reprise

| Vérification du 25 novembre 2026 | Résultat |
| --- | --- |
| `npm run shell-version -- --check` | Conforme : `d8d1fcf84bd5635f`, coquille inchangée |
| Test GPU sur `a42b429`, sans le correctif applicatif | 1 parcours en échec : 4 contrôles refusés, 1 réussi |
| Répétitions du correctif | 10 parcours réussis sur 10 ; 50 contrôles réussis, 0 échec |
| `npm test` | 267 tests unitaires et 202 vérifications Chrome réussis ; aucun échec ni cas ignoré |
| Python : `python -m unittest discover -s tests` | 113 tests réussis |
| Vrai parcours CUDA, vidéo H.264 de 10 s sans audio | 12 étapes réussies ; analyse terminée après reprise en 178 s |

Ce dernier parcours utilise Chrome 158.0.8127.37 sur le même PC. Il vérifie des résultats partiels
après 21 s (23 objets, dont 16 placés), un serveur arrêté détecté en 92 ms, puis la lecture et la sélection
après reprise (23 objets et 23 placés). L'export réel contient 125 images, 5 segments et 25 trajectoires :
il est vérifié puis lu sans serveur. L'origine HTTPS publique est simulée dans Chrome par `page.route` ;
les requêtes vers le serveur local, le CORS et l'autorisation réseau local sont réels.

Aucune perte WebGPU n'a eu lieu pendant ce parcours (`gpuReset: false`) : sa branche de rechargement
conditionnel n'y a donc pas été exercée. La panne applicative est couverte séparément par les dix arrêts
contrôlés du processus GPU. Le nombre d'étapes du parcours réel serait augmenté d'une étape de
diagnostic si cette branche était prise.

Les traces, modèles, vidéos et bases SQLite restent hors des fichiers suivis. Les essais sont faits sur
PC dans Chrome, sans validation physique sur téléphone, Firefox ou Safari.

## Limites et risques restants

- **Aucun essai sur téléphone réel.** Les profils mobiles et l'AR sont des émulations sur PC. Firefox et
  Safari ne sont pas testés.
- **Application installée.** Le lien ouvre le visualiseur dans un onglet du navigateur, hors de la fenêtre
  de l'application installée. Le visualiseur n'est pas promis hors ligne.
- **Taille publiée.** La démonstration publique `demo/` pèse environ 2,2 Mo, chargés seulement à
  l'ouverture du visualiseur.
- **Licences.** Le serveur d'analyse utilise des composants sous AGPL-3.0 (Ultralytics, poids de Roboflow
  Sports). Ni les poids ni les vidéos de match ne sont dans le dépôt, et le dépôt n'a pas de fichier
  LICENSE. Leur redistribution est discutée dans [visualiseur-modes.md](visualiseur-modes.md).
- **ATTRIBUTION.md.** La PR #15 et la PR #18 numérotent chacune de nouvelles entrées. À l'intégration de
  la seconde, la numérotation sera à revoir par l'équipe : ce fichier ne se modifie que sur sa demande.
- **Chrome et le réseau local.** Depuis le site public, l'accès à `127.0.0.1` demande l'autorisation
  « accès au réseau local » de Chrome. Sans elle, le visualiseur affiche « indisponible ».
- **Perte du GPU.** La panne est expliquée et prise en charge ; le terrain 3D demande encore un
  rechargement de page après une perte du périphérique. Le correctif ne répare pas le pilote NVIDIA.

## Séquence Git recommandée

1. Relire puis fusionner la PR #19 dans `main`. Vérifier le déploiement : la démonstration n'y est pas
   encore, mais l'application doit rester inchangée, hors ligne compris.
2. Créer une nouvelle branche d'intégration depuis `main` à jour.
3. Y fusionner `feature/visualiseur-match` (PR #15) sans avance rapide, avec les résolutions ci-dessus.
4. Y reporter les commits de migration et d'accès de cette répétition, par `git cherry-pick`.
5. Relancer `npm run shell-version`, `npm test`, les tests Python et le pipeline GPU.
6. Ouvrir une nouvelle PR d'intégration, en brouillon, vers `main`. Une fois fusionnée, la PR #15 est
   fermée comme remplacée.

Une PR d'intégration séparée vaut mieux que la mise à jour de la PR #15. La PR #15 reste lisible telle
qu'elle a été relue. L'intégration a son propre historique, ses résolutions et ses tests. En cas de
problème, elle se rejette sans toucher au travail du visualiseur.

## À vérifier sur téléphone réel

- l'ouverture de la carte depuis l'application installée, puis le retour au tableau ;
- la lecture et l'avance dans la démonstration de 36 s sous le Service Worker, sur réseau mobile ;
- le terrain 3D posé dans la vidéo, sa sélection au doigt et le déplacement du panneau ;
- la carte masquée pendant une vraie session AR, et l'AR inchangée après une visite du visualiseur ;
- la mémoire et la fluidité du visualiseur sur un téléphone d'entrée de gamme.
