# Démonstrations sur de vraies vidéos

## État au 26 novembre 2026 : galerie de sept matchs, équipes contrôlées

La galerie propose six vidéos réelles de Wikimedia Commons et le match synthétique. Trois vidéos ont été
ajoutées pour montrer le classement des joueurs en deux équipes : Samsunspor contre Trabzonspor (corner),
Rizespor (penalty) et Fenerbahçe (coup franc), filmées en tribune par 𐰇𐱅𐰚𐰤. Les six vidéos réelles ont
été analysées à nouveau avec le code final, sur RTX 2050. Sur les trois vidéos déjà publiées, les
mesures de calibration, de positions, de suivi et d'identités sont restées identiques : seules les
équipes changent.

Chaque carte affiche désormais deux verdicts de contrôle visuel, calibration et équipes, et l'indicateur
« Équipes ». Celui-ci donne la part des observations de joueurs dont l'équipe est connue. Il passe au
rouge quand le contrôle visuel juge les équipes fausses. Sans contrôle, il passe aussi au rouge si plus de
70 % des joueurs d'une image typique sont dans la même équipe, car deux équipes sont attendues. Ce n'est
qu'un indice : la vidéo synthétique, aux équipes exactes, compte 78 % de joueurs de la même équipe dans
une image typique, parce que la caméra suit l'attaque. Le verdict et son constat chiffré se lisent aussi dans « Qualité de l'analyse ». La
démonstration ouverte par défaut reste Samsunspor–Altınordu, la seule dont la calibration passe le
contrôle visuel : ses positions 3D sont affichées, mais ses équipes sont fausses et c'est indiqué.

| Match | Catégorie | Durée ; vidéo | Analyse RTX 2050 ; mémoire GPU | Équipe connue | Même équipe (image typique) | Contrôle des équipes | Calibration |
|---|---|---|---|---|---|---|---|
| Samsunspor–Altınordu 2023 — penalty, vue large | Vue large | 29,8 s ; 6,1 Mo | 208 s ; +910 Mio | 99 % | 89 % | fausses : arbitres en cyan contre tous les joueurs | approximative (1 à 3 m) |
| Samsunspor–Trabzonspor 2025 — corner | Corner | 15,3 s ; 6,7 Mo | 146 s ; +886 Mio | 93 % | 62 % | 73 justes, 3 erreurs, 3 mêlées, 6 sans équipe | rejetée : 3D masquée |
| Samsunspor–Rizespor 2024 — penalty | Penalty | 19,5 s ; 8,2 Mo | 129 s ; +876 Mio | 94 % | 57 % | 28 justes, 1 erreur, 1 mêlée, 5 sans équipe | rejetée : 3D masquée |
| Samsunspor–Fenerbahçe 2025 — coup franc | Coup franc | 22,7 s ; 9,3 Mo | 178 s ; +883 Mio | 96 % | 56 % | 53 justes, 3 erreurs, 4 mêlées, 6 sans équipe | rejetée : 3D masquée |
| Brésil–Afrique du Sud 2016 — coup franc | Coup franc | 26,1 s ; 4,4 Mo | 174 s ; +903 Mio | 90 % | 67 % | 52 justes, 3 erreurs, 2 douteuses, 10 sans équipe | rejetée : 3D masquée |
| France–Allemagne 2018 — penalty, vidéo réelle | Suivi difficile | 26,0 s ; 10,6 Mo | 149 s ; +877 Mio | 85 % | 70 % | 28 justes, 2 erreurs, 1 mêlée, 3 sans équipe | rejetée : 3D masquée |
| Match synthétique de démonstration | Synthétique | 36 s ; 1,3 Mo | aucune (annotations exactes) | sans objet | sans objet | exactes par construction | exacte par construction |

« Analyse » : durée totale d'une analyse, une à la fois, chargement des modèles compris. « Mémoire GPU » :
hausse mesurée sur toute la carte par nvidia-smi ; le pic propre à PyTorch est de 627 Mio. « Même
équipe » : part médiane des joueurs classés d'une image qui sont dans la même équipe, vers 50 % attendu.
Les décomptes du contrôle portent sur les trajectoires de joueurs suivies au moins 8 images (protocole
ci-dessous). Preuves : [validation-equipes-2026-11-26.json](validation-equipes-2026-11-26.json).

