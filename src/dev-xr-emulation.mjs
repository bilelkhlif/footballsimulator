/**
 * Compléments de l'émulateur IWER pour le sprint 3 : développement et tests sur PC uniquement.
 * Ce module n'est chargé qu'avec ?iwer (voir src/dev-emulator.mjs) ; il n'est ni mis en cache par
 * le Service Worker ni utilisé sur téléphone.
 *
 * IWER 2.7.0 émule une session immersive-ar, mais ni la liaison WebXR/WebGPU (XRGPUBinding),
 * ni le hit test sans son module d'environnement synthétique (@iwer/sem). Ce module ajoute :
 * 1. XRGPUBinding émulé : la couche de projection est le canvas WebGPU de l'application, et
 *    three.js y dessine directement (vue unique, comme un téléphone) ;
 * 2. une horloge d'images : IWER ne cadence les images d'une session que si elle a une couche de
 *    base WebGL. Une couche vide, sur un canvas caché de 1 pixel, lui sert d'horloge : rien n'y
 *    est dessiné, et elle n'existe qu'avec ?iwer. Sur téléphone, aucune couche WebGL n'est créée ;
 * 3. une table virtuelle pour le hit test : un plan horizontal de 1,6 × 1 m, à 72 cm du sol et
 *    90 cm devant la position de départ. Le regard du téléphone émulé la touche ou non ;
 * 4. le toucher sur l'écran : un clic sur la scène appuie sur la gâchette de la manette droite
 *    d'IWER, qui produit l'événement select de WebXR, comme un toucher sur l'écran du téléphone.
 *    Depuis le sprint 5, la manette est d'abord orientée comme le rayon d'un toucher de téléphone :
 *    depuis la vue, à travers le point cliqué (aimControllerAt). L'application lit ce rayon dans
 *    targetRaySpace, comme sur un téléphone. Le clic est aussi proposé d'abord à l'interface par
 *    l'événement beforexrselect, comme le fait le DOM Overlay : s'il est annulé, aucun select
 *    n'est produit. Au survol, la manette suit le pointeur, pour l'aperçu des flèches ;
 * 5. la pose de départ : téléphone tenu à 1,35 m du sol, incliné de 35° vers la table ;
 * 6. une seule vue, comme l'écran d'un téléphone : IWER 2.7.0 rend toujours les deux yeux d'un
 *    casque (sans stéréo, la seconde vue a une largeur nulle) ; on ne garde que la première ;
 * 7. en mode test WebGL (?webgl) : un vrai framebuffer pour la couche WebGL de three.js, recopié
 *    dans le canvas à la fin de chaque image (voir provideLayerFramebuffer).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Table virtuelle de l'émulateur, dans l'espace local-floor, en mètres. */
export const VIRTUAL_TABLE = Object.freeze({ height: 0.72, centerX: 0, centerZ: -0.9, halfSizeX: 0.8, halfSizeZ: 0.5 });

/** Pose de départ du téléphone émulé : hauteur en mètres et inclinaison vers le bas en degrés. */
export const START_POSE = Object.freeze({ height: 1.35, pitchDownDegrees: 35 });

/** Durée d'appui de la gâchette émulée, en millisecondes : au moins une image de la session. */
const TRIGGER_PRESS_MS = 120;

/** Canvas WebGPU de l'application, cible de la couche de projection émulée. */
let targetCanvas = null;

/** Couche-horloge de chaque session (voir startFrameClock). */
const clockLayers = new WeakMap();

/** Framebuffer réel de chaque couche WebGL du mode test (voir provideLayerFramebuffer). */
const layerFramebuffers = new WeakMap();

/**
 * Fait tourner un vecteur par un quaternion unitaire (v' = q v q⁻¹).
 * @param {{x: number, y: number, z: number}} v
 * @param {{x: number, y: number, z: number, w: number}} q
 * @returns {{x: number, y: number, z: number}}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Développement — hit test émulé (géométrie)
 */
