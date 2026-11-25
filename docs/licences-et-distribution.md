# Licences et distribution

État vérifié le 25 novembre 2026, à partir des sources officielles citées. Ce document décrit une mise
en conformité technique ; ce n'est pas un avis juridique.

## Décision : voie libre AGPL-3.0, Enterprise inutile

Le projet publie son visualiseur et son serveur d'analyse sous **AGPL-3.0-only**
([LICENSING.md](../LICENSING.md), [REUSE.toml](../REUSE.toml)). C'est la voie libre que décrit
Ultralytics, dont dépend le serveur. Sa [page de licence](https://www.ultralytics.com/license),
lue le 25 novembre 2026, distingue :

- la voie AGPL-3.0, pour qui accepte « open-sourcing your entire project under AGPL-3.0 ». Elle cite « Academic research and university coursework » ;
- la licence Enterprise, nécessaire pour utiliser Ultralytics « without open-sourcing your entire project ». Elle cite aussi les services SaaS et les API fermés.

Le projet est entièrement public. La licence Enterprise n'est donc pas nécessaire, et aucune n'a été
demandée ni achetée.

Obligations de l'AGPL-3.0, et leur mise en œuvre :

| Obligation | Mise en œuvre |
| --- | --- |
| Code source complet de l'œuvre distribuée, sous la même licence | Dépôt public ; texte dans `LICENSES/AGPL-3.0-only.txt` ; correspondance fichier par fichier vérifiée par `reuse lint` (REUSE 3.3) |
| Avis de droits et de licence ; absence de garantie | `LICENSING.md`, en-tête de `REUSE.toml`, carte « Licence et code source » de l'interface du visualiseur (section 5 d) |
| Accès au code pour les utilisateurs d'un service en réseau (section 13) | `/api/health` renvoie `license` et `source`. Un serveur hébergé devra montrer ce lien à ses utilisateurs, pour sa version exacte |
| Modifications sous AGPL-3.0, datées et décrites | Historique Git public ; toute contribution est soumise à la même licence |
| Composants tiers sous leur propre licence | [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) ; three.js garde sa licence MIT |

**Compatibilité.** Les 88 paquets de l'environnement validé ont des licences compatibles avec
l'AGPL-3.0 : MIT, MIT-CMU, BSD, 0BSD, ISC, Apache-2.0, PSF-2.0, MPL-2.0, Zlib, BSL-1.0, CC0-1.0, et LGPL pour les codecs FFmpeg
([inventaire](inventaire-licences-python.md)). three.js (MIT) l'est aussi. Aucun conflit n'a été trouvé.

## Qui peut accorder quelle licence

D'après l'historique Git, Bilel Khlif est l'auteur de tous les commits (136 au 25 novembre 2026, sous deux adresses), sans coauteur déclaré.
`ATTRIBUTION.md` précise aussi les contributions de chacun :

- **Visualiseur et serveur d'analyse.** Ajoutés par Bilel Khlif après le projet (contributions 25 et 26 d'ATTRIBUTION.md) : il peut les licencier seul. C'est fait, sous AGPL-3.0-only.
- **Application académique et documents de l'équipe.** Le cahier des charges est collectif, et le terrain, les pions et le ballon sont déclarés « Équipe Football Simulator ». Le rapport final et la présentation sont signés par les trois membres. Aucune licence ne peut donc être accordée sans l'accord écrit d'Iyed Rachdi et de Ghassen Dalleji ([demande prête](demande-accord-licence.md)). En attendant, ces fichiers sont publiés pour consultation, tous droits réservés.
- **Éléments de tiers.** Le logo de SUP'COM appartient à SUP'COM, et les captures d'outils tiers du rapport d'état de l'art restent soumises aux droits de leurs éditeurs.

## Droits sur les modèles

