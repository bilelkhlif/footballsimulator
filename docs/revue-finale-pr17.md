# Revue finale de la PR nº 17 — 24 novembre 2026

## Décision et portée

**Fusion recommandée pour cette amélioration d'interface, après autorisation explicite.**
Les défauts reproduits pendant la revue sont corrigés. Aucune perte de tactique, seconde scène
ou corruption de l'historique n'a été observée. La validation de l'interface sur PC est concluante.
Elle ne constitue pas une recette physique du téléphone, du DOM Overlay natif ou de l'installation
PWA dans une fenêtre autonome. Ces validations restent requises avant de présenter l'usage AR
sur téléphone comme accepté par le professeur.

Départ de revue : PR ouverte, non fusionnée, tête `2885bd2be8d019b7a0800b3657386531c3e9742f`,
base `main` à `27eff23a2ec8bc2cebbebde9e653c6c8a9524b9c`, worktree sans modification.
La PR nº 15 est indépendante ; sa tête initialement vérifiée est `e8ae5c0b4731107801f73c0a7b9b4c27d4372fb7`.
Aucun changement sur main, le visualiseur, les fichiers tiers ou `ATTRIBUTION.md`.

## Appréciation UX

L'ensemble est cohérent : mêmes couleurs, commandes et confirmations, un seul terrain, panneaux
contextuels courts et défilants. Le rail laisse beaucoup plus de place au terrain que la barre
académique précédente. Les noms de sections, les infobulles et le guide réduisent l'apprentissage.
Les contrôles désactivés et les messages de refus correspondent aux capacités réelles.

Des faiblesses subsistent :

- Le rail paysage est constitué d'icônes sans libellé permanent. Sans survol tactile, l'utilisateur doit découvrir le nom en ouvrant la section. Un court apprentissage reste nécessaire.
- Annuler et Rétablir à la souris demandent d'ouvrir Outils tactiques. Les raccourcis restent disponibles partout, mais sont moins découvrables pour un débutant.
- À 200 % de texte sur 320/390 px, les libellés bas sont abrégés avec une ellipse. Le nom accessible reste complet. Avec un panneau ouvert, le terrain devient petit ; Fermer reste atteignable et redonne de la place.
- Aucune promesse de conformité complète à un audit WCAG ou à un lecteur d'écran physique n'est déduite des seuls tests clavier et de géométrie.
- Les panneaux s'affichent sans glissement : cela évite de faire bouger le canvas durant la visée. Les changements de couleur sont courts et supprimés avec la préférence de réduction des animations.

| Espace | Statut et usage vérifié | Limite d'usage |
| --- | --- | --- |
| Accueil / terrain | Vue, rotation/zoom/recentrage, formations et sélection ; retrouve le même état | Petit terrain avec texte très agrandi et panneau ouvert |
| Équipes et formations | Deux équipes, quatre formations, positions des 22 joueurs, feedback et annulation | Coordonnées techniques placées dans un détail dépliable |
| Outils tactiques | Joueur, ballon, passe, course, aperçu, Abandonner et historique fonctionnels | Commandes d'historique hors de la vue courante lorsqu'on replie le panneau |
| Animation et séquences | Deux images clés, lecture réelle, pause et conservation de la séquence ; suite existante des vitesses et redémarrage | Les images clés vivent en mémoire, sans sauvegarde au rechargement |
| Réalité augmentée | Compatibilité honnête ; IWER : pose, ancre, interaction et retour 3D | Projection et gestes d'une caméra réelle non validés |
| Plus d'outils | Diagnostics, réseau/cache, installation conditionnelle, liens AR/aide | Le test d'invite d'installation est simulé, pas une installation native |
| Réglages et aide | Guide, clavier, agrandissement du rail et préférence système | La réduction des mouvements est lue au lancement, comme auparavant |

## Défauts démontrés et corrections ciblées