export function rotateByQuaternion(v, q) {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/**
 * Direction monde du rayon qui part d'une vue et passe par un point de l'écran.
 *
 * Avec une projection perspective P (matrice 4 × 4 en colonnes, comme XRView.projectionMatrix),
 * un point de la vue à la profondeur z = -1 donne clip.w = 1 et ndc.x = P[0]·x - P[8], ndc.y =
 * P[5]·y - P[9]. D'où la direction (x, y, -1) dans la vue, tournée ensuite par l'orientation de la
 * vue, puis normalisée.
 * @param {{x: number, y: number}} ndc point de l'écran en coordonnées normalisées (-1 à 1)
 * @param {ArrayLike<number>} projection matrice de projection de la vue
 * @param {{x: number, y: number, z: number, w: number}} orientation orientation de la vue
 * @returns {{x: number, y: number, z: number}} direction unitaire, en coordonnées monde
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Développement — toucher émulé (rayon à travers le point cliqué)
 */
export function rayDirectionThroughPixel(ndc, projection, orientation) {
  const inView = {
    x: (ndc.x + projection[8]) / projection[0],
    y: (ndc.y + projection[9]) / projection[5],
    z: -1,
  };
  const d = rotateByQuaternion(inView, orientation);
  const length = Math.hypot(d.x, d.y, d.z);
  return { x: d.x / length, y: d.y / length, z: d.z / length };
}

/**
 * Quaternion unitaire de la plus petite rotation qui amène l'axe -Z sur une direction unitaire d.
 * Pour a = (0, 0, -1) : q = normaliser(a × d, 1 + a · d), avec a × d = (d.y, -d.x, 0) et
 * 1 + a · d = 1 - d.z. Si d = +Z, la rotation est un demi-tour autour de X.
 * @param {{x: number, y: number, z: number}} direction direction unitaire
 * @returns {{x: number, y: number, z: number, w: number}}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Développement — toucher émulé (rayon à travers le point cliqué)
 */
export function quaternionFromForward(direction) {
  const w = 1 - direction.z;
  if (w < 1e-9) {
    return { x: 1, y: 0, z: 0, w: 0 };
  }
  const length = Math.hypot(direction.y, direction.x, w);
  return { x: direction.y / length, y: -direction.x / length, z: 0, w: w / length };
}

/**
 * Point où un rayon rencontre la table virtuelle, ou null s'il la manque.
 * @param {{x: number, y: number, z: number}} origin origine du rayon (position du téléphone)
 * @param {{x: number, y: number, z: number}} direction direction du rayon (regard du téléphone)
 * @param {typeof VIRTUAL_TABLE} [table]
 * @returns {{x: number, y: number, z: number}|null}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Développement — hit test émulé (géométrie)
 */
export function intersectVirtualTable(origin, direction, table = VIRTUAL_TABLE) {
  if (direction.y > -1e-6) {
    return null; // regard horizontal ou vers le haut : le rayon ne descend jamais vers la table
  }
  const distance = (table.height - origin.y) / direction.y;
  if (distance <= 0) {
    return null; // table au-dessus du téléphone
  }
  const x = origin.x + distance * direction.x;
  const z = origin.z + distance * direction.z;
  if (Math.abs(x - table.centerX) > table.halfSizeX || Math.abs(z - table.centerZ) > table.halfSizeZ) {
    return null; // le rayon passe à côté de la table
  }
  return { x, y: table.height, z };
}

/**
 * Applique une matrice 4 × 4 (en colonnes, comme XRRigidTransform.matrix) à un point.
 * @param {ArrayLike<number>} m
 * @param {{x: number, y: number, z: number}} p
 * @returns {{x: number, y: number, z: number}}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Développement — hit test émulé (géométrie)
 */
function transformPoint(m, p) {
  return {
    x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
  };
}

/**
 * Source de hit test émulée, rendue par session.requestHitTestSource.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Développement — hit test émulé
 */
class EmulatedHitTestSource {
  /**
   * @param {XRSpace} space espace d'origine du rayon (« viewer » dans l'application)
   * @param {XRReferenceSpace} floorSpace espace local-floor, où la table virtuelle est définie
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Développement — hit test émulé
   */
  constructor(space, floorSpace) {
    this.space = space;
    this.floorSpace = floorSpace;
    this.cancelled = false;
  }

  /**
   * Arrête la source, comme XRHitTestSource.cancel.
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Développement — hit test émulé
   */
  cancel() {
    this.cancelled = true;
  }

  /**
   * Résultats pour une image : la table virtuelle si le regard la touche, sinon rien.
   * @param {XRFrame} frame
   * @returns {EmulatedHitTestResult[]}
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Développement — hit test émulé
   */
  results(frame) {
    if (this.cancelled) {
      return [];
    }
    const viewerPose = frame.getPose(this.space, this.floorSpace);
    if (!viewerPose) {
      return [];
    }
    const { position, orientation } = viewerPose.transform;
    const point = intersectVirtualTable(position, rotateByQuaternion({ x: 0, y: 0, z: -1 }, orientation));
    return point ? [new EmulatedHitTestResult(frame, this, point)] : [];
  }
}

/**
 * Résultat de hit test émulé : un point de la table virtuelle, normale vers le haut.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Développement — hit test émulé
 */
class EmulatedHitTestResult {
  #frame;
  #source;
  #point;

  /**
   * @param {XRFrame} frame image où le hit test a eu lieu
   * @param {EmulatedHitTestSource} source source qui a produit le résultat
   * @param {{x: number, y: number, z: number}} point point touché, dans l'espace local-floor
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Développement — hit test émulé
   */
  constructor(frame, source, point) {
    this.#frame = frame;
    this.#source = source;
    this.#point = point;
  }

  /**
   * Pose du point dans l'espace demandé, comme XRHitTestResult.getPose.
   * @param {XRSpace} baseSpace
   * @returns {{transform: XRRigidTransform, emulatedPosition: boolean}|null}
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Développement — hit test émulé
   */
  getPose(baseSpace) {
    const floorInBase = this.#frame.getPose(this.#source.floorSpace, baseSpace);
    if (!floorInBase) {
      return null;
    }
    const position = transformPoint(floorInBase.transform.matrix, this.#point);
    return {
      transform: new XRRigidTransform(position, floorInBase.transform.orientation),
      emulatedPosition: false,
    };
  }

  /**
   * Les ancres de l'application sont créées par XRFrame.createAnchor, pas depuis le résultat.
   * @returns {Promise<never>}
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Développement — hit test émulé
   */
  createAnchor() {
    return Promise.reject(new DOMException('Utiliser XRFrame.createAnchor avec l’émulateur.', 'NotSupportedError'));
  }
}

/**
 * Couche de projection émulée : le canvas WebGPU de l'application, vue unique.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Développement — liaison WebXR/WebGPU émulée
 */
class EmulatedProjectionLayer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{colorFormat?: GPUTextureFormat}} init
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Développement — liaison WebXR/WebGPU émulée
   */
  constructor(canvas, init) {
    this.canvas = canvas;
    this.context = canvas.getContext('webgpu'); // le même contexte que celui configuré par three.js
    this.colorFormat = init.colorFormat;
    this.textureArrayLength = 1;
    this.ignoreDepthValues = true;
    this.fixedFoveation = 0;
  }

  /**
   * Largeur de la texture de la couche, en pixels : celle du canvas (XRProjectionLayer).
   * @returns {number}
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Développement — liaison WebXR/WebGPU émulée
   */
  get textureWidth() {
    return this.canvas.width;
  }

  /**
   * Hauteur de la texture de la couche, en pixels : celle du canvas (XRProjectionLayer).
   * @returns {number}
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Développement — liaison WebXR/WebGPU émulée
   */
  get textureHeight() {
    return this.canvas.height;
  }

  /**
   * Sans effet, comme XRProjectionLayer.destroy : le canvas reste à l'application.
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Développement — liaison WebXR/WebGPU émulée
   */
  destroy() {}
}