**Ce qui a changé dans l'analyse** ([analyse-incrementale.md](analyse-incrementale.md)) :

- *Défaut corrigé.* Sur un clip plus court que l'amorçage des équipes (30 s), un joueur apparu après le
  remplissage de la réserve d'apprentissage (64 trajectoires) restait sans équipe jusqu'à la fin. Avec
  les mêmes détections, la part des observations classées passe de 44,8 à 93,0 % sur Trabzonspor, de
  86,7 à 96,2 % sur Fenerbahçe, de 52,5 à 89,7 % sur le Brésil et de 87,8 à 99,1 % sur Altınordu.
- *Groupe « autres ».* Un petit groupe à part du regroupement en trois ne vote pour aucune équipe. Sur
  Rizespor, il écarte deux gardiens en noir et trois stadiers, auparavant rangés avec l'équipe rouge et
  blanche. La part classée descend donc de 99,6 à 94,2 % : ce sont ces non-joueurs qui sortent.
- *Limite.* Sur Altınordu, les deux équipes sont plus proches l'une de l'autre que des arbitres en
  cyan : le regroupement oppose « arbitres » et « joueurs ». La correction du défaut y range désormais
  presque tous les joueurs dans le même groupe (99 % classés, 89 % dans la même équipe) : l'indicateur
  est rouge et le verdict « équipes fausses ».

**Protocole du contrôle des équipes.** Une planche par vidéo montre une vignette par trajectoire de
joueur suivie au moins 8 images, prise au milieu de la trajectoire et rangée selon l'équipe attribuée.
Chaque vignette douteuse (deux joueurs superposés, flou) est tranchée sur cinq images réparties le long
de la trajectoire. Est compté comme **erreur** un joueur rangé avec l'équipe adverse, ou un non-joueur
rangé dans une équipe : arbitre, gardien adverse, drapeau de corner. Une trajectoire **mêlée** passe
d'un joueur à l'autre, souvent dans un duel ou dans le mur : c'est un défaut d'identité plus que de
maillot. Les trajectoires que le détecteur appelle « gardien » sont classées autrement, par position :
elles ne sont pas comptées. Sur le Brésil, ce sont surtout des stadiers du bord du terrain. Verdicts :
`verified` sans erreur, `partial` avec des erreurs chiffrées dans la note, `wrong` si les équipes ne
sont pas séparées, `exact` pour la vidéo synthétique. **Limites** : ce contrôle a été fait par
l'assistant IA (Claude Code) sur les planches, sans revue humaine ni annotation de référence ; une
vignette par trajectoire peut cacher un échange d'identité. L'audit annoté sur huit vidéos de la DFL
reste la mesure de référence : 444 justes, 0 erreur, 2 inconnus sur 446 observations, inchangé.

**Droits** : les trois nouvelles vidéos sont, comme Altınordu, des enregistrements de spectateur déclarés
« création personnelle » et placés par leur auteur sous CC BY-SA 4.0. Les six pages ont été relues sur
Commons et par son API le 26 novembre 2026 : aucune demande de suppression ni revue de licence.
Crédits, transformations et empreintes : `SOURCE.md` de chaque dossier et
[media-licenses.json](../demo/media-licenses.json). Écartés le 26 novembre : Samsunspor–Manisa et
Samsunspor–Tuzlaspor (suivi trop morcelé : trajectoire médiane de 0,7 et 0,9 s, 61 et 77 % des
observations classées). Également écartés : Samsunspor–Kayserispor (trois coupures de plan, trajectoire
médiane de 0,6 s),
Samsunspor–Panathinaikos (supporters au premier plan), Fleury–Lyon (photographes au premier plan, à
contre-jour), Lettonie–Gibraltar et Pays basque–Venezuela (fumigènes et tribunes, presque pas de jeu).

## Historique : galerie du 25 novembre 2026 (soir)

La galerie du visualiseur propose trois vidéos réelles de Wikimedia Commons et le match synthétique.
Chaque carte affiche sa vignette, sa catégorie, sa durée, le crédit de la vidéo, le verdict du contrôle
visuel de la calibration et des indicateurs **lus dans les mesures de l'analyse** (rien n'est saisi à la
main). La démonstration ouverte par défaut est Samsunspor–Altınordu, la seule dont la calibration passe le
contrôle visuel.

