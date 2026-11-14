/**
 * Point d'entrée de Football Simulator.
 * Sprint 1 : vue 3D hors AR du terrain, des deux équipes et du ballon.
 * Sprint 2 : session AR immersive.
 * Sprint 3 : rendu WebGPU sans repli WebGL ; terrain posé sur une surface réelle (hit test,
 * réticule, toucher, ancre) ; application installable, avec avis de nouvelle version.
 * Mode test WebGL : réservé aux tests, avec ?webgl dans l'adresse ; ce n'est pas un repli.
 * Sprint 4 : choix de la formation de chaque équipe par des boutons ; les joueurs rejoignent leurs
 * nouvelles places (patrons Strategy et Observer).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { createSceneContext } from './scene.js';
import { createPitch } from './pitch.js';
import { PlayerFactory } from './players.js';
import { applyFormation, createTeam } from './team.js';
import { createBall } from './ball.js';
import { DEFAULT_FORMATIONS, TEAMS } from './config.js';
import { TacticsBoard } from './tactics-board.js';
import { FormationAnimator, TRANSITION_DURATION_MS } from './formation-transition.js';
import { createFormationPanel } from './formation-panel.js';
import { installEmulatorIfRequested } from './dev-emulator.js';
import { isImmersiveArSupported, showXrStatus } from './xr-support.js';
import { registerServiceWorker, setUpInstallButton, watchForUpdates, watchNetworkStatus } from './pwa.js';
import { ArSession, AR_ERROR_REASONS, hasWebGpuXrBinding, RENDERING_APIS } from './xr-session.js';
import { createArView } from './ar-view.js';
import { SurfacePlacement } from './ar-surface.js';
import { createReticle } from './reticle.js';
import { createRenderLoop } from './render-loop.js';
import { describeAdapter, WebGpuUnavailableError, WEBGPU_ERROR_REASONS } from './webgpu.js';
import { getRequestedRenderMode, RENDER_MODES, WebGlTestModeUnavailableError } from './webgl-test-mode.js';

/** Réglage de Chrome qui active la liaison WebXR/WebGPU (Chrome 157, Android et Windows). */
const WEBGPU_FLAG_URL = 'chrome://flags/#webxr-webgpu-binding';

/** Explication affichée quand l'AR existe mais sans liaison WebXR/WebGPU. */
const WEBGPU_FLAG_HELP = `L’AR rendue en WebGPU demande un réglage de Chrome : ouvrez ${WEBGPU_FLAG_URL}, activez « WebXR/WebGPU Binding », puis relancez Chrome.`;

/** Messages affichés quand l'entrée en AR échoue, selon la cause signalée par la session. */
const AR_ERROR_MESSAGES = Object.freeze({
  [AR_ERROR_REASONS.UNAVAILABLE]: 'WebXR est indisponible : ouvrez l’application dans Chrome sur Android, en HTTPS.',
  [AR_ERROR_REASONS.UNSUPPORTED]: 'Ce navigateur ne propose pas la réalité augmentée immersive.',
  [AR_ERROR_REASONS.WEBGPU_BINDING]: WEBGPU_FLAG_HELP,
  [AR_ERROR_REASONS.REJECTED]: 'Session AR refusée : autorisez l’accès à la caméra et vérifiez que les Services Google Play pour la RA sont installés.',
  [AR_ERROR_REASONS.REFERENCE_SPACE]: 'Cet appareil ne fournit pas l’espace de référence local-floor.',
  [AR_ERROR_REASONS.LAYER]: 'Le rendu WebGPU n’a pas pu être relié à la session AR.',
});

/** Messages affichés à la place du terrain quand WebGPU manque : il n'y a pas de repli WebGL. */
const STARTUP_ERROR_MESSAGES = Object.freeze({
  [WEBGPU_ERROR_REASONS.NO_API]: 'Football Simulator a besoin de WebGPU, absent de ce navigateur. Ouvrez-le dans Chrome ou Edge à jour, sur ordinateur ou sur Android, ou dans Safari 26 sur iPhone.',
  [WEBGPU_ERROR_REASONS.NO_ADAPTER]: 'WebGPU est présent, mais aucun processeur graphique compatible n’a été trouvé sur cet appareil.',
  [WEBGPU_ERROR_REASONS.WRONG_BACKEND]: 'Le rendu ne tourne pas sur WebGPU : démarrage interrompu.',
  'no-webgl': 'Le mode test WebGL demande WebGL 2, indisponible sur ce navigateur.',
});