/**
 * Horloge d'images pour IWER : une couche WebGL vide, sur un canvas caché de 1 pixel.
 * @param {XRSession} session
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Développement — horloge d'images de l'émulateur
 */
function startFrameClock(session) {
  if (clockLayers.has(session)) {
    return;
  }
  const clockCanvas = document.createElement('canvas');
  clockCanvas.width = 1;
  clockCanvas.height = 1;
  clockCanvas.dataset.role = 'iwer-frame-clock';
  clockCanvas.style.display = 'none';
  document.body.append(clockCanvas);
  const gl = clockCanvas.getContext('webgl2');
  const clockLayer = new XRWebGLLayer(session, gl);
  clockLayers.set(session, clockLayer);
  clockSet.add(clockLayer);
  session.updateRenderState({ baseLayer: clockLayer });
  session.addEventListener('end', () => clockCanvas.remove(), { once: true });
}

/**
 * XRGPUBinding émulé (spécification WebXR/WebGPU Binding), limité à une vue.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Développement — liaison WebXR/WebGPU émulée
 */
class EmulatedXRGPUBinding {
  #session;

  /**
   * @param {XRSession} session
   * @param {GPUDevice} device périphérique WebGPU de three.js
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Développement — liaison WebXR/WebGPU émulée
   */
  constructor(session, device) {
    if (!session || !device) {
      throw new TypeError('XRGPUBinding : une session et un périphérique WebGPU sont requis.');
    }
    this.#session = session;
  }

