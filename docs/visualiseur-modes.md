# Visualiseur de match : démonstration publique et analyse locale

Le visualiseur a deux modes, une seule interface. **Explorer la démo** lit des exports statiques, sans
Python, sans GPU et sans serveur : c'est le mode prévu pour GitHub Pages. **Analyser ma vidéo** utilise
le serveur d'analyse local (`analysis/`) : téléversement, analyse réelle sur GPU, résultats partiels,
interruption et reprise. Les deux modes passent par le même moteur : `PagedTrackingStore`, la
synchronisation `requestVideoFrameCallback`, les annotations, le terrain 3D en WebGPU dans la vidéo,
le placement automatique et la sélection. Seule la source des données change.

**Statut :** branche `feature/visualiseur-match` (PR #15), hors de la version évaluée. La démonstration
est **prête pour GitHub Pages, mais pas publiée** : Pages publie `main`, et la PR #15 n'est pas fusionnée.
L'application AR n'est pas modifiée.

Architecture du visualiseur : [visualiseur-match.md](visualiseur-match.md). Analyse par segments et
reprise : [analyse-incrementale.md](analyse-incrementale.md). Installation : [analysis/README.md](../analysis/README.md).

---

## 1. Choix du mode et états affichés

| Mode | Source (`src/visualizer/`) | Ce qu'elle sait faire |
| --- | --- | --- |
| Explorer la démo | `static-source.mjs` | Catalogue, manifeste, fenêtres horodatées, vidéo : fichiers relatifs |
| Analyser ma vidéo | `local-source.mjs` | Tout cela par l'API, plus téléversement, interruption, reprise |

Le mode de départ suit l'adresse (`?demo=`, `?analyse=`, `?serveur=`, `?mode=`). Sans indication, la page
servie par Python ouvre l'analyse locale (en-tête `Server-Timing: football-analysis`, lu sans requête) ;
toute autre page ouvre la démonstration, sans interroger de serveur. L'analyse ouverte est inscrite
dans l'adresse : un rechargement la rouvre.

États affichés en haut de la page, sans promesse au-delà de ce que le serveur fait :

| État | Signification |
| --- | --- |
| Mode démo | Exports statiques ; aucun serveur requis |
| Connexion… / connecté / indisponible | Serveur local joint, ou non (aide affichée : commande, autorisation de Chrome, page servie par Python) |
| Analyse en cours *n* % | Progression du serveur ; les segments publiés sont déjà consultables |
| Interrompue (reprenable) | Interruption demandée, ou serveur arrêté pendant l'analyse ; bouton « Reprendre » |
| Terminée / Échec | Fin de l'analyse, ou erreur du serveur avec son message |

Le bouton « Interrompre » n'apparaît que pour une analyse en attente ou en cours ; il arrête l'analyse
au lot d'images suivant et garde les segments validés. Il n'existe pas de suppression d'analyse : le
serveur ne sait pas le faire, l'interface ne la propose donc pas.

## 2. Démonstration publique

### Contenu publié : un match synthétique

Les vidéos réelles disponibles ne sont pas redistribuables (partie 6). La démonstration publiée est donc
**synthétique** : `python -m football_analysis demo` (`demo_match.py`) simule une rencontre, filme-la
avec une caméra de diffusion virtuelle, puis écrit des annotations qui décrivent exactement ce que la
vidéo montre.

| Élément | Valeur |
| --- | --- |
| Vidéo | 36 s, 960 × 540, 25 images/s, H.264 (MP4), 1,3 Mo |
| Annotations | 450 images analysées (12,5 images/s), 4 segments de 10 s, 43 identifiants |
| Situations montrées | panoramique qui suit le ballon ; coupures à 24 et 28 s ; plan rapproché non calibré (24–28 s) ; joueurs cachés non détectés ; contact masqué d'identité incertaine (11,0–12,2 s) |
| Vitesses | médiane 2,4 m/s, maximum 8,6 m/s (sprint) |
| Provenance | `provenance.kind = "synthetic"`, générateur, graine ; bandeau dans l'interface |

Les annotations sont **exactes par construction** : elles ne disent rien de la précision de l'analyse IA,
et l'interface l'affiche (« sans objet : données synthétiques »). Aucun modèle n'a tourné. Pour que
l'interface montre les mêmes situations qu'une vraie analyse, le générateur imite le comportement visible
du suivi : un joueur caché derrière un autre n'est pas détecté, un identifiant change après une coupure
ou 2,4 s sans détection (comme ByteTrack), et le contact scénarisé porte `identity: "uncertain"` sans
équipe, comme après une correction réelle. Chaque image porte son numéro en binaire (12 pavés en bas à
gauche) : les tests vérifient ainsi que l'image affichée et les annotations correspondent.

### Lecture dans le navigateur

`static-source.mjs` offre au visualiseur la même interface que l'API locale :

- **fenêtres** de trente secondes au plus, avec une image voisine de chaque côté pour l'interpolation et
  les résumés des seules trajectoires présentes (plus la sélection), comme `ChunkStore.window` ;
- **mémoire bornée** : six segments décodés au plus en cache ; un segment voisin n'est lu que si l'image
  voisine n'est pas déjà dans la fenêtre ;
- **intégrité** : catalogue, manifeste et segments contrôlés (format, version, instants croissants) ;
  empreinte SHA-256 de chaque segment vérifiée par Web Crypto dans un contexte sécurisé (HTTPS, boucle
  locale) ; un export abîmé affiche « Fichier de démonstration abîmé » au lieu d'annotations fausses ;
- **adresses** : relatives au catalogue, refusées si elles sortent du dossier de l'export.

### Compatibilité GitHub Pages

Tout est relatif (`demo/index.json`, puis `matches/<id>/…`) : la page fonctionne à la racine comme sous
`/footballsimulator/`. La lecture partielle (`Range`), nécessaire pour se déplacer dans un MP4, est
fournie par GitHub Pages et par le serveur Python ; le serveur statique des tests ne la gère pas, les
tests l'émulent donc pour la vidéo de démonstration. Vérifié dans Chrome sous le sous-chemin, serveur
d'analyse arrêté (partie 7). **Non vérifié à l'adresse publique**, puisque rien n'y est publié.

**Condition bloquante pour l'intégration dans `main` :** le Service Worker académique (`sw.mjs`) met en
cache toute réponse `GET` réussie de la même origine, réponses partielles `206` comprises ; or
`cache.put` refuse une réponse partielle. Une fois la page du visualiseur sous son contrôle (après une
visite de l'application AR), la lecture de la vidéo de démonstration échouerait. Avant la fusion,
`sw.mjs` doit laisser passer sans cache les requêtes avec `Range`, celles de `demo/` et celles de `api/`
(partie 8). Ce point vient de la lecture du code de `main` ; il n'a pas été rejoué, faute d'avoir le
droit de combiner les branches.

## 3. Export statique d'une analyse

```
python -m football_analysis export <base.sqlite> <dossier> [--video V] [--id ID] [--title T]
                                   [--catalog ../demo/index.json] [--replace] [--other-video]
python -m football_analysis verify-export <dossier>
```

| Fichier | Contenu |
| --- | --- |
| `manifest.json` | En-tête et résumé de l'analyse, provenance, index des segments (instants, nombre d'images, taille, SHA-256), trajectoires, vidéo |
| `chunks/00000.json` … | Images d'un segment, au format du contrat (`contract.py`), dans l'ordre du temps |
| `tracks.json` | Résumés publics des trajectoires (sans les votes internes) |
| `video.mp4` ou `.webm` | Vidéo source copiée |

- **Provenance explicite** : outil et version de l'export, date, et pour une analyse réelle les
  empreintes de la source et des poids, les empreintes du code et les versions des bibliothèques (signature
  de reprise de la base). Une démonstration synthétique porte son générateur et sa graine.
- **Aucun chemin local** : le nom de la source est réduit au nom du fichier ; toute autre chaîne qui
  ressemble à un chemin fait échouer l'export.
- **Erreurs** : base absente, illisible ou incompatible ; analyse incomplète (à reprendre d'abord) ;
  segment abîmé ; vidéo non lisible par un navigateur (MP4 ou WebM attendus) ; vidéo différente de celle
  analysée (empreinte), sauf `--other-video`, qui le note dans la provenance.
- **Écriture atomique** : dossier temporaire, relecture complète, puis renommage ; un export raté laisse
  l'ancien intact.
- **Mémoire bornée** : un segment décomprimé à la fois, trajectoires écrites au fil de l'eau ; adapté à un
  match entier.
- **Schémas** : `src/visualizer/schemas/` (JSON Schema 2020-12) ; l'export applique les mêmes règles sans
  dépendance, et les tests vérifient les fichiers avec ces schémas.

Un export d'analyse réelle n'est pas publié dans ce dépôt : la démonstration publique ne contient que le
match synthétique (partie 6).

## 4. Analyse locale

1. Dans `analysis/` : `.venv\Scripts\python -m football_analysis serve` (port 8765, boucle locale).
2. Ouvrir la page **servie par Python**, `http://127.0.0.1:8765/visualizer.html` : même interface, même
   origine que l'API. C'est le mode le plus simple et le repli si une page publique ne peut pas joindre
   le serveur.
3. Ou, depuis GitHub Pages une fois publiée : `visualizer.html?serveur=http://127.0.0.1:8765/`. Chrome
   demande alors l'autorisation d'accéder aux applications et services de cet appareil (partie 5).

Le téléversement crée une analyse ; la page suit son état chaque seconde, ouvre les premiers segments
dès qu'ils existent (le statut indique `results`), puis la vidéo complète à la fin. Une coupure du
serveur ne perd pas l'analyse : l'interface réessaie avec un délai croissant (10 s au plus) ; un serveur
redémarré la retrouve « interrompue » et reprenable, depuis son dernier segment validé.

## 5. Sécurité et restrictions des navigateurs

| Protection (`server.py`) | Contre quoi |
| --- | --- |
| Écoute sur `127.0.0.1` ; autre adresse refusée sans `--allow-network` | Vidéos privées exposées au réseau |
| En-tête `Host` limité à `127.0.0.1`, `localhost`, `[::1]` | Rebond DNS |
| Requête avec `Origin` : acceptée seulement de la page servie ici ou d'une origine autorisée (`https://bilelkhlif.github.io` par défaut, `--allow-origin` pour une autre) | Lecture des résultats, téléversement, lancement ou reprise par un autre site (une requête simple sans préalable CORS comprise) |
| Requête intersite sans `Origin` refusée sur l'API | Intégration de la vidéo privée par une balise d'un autre site |
| CORS et `Access-Control-Allow-Private-Network` envoyés aux seules origines autorisées | — |

**Comportement réel mesuré** (Chrome 158, page réelle `https://bilelkhlif.github.io/footballsimulator/`,
serveur sur la boucle locale, 24 novembre 2026) :

- sans autorisation « accès au réseau local » (état `prompt`, refusé d'office en mode sans interface) : la
  requête est bloquée par Chrome avant d'atteindre le serveur, avec le message « Permission was denied for
  this request to access the `loopback` address space » ;
- avec l'autorisation : `GET` réussit avec les en-têtes CORS, `POST` passe par une requête préalable
  `OPTIONS` puis réussit. Chrome 158 n'envoie plus l'en-tête de demande « Private Network Access » : la
  permission l'a remplacé ; le serveur reste compatible avec les deux ;
- `http://127.0.0.1` depuis une page HTTPS n'est pas bloqué comme contenu mixte : la boucle locale est
  considérée comme sûre.

Non testé : Firefox, Safari et Edge (navigateurs absents de ce poste), et un vrai clic sur l'invite de
Chrome. La page servie par Python évite toutes ces restrictions.

## 6. Licences et redistribution

Versions installées et licences déclarées (métadonnées des paquets, 24 novembre 2026) :

| Élément | Version | Licence | Publié avec la démonstration ? |
| --- | --- | --- | --- |
| ultralytics | 8.4.215 | AGPL-3.0 | Non : serveur local seulement |
| Poids YOLOv8 de Roboflow Sports (3 fichiers) | `setup.sh`, commit 42c80c0 | AGPL-3.0 selon Ultralytics ; aucune licence propre lue | Non : téléchargés à l'installation, jamais versionnés |
| torch / torchvision | 2.5.1 / 0.20.1 | BSD | Non |
| transformers, SigLIP `google/siglip-base-patch16-224` | 5.13.0 | Apache-2.0 | Non |
| supervision, trackers, scenedetect | 0.31.7, 2.7.0, 0.7.3 | MIT, Apache-2.0, BSD-3-Clause | Non |
| umap-learn, scikit-learn, opencv-python, numpy | 0.6.0, 1.6.1, 4.14.0.94, 2.4.6 | BSD, BSD-3-Clause, Apache-2.0, BSD-3-Clause et autres | Non |
| sports (Roboflow), gdown, sentencepiece | 0.1.0, 5.2.0, 0.2.3 | MIT, MIT, Apache-2.0 | Non |
| three.js (copie `src/vendor/three-r187`) | r187 | MIT | Oui, déjà publié par l'application AR |
| Vidéo et annotations de démonstration | générées | créées pour ce dépôt | Oui |

- **Vidéos réelles** : les cinq exemples de Roboflow Sports viennent du concours Kaggle « DFL – Bundesliga
  Data Shootout », dont les conditions n'ont pas pu être lues ; le résumé de la finale de la Coupe du monde
  2022 analysé le 17 novembre est une diffusion protégée. Aucune n'est versionnée ni publiée, ni leurs
  copies, ni les résultats de leurs analyses, qui en dérivent.
- **AGPL-3.0** : la démonstration publique ne contient ni code d'Ultralytics, ni poids, ni sortie de modèle.
  Le serveur d'analyse importe Ultralytics : il n'est utilisé que sur la machine de son utilisateur. Le
  proposer comme service à d'autres déclencherait les obligations de l'AGPL (§13) sur le code combiné ;
  ce n'est pas prévu. Le dépôt n'a pas de fichier `LICENSE` : la licence du code reste à choisir par
  l'équipe.
- Une dépendance libre ne rend pas ses poids ou ses données libres : chaque élément est évalué à part,
  et rien dont la licence n'est pas lue n'est publié.

## 7. Validation

Le 24 novembre 2026, sur Windows 11, Chrome 158 sans interface (WebGPU matériel), RTX 2050 :

| Niveau | Contenu | Résultat |
| --- | --- | --- |
| Tests Python | Export (validité, schémas JSON, refus des analyses incomplètes ou abîmées, écriture atomique, empreintes, catalogue), démonstration (reproductible, contrat, coupures, contact, vitesses), sécurité du serveur, lecture partielle, interruption ; plus l'existant | 105 réussis sur 105 |
| Tests unitaires Node | Sources démo et locale : fenêtres, voisines, mémoire bornée, empreintes, adresses hors du dossier, boucle locale | 214 réussis sur 214 |
| Chrome automatisé (`npm test`) | 19 vérifications nouvelles : démo sous `/footballsimulator/`, serveur arrêté : lecture, synchronisation image par image après cinq déplacements avant et arrière (numéro binaire de l'image affichée identique à l'image annotée), sélection sur la vidéo et sur le terrain 3D, identité incertaine sans vitesse ni équipe, distance estimée, plan non calibré, rechargement, export abîmé refusé, 390 × 844 et 844 × 390 ; analyse locale simulée : en cours, interrompue, reprise, coupure du serveur, redémarrage, terminée | 121 réussies sur 121 (79 de l'application AR, 23 du visualiseur existant, 19 nouvelles), aucune ignorée |
| Chrome, vrai pipeline GPU | `tests/visualizer-local-ai.mjs`, 10 s de l'exemple `121364_0` (fichier local) : page servie par Python ; résultats partiels après 20 s ; interruption ; arrêt brutal du serveur détecté en 0,1 s ; redémarrage, analyse « interrompue » ; reprise jusqu'à la fin ; lecture avec 23 joueurs annotés et posés en 3D ; origine publique sans autorisation (indisponible) puis avec (vidéo en CORS) ; export de l'analyse réelle vérifié puis lu sans serveur | 12 étapes réussies sur 12 ([relevé](validation-modes-2026-11-24.json)) |
| Téléphone réel | — | Non fait |

La durée de l'analyse réelle (119 s pour 10 s de vidéo) cumule trois chargements des modèles
(interruption, arrêt, reprises) : ce n'est pas une mesure de performance.

## 8. Intégration future dans l'application académique

Ne pas fusionner avant ces points (relevés le 24 novembre 2026, sans modifier `main`) :

1. **`sw.mjs`** : ne pas mettre en cache les réponses `206`, `demo/` et `api/` (partie 2) ; recalculer
   `SHELL_VERSION` ; rejouer la lecture de la démonstration sous le contrôle du Service Worker.
2. **`.mjs`** : renommer `src/visualizer/*.js` et les neuf imports partagés ; étendre le test de
   documentation aux fichiers du visualiseur ; garder ses tests dans le lanceur (voir
   [analyse-incrementale.md](analyse-incrementale.md), partie 9).
3. **Sept espaces de travail** : le visualiseur reste une page à part (`visualizer.html`). Un lien depuis
   l'espace « Plus d'outils » suffirait ; ni la scène three.js ni l'historique tactique ne sont partagés.
4. **Démonstration** : `demo/` (2,2 Mo) devient public avec `main` ; elle ne contient que des données
   synthétiques.

## 9. Limites connues

- La démonstration est synthétique : elle montre l'interface, pas la précision de l'analyse IA.
- Sur un écran de 390 px de large, le panneau du terrain 3D couvre une grande part de la vidéo ; il se
  réduit d'un toucher. Ce placement vient du visualiseur existant, pas de ce changement.
- L'accès d'une page publique au serveur local dépend de l'autorisation de Chrome ; les autres
  navigateurs ne sont pas testés.
- Aucun essai sur téléphone réel ; aucune publication à l'adresse publique.
- L'interruption agit au prochain rapport de progression : pendant le chargement des modèles, elle peut
  attendre quelques secondes.
