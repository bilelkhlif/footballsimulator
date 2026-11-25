# Convention de documentation du code

Le cahier des charges (§7.1) demande un commentaire d'en-tête pour chaque fonction JavaScript et pour chaque bloc HTML ou CSS. La première évaluation de l'enseignant précise le contenu de ce bloc : le nom de l'auteur, la date et le rôle de la fonction. Ce document fixe la forme de l'en-tête d'une fonction : une description, puis trois balises communes, le **responsable**, la **date** et le **rôle technique**. Le test [`tests/unit/documentation.test.mjs`](../tests/unit/documentation.test.mjs) vérifie la règle à chaque `npm test`.

## 1. Forme d'un en-tête

```js
/**
 * Change la formation d'une équipe et prévient les observateurs. Sans effet si la formation
 * demandée est déjà en place.
 * @param {string} teamId
 * @param {string} name nom d'une formation de FORMATIONS, par exemple « 4-4-2 »
 * @returns {import('./formations.mjs').FormationStrategy} la formation précédente
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Logique métier — tableau tactique (sujet du patron Observer)
 */
setFormation(teamId, name) {
```

La description dit ce que fait la fonction. `@param` et `@returns` décrivent ses entrées et sa sortie. Les trois balises communes ferment toujours le bloc, dans cet ordre :

| Balise | Contenu | Source |
| --- | --- | --- |
| `@responsable` | Membre de l'équipe qui répond de la fonction : conduite de sa réalisation, revue et validation du résultat, intégration au dépôt. | Historique Git (auteur des commits) et [ATTRIBUTION.md](../ATTRIBUTION.md), §4 |
| `@date` | Date de création, au format AAAA-MM-JJ : celle du premier commit où la déclaration apparaît. | Historique Git (voir §4) ; les modifications suivantes y sont aussi |
| `@role` | Rôle technique de la fonction dans l'architecture : couche ou module, puis sa responsabilité, avec le patron de conception quand il y en a un. | [Architecture](architecture.md) |

## 2. Responsable et assistance à l'implémentation

Toutes les fonctions actuelles ont pour responsable Bilel Khlif, auteur de tous les commits du dépôt et chargé de la conduite technique des sprints 1 à 4 (ATTRIBUTION.md, §4). Iyed Rachdi et Ghassen Dalleji ont contribué, avec Bilel Khlif, au cahier des charges, qui définit les fonctionnalités, les contraintes d'architecture et les scénarios de démonstration. La répartition des rôles du cahier (§5.2), reprise dans le README, décrit l'organisation prévue. Les en-têtes des fonctions suivent l'historique Git et ATTRIBUTION.md.

La consigne parle du nom de l'auteur. L'implémentation a été réalisée avec un assistant de développement (ATTRIBUTION.md, §4) : la balise `@responsable` nomme donc le membre de l'équipe qui répond de la fonction, et non l'auteur de chaque ligne.

L'assistance à l'implémentation n'est pas répétée dans chaque en-tête. Chaque fichier source y renvoie une fois, dans son propre en-tête : « Assistance à l'implémentation : voir ATTRIBUTION.md (§4) ».

Le code adapté d'une source tierce porte en plus une balise `@see` vers ATTRIBUTION.md, §3 :

- `installEmulatorIfRequested` ([`src/dev-emulator.mjs`](../src/dev-emulator.mjs)), adapté du guide de démarrage d'IWER ;
- le constructeur de `WebGpuOnlyRenderer` ([`src/webgpu.mjs`](../src/webgpu.mjs)), adapté de celui de `WebGPURenderer` de three.js.

## 3. Portée

- **En-tête complet** (description et trois balises) :
  - chaque fonction et chaque classe de premier niveau d'un module ;
  - chaque membre de classe : constructeur, méthode, accesseur, ou champ qui contient une fonction ;
  - chaque gestionnaire d'événement de premier niveau : `install`, `activate` et `fetch` du Service Worker.
- **Fonction locale**, définie dans une autre fonction : un commentaire court qui dit ce qu'elle fait. Son responsable, sa date et son rôle sont ceux de la fonction qui la contient.
- **Méthodes d'un objet littéral** (doublures de test, descripteurs de propriété) et **fonctions passées en argument** : elles sont décrites par l'en-tête de la fonction qui les crée.
- **Exclus** : les bibliothèques tierces de `src/vendor/`, copiées sans modification.

Les fichiers concernés sont `sw.mjs`, `sw.js` (migration), `src/*.mjs`, `tests/*.mjs` et `tests/unit/*.mjs`. `index.html` et `src/styles.css` n'ont pas de fonction ; leur en-tête renvoie aussi à ATTRIBUTION.md.

## 4. Dates de création

Les dates suivent l'historique Git :

| Date | Travail |
| --- | --- |
| 2026-11-05 | Sprint 1 : scène, terrain, formations, joueurs, détection de l'AR, émulateur et PWA |
| 2026-11-09 | Tests de bout en bout du sprint 1, puis sprint 2 : session WebXR |
| 2026-11-10 | Sprint 2 : tests du mode AR |
| 2026-11-12 | Correctif du réseau lent (Service Worker) |
| 2026-11-14 | Sprint 3 (WebGPU, surface réelle, PWA), mode test WebGL et sprint 4 (formations) |
| 2026-11-15 | Sprint 5 : raycasting, flèches tactiques, patron Command, mode diagnostic |
| 2026-11-23 | Retours d’évaluation : règles des flèches, aide, raccourcis, migration `.mjs` et corrections des écrans courts |
| 2026-11-16 | Sprint 6 : joueurs instanciés, séquence animée (BF9), coquille à version de contenu du Service Worker, mesure des performances |

**Méthode.** La date d'une fonction ou d'une classe est celle du premier commit où sa déclaration apparaît (`git log -S "function nom("`). La recherche porte sur tout le code de l'application : une fonction déplacée d'un fichier à un autre garderait ainsi sa date d'origine. Un renommage `.js` → `.mjs` ne change pas la date de création. Lors d’une extraction dans un autre module, vérifier aussi le fichier d’origine.

Un membre de classe est daté de la même façon dans son fichier. Sa date ne peut pas précéder celle de sa classe.

L'historique d'une ligne (`git log -L`) n'a pas été retenu seul : il peut rattacher une ligne nouvelle à la ligne plus ancienne qu'elle remplace. Il daterait ainsi la classe `Formation4231`, ajoutée au sprint 4, du sprint 1.

## 5. Ajouter une fonction

1. Écrire l'en-tête : la description, `@param` et `@returns`, puis les trois balises (son nom comme responsable, la date du jour et le rôle technique).
2. Un nouveau fichier commence par son en-tête, avec le renvoi à ATTRIBUTION.md.
3. Lancer `npm run test:unit` : le test de la documentation signale toute unité sans en-tête complet, avec son fichier et sa ligne.
