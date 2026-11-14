/**
 * Active la résolution « three » d'après la carte d'import de index.html (voir import-map-hooks.mjs).
 * Chargé avant les tests : node --import ./tests/unit/import-map.mjs --test
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as nodeModule from 'node:module';
import { resolve } from './import-map-hooks.mjs';

if (typeof nodeModule.registerHooks === 'function') {
  // Node.js 22.15 et plus : crochets synchrones, dans le même fil d'exécution.
  nodeModule.registerHooks({ resolve });
} else {
  // Versions plus anciennes : crochets chargés dans un fil séparé.
  nodeModule.register('./import-map-hooks.mjs', import.meta.url);
}
