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
 * Retours d'évaluation : règles des flèches vérifiées avant toute action (src/arrow-rules.mjs),
 * barre d'outils à icônes, aide au premier lancement, bouton « Abandonner », raccourcis clavier,
 * visée au doigt, confirmation de la réinitialisation ; modules en .mjs.
 * Phase 6 : une tactique reçue par un lien de partage (« #tactique=… ») s'ouvre au lancement ;
 * calques de lecture du terrain (tiers, couloirs, demi-espaces, zone 14) ; zones surlignées.
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
import { postOfNumber } from './formations.mjs';
import { createFormationPanel } from './formation-panel.mjs';
import { createAnalysisPanel } from './analysis-panel.mjs';
import { OffsideLayer } from './offside-layer.mjs';
import { MarkingLayer } from './marking-layer.mjs';
import { PitchZonesLayer } from './pitch-zones-layer.mjs';
import { ZoneLayer } from './zone-layer.mjs';
import { createZonePanel } from './zone-panel.mjs';
import { followTeamKits } from './team-kits-view.mjs';
import { createTeamPanel } from './team-panel.mjs';
import { buildScenarioState, loadScenarioLibrary } from './scenarios.mjs';
import { createScenarioPanel } from './scenario-panel.mjs';
import {
  ChangeFormationCommand, ChangePhaseCommand, ChangePlayerAppearanceCommand, ChangeTeamIdentityCommand, CommandHistory,
  LoadSavedTacticCommand,
  LoadScenarioCommand,
} from './commands.mjs';
import { MOVE_DURATION_MS, TacticalView } from './tactical-view.mjs';
import { TacticalInteraction } from './tactical-interaction.mjs';
import { attachKeyboardShortcuts } from './keyboard-shortcuts.mjs';
import { createOnboarding } from './onboarding.mjs';
import { createHintController, createTacticalToolbar, describeGuidance } from './tactical-toolbar.mjs';
import { PointerInput } from './pointer-input.mjs';
import { routeXrSelect, SELECT_ROUTES, XrTacticalInput } from './xr-input.mjs';
import { DiagnosticsPanel, isDiagnosticsRequested } from './diagnostics.mjs';
import { TacticalSequence } from './tactical-sequence.mjs';
import {
  attachTacticAutosave, captureTactic, createTacticStore, isValidTactic,
} from './tactic-storage.mjs';
import { createTacticLibrary } from './tactic-library.mjs';
import { createSavedTacticsPanel } from './saved-tactics-panel.mjs';
import { readSharePayload } from './tactic-share.mjs';
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
import { PointOfView } from './point-of-view.mjs';
import { followPlayerAppearances } from './player-appearance-view.mjs';
import { createPlayerCustomizationPanel } from './player-customization-panel.mjs';
import { describeAdapter, WebGpuUnavailableError, WEBGPU_ERROR_REASONS } from './webgpu.mjs';
import { getRequestedRenderMode, RENDER_MODES, WebGlTestModeUnavailableError } from './webgl-test-mode.mjs';
import { WorkspaceController } from './workspace-controller.mjs';
import { createThemeControl, THEME_COLORS } from './theme.mjs';
import { followTeamNames, teamName } from './team-identity.mjs';
import { createWorkspaceNavigation, createWorkspaceSummary, createWorkspaceStatus } from './workspace-navigation.mjs';

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
 * surfaces de l'interface (barre d'outils, panneaux, pastilles, aide) et avis.
 */
const XR_UI_SELECTOR = 'button, a, summary, .ui-surface, .notice, .workspace-panel';

