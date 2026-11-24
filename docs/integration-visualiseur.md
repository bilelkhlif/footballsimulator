# Intégration du visualiseur de match : compte rendu

Répétition locale du 24 novembre 2026, sur la branche `repetition/integration-visualiseur`, non publiée.
Elle réunit `main`, la correction du Service Worker (PR #19) et le visualiseur de match (PR #15).
`main` et les branches des PR #15, #18 et #19 ne sont pas modifiées. Aucune fusion n'a été faite sur GitHub.

Cette note remplace, pour l'intégration, la [note différée](integration-future-visualiseur.md), qui reste
comme trace historique.

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
| Vrai pipeline sur GPU (`tests/visualizer-local-ai.mjs`) | voir ci-dessous |

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

À compléter après l'exécution.

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