  /**
   * Facteur d'échelle natif des couches de projection : 1, la taille du canvas.
   * @returns {number}
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Développement — liaison WebXR/WebGPU émulée
   */
  get nativeProjectionScaleFactor() {
    return 1;
  }

  /**
   * Format de couleur conseillé pour les couches : celui du canvas WebGPU du navigateur.
   * @returns {GPUTextureFormat}
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Développement — liaison WebXR/WebGPU émulée
   */
  getPreferredColorFormat() {
    return navigator.gpu.getPreferredCanvasFormat();
  }

  /**
   * @param {{colorFormat?: GPUTextureFormat}} [init]
   * @returns {EmulatedProjectionLayer}
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Développement — liaison WebXR/WebGPU émulée
   */
  createProjectionLayer(init = {}) {
    if (!targetCanvas) {
      throw new DOMException('Canvas de rendu de l’application inconnu.', 'InvalidStateError');
    }
    startFrameClock(this.#session);
    return new EmulatedProjectionLayer(targetCanvas, init);
  }

  /**
   * Texture où dessiner une vue : la texture courante du canvas, en entier.
   * @param {EmulatedProjectionLayer} layer
   * @returns {{colorTexture: GPUTexture, depthStencilTexture: null, viewport: object, getViewDescriptor: () => GPUTextureViewDescriptor}}
   * @responsable Bilel Khlif
   * @date 2026-11-14
   * @role Développement — liaison WebXR/WebGPU émulée
   */
  getViewSubImage(layer) {
    const colorTexture = layer.context.getCurrentTexture();
    return {
      colorTexture,
      depthStencilTexture: null,
      motionVectorTexture: null,
      viewport: { x: 0, y: 0, width: colorTexture.width, height: colorTexture.height },
      getViewDescriptor: () => ({ dimension: '2d', baseArrayLayer: 0, arrayLayerCount: 1, baseMipLevel: 0, mipLevelCount: 1 }),
    };
  }
}

/**
 * Cherche l'accesseur d'une propriété dans la chaîne des prototypes.
 * @param {object} object
 * @param {string} name
 * @returns {() => any}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Développement — rendu émulé du mode test WebGL
 */
function findGetter(object, name) {
  for (let proto = Object.getPrototypeOf(object); proto; proto = Object.getPrototypeOf(proto)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (descriptor?.get) {
      return descriptor.get;
    }
  }
  throw new Error(`Accesseur ${name} introuvable.`);
}

/**
 * Crée un framebuffer de la taille du canvas, avec couleur et profondeur, sans changer les
 * liaisons WebGL que three.js connaît.
 * @param {WebGL2RenderingContext} gl
 * @param {number} width
 * @param {number} height
 * @returns {{framebuffer: WebGLFramebuffer, renderbuffers: WebGLRenderbuffer[], width: number, height: number}}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Développement — rendu émulé du mode test WebGL
 */
function createLayerFramebuffer(gl, width, height) {
  const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const previousRenderbuffer = gl.getParameter(gl.RENDERBUFFER_BINDING);
  const framebuffer = gl.createFramebuffer();
  const color = gl.createRenderbuffer();
  const depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, color);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, width, height);
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
  gl.bindRenderbuffer(gl.RENDERBUFFER, previousRenderbuffer);
  return { framebuffer, renderbuffers: [color, depth], width, height };
}

