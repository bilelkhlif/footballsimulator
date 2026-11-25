# Revue indépendante des PR #19 et #20 — 25 novembre 2026

## Verdict et périmètre

- **PR #19 : READY pour son correctif Range/206.** Aucun défaut bloquant introduit par ce correctif.
  Le premier passage complet échoue toutefois sur une comparaison flottante préexistante du test AR,
  documentée ci-dessous ; il ne faut pas présenter ce passage comme entièrement réussi.
- **PR #20 à `ee40e45` : BLOCKED.** Les défauts reproduits de données/lecture doivent être corrigés et
  relus. Le correctif séparé de cette revue ne résout pas la version PyTorch vulnérable ni le choix de
  licence. La distribution du serveur IA ne reçoit pas de feu vert de sécurité/licence.
- Aucun changement de `main`, aucune modification des têtes des PR #19/#20, aucune fusion distante ni
  aucun déploiement. Les changements de cette revue sont sur une branche distincte, à proposer en PR
  vers `repetition/integration-visualiseur`.

Références vérifiées : `main` `48c293da17d7fbba9a926d3b0777684865a109f0`, PR #19
`47d4a752cc2938a0be4a309c852e256cf23ab8fa`, PR #20 `ee40e454028d291b73e302b5bcda65aeabaf3b70`.
Les worktrees existants ont été laissés en place. Les essais utilisent des worktrees isolés et les
dépendances déjà installées ; aucun modèle n'est téléchargé ou ajouté au dépôt.

## Défauts reproduits

P1 désigne un risque élevé conditionnel ; P2 un défaut significatif ; P3 une réserve mineure.

| N° | Sévérité et portée | Reproduction et résultat avant correction | Correction séparée |
| --- | --- | --- | --- |
| R1 | P2, injection HTML depuis un export tiers | Remplacer `teams[0].color` du manifeste par une chaîne fermant l'attribut et créant une image avec `onerror`. Une propriété témoin JavaScript est exécutée et une image apparaît dans la légende | Construire le DOM sans `innerHTML`, couleur affectée à `style.backgroundColor` ; aucun témoin ni image injectée |
| R2 | P2, restauration de position obsolète | Démo A à 18 s, erreur de décodage, métadonnées retardées ; fermer via le mode local puis rouvrir A. Le nouveau lecteur part de 0 puis saute à 18 s | Révision de chargement média invalidée à chaque fermeture et nouveau chargement ; la nouvelle ouverture reste à 0 |
| R3 | P2, rejet de lecture non traité | Faire rejeter `video.play()` par `AbortError`, cliquer le vrai bouton Lecture : erreur de page non traitée, sans message adapté | Gestion du rejet dans le bouton, avec garde de révision ; message affiché, aucune promesse non traitée |
| R4 | P2, serveur de développement, préexistant sur `main` | Racine temporaire `root`, frère `root-secret` avec un fichier témoin ; GET `/%2e%2e%5croot-secret/canary.txt` sous Windows retourne 200 et son contenu | Confinement avec `path.relative` ; le témoin extérieur est refusé, l'index normal reste accessible |
| R5 | P3, test AR, préexistant | Égalité exacte de deux matrices : `0.7280000448226929` contre `0.7280000286102295`, écart de 1,62 × 10⁻⁸ m. Même échec dans les deux passages complets initiaux | Tolérance de 10⁻⁶ sur la matrice, bornée et finie ; état tactique, historique et objets toujours comparés exactement |
| R6 | P3, diagnostic trop affirmatif | Une erreur média 3 ne démontre pas une perte du GPU : elle peut venir d'une vidéo corrompue | Message neutre « Erreur de décodage » ; la perte WebGPU garde son indicateur distinct |

R1 concerne les exports de données tiers ajoutés au catalogue/hébergés comme démonstrations. Le clip
synthétique suivi est sain ; une simple vidéo téléversée ne permet pas de choisir `team.color`.
R4 n'est pas une régression de la PR #19 et n'affecte pas le serveur GitHub Pages.

