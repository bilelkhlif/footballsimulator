/**
 * Point d'entrée de Football Simulator.
 * Sprint 1 : vue 3D hors AR du terrain, des deux équipes et du ballon.
 * Sprint 2 : session AR immersive.
 * Sprint 3 : rendu WebGPU sans repli WebGL ; terrain posé sur une surface réelle (hit test,
 * réticule, toucher, ancre) ; application installable, avec avis de nouvelle version.
 * Mode test WebGL : réservé aux tests, avec ?webgl dans l'adresse ; ce n'est pas un repli.
 * Sprint 4 : choix de la formation de chaque équipe par des boutons ; les joueurs rejoignent leurs
 * nouvelles places (patrons Strategy et Observer).
 * Sprint 5 : sélection et déplacement des joueurs et du ballon par raycasting, à la souris, au doigt
 * et en AR ; flèches de passe et de course ; annuler, rétablir et réinitialiser (patron Command) ;
 * mode diagnostic des performances (?diagnostics).
 * Sprint 6 : pions instanciés (6 appels de dessin au lieu de 66) ; séquence animée pas à pas
 * (bonus BF9) ; Service Worker à version de contenu.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { Raycaster, TOUCH } from 'three';
import { createSceneContext } from './scene.mjs';
import { createPitch } from './pitch.mjs';
import { PlayerFactory } from './players.mjs';
import { createTeam } from './team.mjs';
import { createBall } from './ball.mjs';
import { DEFAULT_FORMATIONS, TEAMS } from './config.mjs';
import { TacticsBoard } from './tactics-board.mjs';
import { FormationAnimator, TRANSITION_DURATION_MS } from './formation-transition.mjs';
import { createFormationPanel } from './formation-panel.mjs';
import { ChangeFormationCommand, CommandHistory } from './commands.mjs';
import { MOVE_DURATION_MS, TacticalView } from './tactical-view.mjs';
import { TacticalInteraction } from './tactical-interaction.mjs';
import { createHintController, createTacticalToolbar, describeGuidance } from './tactical-toolbar.mjs';
import { PointerInput } from './pointer-input.mjs';
import { routeXrSelect, SELECT_ROUTES, XrTacticalInput } from './xr-input.mjs';
import { DiagnosticsPanel, isDiagnosticsRequested } from './diagnostics.mjs';
import { TacticalSequence } from './tactical-sequence.mjs';
import { SequencePlayer } from './sequence-player.mjs';
import { createSequencePanel } from './sequence-panel.mjs';
import { installEmulatorIfRequested } from './dev-emulator.mjs';
import { isImmersiveArSupported, showXrStatus } from './xr-support.mjs';
import { registerServiceWorker, setUpInstallButton, watchForUpdates, watchNetworkStatus } from './pwa.mjs';
import { ArSession, AR_ERROR_REASONS, hasWebGpuXrBinding, RENDERING_APIS } from './xr-session.mjs';
import { createArView } from './ar-view.mjs';
import { SurfacePlacement } from './ar-surface.mjs';
import { createReticle } from './reticle.mjs';
import { createRenderLoop } from './render-loop.mjs';
import { describeAdapter, WebGpuUnavailableError, WEBGPU_ERROR_REASONS } from './webgpu.mjs';
import { getRequestedRenderMode, RENDER_MODES, WebGlTestModeUnavailableError } from './webgl-test-mode.mjs';

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

/** Aide affichée en AR, selon l'état de la pose du terrain (src/ar-surface.mjs). */
const PLACEMENT_HINTS = Object.freeze({
  searching: 'Visez la table : un cercle doré apparaît sur la surface détectée.',
  surface: 'Touchez l’écran pour poser le terrain sur le cercle.',
  placed: 'Terrain posé. Tournez autour ; « Déplacer le terrain » pour le poser ailleurs.',
  'in-front': 'Détection des surfaces indisponible : terrain placé devant vous.',
});

