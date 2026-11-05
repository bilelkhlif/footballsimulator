/**
 * Point d'entrée d'AR Football Tactics.
 * Sprint 1 : vue 3D hors AR du terrain, des deux équipes et du ballon.
 */
import { createSceneContext } from './scene.js';
import { createPitch } from './pitch.js';
import { PlayerFactory } from './players.js';
import { createTeam } from './team.js';
import { createBall } from './ball.js';
import { getFormation } from './formations.js';
import { DEFAULT_FORMATIONS, TEAMS } from './config.js';

/**
 * Construit la scène, branche l'interface et lance la boucle de rendu.
 */
function init() {
  const container = document.getElementById('scene-container');
  const { renderer, scene, camera, controls, pitchGroup, resetView } = createSceneContext(container);

  pitchGroup.add(createPitch(renderer));

  // Formation courante de chaque équipe ; les boutons pour la changer arrivent au sprint 4.
  const currentFormation = {
    blue: getFormation(DEFAULT_FORMATIONS.blue),
    red: getFormation(DEFAULT_FORMATIONS.red),
  };
  const playerFactory = new PlayerFactory();
  for (const team of Object.values(TEAMS)) {
    pitchGroup.add(createTeam(team, currentFormation[team.id], playerFactory));
    document.getElementById(`formation-${team.id}`).textContent = currentFormation[team.id].name;
  }
  pitchGroup.add(createBall());

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
