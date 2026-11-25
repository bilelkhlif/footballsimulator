# Licences de Football Simulator

Le dépôt contient trois ensembles, sous trois régimes. La correspondance exacte, fichier par
fichier, est dans [REUSE.toml](REUSE.toml) : `reuse lint` la vérifie (spécification REUSE 3.3).
Les textes des licences sont dans [LICENSES/](LICENSES/).

| Ensemble | Licence | Titulaire des droits |
| --- | --- | --- |
| **Visualiseur de match et serveur d'analyse par IA** : `analysis/`, `src/visualizer/`, `visualizer.html`, `demo/`, leurs tests et leur documentation | [GNU AGPL-3.0-only](LICENSES/AGPL-3.0-only.txt) | Bilel Khlif, 2026 |
| **Application académique** en sept espaces, PWA, AR et documents de l'équipe : tous les autres fichiers | Aucune licence pour l'instant : [tous droits réservés](LICENSES/LicenseRef-Equipe-Droits-Reserves.txt), en attente de l'accord des coauteurs | Équipe : Iyed Rachdi, Bilel Khlif, Ghassen Dalleji |
| **three.js r187**, `src/vendor/three-r187/` | [MIT](src/vendor/three-r187/LICENSE) | Auteurs de three.js |

Les composants installés à part (Ultralytics, PyTorch et les autres paquets Python) et les modèles
téléchargés par l'utilisateur ne sont pas dans le dépôt. Ils sont inventoriés dans
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Pourquoi l'AGPL-3.0 pour l'IA

Le serveur d'analyse importe Ultralytics, publié sous AGPL-3.0. Sa
[page de licence](https://www.ultralytics.com/license), consultée le 25 novembre 2026, propose deux
voies :

- la voie libre, « open-sourcing your entire project under AGPL-3.0 ». Elle cite « Academic research and university coursework » ;
- une licence Enterprise, nécessaire pour utiliser Ultralytics « without open-sourcing your entire project ».

Le projet suit la voie libre. Aucune licence Enterprise n'est donc nécessaire pour cette publication.

Ce que la licence demande ici :

- **Code source.** Le code source complet du visualiseur et du serveur est public dans ce dépôt, avec le texte de la licence et les avis de droits.
- **Interface.** L'interface du visualiseur affiche son avis de licence et le lien vers ce code (section 5 d de l'AGPL).
- **Réseau.** Le serveur indique sa licence et l'adresse de son code dans `/api/health`. S'il était un jour offert à d'autres par le réseau, il devrait proposer le code de sa version exacte à ses utilisateurs (section 13).
- **Modifications.** Elles restent sous AGPL-3.0 et doivent porter la mention de leurs changements.

La version « only » n'accorde rien sous une version future de la licence ; elle reste compatible
avec Ultralytics (AGPL-3.0 et versions ultérieures).

## Pourquoi l'application académique attend

Selon l'historique Git, Bilel Khlif est l'auteur de tous les commits. Mais [ATTRIBUTION.md](ATTRIBUTION.md)
déclare deux choses :

- le cahier des charges est collectif ;
- certains assets (terrain, pions et ballon) sont des créations de l'équipe Football Simulator.

Le rapport final et la présentation sont aussi signés par les trois membres, et la présentation
reprend le logo de SUP'COM. Une licence sur ces fichiers ne peut donc pas être accordée par un seul
coauteur. La demande d'accord est prête : [docs/demande-accord-licence.md](docs/demande-accord-licence.md).

Une fois l'accord écrit d'Iyed Rachdi et de Ghassen Dalleji obtenu, il suffit de remplacer, dans le
premier bloc de `REUSE.toml`, `LicenseRef-Equipe-Droits-Reserves` par `AGPL-3.0-only`. Le texte de la
licence peut alors aussi être copié dans un fichier `LICENSE` à la racine. Ce fichier n'est pas
ajouté avant : GitHub présenterait alors tout le dépôt comme déjà sous AGPL.

Le logo de SUP'COM reste la propriété de SUP'COM, quel que soit l'accord. Les captures d'outils
tiers du rapport d'état de l'art restent soumises aux droits de leurs éditeurs.

## Ce que fait cette licence, et ce qu'elle ne fait pas

- Elle s'applique au code et aux documents du projet listés dans `REUSE.toml`, pas aux composants tiers.
- Elle ne donne aucun droit sur les poids de Roboflow Sports, ni sur SigLIP ou CLIP. Le projet ne les distribue pas ; chacun les télécharge depuis la source officielle ([docs/licences-et-distribution.md](docs/licences-et-distribution.md)).
- Ce document décrit une mise en conformité technique, d'après des sources officielles. Ce n'est pas un avis juridique.