/**
 * Mode test WebGL : IWER dessine la couche WebGL dans le framebuffer par défaut du canvas
 * (XRWebGLLayer.framebuffer vaut null). Un vrai navigateur fournit un framebuffer opaque non
 * nul, et le backend WebGL de three.js r187 l'exige : il s'en sert de clé dans une WeakMap.
 * Chaque couche WebGL de l'application reçoit donc un vrai framebuffer ; copyLayerToCanvas le
 * recopie dans le canvas à la fin de chaque image. La couche-horloge garde son framebuffer nul.
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Développement — rendu émulé du mode test WebGL
 */
function provideLayerFramebuffer() {
  const proto = globalThis.XRWebGLLayer.prototype;
  const readFramebuffer = Object.getOwnPropertyDescriptor(proto, 'framebuffer').get;
  Object.defineProperty(proto, 'framebuffer', {
    configurable: true,
    get() {
      const gl = this.context;
      if (isClockLayer(this) || !(gl instanceof WebGL2RenderingContext)) {
        return readFramebuffer.call(this);
      }
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      let target = layerFramebuffers.get(this);
      if (!target || target.width !== width || target.height !== height) {
        if (target) {
          gl.deleteFramebuffer(target.framebuffer);
          target.renderbuffers.forEach((renderbuffer) => gl.deleteRenderbuffer(renderbuffer));
        }
        target = createLayerFramebuffer(gl, width, height);
        layerFramebuffers.set(this, target);
      }
      return target.framebuffer;
    },
  });
}

/**
 * Indique si une couche est la couche-horloge d'une session.
 * @param {XRWebGLLayer} layer
 * @returns {boolean}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Développement — rendu émulé du mode test WebGL
 */
function isClockLayer(layer) {
  return clockSet.has(layer);
}

/** Couches-horloges, pour les reconnaître depuis la couche elle-même. */
const clockSet = new WeakSet();

/**
 * Recopie dans le canvas l'image que three.js a dessinée dans le framebuffer d'une couche WebGL,
 * en rétablissant ensuite les liaisons et le test de découpe (scissor) de three.js.
 * @param {XRWebGLLayer|null} layer couche de base de la session
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Développement — rendu émulé du mode test WebGL
 */
function copyLayerToCanvas(layer) {
  const target = layer && layerFramebuffers.get(layer);
  if (!target) {
    return;
  }
  const gl = layer.context;
  const previousRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
  const previousDraw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
  const scissor = gl.isEnabled(gl.SCISSOR_TEST);
  if (scissor) {
    gl.disable(gl.SCISSOR_TEST);
  }
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  gl.blitFramebuffer(0, 0, target.width, target.height, 0, 0, target.width, target.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousRead);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previousDraw);
  if (scissor) {
    gl.enable(gl.SCISSOR_TEST);
  }
}

/**
 * Prépare une session IWER : couches de projection visibles dans renderState, hit test sur la
 * table virtuelle, et clic sur la scène changé en select.
 * @param {XRSession} session
 * @param {object} xrDevice appareil émulé par IWER
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Développement — installation de l'émulation WebXR
 */