/** Libellé du bouton « Abandonner », selon ce qui est en cours. */
const CANCEL_LABELS = Object.freeze({ selected: 'Désélectionner', 'arrow-end': 'Abandonner le tracé' });

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

  // Thème clair ou sombre (réglages) : la couleur du fond 3D est modifiée en place, si bien que la
  // vue AR, qui sauvegarde puis restaure ce même objet, retrouve le fond du thème en cours.
  const sceneBackground = scene.background;
  createThemeControl({
    root: document.documentElement,
    buttons: document.querySelectorAll('[data-theme-choice]'),
    storage: readLocalStorage(),
    matchMedia: window.matchMedia?.bind(window),
    meta: document.querySelector('meta[name="theme-color"]'),
    status: document.getElementById('theme-status'),
    onChange: (resolved) => {
      sceneBackground?.set?.(THEME_COLORS[resolved].scene);
      table.material?.color?.set?.(THEME_COLORS[resolved].table);
    },
  });

  pitchGroup.add(createPitch(renderer));

  // Tableau tactique : formations (sprint 4), places des joueurs, ballon et flèches (sprint 5).
  // Les actions de l'utilisateur passent par l'historique des commandes (patron Command).
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  // Noms des équipes dans les textes : suivis avant tout autre observateur du tableau.
  followTeamNames(board);
  const history = new CommandHistory();
  // Déplacements animés ; directs si l'utilisateur demande moins d'animations.
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const animator = new FormationAnimator({ duration: reduceMotion ? 0 : TRANSITION_DURATION_MS });

  const playerFactory = new PlayerFactory();
  const teamGroups = {};
  // Pions instanciés (sprint 6) : 3 appels de dessin par équipe, mis à jour seulement quand un
  // joueur bouge.
  const teamMeshes = [];
  const teamMeshesById = {};
  for (const team of Object.values(TEAMS)) {
    teamGroups[team.id] = createTeam(team, board.getFormation(team.id), playerFactory);
    pitchGroup.add(teamGroups[team.id]);
    const meshes = playerFactory.createTeamMeshes(team, teamGroups[team.id].children);
    pitchGroup.add(meshes.group);
    teamMeshes.push(meshes);
    teamMeshesById[team.id] = meshes;
  }

  // Point de vue d'un joueur : la même scène, vue à hauteur d'homme depuis la place du joueur
  // sélectionné. Mode d'affichage seulement : rien du tableau tactique ne change.
  const pointOfView = new PointOfView({ renderer, pitchGroup, teamGroups, teamMeshes: teamMeshesById, controls });
  // Maillots : couleur de chaque pion (gardien distinct), numéros et pastilles de l'interface.
  followTeamKits({ board, teamMeshes: teamMeshesById, playerFactory, root: document.documentElement });
  // Apparence des joueurs (coupe et couleur des cheveux), joueur par joueur, d'après le tableau.
  const appearanceView = followPlayerAppearances({ board, teamMeshes: teamMeshesById, teamGroups });
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
    choose: (teamId, name) => {
      if (history.execute(new ChangeFormationCommand({ board, teamId, formation: name }))) {
        hint.flash(`${teamName(teamId)} : formation ${name} appliquée.`, 'success');
      }
    },
    choosePhase: (teamId, phase) => {
      const command = new ChangePhaseCommand({ board, teamId, phase });
      if (history.execute(command)) {
        hint.flash(`${teamName(teamId)} : ${command.label.split(' pour ')[0].toLowerCase()}.`, 'success');
      }
    },
  });

  // Analyse tactique : largeur, profondeur, lignes et surface de chaque équipe, en mètres réels.
  // Lignes de hors-jeu en 3D, dans le repère du terrain ; affichées depuis la carte d'analyse.
  const offsideLayer = new OffsideLayer({ pitchGroup, board });
  // Marquages individuels : traits replacés à chaque image (tâche de la boucle de rendu).
  const markingLayer = new MarkingLayer({ pitchGroup, board, teamGroups });
  // Calques de lecture du terrain (phase 6) : tiers, couloirs, demi-espaces, zone 14, masqués au départ.
  const pitchZones = new PitchZonesLayer({ pitchGroup, board });
  createAnalysisPanel({ root: document.getElementById('analysis-panel'), board, teams: Object.values(TEAMS), offsideLayer, pitchZones });
  // Noms et maillots des équipes : une commande annulable ; un refus est expliqué dans le bandeau.
  createTeamPanel({
    root: document.getElementById('team-panel'),
    board,
    choose: (teamId, identity) => {
      try {
        if (history.execute(new ChangeTeamIdentityCommand({ board, teamId, ...identity }))) {
          hint.flash(`${teamName(teamId)} : nom et maillot appliqués.`, 'success');
        }
      } catch (error) {
        hint.flash(error.message, 'invalid');
      }
    },
  });

  // Interaction tactique (sprint 5) : un seul rayon, orienté par la souris, le doigt ou l'AR.
  const interaction = new TacticalInteraction({ board, history, pitchGroup, getHitboxes: () => tacticalView.hitboxes });
  tacticalView.bindInteraction(interaction);
  // Zones surlignées (phase 6) : rectangles du tableau et aperçu du tracé en cours.
  const zoneLayer = new ZoneLayer({ pitchGroup, board, interaction });
  const raycaster = new Raycaster();
  new PointerInput({
    element: renderer.domElement,
    camera,
    raycaster,
    interaction,
    // Pendant le point de vue, un clic sert à regarder autour : il ne sélectionne ni ne déplace rien.
    isPresenting: () => renderer.xr.isPresenting || pointOfView.active,
  }).attach();

  // Bandeau d'aide : l'aide de l'état courant, et quelques instants le retour de chaque geste.
  const hint = createHintController(document.getElementById('hint'));
  interaction.on('feedback', ({ kind, message }) => hint.flash(message, kind));
  createZonePanel({
    root: document.getElementById('zone-panel'), board, history, onFeedback: ({ kind, message }) => hint.flash(message, kind),
  });
  const toolbar = createTacticalToolbar({
    root: document.getElementById('tactical-toolbar'),
    interaction,
    history,
    board,
    onFeedback: ({ kind, message }) => hint.flash(message, kind),
  });
  // Une seule navigation ; les composants restent liés aux mêmes objets métier.
  const workspaces = new WorkspaceController();
  const navigation = createWorkspaceNavigation({
    root: document.getElementById('overlay'), controller: workspaces, onNavigate: toolbar.disarmReset,
  });
  createWorkspaceSummary({ root: document.getElementById('overlay'), board, interaction });

  // Bouton « Abandonner » : visible pendant une sélection ou un tracé, comme Échap.
  const cancelButton = document.getElementById('cancel-draft');
  const cancelLabel = cancelButton.querySelector('[data-cancel-label]');
  /** Abandonne la sélection ou le tracé en cours, et le dit. */
  const cancelDraft = () => {
    const wasDrawing = interaction.draft !== null;
    if (!interaction.cancel()) {
      return false;
    }
    hint.flash(wasDrawing ? 'Tracé abandonné.' : 'Sélection annulée.', 'info');
    return true;
  };
  cancelButton.addEventListener('click', cancelDraft);
  interaction.on('statechange', ({ state }) => {
    const label = CANCEL_LABELS[state];
    cancelButton.hidden = !label;
    if (label) {
      cancelLabel.textContent = label;
      cancelButton.setAttribute('aria-label', label);
    }
    // Pendant le choix d'une destination, un doigt vise (src/pointer-input.mjs) : la rotation de
    // la vue passe aux gestes à deux doigts, qui gardent aussi le zoom.
    const aiming = interaction.wantsHover;
    controls.touches.ONE = aiming ? null : TOUCH.ROTATE;
    controls.touches.TWO = aiming ? TOUCH.DOLLY_ROTATE : TOUCH.DOLLY_PAN;
  });

  // « Point de vue » : action du joueur sélectionné, à côté de « Désélectionner ». Le point de vue
  // ne s'ouvre que sur ce bouton, jamais à la simple sélection.
  const pointOfViewButton = document.getElementById('point-of-view');
  const pointOfViewBar = document.getElementById('point-of-view-bar');
  const pointOfViewTitle = pointOfViewBar.querySelector('[data-pov-title]');
  const pointOfViewHelp = pointOfViewBar.querySelector('[data-pov-help]');
  /** Le bouton suit la sélection : un joueur sélectionné, hors AR et hors point de vue. */
  const refreshPointOfViewButton = () => {
    const selection = interaction.selection;
    pointOfViewButton.hidden = selection?.type !== 'player' || renderer.xr.isPresenting || pointOfView.active;
    if (!pointOfViewButton.hidden) {
      pointOfViewButton.setAttribute('aria-label', `Point de vue du n° ${selection.number} des ${teamName(selection.teamId)}`);
    }
  };
  /** Aide du bandeau selon l'état du curseur. */
  const describeLook = (locked) => (locked
    ? 'Bougez la souris pour regarder autour · Échap rend le curseur.'
    : 'Cliquez sur le terrain puis bougez la souris, ou glissez au doigt, pour regarder autour.');
  interaction.on('statechange', refreshPointOfViewButton);

  // « Personnaliser le joueur » : coupe et couleur des cheveux du joueur sélectionné. Aperçu
  // immédiat en 3D ; « Appliquer » crée une commande annulable, enregistrée avec la tactique.
  const customizeButton = document.getElementById('customize-player');
  const customization = createPlayerCustomizationPanel({
    root: document.getElementById('player-customization'),
    getAppearance: (teamId, number) => board.getAppearance(teamId, number),
    describe: (teamId, number) => `${teamName(teamId)} · n° ${number} · ${postOfNumber(board.getFormation(teamId), number)}`,
    preview: (teamId, number, appearance) => appearanceView.preview(teamId, number, appearance),
    clearPreview: () => appearanceView.clearPreview(),
    apply: (teamId, number, appearance) => {
      history.execute(new ChangePlayerAppearanceCommand({ board, teamId, number, appearance }));
      hint.flash(`n° ${number} des ${teamName(teamId)} personnalisé : « Annuler » rend son apparence d'avant.`, 'success');
    },
    onToggle: () => refreshCustomizeButton(),
  });
  /** Le bouton suit la sélection : un joueur sélectionné, hors AR, hors point de vue, panneau fermé. */
  const refreshCustomizeButton = () => {
    const selection = interaction.selection;
    customizeButton.hidden = selection?.type !== 'player' || renderer.xr.isPresenting || pointOfView.active || customization.isOpen;
    if (!customizeButton.hidden) {
      customizeButton.setAttribute('aria-label', `Personnaliser le n° ${selection.number} des ${teamName(selection.teamId)}`);
    }
  };
  interaction.on('statechange', refreshCustomizeButton);
  customizeButton.addEventListener('click', () => {
    const selection = interaction.selection;
    if (selection?.type === 'player') {
      customization.open(selection);
    }
  });

  pointOfViewButton.addEventListener('click', () => {
    customization.cancel();
    const selection = interaction.selection;
    if (!pointOfView.enter(selection)) {
      hint.flash('Point de vue indisponible pour cette sélection.', 'invalid');
    }
  });
  document.getElementById('point-of-view-exit').addEventListener('click', () => pointOfView.exit());
  pointOfView.on('change', ({ active, target }) => {
    pointOfViewBar.hidden = !active;
    if (active) {
      document.body.dataset.pointOfView = 'active';
      pointOfViewTitle.textContent = `${teamName(target.teamId)} · n° ${target.number} · ${postOfNumber(board.getFormation(target.teamId), target.number)}`;
      pointOfViewHelp.textContent = describeLook(false);
    } else {
      delete document.body.dataset.pointOfView;
      delete document.body.dataset.pointerLocked;
      hint.flash('Retour au terrain : la tactique est inchangée.', 'info');
    }
    refreshPointOfViewButton();
    refreshCustomizeButton();
  });
  pointOfView.on('lockchange', ({ locked }) => {
    document.body.dataset.pointerLocked = String(locked);
    pointOfViewHelp.textContent = describeLook(locked);
  });
  // Une session AR ferme le point de vue : la vue appartient alors au téléphone.
  renderer.xr.addEventListener?.('sessionstart', () => {
    pointOfView.exit();
    customization.cancel();
    refreshPointOfViewButton();
    refreshCustomizeButton();
  });
  renderer.xr.addEventListener?.('sessionend', () => {
    refreshPointOfViewButton();
    refreshCustomizeButton();
  });

  // Aide au premier lancement, rouverte par « ? ».
  const onboarding = createOnboarding({
    card: document.getElementById('onboarding'),
    closeButton: document.getElementById('onboarding-close'),
    toggleButton: document.getElementById('help-toggle'),
    storage: readLocalStorage(),
    onOpen: () => workspaces.open('settings'),
  });

  // Raccourcis clavier : D, P, C, Échap, Ctrl+Z, Ctrl+Y.
  attachKeyboardShortcuts({
    target: window,
    actions: {
      mode: (mode) => {
        toolbar.disarmReset();
        interaction.setMode(mode);
      },
      undo: toolbar.undo,
      redo: toolbar.redo,
      // Échap : point de vue (le curseur verrouillé est rendu par le navigateur au premier Échap),
      // personnalisation (annulée), confirmation, geste, guide de prise en main, puis panneau de l'espace.
      cancel: () => pointOfView.exit() || customization.cancel() || toolbar.disarmReset() || cancelDraft() || closeOnboarding(onboarding) || navigation.close(),
    },
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
    // Légende de la lecture (phase 6) : note de l'entraîneur de l'image clé la plus proche.
    caption: document.getElementById('sequence-note'),
  });

  // Sauvegarde automatique : la tactique du dernier lancement est rétablie, une fois la scène et
  // les panneaux abonnés au tableau ; elle est enregistrée dans IndexedDB quand la page est masquée.
  // Un seul magasin IndexedDB : la tactique en cours et les tactiques enregistrées y ont chacune
  // leur clé.
  const tacticStore = createTacticStore(readIndexedDb());
  const autosave = await attachTacticAutosave({
    board,
    sequence,
    store: tacticStore,
    target: document,
  });

  // Tactiques enregistrées (phase 5) : l'entraîneur nomme la tactique en cours et la garde sur
  // l'appareil ; l'ouverture est vérifiée contre le tableau, puis passe par une commande annulable.
  // Export et import en fichier JSON : un fichier importé est vérifié contre le tableau en cours.
  const savedTactics = createSavedTacticsPanel({
    root: document.getElementById('saved-tactics-panel'),
    library: createTacticLibrary(tacticStore),
    capture: () => captureTactic(board, sequence),
    getReference: () => board.snapshot(),
    open: (name, tactic) => {
      if (!isValidTactic(tactic, board.snapshot())) {
        return false;
      }
      history.execute(new LoadSavedTacticCommand({ board, sequence, name, tactic }));
      return true;
    },
    onFeedback: ({ kind, message }) => hint.flash(message, kind),
  });

  // Bibliothèque de situations : chargée sans retarder le lancement ; une situation se charge par
  // une commande annulable, puis se joue avec la séquence.
  createScenarioPanel({
    root: document.getElementById('scenario-panel'),
    library: loadScenarioLibrary((url) => fetch(url)),
    load: (scenario) => {
      history.execute(new LoadScenarioCommand({ board, sequence, title: scenario.title, state: buildScenarioState(scenario) }));
      hint.flash(`Situation « ${scenario.title} » chargée : « Lecture » pour la jouer.`, 'success');
    },
  });

  // Réticule du hit test : en dehors du terrain, car il se déplace avant la pose.
  const reticle = createReticle();
  scene.add(reticle);

  document.getElementById('reset-view').addEventListener('click', resetView);
  document.getElementById('zoom-in').addEventListener('click', () => sceneContext.zoomView(0.85));
  document.getElementById('zoom-out').addEventListener('click', () => sceneContext.zoomView(1 / 0.85));

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
  // Après l'aide de base, qui efface tout retour en cours : le message reste lisible.
  if (autosave.restored) {
    hint.flash('Tactique précédente rétablie. « Réinitialiser » repart des formations de départ.', 'info');
  }
  // Lien de partage (phase 6) : une tactique reçue dans l'adresse s'ouvre après la sauvegarde
  // automatique, par une commande annulable ; « Annuler » rend la tactique rétablie juste avant.
  // Le lancement ne l'attend pas : la promesse est exposée aux tests (?debug).
  const sharedLink = openSharedLink(savedTactics);
  window.addEventListener('hashchange', () => openSharedLink(savedTactics));

  // Mode diagnostic à la demande : ?diagnostics ou l'espace Plus d'outils, sans rechargement.
  let diagnostics = isDiagnosticsRequested()
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
    zoneLayer,
    markingLayer,
    ...teamMeshes,
    // Après les pions : le point de vue masque l'instance du joueur regardé et place sa caméra.
    pointOfView,
  ];
  if (diagnostics) {
    tasks.push(diagnostics);
  }
  const diagnosticsToggle = document.getElementById('diagnostics-toggle');
  diagnosticsToggle.setAttribute('aria-pressed', String(Boolean(diagnostics)));
  if (diagnostics) diagnosticsToggle.textContent = 'Masquer les diagnostics';
  diagnosticsToggle.addEventListener('click', () => {
    const element = document.getElementById('diagnostics');
    if (!diagnostics) {
      diagnostics = new DiagnosticsPanel({ element, renderer, getXrState: () => describeXrState(arState) });
      tasks.push(diagnostics);
    } else {
      element.hidden = !element.hidden;
    }
    diagnosticsToggle.setAttribute('aria-pressed', String(!element.hidden));
    diagnosticsToggle.textContent = element.hidden ? 'Afficher les diagnostics' : 'Masquer les diagnostics';
  });

  // setAnimationLoop plutôt que requestAnimationFrame : la même boucle sert en session WebXR.
  await renderer.setAnimationLoop(createRenderLoop({
    renderer,
    scene,
    camera,
    controls,
    animator,
    getArPlacement: () => arState.placement,
    tasks,
    getViewCamera: () => pointOfView.viewCamera,
  }));
  document.body.classList.add('is-ready');
  return {
    sceneContext, arView, arState, board, animator, history, interaction, tacticalView, hint, raycaster, refreshGuidance,
    sequence, sequencePlayer, teamMeshes, onboarding, workspaces, navigation, autosave, offsideLayer, markingLayer,
    pointOfView, sharedLink, pitchZones, zoneLayer,
    get diagnostics() { return diagnostics; },
  };
}