/** Aide affichée en AR, selon l'état de la pose du terrain (src/ar-surface.js). */
const PLACEMENT_HINTS = Object.freeze({
  searching: 'Visez la table : un cercle doré apparaît sur la surface détectée.',
  surface: 'Touchez l’écran pour poser le terrain sur le cercle.',
  placed: 'Terrain posé. Tournez autour ; « Déplacer le terrain » pour le poser ailleurs.',
  'in-front': 'Détection des surfaces indisponible : terrain placé devant vous.',
});

/** Aide affichée au début d'une session, avant le premier état de la pose. */
const AR_HINT = 'Visez la table avec le téléphone.';

/**
 * Affiche dans le badge de rendu l'API utilisée : WebGPU, avec le processeur graphique, ou
 * WebGL en mode test, pour que personne ne confonde les deux.
 * @param {import('three/webgpu').Renderer} renderer
 * @param {string} renderMode une valeur de RENDER_MODES
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Interface HTML — badge du moteur de rendu
 */
function showRendererStatus(renderer, renderMode) {
  const badge = document.getElementById('gpu-status');
  if (renderMode === RENDER_MODES.WEBGL_TEST) {
    badge.dataset.state = 'webgl-test';
    badge.dataset.adapter = 'WebGL 2';
    badge.textContent = 'Rendu WebGL (mode test)';
    badge.title = 'Mode test demandé par ?webgl dans l’adresse. Ce n’est pas un repli : le rendu de l’application est WebGPU.';
    return;
  }
  const adapter = describeAdapter(renderer.backend.device?.adapterInfo);
  badge.dataset.state = 'webgpu';
  badge.dataset.adapter = adapter;
  badge.textContent = 'Rendu WebGPU';
  badge.title = `WebGPU : ${adapter}`;
}

/**
 * Construit la scène, branche l'interface de la vue 3D et lance la boucle de rendu.
 * @param {string} renderMode une valeur de RENDER_MODES : WebGPU, sauf demande explicite
 * @returns {Promise<{sceneContext: Awaited<ReturnType<typeof createSceneContext>>,
 *   arView: ReturnType<typeof createArView>, arState: {placement: SurfacePlacement|null}}>}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Orchestration — construction de la scène et lancement de la boucle de rendu
 */