function prepareSession(session, xrDevice) {
  // renderState.layers : IWER ignore les couches ; on garde celles que three.js déclare. La couche
  // de l'horloge n'est pas montrée comme couche de rendu ; une vraie couche WebGL (mode test) l'est.
  const readRenderState = findGetter(session, 'renderState');
  const updateRenderState = session.updateRenderState.bind(session);
  let layers = [];
  session.updateRenderState = (state = {}) => {
    const { layers: requestedLayers, ...rest } = state;
    if (requestedLayers) {
      layers = [...requestedLayers];
    }
    updateRenderState(rest);
  };
  Object.defineProperty(session, 'renderState', {
    configurable: true,
    get() {
      const { depthNear, depthFar, inlineVerticalFieldOfView, baseLayer } = readRenderState.call(session);
      const appBaseLayer = baseLayer && baseLayer !== clockLayers.get(session) ? baseLayer : null;
      return { depthNear, depthFar, inlineVerticalFieldOfView, baseLayer: appBaseLayer, layers };
    },
  });

  // Vue affichée (pose et projection), relevée à chaque image : un clic devient un rayon à travers
  // le point cliqué de cette vue, exactement comme l'image que l'on voit.
  const view = { position: null, orientation: null, projection: new Float32Array(16) };
  let floorSpace = null;
  session.requestReferenceSpace('local-floor').then((space) => { floorSpace = space; }).catch(() => {});

  // Mode test WebGL : après chaque image de l'application, l'image de la couche va dans le canvas.
  const requestAnimationFrame = session.requestAnimationFrame.bind(session);
  session.requestAnimationFrame = (callback) => requestAnimationFrame((time, frame) => {
    recordView(frame, floorSpace, view);
    callback(time, frame);
    copyLayerToCanvas(readRenderState.call(session).baseLayer);
  });

  // Hit test : la table virtuelle, à la place du module d'environnement synthétique d'IWER.
  session.requestHitTestSource = async ({ space }) => {
    if (!session.enabledFeatures.includes('hit-test')) {
      throw new DOMException('La fonctionnalité hit-test n’a pas été accordée.', 'NotSupportedError');
    }
    const floorSpace = await session.requestReferenceSpace('local-floor');
    return new EmulatedHitTestSource(space, floorSpace);
  };

  // Toucher : comme le DOM Overlay, le geste est d'abord proposé à l'interface (beforexrselect) ;
  // sinon, la manette droite vise le point cliqué et sa gâchette est brièvement enfoncée.
  const onPointerDown = (event) => {
    const controller = xrDevice.controllers?.right;
    if (!controller) {
      return;
    }
    const beforeSelect = new Event('beforexrselect', { bubbles: true, cancelable: true });
    event.target.dispatchEvent(beforeSelect);
    if (beforeSelect.defaultPrevented) {
      return;
    }
    aimControllerAt(controller, event, view);
    controller.updateButtonValue('trigger', 1);
    setTimeout(() => controller.updateButtonValue('trigger', 0), TRIGGER_PRESS_MS);
  };
  // Survol : la manette suit le pointeur, comme une manette suivie en continu (aperçu des flèches).
  const onPointerMove = (event) => {
    const controller = xrDevice.controllers?.right;
    if (controller) {
      aimControllerAt(controller, event, view);
    }
  };
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  session.addEventListener('end', () => {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointermove', onPointerMove, true);
  }, { once: true });
}

/**
 * Relève la pose et la projection de la vue affichée, dans l'espace local-floor.
 * @param {XRFrame} frame image en cours
 * @param {XRReferenceSpace|null} floorSpace espace local-floor, une fois obtenu
 * @param {{position: object|null, orientation: object|null, projection: Float32Array}} view relevé
 *   mis à jour sur place
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Développement — toucher émulé (rayon à travers le point cliqué)
 */
function recordView(frame, floorSpace, view) {
  const first = floorSpace ? frame.getViewerPose(floorSpace)?.views?.[0] : null;
  if (!first) {
    return;
  }
  const { position, orientation } = first.transform;
  view.position = { x: position.x, y: position.y, z: position.z };
  view.orientation = { x: orientation.x, y: orientation.y, z: orientation.z, w: orientation.w };
  view.projection.set(first.projectionMatrix);
}

