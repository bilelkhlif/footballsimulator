# Licences et distribution — décision du propriétaire en attente

État vérifié le 25 novembre 2026. Ce document rectifie les conclusions trop catégoriques des études
du 17 novembre ; il ne choisit pas de licence pour le projet et ne remplace pas l'accord des ayants droit.

## Deux modes, deux ensembles de fichiers

La démo publique est constituée de HTML, CSS, modules JavaScript, three.js et d'une vidéo synthétique.
Elle ne télécharge aucun modèle, n'importe aucun paquet Python et ne paie aucun GPU distant. Les
données de `demo/matches/match-synthetique/` sont générées par le projet ; aucune image de match
télévisé ni sortie des poids YOLO n'y est publiée. Les droits du code et des créations du projet
restent à fixer par leurs ayants droit ; aucune licence racine n'est ajoutée automatiquement.

Le serveur IA est optionnel, installé séparément par l'utilisateur, et écoute la boucle locale. Aucun
environnement Python, poids, modèle de plongements, vidéo réelle ou base privée n'est versionné
ou inclus dans la préparation du site statique. Cette séparation technique **ne suffit pas à conclure
à une exemption juridique**, et l'exécution locale n'annule pas les obligations de licence.

### Périmètre technique retenu pour la préparation

Cible d'ingénierie fixée par le propriétaire le 25 novembre 2026. Ce n'est ni le choix d'une licence,
ni une autorisation de distribuer des composants restreints.

| Mode | Contenu | Exclu |
| --- | --- | --- |
| **Démo publique** | Application statique GitHub Pages ; vidéo et suivi synthétiques ; aucun serveur Python | Poids, images de matchs télévisés, service cloud obligatoire |
| **IA locale** | Serveur Python optionnel, exécuté par l'utilisateur sur son propre GPU ; installation et licences des modèles documentées ([analysis/README.md](../analysis/README.md)) | Hébergement GPU public, poids propriétaires fournis avec le projet |

`npm run pages:prepare` produit ce site statique dans un nouveau dossier : coquille de l'application,
visualiseur, `demo/`, `THIRD_PARTY_NOTICES.md` et `ATTRIBUTION.md`. Il n'y met ni `analysis/`, ni
`tests/`, ni `docs/`, ni poids, ni base. Il refuse aussi un catalogue de démonstration qui contiendrait
autre chose que des données synthétiques. Des tests unitaires vérifient ces trois points.

## Inventaire vérifié et limites