async function init(renderMode) {
  const container = document.getElementById('scene-container');
  const sceneContext = await createSceneContext(container, { renderMode });
  const { renderer, scene, camera, controls, pitchGroup, table, resetView, resize } = sceneContext;
  showRendererStatus(renderer, renderMode);

  pitchGroup.add(createPitch(renderer));

  // Tableau tactique : la formation en place de chaque équipe (sprint 4).
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  // Déplacement des joueurs lors d'un changement de formation ; direct si l'utilisateur demande
  // moins d'animations.
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const animator = new FormationAnimator({ duration: reduceMotion ? 0 : TRANSITION_DURATION_MS });

  const playerFactory = new PlayerFactory();
  const teamGroups = {};
  for (const team of Object.values(TEAMS)) {
    teamGroups[team.id] = createTeam(team, board.getFormation(team.id), playerFactory);
    pitchGroup.add(teamGroups[team.id]);
  }
  pitchGroup.add(createBall());

  // Observateurs du tableau tactique (patron Observer) : la scène déplace les joueurs, et le
  // panneau des formations marque la formation en place et l'écrit dans les pastilles.
  board.on('formationchange', ({ teamId, formation }) => {
    applyFormation(teamGroups[teamId], TEAMS[teamId], formation, animator);
  });
  createFormationPanel({
    root: document.getElementById('formation-panel'),
    board,
    teams: Object.values(TEAMS),
    chips: Object.fromEntries(Object.keys(TEAMS).map((id) => [id, document.getElementById(`formation-${id}`)])),
  });
  document.getElementById('formations-toggle').addEventListener('click', () => {
    setFormationPanelOpen(document.getElementById('formation-panel').hidden);
  });

  // Réticule du hit test : en dehors du terrain, car il se déplace avant la pose.
  const reticle = createReticle();
  scene.add(reticle);

  document.getElementById('reset-view').addEventListener('click', resetView);

  // Vue AR : à la sortie, la taille du rendu et le cadrage de la vue 3D sont recalculés.
  const arView = createArView({
    scene,
    table,
    pitchGroup,
    controls,
    reticle,
    onExit: () => {
      resize();
      resetView();
    },
  });

  // Pose du terrain de la session AR en cours, lue à chaque image par la boucle de rendu.
  const arState = { placement: null };

  renderer.onDeviceLost = (info) => {
    console.error('Périphérique WebGPU perdu :', info);
    showStartupError(new Error('le processeur graphique a été réinitialisé ; rechargez la page.'));
  };

  // setAnimationLoop plutôt que requestAnimationFrame : la même boucle sert en session WebXR.
  await renderer.setAnimationLoop(createRenderLoop({
    renderer,
    scene,
    camera,
    controls,
    animator,
    getArPlacement: () => arState.placement,
  }));
  document.body.classList.add('is-ready');
  return { sceneContext, arView, arState, board, animator };
}

/**
 * Ouvre ou ferme le panneau des formations, et tient à jour l'état du bouton « Formations ».
 * @param {boolean} open
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Interface HTML — ouverture du panneau des formations
 */
function setFormationPanelOpen(open) {
  document.getElementById('formation-panel').hidden = !open;
  document.getElementById('formations-toggle').setAttribute('aria-expanded', String(open));
}

/**
 * Affiche l'explication du réglage WebXR/WebGPU de Chrome, avec un bouton pour copier son adresse
 * (une page web ne peut pas ouvrir chrome://flags elle-même).
 * @param {string} text message à afficher
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Interface HTML — aide au réglage WebXR/WebGPU de Chrome
 */
function showFlagHelp(text) {
  const message = document.getElementById('ar-message');
  message.textContent = text;
  message.hidden = false;
  document.getElementById('copy-flag').hidden = false;
}

/**
 * Branche la réalité augmentée : boutons, toucher sur l'écran, et réactions de la scène et de
 * l'interface aux événements de la session et de la pose du terrain (patron Observer, cahier §3.4).
 * @param {Awaited<ReturnType<typeof createSceneContext>>} sceneContext
 * @param {ReturnType<typeof createArView>} arView
 * @param {{placement: SurfacePlacement|null}} arState
 * @param {string} renderMode une valeur de RENDER_MODES
 * @returns {ArSession}
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Orchestration — branchement de la session AR sur la scène et l'interface
 */
