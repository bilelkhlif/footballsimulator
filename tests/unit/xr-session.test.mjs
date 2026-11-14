/**
 * Tests unitaires de src/xr-session.js, sans casque ni téléphone : le navigateur (navigator.xr),
 * la session WebXR et le gestionnaire XR de three.js sont remplacés par des doublures qui
 * reproduisent leur comportement documenté. Depuis le sprint 3, la session est rendue en WebGPU.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArSession, AR_ERROR_REASONS, RENDERING_APIS } from '../../src/xr-session.js';

/** Fonctionnalités accordées par un téléphone Android avec la liaison WebXR/WebGPU. */
const GRANTED_FEATURES = ['local-floor', 'webgpu', 'hit-test', 'anchors', 'viewer', 'local'];

/**
 * Doublure de XRSession : espace de référence, état de rendu, fonctionnalités et fin de session.
 * @param {{failReferenceSpace?: boolean}} [options]
 * @responsable Bilel Khlif
 * @date 2026-11-10
 * @role Tests unitaires (src/xr-session.js) — doublure
 */
function createFakeSession({ failReferenceSpace = false } = {}) {
  const endListeners = [];
  return {
    ended: false,
    renderState: {},
    enabledFeatures: GRANTED_FEATURES,
    addEventListener(type, listener) {
      if (type === 'end') endListeners.push(listener);
    },
    async requestReferenceSpace(type) {
      if (failReferenceSpace) throw new DOMException(`${type} indisponible`, 'NotSupportedError');
      return { type };
    },
    async end() {
      if (this.ended) throw new DOMException('Session déjà terminée', 'InvalidStateError');
      this.ended = true;
      endListeners.forEach((listener) => listener());
    },
  };
}

/**
 * Doublure du moteur de rendu : reproduit ce que fait renderer.xr dans three.js r187 avec WebGPU
 * (écoute de la fin de session, couche de projection, événements sessionstart et sessionend).
 * @param {{failSetSession?: boolean, webgl?: boolean}} [options] webgl : backend WebGL (mode test)
 * @responsable Bilel Khlif
 * @date 2026-11-10
 * @role Tests unitaires (src/xr-session.js) — doublure
 */
