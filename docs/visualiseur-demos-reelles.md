# Démonstration sur une vraie vidéo — 25 novembre 2026

La première entrée du catalogue est désormais un extrait réel de **France–Allemagne 2018**,
filmant le penalty d'Antoine Griezmann depuis les tribunes. La démonstration synthétique de 36 s
reste disponible pour les scénarios contrôlés et les régressions. Les deux se lisent sur un site
statique, sans Python, sans poids de modèle et sans calcul GPU hébergé. Le GPU du navigateur rend
le terrain 3D ; l'analyse de la vidéo réelle a déjà été calculée sur le PC.

## Source et droits du média

La [page du créateur sur Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Match_de_football_France-Allemagne_-_16_octobre_2018_-_Penalty_d%27Antoine_Griezmann.ogv)
déclare une création personnelle de **Like tears in rain**, sous **CC BY-SA 4.0**. La vidéo adaptée
et le poster gardent cette licence, distincte de celle du code. Le crédit, les liens, les transformations
et les empreintes sont dans [SOURCE.md](../demo/matches/france-allemagne-2018/SOURCE.md), le registre
[media-licenses.json](../demo/media-licenses.json), le bandeau du visualiseur, `LICENSING.md` et REUSE.

Le téléchargement local réutilisé était un vrai WebM VP9 1080p. L'extrait distribué couvre 2 à 28 s,
en H.264, 1280 × 720, 25 images/s, sans audio ; il pèse 10 640 808 octets. Le poster vient de cet extrait.
Les vidéos Bundesliga/DFL et FIFA restées sur le PC ne sont pas publiées. Le fichier local Orange
County–Oakland était un manifeste MPD, pas une vidéo ; sa page Commons signalait aussi une revue
de licence non terminée au 25 novembre. Il n'est pas ajouté sans vérification de la source primaire.

## Analyse réellement exécutée et limites

Le pipeline a traité **325 images** sur RTX 2050 avec PyTorch **2.14.1+cu126**, torchvision 0.29.1,
Ultralytics 8.4.215, les trois checkpoints vérifiés et le snapshot SigLIP épinglé. L'analyse complète
prend **175,57 s** pour 26 s de vidéo ; pic PyTorch 627 Mio. L'export vérifié comporte six segments et
56 trajectoires. Aucune position n'a été dessinée à la main pour cette démonstration réelle.

| Mesure sans vérité terrain | Observation |
| --- | --- |
| Images déclarées calibrées | 95,4 % ; 15 images sans terrain détecté |
| Erreur médiane hors échantillon | 1,25 m sur les repères du terrain, pas sur les joueurs |
| Joueurs avec équipe connue | 92,8 % |
| Déplacements jugés improbables | **70,6 %** ; médiane des vitesses estimées 23,16 m/s |

La vue de tribune, la caméra mobile, les drapeaux et les détections de personnes au bord du terrain
limitent fortement ces résultats. **Les vitesses et distances ne sont pas des mesures sportives
validées.** Le bandeau et les limites de l'export le signalent ; une absence de calibration garde les
objets sur la vidéo sans leur inventer de position 3D. Les identités restent des trajectoires, pas les
noms des joueurs. Le clip réel démontre le fonctionnement de l'interface et ses limites, pas une
précision scientifique garantie.

## Correctifs et séparation de la livraison

- Les champs de crédit sont rendus avec le DOM et du texte ; seuls HTTP/HTTPS deviennent des liens,
  avec `noopener noreferrer`. Des titres HTML hostiles et des URL `javascript:`/`data:` sont refusés
  comme contenu exécutable par un contrôle Chrome supplémentaire.
- La préparation Pages exige un enregistrement de droits relu et vérifie les octets du média réel.
  Un changement de crédit ou de hash bloque la copie. Seuls les fichiers déclarés du catalogue et
  des manifestes sont copiés : un clip privé voisin ne rejoint pas le site.
- La reprise d'analyse inclut maintenant révision et empreinte des plongements. Reproduction avant
  correction : modifier ces deux valeurs du verrou en mémoire ne changeait pas la signature.
  La régression impose désormais deux signatures différentes. Le modèle décrit aussi ces valeurs
  dans la provenance des nouvelles analyses. Les analyses terminées existantes restent lisibles ;
  une ancienne analyse partielle peut demander un nouveau calcul après changement d'implémentation.
- L'installateur `pip` de l'environnement isolé passe de 24.0 à 26.3 après détection d'avis de sécurité.
  Aucun paquet ni poids de l'ancien environnement partagé n'est remplacé.
- Une répétition forcée de perte GPU révèle aussi une course dans le test par coordonnées : après
  un saut vidéo, `frame.rect` indique déjà la destination du panneau, mais son déplacement CSS dure
  450 ms. Le diagnostic d'un échec montre `pick=18` et `elementFromPoint=pitch-view` : le clic est
  intercepté par le panneau encore présent, pas perdu par le lecteur. Le test attend maintenant
  que le vrai hit-test atteigne les annotations et le joueur attendu. Il conserve l'égalité exacte
  de sélection après le clic ; aucun délai arbitraire ni relance automatique du test n'est ajouté.

La préparation ne publie aucun serveur, poids ou base privée et ne modifie pas les réglages Pages.
`SHELL_VERSION` reste celui de la carte Bêta de la PR #23 : `10ab6aeb23c96386`. La vidéo ne rejoint pas
la coquille hors ligne. Range, 206 et vidéo entière contournent le cache ; les réponses `no-store`
ne sont pas conservées. La PWA académique conserve ses sept espaces et sa migration `sw.js`.

## Vérifications et portée

Les résultats finaux sont consignés dans le corps de la PR et le rapport de livraison. Les essais
concernent Chrome sur PC, WebGPU matériel et AR émulée ; aucun essai physique de téléphone n'est
inventé. Le parcours réel CUDA couvre téléversement, résultats partiels, interruption, arrêt brutal,
redémarrage, reprise, lecture, export et relecture sans Python. Les tests de la démo réelle vérifient
aussi sélection, zoom, changement vers la vidéo synthétique, rechargement et sous-chemin Pages.

**Dépendances :** les deux avis d'exécution de code ≤ 2.5.1 et ≤ 2.9.1 sont corrigés dans la recette
testée. PyTorch 2.14.1 reste concerné par
[GHSA-v32g-mr63-3j83](https://github.com/pytorch/pytorch/security/advisories/GHSA-v32g-mr63-3j83),
lecture de fichiers via un checkpoint hostile. Les poids non approuvés sont refusés par hash avant
le chargeur ; l'API n'accepte pas de checkpoint. Cela réduit l'exposition sans rendre la dépendance
elle-même corrigée. Le scan PyPI ne couvre pas automatiquement les roues CUDA ni le dépôt Git
Sports : les avis officiels restent nécessaires. Ne pas interpréter un scan sans résultat comme une
garantie générale. Une publication d'un paquet serveur installé attend toujours la revue de droits
et de sécurité ; le site statique ne contient pas ces dépendances.

Les droits de l'application académique collective restent réservés jusqu'à l'accord écrit de l'équipe,
comme indiqué dans `LICENSING.md`. Aucune licence racine n'est créée ici ; PR #18 et `ATTRIBUTION.md`
restent inchangés. Le travail est réalisé par Codex sur instruction du propriétaire, sans délégation
à un autre agent ; les validations automatisées ne sont pas attribuées aux coéquipiers.