/**
 * Stockage local du navigateur, ou null s'il est refusé (navigation privée, réglages) : l'aide au
 * premier lancement s'en passe.
 * @returns {Storage|null}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Interface HTML — aide au premier lancement
 */
function readLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Ouvre la tactique d'un lien de partage (« #tactique=… » dans l'adresse), puis retire le fragment
 * de l'adresse sans recharger la page : un rechargement ou un favori ne rouvre pas le lien une
 * seconde fois. Sans fragment de partage, rien ne se passe.
 * @param {ReturnType<typeof createSavedTacticsPanel>} savedTactics panneau des tactiques enregistrées
 * @returns {Promise<boolean>} vrai si une tactique a été ouverte
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Orchestration — ouverture d'un lien de partage
 */
async function openSharedLink(savedTactics) {
  const payload = readSharePayload(window.location.hash);
  if (payload === null) {
    return false;
  }
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  await savedTactics.ready;
  return savedTactics.importShared(payload);
}

/**
 * Fabrique IndexedDB du navigateur, ou null si elle est refusée (réglages, contexte restreint) :
 * l'application fonctionne alors sans sauvegarde automatique.
 * @returns {IDBFactory|null}
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Persistance — sauvegarde automatique de la tactique
 */
function readIndexedDb() {
  try {
    return window.indexedDB ?? null;
  } catch {
    return null;
  }
}