function setUpArSession(sceneContext, arView, arState, renderMode) {
  const overlay = document.getElementById('overlay');
  const enterButton = document.getElementById('enter-ar');
  const exitButton = document.getElementById('exit-ar');
  const moveButton = document.getElementById('move-pitch');
  const formationsToggle = document.getElementById('formations-toggle');
  const resetButton = document.getElementById('reset-view');
  const hint = document.getElementById('hint');
  const message = document.getElementById('ar-message');
  const defaultHint = hint.textContent;

  const arSession = new ArSession({
    renderer: sceneContext.renderer,
    overlayRoot: overlay,
    // En mode test, la session est rendue par une couche WebGL : ni webgpu ni XRGPUBinding.
    renderingApi: renderMode === RENDER_MODES.WEBGL_TEST ? RENDERING_APIS.WEBGL : RENDERING_APIS.WEBGPU,
  });

  // Toucher sur l'écran pendant la session : WebXR le signale par l'événement select.
  const onSelect = () => arState.placement?.requestPlacement();

  // Observateurs : la scène et l'interface suivent le cycle de vie de la session.
  arSession.on('sessionstart', ({ session, referenceSpace }) => {
    arView.enter();
    const placement = new SurfacePlacement({ session, referenceSpace, view: arView });
    placement.on('statechange', ({ state }) => {
      document.body.dataset.placement = state;
      hint.textContent = PLACEMENT_HINTS[state];
      moveButton.hidden = state !== 'placed';
      // Les formations se choisissent sur le terrain posé, pas pendant la visée.
      const pitchShown = state === 'placed' || state === 'in-front';
      formationsToggle.hidden = !pitchShown;
      if (!pitchShown) {
        setFormationPanelOpen(false);
      }
    });
    arState.placement = placement;
    placement.start();
    session.addEventListener('select', onSelect);

    document.body.dataset.xr = 'active';
    enterButton.hidden = true;
    resetButton.hidden = true;
    formationsToggle.hidden = true;
    setFormationPanelOpen(false);
    exitButton.hidden = false;
    hint.textContent = AR_HINT;
  });

  // Fin de session, par « Quitter l'AR » ou par le système (bouton retour du téléphone).
  arSession.on('sessionend', ({ session }) => {
    session?.removeEventListener('select', onSelect);
    arState.placement?.stop();
    arState.placement = null;
    arView.exit();
    document.body.dataset.xr = 'inactive';
    delete document.body.dataset.placement;
    exitButton.hidden = true;
    moveButton.hidden = true;
    resetButton.hidden = false;
    formationsToggle.hidden = false;
    enterButton.hidden = false;
    enterButton.disabled = false;
    hint.textContent = defaultHint;
  });

  arSession.on('sessionerror', ({ reason, error }) => {
    console.warn(`Entrée en AR impossible (${reason}) :`, error);
    if (reason === AR_ERROR_REASONS.WEBGPU_BINDING) {
      showFlagHelp(AR_ERROR_MESSAGES[reason]);
    } else {
      message.textContent = AR_ERROR_MESSAGES[reason];
      message.hidden = false;
    }
    enterButton.disabled = false;
    // three.js a pu modifier la taille du rendu avant l'échec : on la recalcule à l'image suivante.
    requestAnimationFrame(sceneContext.resize);
  });

  // DOM Overlay : un toucher sur un bouton de l'interface ne doit pas aussi poser le terrain.
  overlay.addEventListener('beforexrselect', (event) => {
    if (event.target.closest?.('button')) {
      event.preventDefault();
    }
  });

  enterButton.addEventListener('click', () => {
    enterButton.disabled = true;
    message.hidden = true;
    arSession.start();
  });
  exitButton.addEventListener('click', () => arSession.end());
  moveButton.addEventListener('click', () => arState.placement?.startOver());

  const copyFlagButton = document.getElementById('copy-flag');
  copyFlagButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(WEBGPU_FLAG_URL);
      copyFlagButton.textContent = 'Adresse copiée';
    } catch {
      copyFlagButton.textContent = WEBGPU_FLAG_URL;
    }
  });

  document.body.dataset.xr = 'inactive';
  return arSession;
}

/**
 * Détecte la réalité augmentée (réelle, ou émulée par IWER) et l'affiche dans le badge d'état.
 * En WebGPU, le bouton « Entrer en AR » n'apparaît que si l'AR peut être rendue en WebGPU ;
 * en mode test WebGL (?webgl), l'AR est rendue par une couche WebGL.
 * @param {boolean} emulated vrai si l'émulateur IWER est installé
 * @param {string} renderMode une valeur de RENDER_MODES
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Session WebXR — détection de la prise en charge au démarrage
 */
