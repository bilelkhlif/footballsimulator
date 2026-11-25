# Intégration du visualiseur de match : compte rendu

Intégration répétée le 24 novembre 2026 sur la branche `repetition/integration-visualiseur`, publiée
ensuite comme PR #20 en brouillon. Elle réunit `main`, la correction du Service Worker (PR #19) et le
visualiseur de match (PR #15). `main` et les branches des PR #15, #18 et #19 ne sont pas modifiées.
Aucune fusion n'a été faite vers `main`.

Cette note remplace, pour l'intégration, la [note différée](integration-future-visualiseur.md), qui reste
comme trace historique.

Complément du 25 novembre : l'échec intermittent du lecteur est expliqué et pris en charge dans
la [correction de perte du GPU](#perte-du-gpu--cause-correction-et-validation-du-25-novembre-2026).
Complément du 25 novembre, préparation de la publication : sécurité du serveur et des modèles,
PyTorch 2.14.1, site statique préparé et fusion répétée, dans la
[section dédiée](#préparation-de-la-publication-25-novembre-2026). La PR #20 reste un brouillon et
dépend toujours de la PR #19 ; aucune fusion n'est faite sans autorisation.

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

## Préparation de la publication, 25 novembre 2026

Ces commits suivent la PR #21 (`5610e16`) sur la branche `fix/release-readiness`. Codex a commencé ce
travail ; sa limite d'usage l'a interrompu avant validation. Claude Code a conservé l'état non validé
(24 fichiers), puis l'a vérifié, complété et testé.

### Sécurité et dépendances

| Domaine | Correction | Preuve |
| --- | --- | --- |
| Serveur d'analyse | Chemins décodés une fois ; refus des octets de contrôle, séparateurs Windows, lecteurs, encodages imbriqués, cibles absolues et HTTP/0.9 ; longueur unique ; nom simple ; deux téléversements et seize connexions au plus, 30 s d'inactivité, réserve disque ; fichiers d'un travail confinés | Reproduits avant correction : sortie par jonction, connexion coupée sans réponse pour une longueur invalide et pour un NUL. Tests : 18 requêtes brutes, liens, longueurs, noms, téléversements interrompus |
| Serveur de développement (Node) | Racine et chemins réels confinés, mêmes refus | Lien extérieur, lecteurs, UNC, flux NTFS, encodages imbriqués refusés |
| Poids des modèles | Taille et SHA-256 vérifiés avant tout import d'Ultralytics ; téléchargement en quarantaine ; mode restreint et `weights_only` forcés, sans repli | Un checkpoint piégé est refusé sans exécution ; le même fichier exécute sa charge sans garde-fous |
| PyTorch | 2.14.1 + CUDA 12.6 ; une analyse refuse toute version antérieure à 2.10.0 | GHSA-53q9 et GHSA-63cw corrigés ; GHSA-v32g, voir ci-dessous |
| gdown | 5.2.2 | Corrige GHSA-76hw-p97h-883f (fonction `extractall`, inutilisée ici) |
| Service Worker | Vidéos et réponses `no-store` hors du cache d'exécution | Tests unitaires ; aucune vidéo en cache dans Chrome |
| Revue indépendante (PR #21) | R1 à R6 conservés | Contrôles Chrome et test serveur inchangés |

**PyTorch, risque résiduel.** [GHSA-v32g-mr63-3j83](https://github.com/pytorch/pytorch/security/advisories/GHSA-v32g-mr63-3j83) :
un checkpoint malveillant peut lire des fichiers texte avec `weights_only=True`, à partir de 2.14.0.
La correction, 2.15.0, n'est publiée qu'en CUDA 13.2 et 13.4. Le pilote de l'essai (566.07) ne va que
jusqu'à CUDA 12.7. Ici, seuls les trois poids épinglés atteignent `torch.load`, et aucun ne référence la
classe exploitée. Passer à 2.15.0 demande de mettre à jour le pilote NVIDIA, puis de valider à nouveau.

**Provenance des empreintes.** Roboflow ne publie pas d'empreinte pour ses poids. Les octets servis par
les liens de son `setup.sh` sont identiques le 17 et le 25 novembre, et les analyses du 17 au 23
novembre avaient enregistré les mêmes empreintes. Les révisions SigLIP et CLIP, leurs tailles et leurs
empreintes sont celles du Hub ; ces révisions sont aussi celles de leur branche principale.

### Chaîne IA avec PyTorch 2.14.1

Mêmes vidéos, même code d'analyse ; seuls l'environnement et le chargement sécurisé changent :

| Vidéo | Détections appariées | Équipes, rôles, calibration | Coupures | Trajectoires | Temps de traitement |
| --- | --- | --- | --- | --- | --- |
| Extrait de 10 s | 2 759 sur 2 759, IoU médiane 1,0 | identiques | aucune | 25 et 25 | 124 s (2.5.1), 98 s (2.14.1) |
| Montage de 24 s avec deux coupures | 5 925 sur 5 926 | identiques | images 200 et 400 dans les deux | 73 et 73 | 180 s (2.5.1), 160 s (2.14.1) |

Positions sur le terrain : écart médian nul, 7 cm au 95ᵉ centile. Le premier passage de 2.14.1 sur
l'extrait de 10 s a pris 199 s : premier usage d'UMAP dans le nouvel environnement, et calculs
simultanés sur le processeur. Ce passage n'est pas retenu comme mesure. Mémoire de PyTorch : 627 Mo au
plus dans les deux versions. Mémoire vive mesurée par la chaîne : 2,5 à 2,6 Go ; échantillonnée sur tous ses processus : 2,7 à 3,0 Gio.

### Résultats

| Vérification | Résultat |
| --- | --- |
| `npm run test:unit` | 274 tests réussis, aucun ignoré |
| `npm run test:e2e` | 207 vérifications Chrome réussies, aucune ignorée |
| Python, environnement 2.14.1 | 127 tests réussis |
| Vrai parcours GPU (`tests/visualizer-local-ai.mjs`) | 12 étapes réussies en 177 s, sans perte GPU pendant ce passage |
| Site préparé par `npm run pages:prepare`, servi seul sous `/footballsimulator/` | 6 contrôles réussis : Service Worker, démonstration sans Python, aucune vidéo en cache, 56 modules au type JavaScript, hors ligne, aucune erreur |
| Fusion répétée : `main`, puis #19, puis cette branche | Aucun conflit ; arbre identique à la branche ; aucun fichier supprimé ; #18 fusionnable ensuite |

Pendant le parcours GPU, la carte (affichage et Chrome compris) a utilisé de 1,0 à 2,5 Gio. Les
résultats partiels arrivent au bout de 24 s, l'arrêt brutal est détecté en 220 ms, et l'analyse se
termine 151 s après le téléversement.

## Limites et risques restants

- **Aucun essai sur téléphone réel.** Les profils mobiles et l'AR sont des émulations sur PC. Firefox et
  Safari ne sont pas testés.
- **Application installée.** Le lien ouvre le visualiseur dans un onglet du navigateur, hors de la fenêtre
  de l'application installée. Le visualiseur n'est pas promis hors ligne.
- **Taille publiée.** La démonstration publique `demo/` pèse environ 2,2 Mo, chargés seulement à
  l'ouverture du visualiseur.
- **Licences.** Le visualiseur et le serveur sont sous AGPL-3.0-only, la voie libre d'Ultralytics, sans
  licence Enterprise. L'application académique attend l'accord écrit de ses coauteurs. Les poids et les
  vidéos de match ne sont pas distribués. Voir [LICENSING.md](../LICENSING.md) et
  [licences-et-distribution.md](licences-et-distribution.md).
- **PyTorch.** GHSA-v32g touche 2.14.1, atténué par la vérification des poids ; la correction demande
  CUDA 13 et un pilote NVIDIA plus récent.
- **ATTRIBUTION.md.** La PR #15 et la PR #18 numérotent chacune de nouvelles entrées. À l'intégration de
  la seconde, la numérotation sera à revoir par l'équipe : ce fichier ne se modifie que sur sa demande.
- **Chrome et le réseau local.** Depuis le site public, l'accès à `127.0.0.1` demande l'autorisation
  « accès au réseau local » de Chrome. Sans elle, le visualiseur affiche « indisponible ».
- **Perte du GPU.** La panne est expliquée et prise en charge ; le terrain 3D demande encore un
  rechargement de page après une perte du périphérique. Le correctif ne répare pas le pilote NVIDIA.

## Séquence Git recommandée

Séquence vérifiée le 25 novembre 2026 dans un worktree isolé, sans rien publier ; chaque fusion
reste soumise à l'autorisation du propriétaire :

1. Fusionner la PR #19 (`47d4a75`) dans `main` par **commit de fusion**. Un squash ou un rebase
   recréerait ses commits ; la PR #20 garderait alors son diff.
2. Fusionner la PR #20, avec les corrections de la PR #21 et de cette préparation, par **commit de
   fusion**. La répétition le fait sans conflit, et son arbre final est celui de la branche.
3. Revoir la PR #18 séparément : aucun conflit Git, mais la numérotation 23/24 de `ATTRIBUTION.md`
   est à trancher.
4. Fermer la PR #15 comme remplacée par la PR #20.
5. Déployer GitHub Pages seulement après autorisation, puis vérifier le site publié.

L'historique de la proposition initiale (nouvelle branche et `cherry-pick`) n'est plus nécessaire : la
PR #20 porte déjà la répétition, les corrections et leurs preuves.

## À vérifier sur téléphone réel

- l'ouverture de la carte depuis l'application installée, puis le retour au tableau ;
- la lecture et l'avance dans la démonstration de 36 s sous le Service Worker, sur réseau mobile ;
- le terrain 3D posé dans la vidéo, sa sélection au doigt et le déplacement du panneau ;
- la carte masquée pendant une vraie session AR, et l'AR inchangée après une visite du visualiseur ;
- la mémoire et la fluidité du visualiseur sur un téléphone d'entrée de gamme.
