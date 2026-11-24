# Équipes et éclairage : recherche de composants réutilisables

Recherche du 17 novembre 2026, suivie d'une comparaison locale des variantes. Les performances citées par les sources ne sont pas des mesures de ce projet. La partie 4 distingue les essais de choix de méthode de la validation complète. Les résultats du visualiseur sont dans [visualiseur-match.md](visualiseur-match.md).

## 1. Point de départ

Le défaut observé sur `573e61_0` concerne des joueurs blancs affectés à l'équipe sombre, parfois avec des votes unanimes. Un vote cohérent ne prouve donc pas une bonne reconnaissance.

Le [code de Roboflow Sports à la révision utilisée](https://github.com/roboflow/sports/blob/42c80c06b6b65a7f89455b89fe31cdf4c38ba227/sports/common/team.py) extrait des plongements SigLIP sur les images découpées des personnes. Il moyenne les jetons visuels, applique UMAP, puis KMeans à deux groupes. Sa normalisation ne vise pas spécialement les ombres.

La [fiche de SigLIP](https://huggingface.co/google/siglip-base-patch16-224) décrit un redimensionnement en 224 × 224 et une normalisation RGB fixe. Il s'agit d'un modèle généraliste, sans garantie annoncée de séparation des maillots sous des éclairages différents. Les poids déjà présents peuvent être réutilisés, sans nouveau téléchargement.

**Hypothèses à départager par des essais :** le fond, les jambes et les ombres occupent une partie du découpage ; les plongements conservent ces différences ; la réduction non linéaire peut les favoriser face à celles des maillots. La recherche seule ne permet pas d'attribuer le défaut à une étape précise.

## 2. Options pratiques

| Option | Composant réutilisé | Intérêt | Limites et vérification nécessaire |
| --- | --- | --- | --- |
| Cadrage sur le torse avant extraction | Découpage NumPy/OpenCV et SigLIP existants | Réduit le fond, le short et les jambes ; conserve le modèle actuel | Peut enlever des indices utiles, notamment pour un maillot rayé ou un torse masqué. Comparer sur les huit vidéos |
| Regroupement direct des plongements | KMeans et normalisation de scikit-learn | Évite de faire dépendre les équipes d'une projection UMAP ; pas de nouveau modèle | Une direction du plongement peut encore coder la lumière. Comparer les variantes avec et sans normalisation |
| Moyenne par trajectoire avant regroupement | Principe de la référence SoccerNet-GSR ; KMeans | Donne un poids comparable aux trajectoires ; réduit le nombre de vecteurs à regrouper | Un échange d'identifiants mélange les joueurs. Conserver un contrôle des observations et la possibilité d'une équipe inconnue |
| Correction du contraste sur la luminance | `cv2.createCLAHE`, déjà disponible | Normalisation locale, sans poids et peu coûteuse | Peut amplifier le bruit ou rapprocher un maillot blanc et un maillot sombre. Ne pas l'activer sans comparaison visuelle et quantitative |
| Représentation spécialisée du football | PRTReID de SoccerNet-GSR | Modèle préentraîné pour l'identité, le rôle et l'équipe | Autre chaîne de dépendances et nouveaux poids. À considérer si les adaptations légères échouent |

Le [module officiel de SoccerNet-GSR](https://github.com/SoccerNet/sn-gamestate/blob/main/sn_gamestate/team/tracklet_team_clustering_api.py) moyenne les plongements de chaque trajectoire de joueur, puis applique KMeans aux moyennes. L'[article de référence](https://openaccess.thecvf.com/content/CVPR2024W/CVsports/papers/Somers_SoccerNet_Game_State_Reconstruction_End-to-End_Athlete_Tracking_and_Identification_on_CVPRW_2024_paper.pdf) précise que ses plongements viennent de PRTReID, entraîné pour ces tâches. Ce résultat ne démontre pas que la même opération suffit avec SigLIP.

La [documentation de `normalize`](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.normalize.html) décrit la normalisation des vecteurs à norme unité. C'est une transformation disponible dans la dépendance existante, pas une garantie d'invariance à l'éclairage.

La [documentation OpenCV de CLAHE](https://docs.opencv.org/4.x/d5/daf/tutorial_py_histogram_equalization.html) explique la correction locale avec limitation de l'amplification du contraste. Elle avertit aussi que l'égalisation globale peut perdre des détails quand une image contient à la fois des régions très claires et très sombres.

## 3. Approches spécialisées examinées

L'article [« Unsupervised Clustering in Football Analysis: A Color-Segmentation and Lighting Adaptation Approach »](https://ieeexplore.ieee.org/abstract/document/10767702), IEEE Access, 2024, traite explicitement des grandes ombres. Son résumé décrit une segmentation par couleur et une égalisation de l'éclairage. Aucun paquet prêt à intégrer, avec une licence de code vérifiée, n'a été identifié pendant cette recherche. L'article reste une piste, pas une dépendance retenue ni une méthode reproduite ici.

[« From Broadcast to Minimap »](https://openaccess.thecvf.com/content/CVPR2025W/CVSPORTS/papers/Golovkin_From_Broadcast_to_Minimap_Achieving_State-of-the-Art_SoccerNet_Game_State_Reconstruction_CVPRW_2025_paper.pdf), CVPRW 2025, utilise une représentation TeamID spécialisée fondée sur OSNet et apprise sur des tenues. Ce travail confirme l'intérêt d'un plongement dédié, mais suppose d'autres modèles et une chaîne plus lourde. Ce n'est pas un remplacement immédiat des composants en cache.

## 4. Comparaison locale et décision

Les huit vidéos déjà testées ont servi à comparer **22 combinaisons par vidéo**, avec SigLIP en cache. Aucun entraînement de modèle ni nouveau téléchargement de poids.

| Étape | Variantes |
| --- | --- |
| Image fournie à SigLIP | Personne entière ; torse entre 15 et 55 % de la hauteur et 20 et 80 % de la largeur ; personne entière avec CLAHE sur la composante L de Lab (`clipLimit=2`, grille 4 × 4) ; torse avec le même CLAHE |
| Regroupement, pour chacune des quatre images | UMAP à trois dimensions puis KMeans ; KMeans direct ; KMeans après normalisation L2 ; KMeans sur des prototypes par trajectoire, moyennes de plongements normalisés puis normalisées, suivi d'une prédiction par image |
| Six essais supplémentaires | Regroupement spectral sur la personne entière ou le torse, graphe de 10, 15 ou 30 voisins ; attribution des groupes par KMeans |

UMAP et les regroupements utilisent la graine 0 ; KMeans est lancé dix fois (`n_init=10`). Le vote par trajectoire garde le seuil de deux tiers. Les numéros des deux groupes sont alignés sur les annotations pour le décompte : échanger 0 et 1 ne constitue pas une erreur.

**Échantillon de choix de méthode :** 1 308 images de joueurs annotées visuellement sur les planches-contact, sans consulter les prédictions. Les gardiens ou cas exclus ne comptent pas dans ce total. Ces images servent aussi à construire les groupes : les scores suivants ne sont donc pas une validation sur des observations nouvelles. Les fichiers locaux `analysis/data/runs/team-experiments/scores.json` et les annotations conservent le détail.

| Vidéo | Images annotées | Personne entière + UMAP : fausses / inconnues | Torse + UMAP : fausses / inconnues |
| --- | ---: | ---: | ---: |
| `2e57b9_0` | 123 | 4 / 0 | 4 / 0 |
| `0bfacc_0` | 122 | 1 / 0 | 1 / 0 |
| `121364_0` | 125 | 2 / 8 | 2 / 8 |
| `08fd33_0` | 127 | 0 / 0 | 0 / 0 |
| `573e61_0` | 151 | 36 / 0 | 0 / 0 |
| `2e57b9_0` en 720p | 153 | 0 / 15 | 0 / 15 |
| Montage à coupures | 382 | 0 / 6 | 0 / 0 |
| Cadence variable | 125 | 0 / 11 | 0 / 11 |
| **Total** | **1 308** | **43 / 40** | **7 / 34** |

Les erreurs et équipes inconnues portent sur les images après vote de leur trajectoire. Elles peuvent donc venir d'un échange d'identifiants : une trajectoire contenant deux maillots reçoit une seule équipe ou reste inconnue. Il ne s'agit pas d'une mesure indépendante de chaque joueur pendant toute la vidéo.

**Choix retenu pour la validation complète : torse + UMAP, sans CLAHE.** Sur cet échantillon, les 36 erreurs de `573e61_0` disparaissent ; aucune erreur supplémentaire sur les sept autres vidéos. Le cadrage conserve le modèle et le regroupement déjà utilisés. Ce résultat soutient le rôle des régions extérieures au maillot dans le défaut, sans démontrer une invariance générale à l'éclairage.

Les autres variantes sont écartées pour cette correction. La meilleure variante CLAHE donne 13 erreurs et 43 inconnues ; la meilleure variante spectrale, 67 et 34 ; la meilleure variante de regroupement direct ou par prototypes, 90 et 59. Elles n'améliorent pas le résultat du torse avec UMAP. Un gain éventuel de vitesse ne justifie pas ces régressions.

**Le cadrage dépend du modèle.** Le contrôle complémentaire de CLIP en cache montre 60 erreurs sur 151 maillots de `573e61_0` avec le torse, contre zéro avec la personne entière. Le cadrage du torse est donc réservé à SigLIP ; CLIP conserve ses entrées. Après cette séparation, les plongements et résultats CLIP restent identiques sur deux clips, et les 1 361 plongements SigLIP restent strictement identiques sur les huit vidéos. Détail : [rapport de compatibilité](compatibilite-equipes-2026-11-17.json).

**Validation complète terminée :** huit nouvelles analyses et audit interne de 446 observations lisibles sur des images distinctes du corpus expérimental reconstruit. Les erreurs passent de 19 à 3, les inconnues de 14 à 13 ; aucune régression sur les autres résultats des 2 792 images analysées. Protocole, caveat de reconstruction, temps et limites : [visualiseur-match.md, partie 6.7](visualiseur-match.md#67-fiabilisation-des-équipes-17-novembre-2026).

Le vote par trajectoire, les équipes inconnues, la résolution séparée des gardiens et le contrat de données restent nécessaires. La simple proportion de chaque équipe est un avertissement de cohérence, pas une mesure de justesse : un regroupement faux peut rester équilibré. Pour un futur direct, apprendre sur un échantillon borné puis prédire les nouveaux vecteurs ; pour les matchs longs, borner les images et vecteurs conservés et découper les résultats. Aucun essai sur trente secondes ne valide un match entier.

## 5. Pistes de vitesse sans nouveau modèle

Le [regroupement spectral de scikit-learn](https://scikit-learn.org/stable/modules/generated/sklearn.cluster.SpectralClustering.html) peut construire un graphe de voisins puis le séparer en deux groupes. L'option `cluster_qr` attribue les groupes à partir des vecteurs propres sans les itérations de KMeans. Cette piste réutilise une dépendance existante et ne demande ni TensorFlow ni Numba. Elle ne garantit pas de meilleures équipes : des groupes de vues ou de trajectoires peuvent aussi former des composantes du graphe.

`SpectralClustering` fournit `fit_predict`, sans méthode de prédiction de nouvelles observations. La [documentation scikit-learn sur le regroupement inductif](https://scikit-learn.org/stable/auto_examples/cluster/plot_inductive_clustering.html) propose de former ensuite un classifieur sur les groupes obtenus. Un [classifieur par voisins](https://scikit-learn.org/stable/modules/generated/sklearn.neighbors.KNeighborsClassifier.html) serait une brique réutilisable pour cette adaptation. Un futur flux demanderait un échantillon borné, des refus des cas éloignés et une vérification de la dérive. Cette combinaison n'est pas retenue sans validation des équipes et des observations nouvelles.

Dans la version UMAP installée, [l'initialisation du paquet](https://github.com/lmcinnes/umap/blob/master/umap/__init__.py) tente de charger le module paramétrique, dont le code importe TensorFlow s'il est disponible. Les deux fichiers installés ont été lus : ils ne proposent pas de variable d'environnement pour désactiver ce chargement. Sur cette machine, TensorFlow vient de l'environnement global réutilisé. Un environnement réellement isolé, sans ce paquet facultatif, est préférable à une modification du chargeur Python ou des dépendances installées.

La [documentation UMAP](https://umap-learn.readthedocs.io/en/latest/reproducibility.html) explique aussi le coût de compilation initiale de Numba. Garder un travailleur actif permet d'amortir certains coûts d'import et de compilation entre analyses. Il faut distinguer cette économie de démarrage d'une accélération de l'inférence ou du regroupement lui-même.