/** Aide affichée au début d'une session, avant le premier état de la pose. */
const AR_HINT = 'Visez la table avec le téléphone.';

/** État de la pose du terrain, en clair, pour le mode diagnostic. */
const PLACEMENT_LABELS = Object.freeze({
  searching: 'recherche d’une surface',
  surface: 'surface visée',
  placed: 'terrain posé',
  'in-front': 'terrain devant l’utilisateur',
});

/**
 * Éléments de l'interface où un toucher ne doit pas devenir un select WebXR (DOM Overlay) : boutons,
 * barre d'outils, panneaux des formations et de la séquence, et avis.
 */
const XR_UI_SELECTOR = 'button, .toolbar, .formation-panel, .sequence-panel, .notice';

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
 * @returns {Promise<object>} contexte de la scène, vue AR, état de la session AR, et objets
 *   tactiques : tableau, historique, interaction, vue tactique, aide, rayon et diagnostic
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

  // Tableau tactique : formations (sprint 4), places des joueurs, ballon et flèches (sprint 5).
  // Les actions de l'utilisateur passent par l'historique des commandes (patron Command).
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  const history = new CommandHistory();
  // Déplacements animés ; directs si l'utilisateur demande moins d'animations.
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const animator = new FormationAnimator({ duration: reduceMotion ? 0 : TRANSITION_DURATION_MS });

  const playerFactory = new PlayerFactory();
  const teamGroups = {};
  // Pions instanciés (sprint 6) : 3 appels de dessin par équipe, mis à jour seulement quand un
  // joueur bouge.
  const teamMeshes = [];
  for (const team of Object.values(TEAMS)) {
    teamGroups[team.id] = createTeam(team, board.getFormation(team.id), playerFactory);
    pitchGroup.add(teamGroups[team.id]);
    const meshes = playerFactory.createTeamMeshes(team, teamGroups[team.id].children);
    pitchGroup.add(meshes.group);
    teamMeshes.push(meshes);
  }
  const ball = createBall();
  pitchGroup.add(ball);

  // Observateurs du tableau tactique (patron Observer) : la vue tactique déplace joueurs et ballon
  // et dessine les flèches ; le panneau des formations marque la formation en place.
  const tacticalView = new TacticalView({
    board,
    pitchGroup,
    teamGroups,
    teams: TEAMS,
    ball,
    animator,
    moveDuration: reduceMotion ? 0 : MOVE_DURATION_MS,
    formationDuration: reduceMotion ? 0 : TRANSITION_DURATION_MS,
  });
  createFormationPanel({
    root: document.getElementById('formation-panel'),
    board,
    teams: Object.values(TEAMS),
    chips: Object.fromEntries(Object.keys(TEAMS).map((id) => [id, document.getElementById(`formation-${id}`)])),
    choose: (teamId, name) => history.execute(new ChangeFormationCommand({ board, teamId, formation: name })),
  });

  // Interaction tactique (sprint 5) : un seul rayon, orienté par la souris, le doigt ou l'AR.
  const interaction = new TacticalInteraction({ board, history, pitchGroup, getHitboxes: () => tacticalView.hitboxes });
  tacticalView.bindInteraction(interaction);
  const raycaster = new Raycaster();
  new PointerInput({
    element: renderer.domElement,
    camera,
    raycaster,
    interaction,
    isPresenting: () => renderer.xr.isPresenting,
  }).attach();

  // Bandeau d'aide : l'aide de l'état courant, et quelques instants le retour de chaque geste.
  const hint = createHintController(document.getElementById('hint'));
  interaction.on('feedback', ({ kind, message }) => hint.flash(message, kind));
  createTacticalToolbar({
    root: document.getElementById('tactical-toolbar'),
    interaction,
    history,
    board,
    onFeedback: ({ kind, message }) => hint.flash(message, kind),
  });
  document.getElementById('formations-toggle').addEventListener('click', () => {
    setFormationPanelOpen(document.getElementById('formation-panel').hidden);
  });
  interaction.on('statechange', () => {
    // Pendant le choix d'une destination, un doigt vise (src/pointer-input.mjs) : la rotation de
    // la vue passe aux gestes à deux doigts, qui gardent aussi le zoom.
    const aiming = interaction.wantsHover;
    controls.touches.ONE = aiming ? null : TOUCH.ROTATE;
    controls.touches.TWO = aiming ? TOUCH.DOLLY_ROTATE : TOUCH.DOLLY_PAN;
  });

  // Séquence animée (sprint 6, BF9) : images clés par des commandes annulables, lecture dans la
  // boucle de rendu, dans le repère du terrain.
  const sequence = new TacticalSequence();
  const sequencePlayer = new SequencePlayer({
    sequence,
    board,
    view: tacticalView,
    animator,
    targets: [
      ...Object.entries(teamGroups).flatMap(([teamId, group]) => group.children.map((object) => ({ object, key: `${teamId}:${object.userData.number}` }))),
      { object: ball, key: 'ball' },
    ],
  });
  createSequencePanel({
    root: document.getElementById('sequence-panel'),
    sequence,
    player: sequencePlayer,
    history,
    board,
    onFeedback: ({ kind, message }) => hint.flash(message, kind),
  });
  document.getElementById('sequence-toggle').addEventListener('click', () => {
    setSequencePanelOpen(document.getElementById('sequence-panel').hidden);
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

  // Session AR en cours : pose du terrain et saisie tactique, lues à chaque image.
  const arState = { placement: null, tacticalInput: null };

  /** Aide de base : la pose du terrain en AR tant qu'il n'est pas posé, sinon l'interaction. */
  const refreshGuidance = ({ force = false } = {}) => {
    hint.setBase(guidanceFor(arState, interaction), { force });
  };
  interaction.on('statechange', () => refreshGuidance());
  refreshGuidance({ force: true });

  // Mode diagnostic, seulement avec ?diagnostics : images par seconde, rendu, session XR.
  const diagnostics = isDiagnosticsRequested()
    ? new DiagnosticsPanel({ element: document.getElementById('diagnostics'), renderer, getXrState: () => describeXrState(arState) })
    : null;

  renderer.onDeviceLost = (info) => {
    console.error('Périphérique WebGPU perdu :', info);
    showStartupError(new Error('le processeur graphique a été réinitialisé ; rechargez la page.'));
  };

  // Tâches de chaque image, après les déplacements et avant le rendu : aperçu d'une flèche guidé
  // par la source d'entrée WebXR, lecture de la séquence, anneau de sélection et aperçu, pions
  // instanciés (après tout ce qui déplace les joueurs), puis comptage des images.
  const tasks = [
    { update: (time, frame) => arState.tacticalInput?.update(frame) },
    sequencePlayer,
    tacticalView,
    ...teamMeshes,
  ];
  if (diagnostics) {
    tasks.push(diagnostics);
  }

  // setAnimationLoop plutôt que requestAnimationFrame : la même boucle sert en session WebXR.
  await renderer.setAnimationLoop(createRenderLoop({
    renderer,
    scene,
    camera,
    controls,
    animator,
    getArPlacement: () => arState.placement,
    tasks,
  }));
  document.body.classList.add('is-ready');
  return {
    sceneContext, arView, arState, board, animator, history, interaction, tacticalView, hint, raycaster, diagnostics, refreshGuidance,
    sequence, sequencePlayer, teamMeshes,
  };
}

/**
 * Texte d'aide de base selon le contexte : en AR, la pose du terrain tant qu'il n'est pas posé ;
 * sinon, l'étape courante de l'interaction tactique.
 * @param {{placement: SurfacePlacement|null}} arState
 * @param {TacticalInteraction} interaction
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Interface HTML — aide de l'interaction tactique
 */
function guidanceFor(arState, interaction) {
  const { placement } = arState;
  if (placement && !placement.pitchReady) {
    return PLACEMENT_HINTS[placement.state] ?? AR_HINT;
  }
  return describeGuidance(
    { mode: interaction.mode, state: interaction.state, selection: interaction.selection, draft: interaction.draft },
    { inAr: Boolean(placement) },
  );
}

/**
 * État de la session XR, en clair, pour le mode diagnostic.
 * @param {{placement: SurfacePlacement|null}} arState
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Performance — panneau du mode diagnostic
 */
function describeXrState(arState) {
  const { placement } = arState;
  if (!placement) {
    return document.body.dataset.xr === 'active' ? 'session active' : 'aucune session';
  }
  const label = PLACEMENT_LABELS[placement.state] ?? 'démarrage';
  return `session active, ${label}${placement.anchored ? ', ancré' : ''}`;
}

/**
 * Ouvre ou ferme le panneau des formations, et tient à jour l'état du bouton « Formations ».
 * @param {boolean} open
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Interface HTML — ouverture du panneau des formations
 */
function setFormationPanelOpen(open) {
  if (open) {
    setSequencePanelOpen(false); // un seul panneau ouvert : le bas de l'écran reste libre
  }
  document.getElementById('formation-panel').hidden = !open;
  document.getElementById('formations-toggle').setAttribute('aria-expanded', String(open));
}

/**
 * Ouvre ou ferme le panneau de la séquence, et tient à jour l'état du bouton « Séquence ». Ouvrir
 * l'un des deux panneaux ferme l'autre.
 * @param {boolean} open
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Interface HTML — ouverture du panneau de la séquence (BF9)
 */
function setSequencePanelOpen(open) {
  if (open) {
    setFormationPanelOpen(false);
  }
  document.getElementById('sequence-panel').hidden = !open;
  document.getElementById('sequence-toggle').setAttribute('aria-expanded', String(open));
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
 * @param {{placement: SurfacePlacement|null, tacticalInput: XrTacticalInput|null}} arState
 * @param {string} renderMode une valeur de RENDER_MODES
 * @param {{interaction: TacticalInteraction, raycaster: Raycaster,
 *   hint: ReturnType<typeof createHintController>, refreshGuidance: (options?: {force?: boolean}) => void}} tactics
 *   interaction tactique (sprint 5), son rayon et l'aide
 * @returns {ArSession}
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Orchestration — branchement de la session AR sur la scène et l'interface
 */
function setUpArSession(sceneContext, arView, arState, renderMode, { interaction, raycaster, hint, refreshGuidance }) {
  const overlay = document.getElementById('overlay');
  const enterButton = document.getElementById('enter-ar');
  const exitButton = document.getElementById('exit-ar');
  const moveButton = document.getElementById('move-pitch');
  const formationsToggle = document.getElementById('formations-toggle');
  const sequenceToggle = document.getElementById('sequence-toggle');
  const toolbar = document.getElementById('tactical-toolbar');
  const resetButton = document.getElementById('reset-view');
  const message = document.getElementById('ar-message');

  const arSession = new ArSession({
    renderer: sceneContext.renderer,
    overlayRoot: overlay,
    // En mode test, la session est rendue par une couche WebGL : ni webgpu ni XRGPUBinding.
    renderingApi: renderMode === RENDER_MODES.WEBGL_TEST ? RENDERING_APIS.WEBGL : RENDERING_APIS.WEBGPU,
  });

  // Toucher sur l'écran pendant la session : WebXR le signale par l'événement select. Tant que le
  // terrain n'est pas posé, il sert à le poser ; ensuite, à l'interaction tactique (sprint 5).
  const onSelect = (event) => {
    const route = routeXrSelect(arState.placement);
    if (route === SELECT_ROUTES.PLACEMENT) {
      arState.placement.requestPlacement();
    } else if (route === SELECT_ROUTES.TACTICS) {
      arState.tacticalInput?.handleSelect(event);
    }
  };

  // Observateurs : la scène et l'interface suivent le cycle de vie de la session.
  arSession.on('sessionstart', ({ session, referenceSpace }) => {
    arView.enter();
    const placement = new SurfacePlacement({ session, referenceSpace, view: arView });
    placement.on('statechange', ({ state }) => {
      document.body.dataset.placement = state;
      moveButton.hidden = state !== 'placed';
      // Formations et outils tactiques servent sur le terrain posé, pas pendant la visée.
      const pitchShown = placement.pitchReady;
      formationsToggle.hidden = !pitchShown;
      sequenceToggle.hidden = !pitchShown;
      toolbar.hidden = !pitchShown;
      if (!pitchShown) {
        setFormationPanelOpen(false);
        setSequencePanelOpen(false);
      }
      interaction.setEnabled(pitchShown);
      refreshGuidance({ force: true });
      if (pitchShown) {
        hint.flash(PLACEMENT_HINTS[state], 'success');
      }
    });
    arState.placement = placement;
    arState.tacticalInput = new XrTacticalInput({ session, referenceSpace, interaction, raycaster });
    interaction.setEnabled(false);
    placement.start();
    session.addEventListener('select', onSelect);

    document.body.dataset.xr = 'active';
    enterButton.hidden = true;
    resetButton.hidden = true;
    formationsToggle.hidden = true;
    sequenceToggle.hidden = true;
    toolbar.hidden = true;
    setFormationPanelOpen(false);
    setSequencePanelOpen(false);
    exitButton.hidden = false;
    hint.setBase(AR_HINT, { force: true });
  });

  // Fin de session, par « Quitter l'AR » ou par le système (bouton retour du téléphone) : la
  // saisie AR se tait et lâche la session ; la tactique, elle, est gardée pour la vue 3D.
  arSession.on('sessionend', ({ session }) => {
    session?.removeEventListener('select', onSelect);
    arState.tacticalInput?.stop();
    arState.tacticalInput = null;
    arState.placement?.stop();
    arState.placement = null;
    arView.exit();
    interaction.cancel();
    interaction.setEnabled(true);
    document.body.dataset.xr = 'inactive';
    delete document.body.dataset.placement;
    exitButton.hidden = true;
    moveButton.hidden = true;
    resetButton.hidden = false;
    formationsToggle.hidden = false;
    sequenceToggle.hidden = false;
    toolbar.hidden = false;
    enterButton.hidden = false;
    enterButton.disabled = false;
    refreshGuidance({ force: true });
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

  // DOM Overlay : un toucher sur l'interface (bouton, barre d'outils, panneau des formations) ne
  // doit ni poser le terrain ni sélectionner ou déplacer un joueur.
  overlay.addEventListener('beforexrselect', (event) => {
    if (event.target.closest?.(XR_UI_SELECTOR)) {
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
  const {
    sceneContext, arView, arState, board, animator, history, interaction, tacticalView, hint, raycaster, diagnostics, refreshGuidance,
    sequence, sequencePlayer, teamMeshes,
  } = context;
  emulator?.setCanvas(sceneContext.renderer.domElement);
  const arSession = setUpArSession(sceneContext, arView, arState, renderMode, { interaction, raycaster, hint, refreshGuidance });
  exposeForDebugging({
    ...sceneContext,
    renderMode,
    arView,
    arSession,
    board,
    animator,
    history,
    interaction,
    tacticalView,
    diagnostics,
    sequence,
    sequencePlayer,
    teamMeshes,
    xrDevice: emulator?.xrDevice ?? null,
    get placement() {
      return arState.placement;
    },
    get tacticalInput() {
      return arState.tacticalInput;
    },
  });
  await detectAugmentedReality(Boolean(emulator), renderMode);
}

start();
