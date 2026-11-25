# Demande d'accord de licence aux coauteurs

À l'attention d'**Iyed Rachdi** et de **Ghassen Dalleji**, coauteurs de Football Simulator avec
Bilel Khlif (SUP'COM, module Réalité Étendue, 2026–2027).

## Ce qui est demandé

Le visualiseur de match et le serveur d'analyse, ajoutés par Bilel Khlif après le projet, sont
publiés sous la **GNU Affero General Public License version 3** (AGPL-3.0-only). C'est la voie libre
qu'exige la licence d'Ultralytics, utilisé par le serveur.

L'application académique, en revanche, reste « tous droits réservés » tant que chaque coauteur n'a
pas donné son accord. Cela couvre le tableau tactique en sept espaces, l'AR, la PWA, les assets
conçus ensemble et les documents de l'équipe.

La proposition est de publier aussi l'application académique sous AGPL-3.0-only. Chacun pourrait
alors l'utiliser, l'étudier, la modifier et la redistribuer, y compris dans un service en ligne, à
condition de publier ses modifications sous la même licence.

L'accord porte sur votre part des droits ; il n'en transfère aucun. Le logo de SUP'COM et les
contenus de tiers en sont exclus.

## Texte à approuver

Pour donner votre accord, répondez par écrit avec le texte suivant. Un message signé de votre
compte GitHub, un commentaire dans la pull request dédiée ou un courriel conservé par l'équipe
conviennent.

> Je soussigné(e), [nom], coauteur du projet Football Simulator, accepte que mes contributions à
> ce projet, telles que décrites dans ATTRIBUTION.md, soient publiées sous la licence GNU Affero
> General Public License version 3 seulement (AGPL-3.0-only), avec la mention
> « Copyright 2026 Équipe Football Simulator : Iyed Rachdi, Bilel Khlif, Ghassen Dalleji ». Cet
> accord ne concerne ni le logo de SUP'COM ni les contenus de tiers. Date : [date].

## Ensuite

Une fois les deux accords reçus, le changement se fait par une pull request :

1. Dans le premier bloc de [REUSE.toml](../REUSE.toml), remplacer `LicenseRef-Equipe-Droits-Reserves` par `AGPL-3.0-only`.
2. Exclure les fichiers qui contiennent le logo de SUP'COM ou des captures de tiers, sous leur propre mention.
3. Copier `LICENSES/AGPL-3.0-only.txt` dans `LICENSE` à la racine.
4. Vérifier avec `reuse lint`, puis faire relire la pull request par les trois coauteurs.

Sans accord, rien ne change : l'application reste publiée pour consultation, sans licence.
