# Validation des équipes, 17 novembre 2026

`team-audit.json` contient des étiquettes de maillots, sans image ni vidéo. Elles ont été lues
visuellement avec l'assistant de développement, sans consulter les équipes prédites. Ce ne sont
pas des annotations officielles, ni un banc d'essai indépendant de la Bundesliga.

## Protocole

- Les cinq clips Roboflow déjà présents, la copie en 720p, le montage et la copie à cadence
  variable restent dans `data/videos/`, hors du dépôt. Aucun poids supplémentaire.
- Les détections enregistrées dans `v3-*.tracking.json` ont fourni les boîtes et identifiants.
- Audit de choix de méthode : 1 361 images découpées, dont 1 308 maillots lisibles. Ces images
  servent aussi au regroupement ; les résultats sur cet audit ne sont pas hors échantillon.
- Audit séparé : trois instants par vidéo, proches de 3, 13 et 23 s ; 3, 11 et 19 s pour le
  montage ; 1, 4 et 8 s pour la copie à cadence variable. L'image analysée la plus proche est
  utilisée. Les découpages identiques à une image du regroupement sont exclus par SHA-256 des
  pixels, par rapport au corpus expérimental reconstruit. Les images de cet audit n'ont pas servi
  à choisir les variantes.
- Cet audit comprend 454 observations, dont 446 étiquetées. Les huit exclusions sont des gardiens
  ou des maillots illisibles. Les identifiants, images exactes et exclusions sont conservés dans
  le JSON. Les deux numéros d'équipe sont arbitraires pour chaque vidéo.
- Les trajectoires peuvent échanger leurs joueurs : chaque observation est étiquetée séparément.
  Une affectation stable par trajectoire peut donc être fausse après un échange d'identifiants.

Le script choisit une seule permutation des numéros d'équipe par vidéo et par analyse. Il compte
séparément les observations justes, fausses, inconnues et exclues. Une observation absente est une
erreur de protocole. L'équilibre des équipes ne sert pas d'étiquette de référence.

Le corpus expérimental utilise les rôles majoritaires enregistrés. La collecte originale utilisait
les rôles instantanés avant leur correction ; leur identité complète ne peut pas être prouvée
après coup. L'audit porte sur les mêmes vidéos et trajectoires : il vérifie une régression interne,
pas la généralisation à d'autres matchs. Le JSON conserve les empreintes des vidéos, les instants,
les correspondances des maillots, les révisions du code et les réglages.

## Rejouer

Depuis `analysis/`, après les huit analyses complètes, lancées **une à la fois** avec les options
par défaut et enregistrées sous `data/runs/v4-<nom>.tracking.json` :

```powershell
.venv\Scripts\python validation/compare_teams.py
```

Les fichiers de référence locaux sont indiqués dans `team-audit.json`. Le résultat est écrit dans
`data/runs/team-validation.json`. Le script compare aussi tous les enregistrements d'image : les
instants, détections, rôles, identifiants, positions, calibrations et ballons doivent être identiques,
en retirant uniquement l'équipe et sa confiance.

Les temps viennent des analyses complètes, dans des processus Python neufs. Le premier chargement
d'UMAP, sa compilation et les imports sont inclus. Ce sont des passages uniques sur le même PC,
pas une mesure statistique : la charge du système peut varier. Le résultat de la copie en 720p
qui partageait le GPU est écarté du comparatif de vitesse.

Cette validation ne mesure pas la précision des positions, les autres angles de caméra, un match
entier, le direct ou un téléphone. Les vidéos et modèles ne sont pas distribués avec les étiquettes.

Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
