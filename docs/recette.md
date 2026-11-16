# Recette finale

État au 16 novembre 2026, à la fin du sprint 6, de chaque besoin du cahier des charges (§2.2) et de chaque critère d'acceptation (§4.3). Application : https://bilelkhlif.github.io/footballsimulator/ (publiée depuis `main`).

Trois niveaux de validation sont distingués. Seul le premier vaut pour un critère mesuré sur téléphone :

| Niveau | Ce que c'est |
| --- | --- |
| **Physique** | Essai sur un vrai téléphone, par l'équipe, avec la caméra et ARCore. Seuls les résultats rapportés par l'équipe sont repris ici |
| **Émulée** | Vraie session WebXR de Chrome sur PC, avec l'émulateur IWER : table virtuelle pour le hit test, toucher simulé par une manette visant le point cliqué. Vérifiée par les tests de bout en bout, en WebGPU et en mode test WebGL |
| **Automatisée** | Tests unitaires sous Node.js (WebXR et WebGPU remplacés par des doublures) et tests de bout en bout dans Chrome |

**Résultat automatisé du 16 novembre 2026** : 182 tests unitaires et 79 vérifications de bout en bout, tous réussis (`npm test`).

**Version des essais physiques.** Les essais physiques consignés ont été faits les 12 et 14 novembre, sur les versions publiées à ces dates, avant les sprints 5 et 6. La version finale n'a été vérifiée qu'en émulation et par les tests automatisés. Les essais de la partie 5 sont à faire sur elle.

---

## 1. Besoins fonctionnels

| ID | Besoin (priorité) | Automatisée et émulée | Physique | Statut |
| --- | --- | --- | --- | --- |
| BF1 | Démarrer une session AR par « Entrer en AR » (haute) | Session WebGPU ouverte puis fermée, par le bouton et par le système, cinq fois de suite ; échecs signalés (caméra refusée, réglage WebGPU absent) | 12 nov. : entrée en AR, terrain visible et sortie sur deux téléphones Android avec Chrome (Samsung Galaxy S récent, TECNO POVA 6 Pro 5G), en WebGL à l'époque. 14 nov. : AR rendue en WebGPU réussie sur le TECNO POVA 6 Pro 5G ; mode test WebGL réussi sur le Galaxy S10e | **Validé** sur téléphone (versions du 12 et du 14 novembre) ; version finale vérifiée en émulation |
| BF2 | Réticule sur la surface détectée (haute) | Réticule sur la table virtuelle ; aucun réticule hors de la table | 14 nov. : AR réussie sur le TECNO POVA 6 Pro 5G et sur le Galaxy S10e (mode test), sans détail des étapes consigné | Validé en émulation ; à confirmer sur téléphone |
| BF3 | Poser le terrain d'un toucher (haute) | Terrain posé sur la table, puis ancré ; reposé ailleurs, tourné de 25° | Comme BF2 | Validé en émulation ; à confirmer sur téléphone |
| BF4 | Choisir la formation de chaque équipe (haute) | 4-4-2, 4-3-3, 3-5-2 et 4-2-3-1 par les boutons, pour les deux équipes, au millimètre ; en vue 3D et en AR sur le terrain posé | Aucun essai consigné | **Validé** (automatisé, émulé) |
| BF5 | Sélectionner un joueur puis le déplacer (haute) | Placé à 0,000 mm du point visé, en vue 3D, au doigt sur un écran de 360 px, et en AR sur un terrain tourné de 25° | Aucun essai consigné | Validé en émulation ; critère 9 sur 10 à mesurer |
| BF6 | Déplacer le ballon (moyenne) | Placé à 0,000 mm du point visé | Aucun essai consigné | **Validé** (automatisé) |
| BF7 | Tracer une flèche de passe ou de course (moyenne) | Passes et courses (tests unitaires) ; passe avec aperçu en vue 3D et en AR, départ et arrivée à 0,000 mm | Aucun essai consigné | Validé en émulation |
| BF8 | Annuler la dernière action, réinitialiser le terrain (moyenne) | Annuler, Rétablir, Réinitialiser, formations comprises ; places exactes après annulation | Aucun essai consigné | **Validé** (automatisé, émulé) |
| BF9 | Animer une action pas à pas, « Play » (bonus) | Images clés, Lecture, Pause, Recommencer, vitesses ; lecture exacte ; en AR sur le terrain tourné, terrain toujours ancré | Aucun essai consigné | Validé en émulation |

## 2. Critères d'acceptation (cahier §4.3)

| Critère | Validé si | Automatisée et émulée | Physique | Statut |
| --- | --- | --- | --- | --- |
| Le terrain se pose sur une surface réelle | Stable pendant 1 minute | Le terrain suit son ancre ; sa pose est inchangée pendant l'interaction et la lecture d'une séquence ; suivi interrompu, puis rétabli | Non mesuré | **À valider sur téléphone** (essai C) |
| La formation choisie s'applique correctement | 11 joueurs bien placés | Pour les 4 formations et les 2 équipes : numéros 1 à 11, chacun dans sa moitié et hors du rond central, aucun chevauchement (écart minimal 7,1 cm) ; boutons au millimètre, en vue 3D et en AR | Non mesuré | **Validé** (automatisé) |
| Un joueur peut être sélectionné et déplacé | Réussite sur 9 essais sur 10 | 0,000 mm à chaque essai automatisé, en vue 3D et en AR émulée | Non mesuré | **À valider sur téléphone** (essai A) |
| L'application reste fluide | Au moins 30 images par seconde | Banc de mesure sur PC, processeur ralenti 4 fois : 62,5 images par seconde en AR émulée, 76,9 à 90,1 en vue 3D ([sprint-6.md](sprint-6.md#3-performance--mesurer-puis-optimiser)). Indicatif seulement | Non mesuré | **À valider sur téléphone** (essai D) |
| L'application se lance hors-ligne | Après une première visite | Rechargement hors-ligne, à la racine et sous le sous-chemin de GitHub Pages ; page prête en 1,1 s quand le serveur met 30 s à répondre ; hors-ligne après une mise à jour | Non mesuré | **Validé** (automatisé) ; à confirmer sur téléphone (essai F) |

