# three.js r187 (copie locale, rendu WebGPU)

Copie de [three.js](https://github.com/mrdoob/three.js) version 0.187.0 (publiée le 30 octobre 2026), sous licence MIT (voir `LICENSE`). Elle remplace depuis le sprint 3 la r186 utilisée aux sprints 1 et 2.

La bibliothèque est copiée dans le dépôt plutôt que chargée depuis un CDN : l'application reste servie depuis une seule origine HTTPS (GitHub Pages) et le Service Worker peut la mettre en cache pour le mode hors-ligne. Le numéro de version est dans le nom du dossier : à chaque mise à jour, les adresses changent, et un ancien cache ne peut jamais mélanger deux versions.

| Fichier | Rôle |
| --- | --- |
| `build/three.webgpu.js` | Point d'entrée des modules `three` et `three/webgpu` : `WebGPURenderer`, `Renderer`, `WebGPUBackend`, matériaux à nœuds et TSL |
| `build/three.core.js` | Cœur de la bibliothèque (scène, géométries, mathématiques), importé par `three.webgpu.js` et `three.tsl.js` |
| `build/three.tsl.js` | TSL (Three Shading Language) : les nœuds qui deviennent du code WGSL, importés par `three.webgpu.js` ; aussi le module `three/tsl` |
| `examples/jsm/controls/OrbitControls.js` | Rotation et zoom de la vue 3D hors AR |

La carte d'import de `index.html` associe `three` et `three/webgpu` à `build/three.webgpu.js`, `three/tsl` à `build/three.tsl.js` et `three/addons/` à `examples/jsm/`, comme dans les exemples WebGPU officiels. Les tests unitaires relisent cette carte d'import (`tests/unit/import-map.mjs`) : Node.js charge exactement les mêmes fichiers que le navigateur.

**Pas de `build/three.module.js`.** Ce fichier contient le moteur de rendu WebGL (`WebGLRenderer`) : il n'est plus copié, car l'application ne rend qu'en WebGPU. `three.webgpu.js` contient encore le code du backend WebGL de secours de three.js ; notre moteur de rendu (`src/webgpu.js`) est construit sans lui : il n'est jamais instancié.

## Mettre à jour ou ajouter un module

```bash
npm pack three@0.187.0
tar -xzf three-0.187.0.tgz
# copier les mêmes chemins depuis package/ vers src/vendor/three-r187/
```

Empreintes SHA-256 des fichiers copiés, identiques à celles du paquet npm :

| Fichier | SHA-256 (début) |
| --- | --- |
| `build/three.webgpu.js` | `eafead3154ec0609` |
| `build/three.core.js` | `613e370f76638fde` |
| `build/three.tsl.js` | `d8f3cdb8b85b799a` |
| `examples/jsm/controls/OrbitControls.js` | `e7fca2fe9e7670a8` |

Tout fichier ajouté ici doit l'être dans la même version, puis dans la liste de mise en cache de `sw.js`. Pour une nouvelle version : créer un dossier `three-rXXX`, mettre à jour la carte d'import, `sw.js` et ce fichier, puis supprimer l'ancien dossier.
