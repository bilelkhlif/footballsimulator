/**
 * Point d'entrée d'AR Football Tactics.
 * Sprint 1 : vue 3D hors AR du terrain.
 */
import { createSceneContext } from './scene.js';
import { createPitch } from './pitch.js';

/**
 * Construit la scène, branche l'interface et lance la boucle de rendu.
 */
function init() {
  const container = document.getElementById('scene-container');
  const { renderer, scene, camera, controls, pitchGroup, resetView } = createSceneContext(container);

  pitchGroup.add(createPitch(renderer));

  document.getElementById('reset-view').addEventListener('click', resetView);

  // setAnimationLoop plutôt que requestAnimationFrame : la même boucle servira en session WebXR.
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
  document.body.classList.add('is-ready');
}

/**
 * Remplace l'écran de chargement par un message si la scène ne peut pas démarrer
 * (WebGL indisponible, par exemple).
 * @param {Error} error
 */
function showStartupError(error) {
  console.error(error);
  const loader = document.getElementById('loader');
  loader.textContent = 'Impossible d’afficher le terrain : WebGL est indisponible sur ce navigateur.';
  loader.dataset.state = 'error';
}

try {
  init();
} catch (error) {
  showStartupError(error);
}