## 3. Besoins non fonctionnels (cahier §2.3) et exigences de l'enseignant

| Exigence | Preuve | Statut |
| --- | --- | --- |
| Performance : 30 images par seconde | Voir le critère « fluide » | À valider sur téléphone |
| Ergonomie : gros boutons, une seule main | Boutons de 48 px de haut au moins (`src/styles.css`) ; barre d'outils vérifiée dans un écran de 360 px : six boutons de 48 px, libellés entiers | Validé (automatisé) ; confort à juger sur téléphone |
| Accessibilité : simple URL, sans installation obligatoire | GitHub Pages ; installation possible (PWA) | Validé |
| Disponibilité : hors-ligne après le premier chargement | Voir le critère « hors-ligne » | Validé (automatisé) |
| Sécurité : HTTPS exclusivement | GitHub Pages en HTTPS ; WebXR et le Service Worker exigent un contexte sécurisé | Validé |
| Rendu WebGPU sans repli WebGL | Aucun contexte WebGL créé ; WebGPU retiré : message, pas de repli ; `?webgl` réservé aux tests | Validé (automatisé) ; AR WebGPU réussie sur le TECNO POVA 6 Pro 5G |
| Hors périmètre respecté (§2.5) | Ni simulation de match, ni multijoueur, ni compte, ni serveur | Validé |

## 4. Ce qui reste à faire sur téléphone

1. Stabilité du terrain pendant une minute (essai C).
2. Sélection et déplacement : 9 essais sur 10, à 60 cm et à 1 m (essai A).
3. Fluidité : au moins 30 images par seconde avec le mode diagnostic (essai D).
4. Lancement hors-ligne (essai F), séquence animée en AR (essai G), installation et mise à jour (essai H).
5. Flèches et annulation (essai B), interface et fin de session (essai E).

---

## 5. Protocole de validation physique

**Préparation.** Un téléphone Android compatible ARCore, de milieu de gamme, avec Android 12 ou plus, Chrome à jour et les Services Google Play pour la RA. Activer `chrome://flags/#webxr-webgpu-binding` (« Enabled »), relancer Chrome, puis ouvrir `https://bilelkhlif.github.io/footballsimulator/?diagnostics`. Noter le modèle, la version d'Android et celle de Chrome. Une table bien éclairée, avec un peu de texture (pas une surface blanche uniforme).

**A à E** : sélection et déplacement (9 essais sur 10), flèches et annulation, stabilité d'une minute, images par seconde, interface et fin de session. Ces essais suivent le protocole détaillé de [sprint-5.md](sprint-5.md#11-protocole-de-validation-sur-téléphone).

**F. Hors-ligne.** Ouvrir l'application une fois avec le réseau, attendre le terrain, puis la fermer. Activer le mode avion, et la rouvrir par son icône si elle est installée, sinon par l'onglet. Attendu : le terrain s'affiche, avec le badge « Hors-ligne ». Entrer en AR et poser le terrain : l'AR ne demande pas de réseau.

**G. Séquence animée en AR (BF9).** Poser le terrain, ouvrir « Séquence ». Enregistrer une « Image clé », déplacer deux joueurs et le ballon, enregistrer, recommencer une fois : 3 images clés. « Lecture » à 1×, puis à 2× ; « Pause » ; « Recommencer ». Pendant une lecture, tourner autour de la table. Attendu : les joueurs glissent d'une image à l'autre sur le terrain, et le terrain reste sur la table. Déplacer un joueur pendant la lecture : elle s'arrête, et les joueurs rejoignent leurs places. « Annuler » retire la dernière image clé.

**H. Installation et mise à jour.** Menu ⋮ → « Installer l'application », puis lancer depuis l'icône : l'application s'ouvre sans barre d'adresse. Après une nouvelle publication sur `main`, rouvrir l'application avec le réseau. Attendu : l'avis « Nouvelle version installée » ; « Recharger » donne la nouvelle version.

| Date | Appareil (modèle, Android, Chrome) | Essai | Résultat |
| --- | --- | --- | --- |
| à remplir | | A : 10 essais à 60 cm | |
| à remplir | | A : 10 essais à 1 m | |
| à remplir | | B : flèches et annulation | |
| à remplir | | C : stabilité, 1 minute | |
| à remplir | | D : images par seconde, en AR (moyenne, minimum) ; temps CPU par image | |
| à remplir | | E : interface et fin de session | |
| à remplir | | F : lancement hors-ligne, AR hors-ligne | |
| à remplir | | G : séquence animée en AR | |
| à remplir | | H : installation et mise à jour | |