Les quatre nouvelles vérifications navigateur donnent, sur la version initiale : trois échecs (R1,
R2, R3) et un contrôle positif réussi (budget d'une seule récupération). Après correction : 4/4.
Le test serveur ajoute un contrôle positif de l'index et un contrôle négatif du chemin Windows.

## Service Worker et PWA

Les requêtes `Range` passent au réseau, y compris sur une adresse de la coquille ; les réponses 206 ne
sont pas stockées. Les erreurs de lecture/écriture du cache d'exécution ne détruisent pas une réponse
réseau valide. Les tests couvrent installation fraîche, hors-ligne, mise à jour atomique sur réseau lent
et migration de `sw.js` vers `sw.mjs`, à la racine et sous `/footballsimulator/`.

**Réserve vérifiée :** un GET vidéo sans `Range`, retournant 200, est encore stocké par le cache
d'exécution, même avec `Cache-Control: no-store`. « Aucune vidéo n'est mise en cache » est donc trop
général : le correctif garantit le contournement de Range et l'exclusion des 206. Les vidéos privées du
serveur Python sont sur une autre origine et ne sont pas interceptées ; aucune fuite de téléversement
privé par ce cache n'a été démontrée. Le visualiseur n'est pas promis hors ligne.

La coquille de #19 est `15d2a647fa7d74a5`, celle de l'intégration `d8d1fcf84bd5635f` : différence attendue
à cause du lien et des styles d'intégration. Cette revue ne change pas la coquille, les fichiers tiers
ni `sw.js`. Les imports `.mjs` et les en-têtes sont contrôlés par les tests.

## Résultats indépendants

| Arbre et vérification | Résultat effectivement observé |
| --- | --- |
| #19, tests ciblés SW/PWA/imports/migration | 21/21, aucun échec |
| #19, suite complète initiale | 235 unitaires réussis ; 143/144 Chrome, 1 échec R5, 0 ignoré |
| Simulation #19 puis #20, arbre identique à `ee40e45` | 267 unitaires réussis ; 201/202 Chrome, 1 échec R5, 0 ignoré |
| Python sur le code de l'intégration | 113/113, code de sortie 0 ; inclut 9 tests de sécurité du serveur |
| Branche corrective, suite complète | 268/268 unitaires et 206/206 Chrome, 0 échec, 0 ignoré |
| Répétitions indépendantes de perte du processus GPU | 10/10 parcours, 50/50 contrôles ; erreur média 3 réellement observée dans les dix |
| Vrai parcours CUDA, clip local H.264 de 10 s | 12/12 étapes réussies, Chrome 158.0.8127.37, `cuda:0` |

L'invocation Python initiale depuis la racine du dépôt échouait à importer le paquet ; elle a été
relancée depuis `analysis/`, le dossier documenté. Ce mauvais lancement n'est pas une régression du produit.

Les suites Chrome comprennent la démo sans Python, lecture et recherche d'images, synchronisation du
suivi, rotation/zoom et sélection du terrain 3D, les sept espaces de coaching, les modes locaux simulés,
les réponses tardives, la navigation aller/retour et l'AR IWER. Les tests négatifs supplémentaires
attaquent les frontières non couvertes par les résultats antérieurs.

Le test GPU existant accepte aussi un scénario sans erreur du décodeur. Ici, les journaux des dix
répétitions contiennent tous le code 3 : la récupération vidéo a donc bien été exercée. Aucune boucle
automatique illimitée n'a été trouvée ; le nouveau contrôle exige une seule tentative pour deux erreurs.
Le terrain 3D demande toujours un rechargement de page après perte du périphérique : aucune réparation
du pilote n'est revendiquée.

Le parcours CUDA indépendant affiche les résultats partiels après 23 s, interrompt l'analyse depuis
l'interface, arrête brutalement le serveur, puis retrouve et reprend l'analyse après redémarrage.
Il termine en 164 s au total : 125 images analysées, 5 segments exportés et 25 trajectoires. Lecture,
annotations, sélection et terrain WebGPU fonctionnent, ainsi que l'export relu en démonstration avec
le serveur arrêté. Le contrôle d'origine publique et d'autorisation réseau local est une émulation
par routage du navigateur, pas un essai depuis le site publié. Aucune réinitialisation GPU n'a été
observée pendant ce parcours CUDA ; elle a été provoquée séparément dans les dix répétitions.

## Sécurité, dépendances et attribution

- **P1 conditionnel : environnement de chargement des modèles.** La recette et l'environnement testés
  utilisent PyTorch `2.5.1+cu121`. L'[avis officiel GHSA-53q9-r3pm-6pq6](https://github.com/pytorch/pytorch/security/advisories/GHSA-53q9-r3pm-6pq6)
  classe une exécution de code par modèle malveillant comme critique pour les versions ≤ 2.5.1,
  corrigée à partir de 2.6.0 pour cet avis. Les poids téléchargés n'ont pas de digest attendu vérifié
  avant chargement ; le calcul de provenance vient après `YOLO(...)`. Une montée de version supportée
  doit être validée avec CUDA/torchvision et la provenance des poids verrouillée avant diffusion du
  serveur. Un modèle reste une entrée de confiance, même après mise à jour. Ce n'est pas une preuve
  d'exécution de code par simple vidéo téléversée. Aucun modèle malveillant n'a été chargé dans l'audit.
- **Licence : décision du propriétaire requise.** Pas de LICENSE de projet à la racine. La
  [position publiée d'Ultralytics](https://www.ultralytics.com/license) et le
  [texte AGPL](https://raw.githubusercontent.com/ultralytics/ultralytics/main/LICENSE) doivent guider la
  validation de la voie de distribution/du service retenue. Les affirmations catégoriques du dossier
  de recherche ne constituent pas un avis juridique. L'audit ne déclare pas automatiquement le
  frontend indépendant ou les données produits sous AGPL. La démo synthétique statique seule n'est
  pas ainsi démontrée bloquée par la licence du serveur.
- **Reproductibilité :** dépendances à bornes ouvertes, modèles sans digest attendu et pas de verrou
  complet. Ce sont des risques de chaîne d'approvisionnement, pas un nouvel exploit reproduit.
- `ATTRIBUTION.md` n'est pas modifié par la revue. **La PR #20 contient toutefois 47 lignes héritées de
  la PR #15 dans ce fichier par rapport à `main` (46 ajouts, 1 suppression).** Les numéros 23/24 recouvrent ceux proposés par la
  PR #18 : la validation/renumérotation reste à décider par l'équipe. PR #18 laissée inchangée.
- Aucun poids, vidéo réelle, SQLite, secret, journal local ou chemin local n'est ajouté au dépôt.
  Les avis MIT de three.js sont conservés. Le serveur Python reste une application locale à origines
  et hôtes contrôlés ; les tests ne valent pas homologation d'un service public exposé.

## Historique, Pages et ordre sûr

La répétition détachée de `main` a créé deux commits locaux seulement : fusion normale de #19,
puis fusion normale de #20, sans conflit. Son arbre final est exactement celui de `ee40e45`.
L'intégration contient déjà le commit exact `47d4a75` via `871057d` et #15 via `c8dbcc8`.

1. Relire la PR corrective de cette revue ; ne pas la fusionner sans autorisation. Intégrer les
   correctifs validés à la branche d'intégration, puis revoir sa nouvelle tête.
2. Résoudre les décisions de sécurité des dépendances, licence et attribution selon le périmètre
   réellement distribué. Pas de remplacement de l'environnement GPU partagé dans cet audit.
3. Après autorisation, fusionner #19 par **commit de fusion**, en vérifiant sa tête exacte.
4. Revoir et tester #20 sur ce `main`, puis utiliser aussi un **commit de fusion**. Squash/rebase de
   #19 perdrait l'ascendance du commit original et empêcherait son diff de disparaître comme annoncé.
5. Après autorisation de déploiement seulement : vérifier le build Pages et la version publiée.

La configuration Pages lue est `main`, racine `/`, mode legacy. Les essais reproduisent le sous-chemin
`/footballsimulator/`, les actifs statiques, la navigation et la PWA. Aucun déploiement de l'intégration
n'a été déclenché ou validé en production pendant cette revue.

Le site actuellement publié à `/footballsimulator/` a aussi été ouvert dans deux contextes Chrome
neufs (1365 × 900 et 390 × 844) : HTTP 200, WebGPU NVIDIA Ampere initialisé, 40 modules `.mjs` de
première partie chargés sans erreur HTTP/MIME, contrôleur `sw.mjs`, aucune erreur console ni requête
échouée et aucun débordement horizontal. GitHub indique le dernier build existant « built », sans
erreur, au commit `48c293da17d7fbba9a926d3b0777684865a109f0`. Ces constats concernent le `main`
publié, pas l'intégration non déployée. L'API ne renvoie aucun statut de contrôle CI pour #19/#20 ;
les résultats ci-dessus sont ceux des exécutions indépendantes locales.

## Validation restant à faire

Téléphone réel : installation et mise à jour PWA, caméra/ARCore, suivi d'ancre et stabilité 60 s,
sélection au moins 9/10, au moins 30 images/s, cibles tactiles, rotation portrait/paysage et retour depuis
le visualiseur. Firefox et Safari : démo, codecs, CORS, serveur local et comportement des erreurs ;
leurs capacités WebGPU/WebXR ne se déduisent pas d'IWER. Pas de résultat physique ou autre navigateur
revendiqué. Les quatre défauts logiciels reproduits sont corrigés sur la branche distincte ; les
décisions de publication citées restent ouvertes.