async function detectAugmentedReality(emulated, renderMode) {
  const statusElement = document.getElementById('xr-status');
  showXrStatus(statusElement, 'checking');
  const supported = await isImmersiveArSupported();
  if (!supported) {
    showXrStatus(statusElement, 'unsupported');
  } else if (renderMode === RENDER_MODES.WEBGPU && !hasWebGpuXrBinding()) {
    // AR présente, mais WebXR ne sait pas encore afficher du WebGPU : pas de repli WebGL.
    showXrStatus(statusElement, 'needs-flag');
    showFlagHelp(WEBGPU_FLAG_HELP);
  } else {
    const webglTest = renderMode === RENDER_MODES.WEBGL_TEST;
    showXrStatus(statusElement, emulated ? 'emulated' : (webglTest ? 'supported-webgl-test' : 'supported'));
    document.getElementById('enter-ar').hidden = false;
  }
}

/**
 * Branche l'application installable : Service Worker, bouton d'installation, avis de nouvelle
 * version et badge hors-ligne. Appelé avant la scène : même sans WebGPU, l'application se met
 * en cache et s'installe.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role PWA — branchement de l'application installable
 */
function setUpPwa() {
  registerServiceWorker();
  setUpInstallButton(document.getElementById('install-app'));
  watchNetworkStatus(document.getElementById('network-status'));
  watchForUpdates(() => {
    document.getElementById('update-notice').hidden = false;
  });
  document.getElementById('reload-app').addEventListener('click', () => window.location.reload());
}

/**
 * Outils de développement : avec ?debug dans l'adresse, les objets principaux sont exposés
 * dans window.__footballSimulator, pour la console du navigateur et les tests de bout en bout.
 * @param {object} objects
 * @returns {object|null} l'objet exposé, ou null sans ?debug
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Développement — objets exposés pour le débogage (?debug)
 */
function exposeForDebugging(objects) {
  if (!new URLSearchParams(window.location.search).has('debug')) {
    return null;
  }
  window.__footballSimulator = objects;
  return objects;
}

/**
 * Remplace l'écran de chargement par un message si la scène ne peut pas démarrer : WebGPU
 * absent ou inutilisable. Il n'y a pas de repli : l'écran ne propose pas WebGL.
 * @param {Error} error
 * @param {string} [renderMode] une valeur de RENDER_MODES
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Interface HTML — message d'erreur au démarrage
 */
function showStartupError(error, renderMode = RENDER_MODES.WEBGPU) {
  console.error(error);
  const loader = document.getElementById('loader');
  let reason = 'error';
  if (error instanceof WebGpuUnavailableError) {
    reason = error.reason;
  } else if (error instanceof WebGlTestModeUnavailableError) {
    reason = 'no-webgl';
  }
  loader.textContent = STARTUP_ERROR_MESSAGES[reason] ?? `Impossible d’afficher le terrain : ${error.message}`;
  loader.dataset.state = 'error';
  loader.dataset.reason = reason;
  document.body.classList.remove('is-ready');
  const badge = document.getElementById('gpu-status');
  badge.dataset.state = 'unavailable';
  badge.textContent = renderMode === RENDER_MODES.WEBGL_TEST ? 'WebGL indisponible' : 'WebGPU indisponible';
}

/**
 * Démarrage : application installable, émulateur éventuel, scène WebGPU, puis réalité augmentée.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Orchestration — point d'entrée de l'application
 */
async function start() {
  setUpPwa();
  // WebGPU, sauf si l'adresse demande le mode test WebGL (?webgl), réservé aux tests.
  const renderMode = getRequestedRenderMode();
  // Avec ?iwer, l'émulateur s'installe avant le moteur de rendu : three.js vérifie la présence
  // de XRGPUBinding une seule fois, à la création du moteur.
  const emulator = await installEmulatorIfRequested();
  let context;
  try {
    context = await init(renderMode);
  } catch (error) {
    showStartupError(error, renderMode);
    return;
  }
  const { sceneContext, arView, arState, board, animator } = context;
  emulator?.setCanvas(sceneContext.renderer.domElement);
  const arSession = setUpArSession(sceneContext, arView, arState, renderMode);
  exposeForDebugging({
    ...sceneContext,
    renderMode,
    arView,
    arSession,
    board,
    animator,
    xrDevice: emulator?.xrDevice ?? null,
    get placement() {
      return arState.placement;
    },
  });
  await detectAugmentedReality(Boolean(emulator), renderMode);
}

start();
