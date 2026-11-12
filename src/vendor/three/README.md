# three.js r186 (copie locale)

Copie de [three.js](https://github.com/mrdoob/three.js) version 0.186.1, sous licence MIT (voir `LICENSE`).

La bibliothèque est copiée dans le dépôt plutôt que chargée depuis un CDN : l'application reste servie depuis une seule origine HTTPS (GitHub Pages) et le Service Worker peut la mettre en cache pour le mode hors-ligne.

| Fichier | Rôle |
| --- | --- |
| `build/three.module.js` | Point d'entrée du module `three` |
| `build/three.core.js` | Cœur de la bibliothèque, importé par `three.module.js` |
| `examples/jsm/controls/OrbitControls.js` | Rotation et zoom de la vue 3D hors AR |

La carte d'import de `index.html` associe `three` à `build/three.module.js` et `three/addons/` à `examples/jsm/`, comme dans la documentation officielle.

## Mettre à jour ou ajouter un module

```bash
npm pack three@0.186.1
tar -xzf three-0.186.1.tgz
# copier les mêmes chemins depuis package/ vers src/vendor/three/
```

Tout fichier ajouté ici doit l'être dans la même version, puis dans la liste de mise en cache de `sw.js`. Le sprint 2 n'a pas eu besoin d'`ARButton.js` : la session AR est ouverte par `src/xr-session.js`.
