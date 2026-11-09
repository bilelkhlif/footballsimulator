/**
 * Point d'entrée de Football Simulator.
 * Sprint 1 : vue 3D hors AR du terrain, des deux équipes et du ballon.
 * Sprint 2 : session AR immersive, avec le terrain placé devant l'utilisateur.
 */
import { createSceneContext } from './scene.js';
import { createPitch } from './pitch.js';
import { PlayerFactory } from './players.js';
import { createTeam } from './team.js';
import { createBall } from './ball.js';
import { getFormation } from './formations.js';
import { DEFAULT_FORMATIONS, TEAMS } from './config.js';
import { installEmulatorIfRequested } from './dev-emulator.js';
import { isImmersiveArSupported, showXrStatus } from './xr-support.js';
import { registerServiceWorker } from './pwa.js';
import { ArSession, AR_ERROR_REASONS } from './xr-session.js';
import { createArView } from './ar-view.js';
import { createRenderLoop } from './render-loop.js';

/** Messages affichés quand l'entrée en AR échoue, selon la cause signalée par la session. */
const AR_ERROR_MESSAGES = Object.freeze({
  [AR_ERROR_REASONS.UNAVAILABLE]: 'WebXR est indisponible : ouvrez l’application dans Chrome sur Android, en HTTPS.',
  [AR_ERROR_REASONS.UNSUPPORTED]: 'Ce navigateur ne propose pas la réalité augmentée immersive.',
  [AR_ERROR_REASONS.REJECTED]: 'Session AR refusée : autorisez l’accès à la caméra et vérifiez que les Services Google Play pour la RA sont installés.',
  [AR_ERROR_REASONS.REFERENCE_SPACE]: 'Cet appareil ne fournit pas l’espace de référence local-floor.',
  [AR_ERROR_REASONS.LAYER]: 'Le rendu 3D n’a pas pu être relié à la session AR.',
});

/** Aide aux gestes affichée pendant une session AR. */
const AR_HINT = 'Déplacez-vous pour observer le terrain sous tous les angles.';

/**
 * Construit la scène, branche l'interface de la vue 3D et lance la boucle de rendu.
 * @returns {{sceneContext: ReturnType<typeof createSceneContext>, arView: ReturnType<typeof createArView>}}
 */
function init() {
  const container = document.getElementById('scene-container');
  const sceneContext = createSceneContext(container);
  const { renderer, scene, camera, controls, pitchGroup, table, resetView, resize } = sceneContext;

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

  // Vue AR : à la sortie, la taille du rendu et le cadrage de la vue 3D sont recalculés.
  const arView = createArView({
    scene,
    table,
    pitchGroup,
    controls,
    onExit: () => {
      resize();
      resetView();
    },
  });

  // setAnimationLoop plutôt que requestAnimationFrame : la même boucle sert en session WebXR.
  renderer.setAnimationLoop(createRenderLoop({ renderer, scene, camera, controls, arView }));
  document.body.classList.add('is-ready');
  return { sceneContext, arView };
}

/**
 * Branche la réalité augmentée : boutons d'entrée et de sortie, et réactions de la scène et
 * de l'interface aux événements de la session (patron Observer, cahier §3.4).
 * @param {ReturnType<typeof createSceneContext>} sceneContext
 * @param {ReturnType<typeof createArView>} arView
 * @returns {ArSession}
 */
function setUpArSession(sceneContext, arView) {
  const enterButton = document.getElementById('enter-ar');
  const exitButton = document.getElementById('exit-ar');
  const resetButton = document.getElementById('reset-view');
  const hint = document.getElementById('hint');
  const message = document.getElementById('ar-message');
  const defaultHint = hint.textContent;

  const arSession = new ArSession({
    renderer: sceneContext.renderer,
    overlayRoot: document.getElementById('overlay'),
  });

  // Observateurs : la scène et l'interface suivent le cycle de vie de la session.
  arSession.on('sessionstart', () => {
    arView.enter();
    document.body.dataset.xr = 'active';
    enterButton.hidden = true;
    resetButton.hidden = true;
    exitButton.hidden = false;
    hint.textContent = AR_HINT;
  });

  // Fin de session, par « Quitter l'AR » ou par le système (bouton retour du téléphone).
  arSession.on('sessionend', () => {
    arView.exit();
    document.body.dataset.xr = 'inactive';
    exitButton.hidden = true;
    resetButton.hidden = false;
    enterButton.hidden = false;
    enterButton.disabled = false;
    hint.textContent = defaultHint;
  });

  arSession.on('sessionerror', ({ reason, error }) => {
    console.warn(`Entrée en AR impossible (${reason}) :`, error);
    message.textContent = AR_ERROR_MESSAGES[reason];
    message.hidden = false;
    enterButton.disabled = false;
    // three.js a pu modifier la taille du rendu avant l'échec : on la recalcule à l'image suivante.
    requestAnimationFrame(sceneContext.resize);
  });

  enterButton.addEventListener('click', () => {
    enterButton.disabled = true;
    message.hidden = true;
    arSession.start();
  });
  exitButton.addEventListener('click', () => arSession.end());

  document.body.dataset.xr = 'inactive';
  return arSession;
}

/**
 * Détecte la réalité augmentée, avec l'émulateur IWER si l'adresse le demande,
 * affiche le résultat dans le badge d'état et, si l'AR est disponible, le bouton
 * « Entrer en AR ».
 */
async function detectAugmentedReality() {
  const statusElement = document.getElementById('xr-status');
  showXrStatus(statusElement, 'checking');
  const emulated = await installEmulatorIfRequested();
  const supported = await isImmersiveArSupported();
  if (!supported) {
    showXrStatus(statusElement, 'unsupported');
  } else {
    showXrStatus(statusElement, emulated ? 'emulated' : 'supported');
    // AR réelle ou émulée : le bouton d'entrée en AR devient visible.
    const enterArButton = document.getElementById('enter-ar');
    enterArButton.hidden = false;
  }
}

/**
 * Outils de développement : avec ?debug dans l'adresse, les objets principaux sont exposés
 * dans window.__footballSimulator, pour la console du navigateur et les tests de bout en bout.
 * @param {object} objects
 */
function exposeForDebugging(objects) {
  if (new URLSearchParams(window.location.search).has('debug')) {
    window.__footballSimulator = objects;
  }
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
  const { sceneContext, arView } = init();
  const arSession = setUpArSession(sceneContext, arView);
  exposeForDebugging({ ...sceneContext, arView, arSession });
  detectAugmentedReality();
  registerServiceWorker();
} catch (error) {
  showStartupError(error);
}
