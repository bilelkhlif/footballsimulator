/**
 * Tests unitaires de src/xr-session.js, sans casque ni téléphone : le navigateur (navigator.xr),
 * la session WebXR et le gestionnaire XR de three.js sont remplacés par des doublures qui
 * reproduisent leur comportement documenté.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArSession, AR_ERROR_REASONS } from '../../src/xr-session.js';

/**
 * Doublure de XRSession : espace de référence, état de rendu et fin de session.
 * @param {{failReferenceSpace?: boolean}} [options]
 */
function createFakeSession({ failReferenceSpace = false } = {}) {
  const endListeners = [];
  return {
    ended: false,
    renderState: {},
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
 * Doublure du moteur de rendu : reproduit ce que fait renderer.xr dans three.js r186
 * (écoute de la fin de session, couche de rendu, événements sessionstart et sessionend).
 * @param {{failSetSession?: boolean}} [options]
 */
function createFakeRenderer({ failSetSession = false } = {}) {
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
      if (failSetSession) throw new Error('Création de la couche XRWebGLLayer impossible');
      session.renderState.baseLayer = { framebufferWidth: 1280 };
      this.isPresenting = true;
      this.dispatch('sessionstart');
    },
    setReferenceSpace(space) {
      this.calls.push(`setReferenceSpace(${space.type})`);
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
 * Enregistre les événements émis par une session AR, dans l'ordre.
 * @param {ArSession} arSession
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
  assert.equal(await new ArSession({ renderer: createFakeRenderer(), xr: null }).isSupported(), false);
  assert.equal(await new ArSession({ renderer: createFakeRenderer(), xr: createFakeXr(session, { supported: false }) }).isSupported(), false);
  assert.equal(await new ArSession({ renderer: createFakeRenderer(), xr: createFakeXr(session) }).isSupported(), true);
});

test('sans navigator.xr, l\'entrée en AR signale « unavailable » sans rien demander', async () => {
  // xr non fourni : le module lit navigator.xr, absent sous Node comme dans un navigateur sans WebXR.
  const arSession = new ArSession({ renderer: createFakeRenderer() });
  const events = recordEvents(arSession);

  assert.equal(await arSession.start(), null);
  assert.deepEqual(events.map((event) => event.type), ['sessionerror']);
  assert.equal(events[0].detail.reason, AR_ERROR_REASONS.UNAVAILABLE);
  assert.equal(arSession.isActive, false);
});

test('sans le mode immersive-ar, l\'entrée en AR signale « unsupported » sans demander de session', async () => {
  const xr = createFakeXr(createFakeSession(), { supported: false });
  const arSession = new ArSession({ renderer: createFakeRenderer(), xr });
  const events = recordEvents(arSession);

  assert.equal(await arSession.start(), null);
  assert.equal(events[0].detail.reason, AR_ERROR_REASONS.UNSUPPORTED);
  assert.equal(xr.requests.length, 0);
});

test('entrée réussie : session demandée, local-floor vérifié, puis session et espace confiés à three.js', async () => {
  const session = createFakeSession();
  const renderer = createFakeRenderer();
  const xr = createFakeXr(session);
  const overlayRoot = { id: 'overlay' };
  const arSession = new ArSession({ renderer, xr, overlayRoot });
  const events = recordEvents(arSession);

  assert.equal(await arSession.start(), session);

  assert.deepEqual(xr.requests, [{
    mode: 'immersive-ar',
    init: { requiredFeatures: ['local-floor'], optionalFeatures: ['dom-overlay'], domOverlay: { root: overlayRoot } },
  }]);
  assert.deepEqual(renderer.xr.calls, ['setReferenceSpaceType(local-floor)', 'setSession', 'setReferenceSpace(local-floor)']);
  assert.deepEqual(events.map((event) => event.type), ['sessionstart']);
  assert.equal(events[0].detail.session, session);
  assert.equal(events[0].detail.layer, 'XRWebGLLayer');
  assert.equal(events[0].detail.referenceSpace.type, 'local-floor');
  assert.equal(arSession.isActive, true);
  assert.equal(arSession.referenceSpace.type, 'local-floor');
});

test('sans racine d\'interface, la session ne demande pas le DOM Overlay', async () => {
  const xr = createFakeXr(createFakeSession());
  await new ArSession({ renderer: createFakeRenderer(), xr }).start();
  assert.deepEqual(xr.requests[0].init, { requiredFeatures: ['local-floor'] });
});

test('un double clic ne lance qu\'une seule demande de session', async () => {
  const session = createFakeSession();
  const xr = createFakeXr(session);
  const arSession = new ArSession({ renderer: createFakeRenderer(), xr });

  const [first, second] = await Promise.all([arSession.start(), arSession.start()]);

  assert.equal(xr.requests.length, 1);
  assert.equal(first, session);
  assert.equal(second, session);
});

test('session refusée par le navigateur : « rejected », sans toucher au rendu', async () => {
  const refusal = new DOMException('Accès à la caméra refusé', 'NotAllowedError');
  const renderer = createFakeRenderer();
  const arSession = new ArSession({ renderer, xr: createFakeXr(createFakeSession(), { rejectWith: refusal }) });
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
  const arSession = new ArSession({ renderer, xr: createFakeXr(session) });
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
  const arSession = new ArSession({ renderer, xr: createFakeXr(session) });
  const events = recordEvents(arSession);

  assert.equal(await arSession.start(), null);

  assert.deepEqual(events.map((event) => event.type), ['sessionerror']);
  assert.equal(events[0].detail.reason, AR_ERROR_REASONS.LAYER);
  assert.equal(session.ended, true, 'la session ne doit pas rester ouverte');
  assert.equal(renderer.xr.isPresenting, false);
  assert.equal(arSession.isActive, false);
});

test('sortie par end() : sessionend émis une fois, après la restauration du rendu par three.js', async () => {
  const session = createFakeSession();
  const renderer = createFakeRenderer();
  const arSession = new ArSession({ renderer, xr: createFakeXr(session) });
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
});

test('sortie décidée par le système (bouton retour) : sessionend est émis de la même façon', async () => {
  const session = createFakeSession();
  const arSession = new ArSession({ renderer: createFakeRenderer(), xr: createFakeXr(session) });
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
  const arSession = new ArSession({ renderer: createFakeRenderer(), xr });
  const events = recordEvents(arSession);

  await arSession.start();
  await arSession.end();
  assert.equal(await arSession.start(), sessions[1]);

  assert.deepEqual(events.map((event) => event.type), ['sessionstart', 'sessionend', 'sessionstart']);
  assert.equal(arSession.isActive, true);
});
