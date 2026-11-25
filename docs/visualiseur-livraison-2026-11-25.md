# Livraison vérifiée — 25 novembre 2026

Cette fiche consigne les essais avant publication de la mise à jour de la PR #23. L'état de fusion
et de déploiement effectif se vérifie dans [la PR](https://github.com/bilelkhlif/footballsimulator/pull/23)
et les builds GitHub Pages ; un site préparé localement n'est pas présenté comme déjà déployé.

## Mise en œuvre et historique

Le code vérifié est celui de `b63f98928e489ae7b8fcc38c158b0a146a739a00`, répété sans conflit sur
le `main` distant `3077a2edb5f72baf4b75b8c3e404c35b7c33d745`. Le commit de répétition détaché
`3b312588313d2622a1875c99c4121c942aa95d27` a exactement le même arbre. Les derniers ajouts
documentaires ne changent pas les modules exécutés.

GitHub a déjà fusionné #19 (`1cbd08705e875df0c07da6d99b85daf9987a5639`) puis #20
(`3077a2e`), avec #21 (`5610e16`). Ces changements ont eu lieu dans une autre session ; ils ont été
inspectés et conservés. #15 est marquée fusionnée depuis le 25 novembre, sans action supplémentaire
de cette finalisation. #18 reste ouverte, en brouillon, à `2fbbb901b55a744f75cd32ddcbdb06c971139db2`.
`ATTRIBUTION.md`, les sources tierces et les anciens worktrees ne sont pas réécrits.

| Réalisation | Commit / preuve |
| --- | --- |
| Frontières de fichiers, requêtes malformées, bornes HTTP, nettoyage des uploads | Correctifs déjà intégrés depuis `66531d3`, vérifiés par la suite Python et les tests du serveur Node |
| Vérification des poids avant YOLO, chargement restreint, safetensors figés, PyTorch 2.14.1 | Déjà intégré depuis `b2c3503` ; vrais octets contrôlés et pipeline réexécuté |
| Range/206, exclusion des vidéos entières et de `no-store` | #19, puis `52ee934` ; mises à jour, hors-ligne et migration vérifiés |
| Reprise liée à la révision et au SHA-256 des plongements | `935f62c` ; le test reproduit l'égalité incorrecte des signatures avant correction |
| Vraie vidéo France–Allemagne 2018, crédits DOM sûrs et limites visibles | `2095875` ; 26 s, 325 images réellement analysées, licence média distincte du code |
| Préparation publique limitée au catalogue et aux médias approuvés | `4b5166e` ; fichier témoin privé publié avant la garde, refusé ensuite |
| Scénarios synthétiques explicites et nouveau défaut réel | `aa3ee1f` ; les assertions tactiques et de sélection restent exactes |
| Sélection après panne GPU : attendre la vraie cible de clic | `b63f989` ; diagnostic DOM prouvant l'interception par le panneau pendant ses 450 ms d'animation |

Les corrections de #21 restent présentes : légende sans `innerHTML`, identité de chargement pour
la restauration vidéo, rejets de `play()` traités, diagnostic média neutre et comparaison AR Float32
bornée à 10⁻⁶. L'état tactique et l'historique restent comparés exactement. Les nouveaux crédits ne
créent que du texte et des liens HTTP/HTTPS ; les protocoles exécutables ne deviennent pas des liens.

## Résultats effectivement exécutés

| Vérification | Résultat final | Portée |
| --- | --- | --- |
| `npm test`, arbre de fusion simulé | **277/277 unitaires, 224/224 Chrome**, 0 échec, 0 ignoré | Sept espaces, flèches valides/invalides, formations, animation, historique, WebGPU, AR IWER, imports et PWA |
| `python -m unittest discover -s tests`, dans `analysis/`, même arbre | **129/129**, aucun cas ignoré | API, encodages, chemins, uploads, reprises, modèles, exports et données publiques |
| Perte GPU provoquée, après correction du hit-test | **10/10 répétitions, 50/50 contrôles** | Erreur de décodage 3 réellement exercée dans les dix |
| Vrai parcours CUDA, après ajout de la signature des plongements | **12/12 étapes** | Téléversement, partiels, interruption, arrêt brutal, redémarrage, reprise, lecture, export et relecture sans Python |
| Edge installé, parcours ciblés | **14/14** | Démo réelle aux deux chemins, sélection, zoom, changements de source et six contrôles de sécurité/récupération |
| Site préparé, Chrome 1365 × 900 et 390 × 844 | **Deux parcours réussis** | Sept espaces, Bêta, WebGPU, vidéo réelle sous `sw.mjs`, HTTP 206, 14 pions à 12,5 s, cache vidéo vide, aucun débordement ni erreur console/HTTP/MIME |
| `reuse lint` | Conforme REUSE 3.3 | Notices et licences présentes ; ce contrôle n'est pas un avis juridique |

Les premiers passages ont signalé deux hypothèses de fixture devenues fausses avec le nouveau
défaut réel, puis la course de clic du test GPU. Ils ne sont pas présentés comme réussis : chaque
échec a été expliqué, corrigé et le passage complet a été relancé. Aucun cas n'a été ignoré.

Le parcours CUDA final termine en **157 s**, sans réinitialisation du GPU. Les dix pannes ont été
provoquées séparément. La vérification de l'accès depuis une origine publique et de l'autorisation
réseau local est émulée par routage du navigateur ; ce n'est pas un serveur Python exposé sur Internet.
Après perte WebGPU, la 3D demande encore un rechargement de page ; la vidéo a une seule tentative
de récupération automatique. Aucun rétablissement du pilote n'est revendiqué.

## Données réelles et indépendance des modes

France–Allemagne est une création déclarée de **Like tears in rain**, sous **CC BY-SA 4.0**.
La [notice du média](../demo/matches/france-allemagne-2018/SOURCE.md) conserve la source, le crédit,
les modifications, les hashes et la même licence pour la vidéo adaptée et le poster. Aucun clip
DFL/Bundesliga, FIFA, poids ou analyse privée n'est publié. Le candidat Orange County reste hors
catalogue : sa copie locale est un MPD et sa licence de source n'est pas encore vérifiée.

L'analyse de l'extrait de 26 s prend 175,57 s sur RTX 2050, avec 627 Mio au pic PyTorch. Elle produit
325 images, six segments et 56 trajectoires. **70,6 % des déplacements sont jugés improbables** :
les vitesses et distances ne sont pas validées. L'erreur médiane hors échantillon de 1,25 m porte sur
des repères du terrain, pas une vérité terrain des joueurs. Ces limites apparaissent avant la vidéo
et dans les mesures, sans remplacer les échecs de calibration par des positions inventées.

La démo synthétique conserve ses 36 s, coupures et identité incertaine contrôlées. Le mode public ne
demande ni Python ni GPU d'inférence hébergé. Le GPU du navigateur rend la 3D. Le mode local reste
optionnel, sur la boucle locale, sans service cloud obligatoire. La navigation s'ouvre dans un nouvel
onglet et conserve exactement le tableau tactique ; le retour est masqué sur le serveur Python qui
ne sert pas `index.html`.

## Dépendances, intégrité et décisions restantes

Les trois checkpoints retéléchargés correspondent aux octets déjà présents :

- joueurs : `75b09c377fbf9d0791d23f6cfb689f5aed6eaa43a6818bd1fb884cf7507fffaf` ;
- terrain : `28f68f7c4056d6d9b137efd2e7ab5f3c494039380c63831649126ced25628b36` ;
- ballon : `678fbad05134f19c5094cb8d273812ec9c6691228180d46832551ecf99ed2912`.

Les safetensors SigLIP et CLIP en cache correspondent aussi à leurs empreintes LFS sur les révisions
figées. Aucun chargement de modèle inconnu ni téléchargement implicite pendant l'inférence. Une
empreinte approuvée n'est ni une signature éditeur ni un droit de redistribution des poids.

L'environnement isolé utilise Python 3.11.9, **torch 2.14.1+cu126 / torchvision 0.29.1+cu126**,
CUDA 12.6 et le pilote 566.07 sur RTX 2050. `pip check` ne trouve pas de dépendance cassée.
Après mise à jour de l'installateur vers pip 26.3, le scan relève **90 paquets, 87 audités, zéro
résultat sur cette population**, avec trois exclusions explicites : Sports depuis Git, torch et
torchvision CUDA absents de l'index PyPI du scanner. Les avis officiels ont donc aussi été lus.

**P2 conditionnel :** torch 2.14.1 reste affecté par
[GHSA-v32g-mr63-3j83](https://github.com/pytorch/pytorch/security/advisories/GHSA-v32g-mr63-3j83).
Le hash empêche un checkpoint hostile d'atteindre le chargeur, et aucun des trois pickles approuvés
ne contient de référence `FrameSummary`. Cela réduit l'exposition, sans corriger la bibliothèque.
Les deux avis d'exécution de code antérieurs sont corrigés. Une alternative CUDA 12.6 en 2.13.0,
hors des plages de ces trois avis, est identifiée mais reste à valider. Le disque n'a que **2,26 Go
libres**, moins que la roue seule (2 594 548 547 octets) : un autre emplacement d'environ 10 Go a
été demandé. Aucun environnement existant n'est effacé pour contourner cette limite. La voie
2.15 nécessite également une revue du pilote et une nouvelle validation.

**P2, limite de mesure :** fortes erreurs de vitesse sur la vue réelle, explicitement signalées ;
aucune précision scientifique promise. **P3 :** avis de dépréciation tiers sans échec observé.
Aucun défaut P0 ou P1 nouveau n'a été reproduit dans le site statique livré.

**Décision juridique du propriétaire :** l'accord écrit des coauteurs pour une licence de l'application
académique reste à obtenir. Aucun fichier LICENSE racine, achat Enterprise ou engagement commercial
n'est créé. Les poids ne sont pas distribués ; un paquet serveur installé n'est pas déclaré prêt à
être redistribué. [Inventaire et options](licences-et-distribution.md). #18 reste séparée ; proposition
de numérotation 25/26 pour ses entrées recouvrant 23/24, après revue de l'équipe.

## Publication et validation physique

Le passage prévu est un **commit de fusion de #23** sur `main`, en revérifiant les têtes avant l'action.
Il conserve l'ascendance exacte de #19 et #20. Les builds Pages utilisent toujours `main`, `/`, mode
legacy ; aucun réglage de production n'est changé. Attendre la confirmation GitHub du build au SHA
fusionné, puis vérifier le site réel. `SHELL_VERSION=10ab6aeb23c96386`, calculé et contrôlé ; la vidéo
n'entre pas dans la coquille hors ligne. Mises à jour atomiques, hors-ligne et migration `sw.js` sont
couvertes à la racine et sous `/footballsimulator/`.

Téléphone réel : installation/mise à jour PWA, caméra et ancrage AR, stabilité 60 s, sélection 9/10,
30 images/s et gestes portrait/paysage restent à mesurer. Firefox et Safari restent à essayer ; les
14 contrôles Edge ne constituent pas une suite complète de compatibilité. Les profils mobiles et
IWER sont des émulations sur PC. Les travaux et essais de cette fiche sont réalisés par Codex, sur
instruction du propriétaire, sans délégation ; aucune réalisation humaine non documentée n'est attribuée.