| Élément | Code / poids / service | Source officielle et portée retenue |
| --- | --- | --- |
| Ultralytics 8.4.215 et dépendances associées | Code Python ; modèles YOLO dans un autre téléchargement | [Licence publiée](https://www.ultralytics.com/license), [texte du dépôt](https://github.com/ultralytics/ultralytics/blob/v8.4.215/LICENSE) : voie AGPL ou Enterprise. Le fournisseur demande l'ouverture de l'ensemble du projet pour sa voie AGPL. Ni l'usage universitaire ni localhost ne sont traités ici comme une exemption automatique |
| Trois checkpoints de football | Poids, pas code de `sports` | [Liens figés de téléchargement](https://github.com/roboflow/sports/blob/42c80c06b6b65a7f89455b89fe31cdf4c38ba227/examples/soccer/setup.sh). La politique YOLO ne constitue pas à elle seule une preuve de tous les droits sur les données d'entraînement. Les poids ne sont pas redistribués ; droits et voie AGPL/Enterprise à valider avant une distribution du serveur installé |
| Roboflow Sports | Bibliothèque source réutilisée | [MIT au commit utilisé](https://github.com/roboflow/sports/blob/42c80c06b6b65a7f89455b89fe31cdf4c38ba227/LICENSE). Cette licence de code ne donne pas les droits sur tous les jeux de données, clips, services ou poids de Roboflow |
| PyTorch / torchvision | Bibliothèques et binaires CUDA optionnels | [Licence PyTorch](https://github.com/pytorch/pytorch/blob/v2.14.1/LICENSE), [torchvision](https://github.com/pytorch/vision/blob/v0.29.1/LICENSE) : notices BSD ; les binaires ont aussi leurs notices de composants. Aucun binaire n'est redistribué dans le site |
| ByteTrack | Algorithme exécuté par `trackers` 2.7.0 | [Apache-2.0 de l'implémentation utilisée](https://github.com/roboflow/trackers/blob/2.7.0/LICENSE). Ne pas attribuer la même licence à tout code portant le nom ByteTrack |
| SigLIP | Poids et prétraitement | [Fiche figée](https://huggingface.co/google/siglip-base-patch16-224/blob/7fd15f0689c79d79e38b1c2e2e2370a7bf2761ed/README.md) : Apache-2.0 déclaré. Modèle par défaut, safetensors, révision et empreinte épinglées |
| CLIP ViT-L/14 | Poids optionnels de recherche | [Fiche figée](https://huggingface.co/openai/clip-vit-large-patch14/blob/32bd64288804d66eefd0ccbe215aa642df71cc41/README.md) : périmètre de recherche ; la licence MIT du [code CLIP](https://github.com/openai/CLIP/blob/main/LICENSE) ne résout pas à elle seule la portée de la fiche des poids. Hors démo publique, sans redistribution, décision requise pour autre usage |
| three.js r187 | JavaScript effectivement livré | [MIT et copyright conservés](../src/vendor/three-r187/LICENSE). Aucun fichier tiers modifié |
| IWER | Dépendance de test, chargée seulement sur demande de développement | [MIT](https://github.com/meta-quest/immersive-web-emulation-runtime/blob/main/LICENSE). Ce n'est pas une capacité AR garantie du navigateur réel |
| Playwright | Outil de test seulement | [Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE) ; absent du site statique préparé |
| Autres dépendances Python | Bibliothèques installées localement | Inventaire et notices des roues dans [l'étude](opensource-research.md#7-inventaire-des-licences-du-serveur-danalyse). Les droits MIT/Apache/BSD, la MPL et les composants FFmpeg LGPL/GPL doivent être conservés si un jour un environnement complet est redistribué |
| Vidéos réelles, SoccerNet, concours DFL, services Roboflow | Données / contrats de service | Ni une licence de bibliothèque ni un hash ne donnent un droit de diffusion. Aucun clip privé, poids ou jeu de données réel ajouté au site. Pas d'acceptation de conditions commerciales ou de NDA au nom du propriétaire |

Le format safetensors et SHA-256 améliorent la sécurité technique, pas les droits de redistribution.
Les liens Google Drive des trois checkpoints n'offrent pas de signature éditeur vérifiée : le verrou
approuve les octets comparés à la source HTTPS officielle documentée, pas une attestation juridique.

## Options concrètes, sans engagement pris

| Option à décider | Ce qu'elle permet de préparer | Ce qui reste nécessaire |
| --- | --- | --- |
| **Démo statique d'abord, distribution du serveur suspendue** — recommandation immédiate | Préparer le frontend et la démo synthétique sans dépendances IA livrées ; conserver le backend comme développement optionnel | Autorisation de publication du propriétaire ; pas d'annonce d'une distribution juridiquement validée du backend |
| Voie AGPL ouverte | Préparer une publication sous AGPL du périmètre accepté par le fournisseur, avec source correspondante, notices et instructions de reconstruction | Accord des détenteurs de droits et choix explicite du périmètre ; examiner aussi les droits des poids/données. Aucune licence du projet n'est créée avant cet accord |
| Voie Enterprise / fermée | Garder la possibilité d'une diffusion propriétaire selon un contrat adapté | Devis, contrat et droits sur les poids examinés et acceptés par le propriétaire ; aucun achat ni clic d'acceptation automatique |

Recommandation : finaliser techniquement les deux modes, publier seulement la démo statique après
autorisation, et maintenir la distribution d'un paquet serveur installé/poids en attente. Pour une
diffusion académique pleinement ouverte, étudier la voie AGPL avec l'accord de l'équipe et les droits
nécessaires. Une alternative de détecteur demanderait de nouveaux modèles et une validation ; elle
n'est pas substituée discrètement à la chaîne validée.

## Décisions réservées au propriétaire

Rien de ce qui suit n'a été choisi, accepté ou acheté pendant la préparation :

1. **Licence du code propre au projet.** Il n'y a pas de fichier `LICENSE` à la racine. Le choix revient
   aux ayants droit (l'équipe), y compris pour une éventuelle compatibilité avec l'AGPL.
2. **Voie Ultralytics pour le serveur IA.** AGPL-3.0, avec la source correspondante et des conditions
   pour l'ensemble concerné, ou licence Enterprise sur devis. Tant qu'elle n'est pas choisie, le
   serveur reste un outil local à installer soi-même, sans paquet distribué ni service hébergé.
3. **Droits sur les trois poids de Roboflow Sports.** Le dépôt `sports` est sous MIT pour son code ;
   son README ne donne pas de licence pour les poids, entraînés sur des jeux de Roboflow Universe.
   Ces droits sont à confirmer avant toute redistribution des poids ; le projet ne les redistribue pas.
4. **CLIP.** Il reste réservé à la recherche (`--teams clip`), hors démo publique. SigLIP, qui déclare
   Apache-2.0 dans sa fiche figée, est le modèle par défaut.
5. **Publication de la démo statique.** Elle ne se fait qu'après fusion et autorisation explicite du
   déploiement GitHub Pages.
6. **Numérotation de `ATTRIBUTION.md`.** Le recouvrement des entrées 23 et 24 entre #20 et #18 est
   décrit ci-dessous.

## Attribution, proposition séparée

`ATTRIBUTION.md` et PR #18 restent inchangés. #20 hérite déjà de 46 ajouts et une suppression venus
de #15. Proposition : garder les entrées du visualiseur 23/24 de #20, puis renuméroter les deux entrées
qui se recouvrent dans #18 en 25/26 au moment de sa revue, après vérification des renvois. Si #18
arrive d'abord, faire l'inverse dans une PR explicite. Ne pas réécrire les contributions historiques.

L'équipe indiquée par le propriétaire est Bilel Khlif, Iyed Rachdi et Ghassen Dalleji. L'orthographe
« Dalleji » est confirmée par sa consigne ; les mentions historiques « Dallekji » restent réservées
à la revue explicite de #18. Le README courant emploie le nom confirmé. L'assistance IA des corrections et des essais de cette finalisation est déclarée dans le rapport
de livraison ; aucun résultat de téléphone ni travail humain non établi n'est inventé.