| Match | Catégorie | Auteur (CC BY-SA 4.0) | Durée ; vidéo | Analyse RTX 2050 ; mémoire GPU | Calibré | > 12 m/s avant → après | Suivi médian | Coupures | Calibration |
|---|---|---|---|---|---|---|---|---|---|
| Samsunspor–Altınordu 2023 — penalty, vue large | Vue large | 𐰇𐱅𐰚𐰤 | 29,8 s ; 6,1 Mo | 222 s ; +1183 Mio | 100 % | 29,2 % → 5,0 % | 2,1 s | 0 | approximative (1 à 3 m) |
| Brésil–Afrique du Sud 2016 — coup franc | Coup franc | Rodrigogomesonetwo | 26,1 s ; 4,4 Mo | 196 s ; +1210 Mio | 83 % | 52,9 % → 10,9 % | 0,6 s | 0 | rejetée : 3D masquée |
| France–Allemagne 2018 — penalty, vidéo réelle | Suivi difficile | Like tears in rain | 26,0 s ; 10,6 Mo | 173 s ; +966 Mio | 95 % | 70,6 % → 11,2 % | 2,8 s | 1 | rejetée : 3D masquée |
| Match synthétique de démonstration | Synthétique | généré pour le dépôt | 36 s ; 1,3 Mo | aucune (annotations exactes) | 89 % | sans objet | 6,1 s | 2 | exacte par construction |

« Avant → après » : part des déplacements de plus de 12 m/s sur les mêmes détections, sans puis avec la
stabilisation de la calibration ([stabilisation-homographie.md](stabilisation-homographie.md)). « Mémoire
GPU » : hausse mesurée sur toute la carte par nvidia-smi ; le pic propre à PyTorch est de 627 Mio.

**Droits** : chaque vidéo est l'enregistrement d'un spectateur, déclaré « création personnelle » et placé
par son auteur sous CC BY-SA 4.0 ; pages relues sur Commons et par son API le 25 novembre 2026, sans
demande de suppression ni revue de licence. Crédits, liens, transformations et empreintes :
`SOURCE.md` de chaque dossier et [media-licenses.json](../demo/media-licenses.json). Écartés : les clips
de matchs de jeunes (mineurs), Orange County–Oakland (revue de licence en cours sur Commons), les vidéos de
la DFL et de la FIFA, et un second penalty de Samsunspor (Rizespor, 2024), licite mais redondant avec
Altınordu et filmé sous un angle où la calibration automatique échoue aussi. Il a été ajouté le
26 novembre pour son classement des équipes. **Aucune contre-attaque sous
licence vérifiée n'a été trouvée** : la catégorie n'est pas inventée.

**Calibration** : le contrôle visuel (lignes du terrain projetées sur l'image) a montré que la calibration
automatique est fausse sur France–Allemagne (filmé derrière le but) et sur Brésil–Afrique du Sud (vue
plongeante), malgré une erreur hors échantillon faible. Le visualiseur masque alors positions, vitesses et
distances ; détections, suivi et équipes restent affichés sur la vidéo.

## Historique : la première démonstration réelle (25 novembre 2026, matin)

Les chiffres de cette section décrivent l'analyse du matin, avant la stabilisation et le contrôle visuel ;
ils sont remplacés par le tableau ci-dessus.

La première entrée du catalogue est désormais un extrait réel de **France–Allemagne 2018**,
filmant le penalty d'Antoine Griezmann depuis les tribunes. La démonstration synthétique de 36 s
reste disponible pour les scénarios contrôlés et les régressions. Les deux se lisent sur un site
statique, sans Python, sans poids de modèle et sans calcul GPU hébergé. Le GPU du navigateur rend
le terrain 3D ; l'analyse de la vidéo réelle a déjà été calculée sur le PC.

### Source et droits du média

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

### Analyse réellement exécutée et limites

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

### Correctifs et séparation de la livraison

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

### Vérifications et portée

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
comme indiqué dans `LICENSING.md`. Aucune licence racine n'est créée ici. Le soir du 25 novembre,
les propositions de la PR #18 ont été intégrées à `ATTRIBUTION.md` (contribution 27). Le travail est réalisé par Codex sur instruction du propriétaire, sans délégation
à un autre agent ; les validations automatisées ne sont pas attribuées aux coéquipiers.
