# Dossier d'évaluation — Football Simulator

Point d'entrée pour l'évaluation du projet du module « WebXR : réalité augmentée et calcul spatial »
(SUP'COM, INDP3-SIA, 2026–2027). Équipe : Iyed Rachdi, Bilel Khlif, Ghassen Dalleji. Encadrant :
Dr. Ing. Mohamed-Bécha Kaâniche. Version décrite : `main` après la fusion de la branche
`feature/glass-demos-academique`, le 25 novembre 2026.

- **Application** : https://bilelkhlif.github.io/footballsimulator/ (QR code : [images/qr-code.png](images/qr-code.png))
- **Visualiseur de match (Bêta)** : https://bilelkhlif.github.io/footballsimulator/visualizer.html
- **Code** : https://github.com/bilelkhlif/footballsimulator

## 1. Ordre de lecture

| # | Document | Temps | Ce qu'on y trouve |
|---:|---|---|---|
| 1 | [README](../README.md), partie « En deux minutes » | 2 min | Le projet, son état, ce qui reste |
| 2 | Ce dossier | 5 min | Preuves, résultats, limites, risques |
| 3 | [Conformité au cahier des charges](conformite-cahier-des-charges.md) | 10 min | 54 exigences : statut, implémentation, preuve, test, contributeur |
| 4 | [Guide de démonstration](guide-demonstration-soutenance.md) | 5 min | 20 étapes avec replis, questions du jury |
| 5 | [Explications techniques](explications-techniques.md) | 10 min | WebGPU, WebXR, génie logiciel, IA |
| 6 | [Matrice des contributions](matrice-contributions-academiques.md) et [ATTRIBUTION.md](../ATTRIBUTION.md) | 10 min | Qui a fait quoi, avec quelle preuve ; usage de l'IA |
| 7 | [Recette](recette.md) | 5 min | Protocole physique P0 à P10, à exécuter sur téléphone |
| 8 | [Rapport final](rapport-final.md), [UML](uml.md), [manuel](manuel-utilisateur.md), [sprints](sprint-1.md) | selon besoin | Livrables du cahier (§5.4) |

## 2. Livrables du cahier (§5.4)

| Livrable | Où | État |
|---|---|---|
| Cahier conceptuel (UML : cas d'utilisation, séquence, déploiement) | [uml.md](uml.md) | Livré |
| Code source | dépôt ; `index.html`, `src/main.mjs`, `src/formations.mjs`, `manifest.json`, `sw.mjs` | Livré |
| Documentation technique | README, [architecture.md](architecture.md), [guide-du-code.md](guide-du-code.md), [explications-techniques.md](explications-techniques.md) | Livré |
| Manuel utilisateur illustré | [manuel-utilisateur.md](manuel-utilisateur.md) | Livré |
| Vidéo de 5 minutes au plus | [storyboard et voix off](video-demonstration.md) | **À tourner par l'équipe** |
| Déploiement GitHub Pages | site publié | Livré |

## 3. Résultats vérifiables

### Tests automatisés (25 novembre 2026, PC Windows, Chrome)

| Suite | Résultat | Commande |
|---|---|---|
| Tests unitaires JavaScript | **285 réussis sur 285** | `npm run test:unit` |
| Vérifications dans Chrome (3D, AR émulée, PWA, espaces, visualiseur) | **226 réussies sur 226**, aucune ignorée | `npm run test:e2e` |
| Tests Python (analyse, export, stabilisation, référence, sécurité du serveur) | **144 réussis sur 144** | `python -m unittest discover -s tests` dans `analysis/` |
| Parcours réel sur GPU (serveur local, interruption, arrêt brutal, reprise, lecture, export) | **12 étapes réussies sur 12** (clip de 12 s sous CC BY-SA ; reprise après arrêt brutal comprise, 155 s) | `node tests/visualizer-local-ai.mjs <vidéo>` |
| Licences des fichiers (REUSE 3.3) | 373 fichiers sur 373 avec licence et droits ; conforme à REUSE 3.3 | `reuse lint` |
| Garde des droits avant publication | vidéos, affiches et vignettes conformes au registre relu | `npm run pages:prepare` |

Les tests vérifient aussi que les erreurs sont détectées : erreurs introduites volontairement aux sprints 5
et 6, toutes détectées. Les vérifications « AR » sont émulées (session WebXR de Chrome, IWER) : **elles ne
remplacent pas un essai sur téléphone.**

### Mesures

| Mesure | Valeur | Conditions |
|---|---|---|
| Appels de dessin, terrain et 22 joueurs | 55 (115 avant l'instanciation) | `docs/sprint-6.md` |
| Images par seconde en AR émulée | 62,5 | PC, processeur ralenti 4 fois ; indicatif |
| Chargement du tableau tactique | 0,69 s (médiane de 3 ; 1,76 s au premier chargement) | Chrome sur PC, serveur local, cache vide |
| Ouverture du visualiseur jusqu'à la première image de la démo | 1,40 s (médiane de 3) ; changement de démonstration par la galerie : 0,32 s | idem |
| Galerie : vignettes | 82 Kio au total ; chargées à la demande (loading=lazy) | quatre vignettes JPEG 480 × 270 |
| Vidéos de démonstration | 6,1 Mo, 4,4 Mo et 10,6 Mo pour les vidéos réelles ; 1,3 Mo pour la synthétique | H.264 720p, sans audio, jamais mises en cache par le Service Worker |
| Analyse GPU d'un clip de 26 à 30 s | 173 à 222 s (6,3 à 7,1 fois la durée) | RTX 2050 4 Gio, PyTorch 2.14.1+cu126 ; pic PyTorch 627 Mio |

### Analyse vidéo : la correction mesurée

| Vidéo | Déplacements > 12 m/s, avant → après stabilisation | Calibration (contrôle visuel) |
|---|---|---|
| Samsunspor–Altınordu 2023 | 29,2 % → 5,0 % | approximative, positions 3D affichées |
| Brésil–Afrique du Sud 2016 | 52,9 % → 10,9 % | fausse, positions 3D masquées |
| France–Allemagne 2018 | 70,6 % → 11,2 % | fausse, positions 3D masquées |

Mêmes détections avant et après ; méthode et limites : [stabilisation-homographie.md](stabilisation-homographie.md).

## 4. Ce qui reste à faire, et par qui

| Reste | Pourquoi | Qui |
|---|---|---|
| Essais physiques P0 à P10 sur la version actuelle (stabilité d'une minute, 9 essais sur 10, 30 images/s, hors-ligne) | Le cahier exige des mesures sur téléphone ; les essais des 12 et 14 novembre portent sur des versions antérieures | Équipe |
| Vidéo de démonstration | Livrable du cahier (§5.4) | Équipe |
| Accord de licence de l'application académique | Œuvre collective : un seul coauteur ne peut pas la licencier ([LICENSING.md](../LICENSING.md)) | Iyed Rachdi, Ghassen Dalleji, Bilel Khlif |
| Confirmation des contributions individuelles d'Iyed Rachdi et de Ghassen Dalleji | Rien n'est documenté au-delà du cahier des charges | Équipe |
| Calibration de référence des deux démonstrations rejetées | L'outil existe et est testé ; l'annotation de ces vues basses reste à faire | Volontaire |

## 5. Risques pour l'évaluation, dits franchement

- **Validation physique** : l'AR de la version actuelle n'a pas été essayée sur téléphone. Tout ce qui est
  marqué « vérifié (émulé) » l'est dans Chrome sur PC.
- **Part de l'IA** : le code a été écrit par des assistants d'IA sur les consignes de Bilel Khlif ; c'est
  déclaré partout ([ATTRIBUTION.md](../ATTRIBUTION.md)). La contribution humaine documentée porte sur les
  spécifications, les arbitrages, la revue, les essais physiques et l'intégration.
- **Répartition dans l'équipe** : tous les commits sont publiés sous le nom de Bilel Khlif ; les rôles
  prévus pour Iyed Rachdi et Ghassen Dalleji ne sont pas prouvés par le dépôt.
- **Visualiseur** : extension hors cahier (§2.5 exclut l'IA des joueurs du tableau, que l'application
  respecte). Ses vitesses et distances ne sont pas validées physiquement ; deux des trois vidéos réelles ont
  une calibration fausse, masquée.
- **Dépendance** : PyTorch 2.14.1 reste concerné par l'avis GHSA-v32g (checkpoint hostile) ; les poids non
  approuvés sont refusés par empreinte avant chargement. Le correctif demande CUDA 13 et un pilote récent.

## 6. Contributions et IA en bref

Cahier des charges : les trois membres. Pilotage, consignes, revue, fusions et essais physiques : Bilel
Khlif. Réalisation du code, des tests et des documents : Claude Code (5–25 novembre) et Codex (23–24
novembre), sur ces consignes. Détail et preuves : [matrice-contributions-academiques.md](matrice-contributions-academiques.md).