/**
 * Ferme l'aide au premier lancement si elle est ouverte (touche Échap), en rendant le focus au « ? ».
 * @param {ReturnType<typeof createOnboarding>} onboarding
 * @returns {boolean} vrai si l'aide a été fermée
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Interface HTML — aide au premier lancement
 */
function closeOnboarding(onboarding) {
  if (!onboarding.isOpen || !document.getElementById('onboarding').getClientRects().length) {
    return false;
  }
  onboarding.close({ restoreFocus: true });
  return true;
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
 *   hint: ReturnType<typeof createHintController>, refreshGuidance: (options?: {force?: boolean}) => void,
 *   onboarding?: ReturnType<typeof createOnboarding>, workspaces: WorkspaceController,
 *   navigation: ReturnType<typeof createWorkspaceNavigation>}} tactics
 *   interaction tactique (sprint 5), son rayon, l'aide de l'étape et l'aide au premier lancement
 * @returns {ArSession}
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Orchestration — branchement de la session AR sur la scène et l'interface
 */
function setUpArSession(sceneContext, arView, arState, renderMode, { interaction, raycaster, hint, refreshGuidance, onboarding, workspaces, navigation }) {
  const overlay = document.getElementById('overlay');
  const enterButton = document.getElementById('enter-ar');
  const exitButton = document.getElementById('exit-ar');
  const moveButton = document.getElementById('move-pitch');
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
    onboarding?.close();
    navigation.close();
    workspaces.setUnavailable(['formations', 'tactics', 'animation']);
    const placement = new SurfacePlacement({ session, referenceSpace, view: arView });
    placement.on('statechange', ({ state }) => {
      document.body.dataset.placement = state;
      moveButton.hidden = state !== 'placed';
      // Formations et outils tactiques servent sur le terrain posé, pas pendant la visée.
      const pitchShown = placement.pitchReady;
      workspaces.setUnavailable(pitchShown ? [] : ['formations', 'tactics', 'animation']);
      toolbar.hidden = !pitchShown;
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
    toolbar.hidden = true;
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
    workspaces.setUnavailable([]);
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
  const copyFlagLabel = copyFlagButton.querySelector('.button__label') ?? copyFlagButton;
  copyFlagButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(WEBGPU_FLAG_URL);
      copyFlagLabel.textContent = 'Adresse copiée';
    } catch {
      copyFlagLabel.textContent = WEBGPU_FLAG_URL;
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
  createWorkspaceStatus({ root: document.getElementById('overlay') });
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
    sceneContext, arView, arState, board, animator, history, interaction, tacticalView, hint, raycaster, refreshGuidance,
    sequence, sequencePlayer, teamMeshes, onboarding, workspaces, navigation, autosave, offsideLayer, markingLayer, sharedLink, pitchZones, zoneLayer,
  } = context;
  emulator?.setCanvas(sceneContext.renderer.domElement);
  const arSession = setUpArSession(sceneContext, arView, arState, renderMode, { interaction, raycaster, hint, refreshGuidance, onboarding, workspaces, navigation });
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
    get diagnostics() { return context.diagnostics; },
    workspaces,
    navigation,
    sequence,
    sequencePlayer,
    teamMeshes,
    autosave,
    offsideLayer,
    markingLayer,
    sharedLink,
    pitchZones,
    zoneLayer,
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