| Modèle | Code | Poids | Données d'entraînement | Usage | Redistribution |
| --- | --- | --- | --- | --- | --- |
| Trois YOLO de Roboflow Sports | [`sports`](https://github.com/roboflow/sports/blob/42c80c06b6b65a7f89455b89fe31cdf4c38ba227/LICENSE) sous MIT | Aucune licence publiée par Roboflow ; AGPL-3.0 par défaut selon Ultralytics (modèles entraînés avec son logiciel) | Jeux de Roboflow Universe : licence non lisible (HTTP 403) | Téléchargés par l'utilisateur depuis les liens officiels de `setup.sh` ; utilisés dans un projet AGPL | **Non** : non vérifiée, le projet ne les distribue pas |
| SigLIP base (`7fd15f0`) | transformers sous Apache-2.0 | Apache-2.0, déclaré dans la fiche du modèle | WebLi (Google), non distribué | Défaut des équipes, local | Permise par Apache-2.0 ; le projet ne la fait pas |
| CLIP ViT-L/14 (`32bd642`) | [CLIP](https://github.com/openai/CLIP/blob/main/LICENSE) sous MIT | Fiche sans licence ; « Any deployed use case of the model […] is currently out of scope » | Non publiées | Recherche seulement (`--teams clip`) ; jamais par défaut ni dans la démo | Non |

Une empreinte SHA-256 prouve l'intégrité d'un fichier, pas un droit sur lui. Les trois poids YOLO
sont donc installés par chaque utilisateur, depuis la source de Roboflow, puis vérifiés. Les inclure
au dépôt demanderait une permission écrite de Roboflow (et des droits des jeux d'entraînement) ; elle
n'est pas nécessaire au fonctionnement.

**Pourquoi garder ces poids.** Ce sont les seuls validés pour le football (joueurs, ballon, repères du
terrain). Un autre détecteur sous licence plus permissive demanderait d'entraîner et de revalider la
chaîne. Il ne réglerait pas non plus l'AGPL d'Ultralytics, qui exécute aussi l'inférence : remplacer
Ultralytics impliquerait de réécrire le détecteur et la calibration. La voie AGPL rend ce remplacement
inutile.

## Politique de distribution

| Élément | Distribué par le projet | Comment |
| --- | --- | --- |
| Application académique, visualiseur, démo synthétique | Oui | GitHub Pages, depuis `main` ; dépôt public |
| Code du serveur d'analyse | Oui, en source | Dépôt public ; installation par `analysis/README.md` |
| Paquets Python (Ultralytics, PyTorch…) | Non | Installés par l'utilisateur depuis PyPI et l'index de PyTorch, versions figées |
| Poids YOLO, SigLIP, CLIP | Non | Téléchargés par `models --download`, vérifiés contre `models.lock.json` |
| Vidéos réelles, analyses privées, bases SQLite | Jamais | Restent dans `analysis/data/`, ignoré par Git |

**Paquet du serveur.** La distribution se fait en code source, avec une recette reproductible :
Python 3.11, versions figées, `pip check`, téléchargement explicite et vérifié des modèles. Ni image
Docker ni exécutable ne sont publiés : ils embarqueraient PyTorch, CUDA et, selon leur contenu, les
poids, avec leurs propres conditions de redistribution.

**Service hébergé.** Aucun n'est déployé. Un serveur public devrait, avant toute mise en ligne :

- montrer son code source et sa licence à ses utilisateurs (section 13) ;
- ajouter une authentification, des quotas, l'isolation des traitements et des limites de stockage ;
- respecter les droits sur les vidéos téléversées.

Le serveur actuel écoute la boucle locale et refuse les autres adresses sans `--allow-network`.

## Accords encore nécessaires

1. **Iyed Rachdi et Ghassen Dalleji** : accord écrit pour publier l'application académique sous AGPL-3.0-only ([texte à approuver](demande-accord-licence.md)). Sans lui, elle reste publiée pour consultation, sans licence.
2. **Roboflow**, seulement si l'on veut un jour inclure les trois poids au dépôt ou dans une image : permission écrite. Inutile pour la publication actuelle.
3. **SUP'COM**, seulement si l'on veut licencier la présentation : le logo reste exclu.

Aucun autre accord n'est nécessaire pour publier le code, le site et le serveur local.

## Attribution

La PR #20 avait hérité de #15 les contributions 23 et 24 du visualiseur, alors que la PR #18 proposait
ces numéros pour d'autres contributions. Le 25 novembre 2026, les propositions de la PR #18 ont été
intégrées à `ATTRIBUTION.md` : contributions 23 et 24 (PR #16 et #17), visualiseur renuméroté 25 et 26,
renvois compris, et contribution 27 pour le travail du 25 novembre.

L'équipe est Bilel Khlif, Iyed Rachdi et Ghassen Dalleji ; l'orthographe « Dalleji » a été confirmée par
Bilel Khlif. Depuis le 25 novembre 2026, `ATTRIBUTION.md` (avec une note sur l'ancienne graphie « Dallekji »),
le README, le rapport final et le script de la vidéo l'emploient ; seuls le rapport LaTeX d'état de l'art et
la présentation PDF gardent l'ancienne graphie, à corriger dans leurs sources puis à réexporter.
L'assistance des outils d'IA à ces corrections et à ces essais est déclarée dans les descriptions des
pull requests ; aucun essai sur téléphone ni travail humain non établi n'est revendiqué.