| Défaut | Reproduction avant correction | Correction et vérification |
| --- | --- | --- |
| Focus perdu après Retour navigateur | Animation, focus sur Image clé, Retour : focus dans un bouton masqué | Le rendu de navigation suit l'ancien focus et le restitue à une commande visible |
| Focus perdu dans le débordement mobile | Plus, focus AR, Entrée : destination ouverte avec focus retombé sur body | Focus transféré au bouton visible du rail, ou à Fermer si cette destination est dans le débordement |
| Échap absorbé par une aide invisible | Première visite, guide ouvert, Formations, Échap : seul le guide caché était fermé | Une aide dont les ancêtres la masquent n'a plus priorité sur le panneau réellement visible |
| Texte agrandi en collision | 390 × 844, taille racine de 32 px : libellés bas superposés ; formation coupée sur deux lignes | Cibles flexibles, libellés bornés, hauteur adaptée, codes de formation indivisibles et pastilles repliables dans la largeur |
| Rail sous une encoche latérale simulée | Marge gauche 34 px, cible Accueil à x=7 px | Rail et contenu décalés selon la marge ; cible à x=41 px. Droite et bas respectés aussi, panneau Retour hors de la barre système |

Comparaison du texte à 200 %, même profil Chrome 390 × 844 :
[avant](images/revue/avant-texte-200.png), [après](images/revue/apres-texte-200.png).
Les [comparaisons initiales bureau/portrait/paysage](espaces-coaching.md#captures-avant-et-après)
restent disponibles. Aucun changement de direction graphique ni du moteur tactique n'a été introduit.

La simulation d'encoche remplace les expressions CSS `env(safe-area-inset-*)` dans la vraie
feuille par 34 px à gauche, 24 px à droite et 21 px en bas. Chrome installé ne fournit pas la
commande CDP `Emulation.setSafeAreaInsets`. Il s'agit donc d'une simulation CSS qualifiée,
et non d'un téléphone avec découpe matérielle.

## Parcours complet et règles tactiques

Le nouveau parcours clique les deux formations (Bleus 4-4-2, Rouges 3-5-2), déplace un joueur,
déplace le ballon, trace une passe puis une course avec aperçus valides, enregistre deux images
clés autour d'un autre déplacement, lance puis met en pause la lecture et retourne à Accueil.
Il retrouve exactement les mêmes formations, coordonnées, flèches et séquence. Deux annulations
puis deux rétablissements reconstituent le même état. Les neuf commandes ont chacune été
exécutées une seule fois. Les objets scène, moteur de rendu, tableau, historique et séquence
sont comparés par identité, pas seulement par leur contenu.

Cette même page entre ensuite en AR IWER, pose et ancre cette tactique, ouvre deux espaces
sans select XR parasite, puis quitte l'AR. Le même tableau, la même scène et le même historique
sont retrouvés. Les parcours AR existants vérifient aussi hit test, repositionnement, annulation,
séquences, sortie système et cinq entrées/sorties successives.

Les règles professorales n'ont pas été modifiées. Les tests existants rejouent origines légales,
arrivées impossibles, doublons, aperçu rouge, absence de commande après un refus, annulation,
double toucher, passe longue/en retrait, centre et courses croisées. La suite navigateur garde
les vérifications réelles de raycasting, souris, doigt et AR.

## Compatibilité, recette et risques restants

- Couverture normale : 320 × 568, 360 × 740, 390 × 844, 568 × 320, 740 × 360, 844 × 390 et bureau 1280/1440 px. Revue supplémentaire : tablettes 768 × 1024 et 1024 × 768, et 720 × 450 équivalent au viewport CSS d'un bureau 1440 × 900 à 200 % de zoom. Ce dernier cas est une équivalence de dimensions, pas une manipulation du zoom natif de Chrome.
- Texte agrandi : taille racine 32 px sur 320 et 390 px ; cible et centre des deux pastilles d'équipe ainsi que les cinq libellés vérifiés. Pas de champ éditable dans ces espaces : aucune interaction de clavier logiciel n'est pertinente dans cette interface actuelle.
- PWA : installation fraîche du Service Worker, cache et état réseau, lancement et navigation hors ligne, mise à jour atomique et migration sw.js → sw.mjs vérifiés. L'invite `beforeinstallprompt` est fabriquée par le test ; acceptation d'un dialogue natif et lancement dans une fenêtre installée non vérifiés.
- `.mjs` : imports et types MIME vérifiés, seuls les fichiers tiers three.js restent en `.js` dans le chargement normal. `sw.js` conserve son seul rôle de migration documenté. Sous-chemin GitHub Pages et version de la coquille vérifiés.
- Fluctuation connue : téléchargement IWER dépendant d'un CDN, délai de 60 s dans le banc. Cette exécution finale n'a nécessité ni reprise de test ni cas ignoré ; les échecs réseau de la phase initiale restent documentés dans le rapport précédent.
- À réaliser sur téléphone : caméra/permissions, DOM Overlay natif, cibles au doigt près des encoches, rotation portrait/paysage, annulation/Retour système, stabilité/ancre pendant une minute, sélection ≥9/10, FPS ≥30, installation et ouverture autonome, passage hors ligne/mise à jour. Les essais anciens ne valident pas automatiquement ce nouveau rail.

Les frontières du futur visualiseur sont consignées dans la
[note séparée](integration-future-visualiseur.md#frontières-après-la-revue-de-la-pr-nº-17).
Aucun backend, modèle ou fichier vidéo n'est ajouté au produit académique.

## Mesures de rendu et de mémoire

Relevé après corrections : Chrome sans interface, WebGPU matériel, 1440 × 900, profils vierges,
main puis branche revue, dans cet ordre. Chaque échantillon dure environ 3 secondes après
échauffement ; le tas JavaScript est lu par CDP après demande de collecte. Les clics de navigation
sont de vraies actions Playwright, avec attente de deux images après ouverture.
Ces mesures sur ce PC ne sont ni un benchmark statistique ni une mesure sur téléphone.

| Mesure | Main, repos | Branche revue, repos | Après 42 changements | Après 210 changements |
| --- | --- | --- | --- | --- |
| Images/s observées | 60,1 | 60,0 | 60,2 | 60,2 |
| Appels de rendu / images échantillonnées | 181 / 181 | 181 / 181 | 181 / 181 | 181 / 181 |
| Canvas du terrain | 1 | 1 | 1 | 1 |
| Géométries / textures / cibles de rendu | 15 / 26 / 1 | 15 / 26 / 1 | 15 / 26 / 1 | 15 / 26 / 1 |
| Écouteurs window / overlay / rail, lus par CDP | 19 / 1 / absent | 22 / 2 / 1 | 22 / 2 / 1 | 22 / 2 / 1 |
| Tas JavaScript après collecte, MiB arrondis | 8,2 | 8,2 | 8,7 | 9,0 |

Aucune accumulation d'écouteurs ni de ressource GPU n'est observée dans cette fenêtre.
Le nombre de rendus suit le nombre d'images, sans signe d'une boucle supplémentaire. La suite
vérifie séparément l'identité du moteur et l'unicité du contexte WebGPU. Le tas augmente d'environ
0,8 MiB ; il inclut le navigateur et les scripts injectés d'automatisation. Ce relevé court ne
prouve pas l'absence de fuite sur une longue séance. Aucune amélioration de performance n'est
revendiquée. Les ressources des cinq cycles AR sont aussi stables dans la suite existante
(23 géométries, 26 textures, 1 cible après la première et la cinquième sortie).

Durée automatisée clic → espace prêt après deux images : médiane **83 ms**, p95 **90 ms**,
sur 210 ouvertures. Elle inclut l'aller-retour Playwright et les images attendues : ce n'est
pas une mesure isolée de latence tactile. Les [mesures brutes](validation/revue-pr17-mesures.json)
conservent les valeurs exactes et les statistiques fournies par three.js.

## Bilan de validation et préparation à la fusion

`npm test` après corrections : **229 / 229 tests unitaires** et **140 / 140 vérifications
navigateur**, **0 échec, 0 cas ignoré**, code de sortie 0. Les onze vérifications ajoutées sont
les sept cas UX, les deux dimensions avec marges simulées et les deux étapes du parcours complet
3D puis AR. Le [journal complet](validation/revue-pr17-tests.txt) est conservé.
`npm run shell-version -- --check` passe avec `15d2a647fa7d74a5`, et `git diff --check` passe.
Les nouveaux modules de tests sont en `.mjs` ; aucune dépendance n'a été ajoutée.

La PR demeure ouverte contre main, sans fusion ni auto-merge. La tête distante et la possibilité
de fusion sont vérifiées après la poussée ; le SHA exact est donné dans le compte rendu de fin
de tâche, sans créer de référence circulaire dans ce document committé.

Cette revue rend la PR acceptable comme amélioration académique de navigation. La recette
physique et l'installation PWA native restent des risques de validation identifiés, et non
des résultats implicitement déduits des tests automatisés.