function createFakeRenderer({ failSetSession = false, webgl = false } = {}) {
  const listeners = new Map();
  const xr = {
    calls: [],
    isPresenting: false,
    referenceSpace: null,
    setReferenceSpaceType(type) {
      this.calls.push(`setReferenceSpaceType(${type})`);
    },
    async setSession(session) {
      this.calls.push('setSession');
      // Comme three.js : la fin de session est écoutée avant la création de la couche de rendu.
      session.addEventListener('end', () => {
        this.isPresenting = false;
        this.dispatch('sessionend');
      });
      if (failSetSession) throw new Error('Création de la couche de projection WebGPU impossible');
      if (webgl) {
        // Backend WebGL (mode test) : une couche XRWebGLLayer, couche de base de la session.
        session.renderState.baseLayer = { framebufferWidth: 1080 };
      } else {
        // Comme three.js r187 avec XRGPUBinding : une couche de projection, dans renderState.layers.
        session.renderState.layers = [{ textureWidth: 1080, textureHeight: 2340 }];
      }
      this.isPresenting = true;
      this.dispatch('sessionstart');
    },
    setReferenceSpace(space) {
      this.calls.push(`setReferenceSpace(${space?.type ?? null})`);
      this.referenceSpace = space;
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener({ type });
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
  return { xr };
}

/**
 * Doublure de navigator.xr.
 * @param {object} session session renvoyée par requestSession
 * @param {{supported?: boolean, rejectWith?: Error}} [options]
 * @responsable Bilel Khlif
 * @date 2026-11-10
 * @role Tests unitaires (src/xr-session.js) — doublure
 */
function createFakeXr(session, { supported = true, rejectWith = null } = {}) {
  return {
    requests: [],
    async isSessionSupported(mode) {
      return supported && mode === 'immersive-ar';
    },
    async requestSession(mode, init) {
      this.requests.push({ mode, init });
      if (rejectWith) throw rejectWith;
      return session;
    },
  };
}

/**
 * Crée une session AR dont le navigateur expose XRGPUBinding, sauf indication contraire.
 * @param {object} options options d'ArSession
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Tests unitaires (src/xr-session.js) — montage du test
 */
function createArSession(options) {
  return new ArSession({ hasGpuBinding: () => true, ...options });
}

/**
 * Enregistre les événements émis par une session AR, dans l'ordre.
 * @param {ArSession} arSession
 * @responsable Bilel Khlif
 * @date 2026-11-10
 * @role Tests unitaires (src/xr-session.js) — outil de vérification
 */
function recordEvents(arSession) {
  const events = [];
  for (const type of ['sessionstart', 'sessionend', 'sessionerror']) {
    arSession.on(type, (detail) => events.push({ type, detail }));
  }
  return events;
}

test('détection : sans WebXR, ou sans le mode immersive-ar, l\'AR est déclarée indisponible', async () => {
  const session = createFakeSession();
  assert.equal(await createArSession({ renderer: createFakeRenderer(), xr: null }).isSupported(), false);
  assert.equal(await createArSession({ renderer: createFakeRenderer(), xr: createFakeXr(session, { supported: false }) }).isSupported(), false);
  assert.equal(await createArSession({ renderer: createFakeRenderer(), xr: createFakeXr(session) }).isSupported(), true);
});

test('sans navigator.xr, l\'entrée en AR signale « unavailable » sans rien demander', async () => {
  // xr non fourni : le module lit navigator.xr, absent sous Node comme dans un navigateur sans WebXR.
  const arSession = createArSession({ renderer: createFakeRenderer() });
  const events = recordEvents(arSession);

  assert.equal(await arSession.start(), null);
  assert.deepEqual(events.map((event) => event.type), ['sessionerror']);
  assert.equal(events[0].detail.reason, AR_ERROR_REASONS.UNAVAILABLE);
  assert.equal(arSession.isActive, false);
});

test('sans le mode immersive-ar, l\'entrée en AR signale « unsupported » sans demander de session', async () => {
  const xr = createFakeXr(createFakeSession(), { supported: false });
  const arSession = createArSession({ renderer: createFakeRenderer(), xr });
  const events = recordEvents(arSession);

  assert.equal(await arSession.start(), null);
  assert.equal(events[0].detail.reason, AR_ERROR_REASONS.UNSUPPORTED);
  assert.equal(xr.requests.length, 0);
});

test('sans XRGPUBinding, l\'entrée en AR signale « webgpu-binding » : pas de session, pas de repli WebGL', async () => {
  const xr = createFakeXr(createFakeSession());
  const renderer = createFakeRenderer();
  const arSession = new ArSession({ renderer, xr, hasGpuBinding: () => false });
  const events = recordEvents(arSession);

  assert.equal(await arSession.start(), null);
  assert.deepEqual(events.map((event) => event.type), ['sessionerror']);
  assert.equal(events[0].detail.reason, AR_ERROR_REASONS.WEBGPU_BINDING);
  assert.equal(xr.requests.length, 0, 'aucune session ne doit être demandée');
  assert.deepEqual(renderer.xr.calls, []);
});

test('par défaut, la présence de XRGPUBinding est lue au moment de l\'entrée en AR', async () => {
  const xr = createFakeXr(createFakeSession());
  const arSession = new ArSession({ renderer: createFakeRenderer(), xr });
  const events = recordEvents(arSession);

  // Sous Node, XRGPUBinding n'existe pas : l'entrée échoue…
  assert.equal(await arSession.start(), null);
  assert.equal(events[0].detail.reason, AR_ERROR_REASONS.WEBGPU_BINDING);

  // … puis réussit quand la liaison apparaît, comme quand l'émulateur l'ajoute après le chargement.
  globalThis.XRGPUBinding = class XRGPUBinding {};
  try {
    assert.notEqual(await arSession.start(), null);
  } finally {
    delete globalThis.XRGPUBinding;
  }
});

test('entrée réussie : session WebGPU demandée, local-floor vérifié, puis session et espace confiés à three.js', async () => {
  const session = createFakeSession();
  const renderer = createFakeRenderer();
  const xr = createFakeXr(session);
  const overlayRoot = { id: 'overlay' };
  const arSession = createArSession({ renderer, xr, overlayRoot });
  const events = recordEvents(arSession);

  assert.equal(await arSession.start(), session);

  assert.deepEqual(xr.requests, [{
    mode: 'immersive-ar',
    init: {
      requiredFeatures: ['local-floor', 'webgpu'],
      optionalFeatures: ['hit-test', 'anchors', 'dom-overlay'],
      domOverlay: { root: overlayRoot },
    },
  }]);
  assert.deepEqual(renderer.xr.calls, ['setReferenceSpaceType(local-floor)', 'setSession', 'setReferenceSpace(local-floor)']);
  assert.deepEqual(events.map((event) => event.type), ['sessionstart']);
  assert.equal(events[0].detail.session, session);
  assert.equal(events[0].detail.layer, 'XRProjectionLayer');
  assert.equal(events[0].detail.rendering, 'webgpu');
  assert.deepEqual(events[0].detail.features, GRANTED_FEATURES);
  assert.equal(events[0].detail.referenceSpace.type, 'local-floor');
  assert.equal(arSession.isActive, true);
  assert.equal(arSession.referenceSpace.type, 'local-floor');
});

test('sans racine d\'interface, la session ne demande pas le DOM Overlay', async () => {
  const xr = createFakeXr(createFakeSession());
  await createArSession({ renderer: createFakeRenderer(), xr }).start();
  assert.deepEqual(xr.requests[0].init, {
    requiredFeatures: ['local-floor', 'webgpu'],
    optionalFeatures: ['hit-test', 'anchors'],
  });
});

test('un double clic ne lance qu\'une seule demande de session', async () => {
  const session = createFakeSession();
  const xr = createFakeXr(session);
  const arSession = createArSession({ renderer: createFakeRenderer(), xr });

  const [first, second] = await Promise.all([arSession.start(), arSession.start()]);

  assert.equal(xr.requests.length, 1);
  assert.equal(first, session);
  assert.equal(second, session);
});

test('session refusée par le navigateur : « rejected », sans toucher au rendu', async () => {
  const refusal = new DOMException('Accès à la caméra refusé', 'NotAllowedError');
  const renderer = createFakeRenderer();
  const arSession = createArSession({ renderer, xr: createFakeXr(createFakeSession(), { rejectWith: refusal }) });
  const events = recordEvents(arSession);

  assert.equal(await arSession.start(), null);

  assert.deepEqual(events.map((event) => event.type), ['sessionerror']);
  assert.equal(events[0].detail.reason, AR_ERROR_REASONS.REJECTED);
  assert.equal(events[0].detail.error, refusal);
  assert.deepEqual(renderer.xr.calls, []);
  assert.equal(arSession.isActive, false);
});

test('espace local-floor indisponible : « reference-space », et la session est refermée', async () => {
  const session = createFakeSession({ failReferenceSpace: true });
  const renderer = createFakeRenderer();
  const arSession = createArSession({ renderer, xr: createFakeXr(session) });
  const events = recordEvents(arSession);

  assert.equal(await arSession.start(), null);

  assert.deepEqual(events.map((event) => event.type), ['sessionerror']);
  assert.equal(events[0].detail.reason, AR_ERROR_REASONS.REFERENCE_SPACE);
  assert.equal(session.ended, true, 'la session ne doit pas rester ouverte');
  assert.equal(renderer.xr.calls.includes('setSession'), false);
  assert.equal(arSession.isActive, false);
});

test('échec de la couche de rendu : « layer », session refermée et aucun sessionend parasite', async () => {
  const session = createFakeSession();
  const renderer = createFakeRenderer({ failSetSession: true });
  const arSession = createArSession({ renderer, xr: createFakeXr(session) });
  const events = recordEvents(arSession);

  assert.equal(await arSession.start(), null);

  assert.deepEqual(events.map((event) => event.type), ['sessionerror']);
  assert.equal(events[0].detail.reason, AR_ERROR_REASONS.LAYER);
  assert.equal(session.ended, true, 'la session ne doit pas rester ouverte');
  assert.equal(renderer.xr.isPresenting, false);
  assert.equal(arSession.isActive, false);
});

test('sortie par end() : sessionend émis une fois, après la restauration du rendu, et espace retiré de three.js', async () => {
  const session = createFakeSession();
  const renderer = createFakeRenderer();
  const arSession = createArSession({ renderer, xr: createFakeXr(session) });
  const events = recordEvents(arSession);
  let presentingWhenNotified = null;
  arSession.on('sessionend', () => { presentingWhenNotified = renderer.xr.isPresenting; });

  await arSession.start();
  await arSession.end();
  renderer.xr.dispatch('sessionend'); // un événement tardif ne doit pas être signalé deux fois

  assert.deepEqual(events.map((event) => event.type), ['sessionstart', 'sessionend']);
  assert.equal(events[1].detail.session, session);
  assert.equal(presentingWhenNotified, false);
  assert.equal(arSession.isActive, false);
  assert.equal(arSession.referenceSpace, null);
  assert.equal(renderer.xr.listenerCount('sessionend'), 0, 'l\'observateur de three.js doit être retiré');
  // three.js r187 garderait sinon l'espace d'une session terminée pour la suivante.
  assert.equal(renderer.xr.calls.at(-1), 'setReferenceSpace(null)');
  assert.equal(renderer.xr.referenceSpace, null);
});

test('sortie décidée par le système (bouton retour) : sessionend est émis de la même façon', async () => {
  const session = createFakeSession();
  const arSession = createArSession({ renderer: createFakeRenderer(), xr: createFakeXr(session) });
  const events = recordEvents(arSession);

  await arSession.start();
  await session.end(); // fin décidée hors de l'application

  assert.deepEqual(events.map((event) => event.type), ['sessionstart', 'sessionend']);
  assert.equal(arSession.isActive, false);
});

test('après une sortie, une nouvelle session peut être ouverte', async () => {
  const sessions = [createFakeSession(), createFakeSession()];
  const xr = createFakeXr(null);
  xr.requestSession = async function requestSession(mode, init) {
    this.requests.push({ mode, init });
    return sessions[this.requests.length - 1];
  };
  const arSession = createArSession({ renderer: createFakeRenderer(), xr });
  const events = recordEvents(arSession);

  await arSession.start();
  await arSession.end();
  assert.equal(await arSession.start(), sessions[1]);

  assert.deepEqual(events.map((event) => event.type), ['sessionstart', 'sessionend', 'sessionstart']);
  assert.equal(arSession.isActive, true);
});

test('mode test WebGL : ni fonctionnalité webgpu ni XRGPUBinding exigées, session rendue par une couche WebGL', async () => {
  const session = createFakeSession();
  session.enabledFeatures = ['local-floor', 'hit-test', 'anchors', 'viewer', 'local'];
  const xr = createFakeXr(session);
  const arSession = new ArSession({
    renderer: createFakeRenderer({ webgl: true }),
    xr,
    hasGpuBinding: () => false, // comme Chrome 138 sur Android 9 : pas de liaison WebXR/WebGPU
    renderingApi: RENDERING_APIS.WEBGL,
  });
  const events = recordEvents(arSession);

  assert.equal(await arSession.start(), session);

  assert.deepEqual(xr.requests[0].init, {
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['hit-test', 'anchors'],
  });
  assert.equal(events[0].type, 'sessionstart');
  assert.equal(events[0].detail.rendering, RENDERING_APIS.WEBGL);
  assert.equal(events[0].detail.layer, 'XRWebGLLayer');
});

test('par défaut, la session est rendue en WebGPU : le mode test WebGL n\'est jamais choisi seul', async () => {
  const xr = createFakeXr(createFakeSession());
  const arSession = new ArSession({ renderer: createFakeRenderer(), xr, hasGpuBinding: () => false });
  const events = recordEvents(arSession);

  // Sans XRGPUBinding, la session WebGPU échoue : elle ne bascule pas sur une couche WebGL.
  assert.equal(await arSession.start(), null);
  assert.equal(events[0].detail.reason, AR_ERROR_REASONS.WEBGPU_BINDING);
  assert.equal(xr.requests.length, 0);
});