/**
 * Oriente une manette d'IWER comme le rayon d'un toucher de téléphone : origine à la vue,
 * direction à travers le point de l'écran sous le pointeur.
 * @param {{position: {set: Function}, quaternion: {set: Function}}} controller manette émulée
 * @param {{clientX: number, clientY: number}} event position du pointeur
 * @param {{position: object|null, orientation: object|null, projection: Float32Array}} view vue relevée
 * @returns {boolean} vrai si la manette a été orientée
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Développement — toucher émulé (rayon à travers le point cliqué)
 */
function aimControllerAt(controller, event, view) {
  if (!view.position) {
    return false;
  }
  const rect = (targetCanvas ?? document.documentElement).getBoundingClientRect();
  const ndc = {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
  };
  const q = quaternionFromForward(rayDirectionThroughPixel(ndc, view.projection, view.orientation));
  controller.position.set(view.position.x, view.position.y, view.position.z);
  controller.quaternion.set(q.x, q.y, q.z, q.w);
  return true;
}

/**
 * Installe les compléments, juste après xrDevice.installRuntime(), et avant la création du moteur
 * de rendu : three.js r187 vérifie la présence de XRGPUBinding une seule fois, à sa création.
 * @param {object} options
 * @param {object} options.xrDevice appareil émulé par IWER
 * @returns {{setCanvas: (canvas: HTMLCanvasElement) => void}} pour donner ensuite le canvas WebGPU
 *   de l'application, cible de la couche de projection émulée
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Développement — installation de l'émulation WebXR
 */
export function installXrEmulationExtras({ xrDevice }) {
  // Une seule vue, comme l'écran d'un téléphone : la première vue couvre alors tout l'écran.
  xrDevice.stereoEnabled = false;

  // Mode test WebGL : un vrai framebuffer par couche WebGL, comme dans un vrai navigateur.
  provideLayerFramebuffer();


  // Pose de départ : téléphone tenu au-dessus de la table, incliné vers elle (rotation autour de X).
  const halfAngle = -(START_POSE.pitchDownDegrees * Math.PI) / 360;
  xrDevice.position.set(0, START_POSE.height, 0);
  xrDevice.quaternion.set(Math.sin(halfAngle), 0, 0, Math.cos(halfAngle));

  // Liaison WebXR/WebGPU : la vraie, si Chrome l'expose, ne sait pas travailler avec une session
  // IWER ; elle est remplacée par l'émulation pendant toute la visite.
  globalThis.XRGPUBinding = EmulatedXRGPUBinding;

  // IWER a installé sa classe XRFrame : on en adapte deux méthodes.
  const frameProto = globalThis.XRFrame.prototype;

  // Vue unique : la pose du téléphone ne garde que la première vue.
  const getViewerPose = frameProto.getViewerPose;
  frameProto.getViewerPose = function getMonoViewerPose(referenceSpace) {
    const pose = getViewerPose.call(this, referenceSpace);
    if (!pose || pose.views.length <= 1) {
      return pose;
    }
    return { transform: pose.transform, emulatedPosition: pose.emulatedPosition, views: [pose.views[0]] };
  };

  // Résultats de hit test : nos sources répondent avec la table virtuelle.
  const getHitTestResults = frameProto.getHitTestResults;
  frameProto.getHitTestResults = function getEmulatedHitTestResults(source) {
    if (source instanceof EmulatedHitTestSource) {
      return source.results(this);
    }
    return getHitTestResults.call(this, source);
  };

  const xr = navigator.xr;
  const requestSession = xr.requestSession.bind(xr);
  xr.requestSession = async (mode, init) => {
    const session = await requestSession(mode, init);
    prepareSession(session, xrDevice);
    return session;
  };

  return {
    setCanvas(canvas) {
      targetCanvas = canvas;
    },
  };
}
