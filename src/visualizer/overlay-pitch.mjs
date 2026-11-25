/**
 * Terrain 3D du visualiseur de match, rendu en WebGPU dans un panneau posé sur la vidéo.
 *
 * Réutilise les modules de l'application AR : moteur de rendu WebGPU sans repli (webgpu.mjs), fond
 * transparent pour laisser voir la vidéo autour du plateau, terrain (pitch.mjs), fabrique de joueurs
 * et pions instanciés (players.mjs), ballon (ball.mjs), géométrie des flèches (tactical-arrows.mjs),
 * raycasting (raycasting.mjs) et reconnaissance du tap (pointer-input.mjs).
 *
 * Chaque équipe a une réserve de pions ; un pion suit une trajectoire tant qu'elle est visible,
 * puis retourne sous le plateau, où il est caché. Les positions viennent de l'analyse, en mètres,
 * converties à l'échelle de la maquette (config.mjs) : x le long du terrain, z vers la caméra
 * principale de la vidéo. Sans calibration pour l'image affichée, aucun joueur n'est posé.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BALL_RADIUS, PITCH_SCALE, PLAYER_SIZE } from '../config.mjs';
import { createBall } from '../ball.mjs';
import { createPitch } from '../pitch.mjs';
import { PlayerFactory } from '../players.mjs';
import { isTap } from '../pointer-input.mjs';
import { pickTarget, pointerToNdc, setRayFromCamera } from '../raycasting.mjs';
import { buildArrowGeometry } from '../tactical-arrows.mjs';
import { createWebGpuRenderer } from '../webgpu.mjs';
import { isPlausibleStep } from './analytics.mjs';
import { accentOnWhite } from './video-annotations.mjs';

/** Taille de la réserve de pions de chaque groupe. */
export const POOL_SIZES = Object.freeze({ 0: 20, 1: 20, unknown: 14, referee: 5 });

/** Couleurs des groupes sans équipe. */
export const NEUTRAL_COLORS = Object.freeze({ unknown: '#9aa0a6', referee: '#202327' });

/** Durée affichée par une flèche de déplacement : la distance parcourue en une seconde. */
export const ARROW_SECONDS = 1;

/** Longueur de référence de la géométrie des flèches, en mètres de maquette. */
const ARROW_UNIT = 0.04;

/** Place des pions inutilisés : sous le plateau opaque, invisibles d'au-dessus. */
const PARKING = new THREE.Vector3(0, -0.05, 0);

/** Nombre maximal de segments des traces. */
const MAX_TRAIL_SEGMENTS = 4096;

/**
 * Convertit une position de l'analyse (mètres, origine au centre) en point de la maquette.
 * @param {number[]} pitch [x, y] en mètres
 * @param {THREE.Vector3} [target]
 * @returns {THREE.Vector3}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — terrain 3D (repère)
 */
export function pitchToScene(pitch, target = new THREE.Vector3()) {
  return target.set(pitch[0] * PITCH_SCALE, 0, pitch[1] * PITCH_SCALE);
}

/**
 * Clé du groupe d'une personne : son équipe (0, 1), « referee » ou « unknown ».
 * @param {{role: string, team: number|null}} object
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — terrain 3D (pions)
 */
export function poolKey(object) {
  if (object.role === 'referee') {
    return 'referee';
  }
  return object.team === 0 || object.team === 1 ? String(object.team) : 'unknown';
}

/**
 * Réserve de pions d'un groupe, avec leurs maillages instanciés.
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — terrain 3D (pions)
 */
class PlayerPool {
  /**
   * @param {PlayerFactory} factory
   * @param {{id: string, color: number, cssColor: string, attacksPositiveX: boolean}} team
   * @param {number} size
   * @param {THREE.Object3D} parent
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — terrain 3D (pions)
   */
  constructor(factory, team, size, parent) {
    this.factory = factory;
    this.team = team;
    this.group = new THREE.Group();
    this.players = Array.from({ length: size }, () => {
      const player = factory.createPlayer({ team, number: 0, role: 'player' });
      player.position.copy(PARKING);
      player.visible = false;
      this.group.add(player);
      return player;
    });
    this.meshes = factory.createTeamMeshes(team, this.players);
    this.group.add(this.meshes.group);
    parent.add(this.group);
    /** @type {Map<number, number>} trajectoire → indice du pion */
    this.slots = new Map();
  }

  /**
   * Pose les pions des personnes visibles, range les autres sous le plateau.
   * @param {object[]} objects personnes de ce groupe, avec une position
   * @param {Map<number, number>} headings orientation de chaque trajectoire, en radians
   * @returns {THREE.Object3D[]} pions posés
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — terrain 3D (pions)
   */
  assign(objects, headings) {
    const wanted = new Set(objects.map((object) => object.id));
    for (const [trackId, slot] of this.slots) {
      if (!wanted.has(trackId)) {
        this.slots.delete(trackId);
        this.players[slot].visible = false;
        this.players[slot].position.copy(PARKING);
      }
    }
    const used = new Set(this.slots.values());
    const free = this.players.map((_, index) => index).filter((index) => !used.has(index));
    const placed = [];
    for (const object of objects) {
      let slot = this.slots.get(object.id);
      if (slot === undefined) {
        slot = free.shift();
        if (slot === undefined) {
          continue; // réserve pleine : la personne n'est pas dessinée
        }
        this.slots.set(object.id, slot);
        const label = this.players[slot].children.find((child) => child.isSprite);
        label.material = this.factory.getLabelMaterial(this.team, object.id);
      }
      const player = this.players[slot];
      pitchToScene(object.pitch, player.position);
      player.rotation.y = headings.get(object.id) ?? player.rotation.y;
      player.userData.trackId = object.id;
      player.visible = true;
      placed.push(player);
    }
    this.meshes.update();
    return placed;
  }
}

/**
 * Terrain 3D du visualiseur.
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — terrain 3D
 */
export class OverlayPitch {
  /**
   * Crée le moteur de rendu WebGPU et la scène dans le conteneur donné.
   * @param {HTMLElement} container
   * @param {(trackId: number|null) => void} onSelect appelé quand l'utilisateur touche un joueur
   *   (ou le vide)
   * @returns {Promise<OverlayPitch>}
   * @throws {import('../webgpu.mjs').WebGpuUnavailableError} sans WebGPU : aucun repli
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — terrain 3D
   */
  static async create(container, onSelect) {
    const renderer = await createWebGpuRenderer({ xrEnabled: false });
    return new OverlayPitch(container, renderer, onSelect);
  }

  /**
   * @param {HTMLElement} container
   * @param {import('three/webgpu').Renderer} renderer moteur WebGPU déjà initialisé
   * @param {(trackId: number|null) => void} onSelect
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — terrain 3D
   */
  constructor(container, renderer, onSelect) {
    this.container = container;
    this.renderer = renderer;
    this.onSelect = onSelect;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 10);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.2;
    this.controls.maxDistance = 2;
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(80);

    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x2b3a30, 2.2);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.4, 1.2, 0.5);
    this.pitchGroup = new THREE.Group();
    this.pitchGroup.add(createPitch(renderer));
    this.scene.add(hemisphere, sun, this.pitchGroup);

    this.factory = new PlayerFactory();
    this.pools = new Map();
    this.ball = createBall();
    this.ball.visible = false;
    this.pitchGroup.add(this.ball);
    this.#createMarkers();
    this.hitboxes = [];
    this.#listenForTaps();
    this.resize(container.clientWidth, container.clientHeight);
    this.resetView();
    renderer.setAnimationLoop(() => {
      this.controls.update();
      renderer.render(this.scene, this.camera);
    });
  }

  /**
   * Crée l'anneau de sélection, les flèches de déplacement (un maillage instancié), les traces
   * et les centres d'équipe.
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — terrain 3D (analyses)
   */
  #createMarkers() {
    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(PLAYER_SIZE.radius * 1.7, PLAYER_SIZE.radius * 2.3, 32),
      new THREE.MeshBasicMaterial({ color: 0xf4c542, side: THREE.DoubleSide }),
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.visible = false;

    const arrowCount = Object.values(POOL_SIZES).reduce((sum, size) => sum + size, 0);
    this.arrows = new THREE.InstancedMesh(
      buildArrowGeometry(ARROW_UNIT),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      arrowCount,
    );
    this.arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arrows.frustumCulled = false;
    this.arrows.count = 0;

    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_TRAIL_SEGMENTS * 6), 3).setUsage(THREE.DynamicDrawUsage));
    trailGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_TRAIL_SEGMENTS * 6), 3).setUsage(THREE.DynamicDrawUsage));
    trailGeometry.setDrawRange(0, 0);
    this.trails = new THREE.LineSegments(trailGeometry, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.trails.frustumCulled = false;

    this.centroids = [0, 1].map(() => {
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.006, 0.0095, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.visible = false;
      return marker;
    });
    this.pitchGroup.add(this.selectionRing, this.arrows, this.trails, ...this.centroids);
  }

  /**
   * Sélection au tap dans le panneau ; un glissé fait tourner la vue (OrbitControls).
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — terrain 3D (sélection)
   */
  #listenForTaps() {
    const canvas = this.renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down = null;
    canvas.addEventListener('pointerdown', (event) => {
      down = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    });
    canvas.addEventListener('pointerup', (event) => {
      const up = { x: event.clientX, y: event.clientY, time: event.timeStamp };
      if (!down || !isTap(down, up)) {
        return;
      }
      down = null;
      pointerToNdc(event.clientX, event.clientY, canvas.getBoundingClientRect(), ndc);
      setRayFromCamera(raycaster, ndc, this.camera);
      const hit = pickTarget(raycaster, this.hitboxes);
      this.onSelect(hit ? hit.object.userData.trackId : null);
    });
  }

  /**
   * Prépare les réserves de pions avec les couleurs des équipes de l'analyse.
   * @param {{id: number, color: string|null}[]} teams
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — terrain 3D (pions)
   */
  setTeams(teams) {
    for (const pool of this.pools.values()) {
      pool.meshes.dispose();
      pool.group.removeFromParent();
    }
    this.pools.clear();
    const colors = { ...NEUTRAL_COLORS };
    for (const team of teams) {
      colors[String(team.id)] = team.color ?? NEUTRAL_COLORS.unknown;
    }
    for (const [key, size] of Object.entries(POOL_SIZES)) {
      const css = colors[key] ?? NEUTRAL_COLORS.unknown;
      // Le pion garde la couleur du maillot ; son numéro (disque blanc) et ses traces, une couleur lisible.
      const team = { id: `vz-${key}`, color: new THREE.Color(css).getHex(), cssColor: accentOnWhite(css), attacksPositiveX: true };
      this.pools.set(key, new PlayerPool(this.factory, team, size, this.pitchGroup));
    }
  }

  /**
   * Met la scène à l'état d'un instant de la vidéo.
   * @param {object} sample résultat de TrackingStore.sample
   * @param {object} options
   * @param {number|null} options.selectedId trajectoire sélectionnée
   * @param {Map<number, {speed: number, vx: number, vy: number}>} options.velocities vitesses mesurées
   * @param {Map<number, {time: number, pitch: number[]}[]>} options.histories positions récentes
   * @param {boolean} options.showTrails
   * @param {boolean} options.showArrows
   * @param {Map<number, number[]>} options.centroids centre de chaque équipe
   * @returns {{placed: number, calibrated: boolean}}
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — terrain 3D
   */
  update(sample, { selectedId, velocities, histories, showTrails, showArrows, centroids }) {
    const calibrated = sample.frame?.calibration?.status === 'ok';
    const groups = new Map([...this.pools.keys()].map((key) => [key, []]));
    if (calibrated) {
      for (const object of sample.objects) {
        if (object.pitch) {
          groups.get(poolKey(object))?.push(object);
        }
      }
    }
    const headings = new Map();
    for (const [id, velocity] of velocities) {
      if (velocity.speed > 1) {
        headings.set(id, Math.atan2(-velocity.vy, velocity.vx));
      }
    }
    this.hitboxes = [];
    let placed = 0;
    let selected = null;
    for (const [key, pool] of this.pools) {
      for (const player of pool.assign(groups.get(key), headings)) {
        this.hitboxes.push(player.children.find((child) => child.name === 'hitbox'));
        placed += 1;
        if (player.userData.trackId === selectedId) {
          selected = player;
        }
      }
    }
    this.selectionRing.visible = Boolean(selected);
    if (selected) {
      this.selectionRing.position.set(selected.position.x, 0.0015, selected.position.z);
    }
    const ball = calibrated ? sample.ball : null;
    this.ball.visible = Boolean(ball?.pitch);
    if (ball?.pitch) {
      pitchToScene(ball.pitch, this.ball.position).setY(BALL_RADIUS);
    }
    this.#updateArrows(calibrated && showArrows ? sample.objects : [], velocities, selectedId);
    this.#updateTrails(calibrated && showTrails ? histories : new Map(), sample.objects, selectedId);
    for (const team of [0, 1]) {
      const centre = calibrated ? centroids.get(team) : null;
      const marker = this.centroids[team];
      marker.visible = Boolean(centre);
      if (centre) {
        pitchToScene(centre, marker.position).setY(0.001);
        marker.material.color.set(this.pools.get(String(team))?.team.cssColor ?? '#ffffff');
      }
    }
    return { placed, calibrated };
  }

  /**
   * Flèches de déplacement : la distance que chaque joueur parcourrait en une seconde à sa vitesse
   * mesurée, à partir de 1 m/s.
   * @param {object[]} objects
   * @param {Map<number, {speed: number, vx: number, vy: number}>} velocities
   * @param {number|null} selectedId
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — terrain 3D (analyses)
   */
  #updateArrows(objects, velocities, selectedId) {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    let count = 0;
    for (const object of objects) {
      const velocity = velocities.get(object.id);
      if (!object.pitch || !velocity || velocity.speed < 1 || count >= this.arrows.instanceMatrix.count) {
        continue;
      }
      const length = velocity.speed * ARROW_SECONDS * PITCH_SCALE;
      pitchToScene(object.pitch, position).setY(0.0012);
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-velocity.vy, velocity.vx));
      const thickness = object.id === selectedId ? 1.6 : 1;
      scale.set(length / ARROW_UNIT, 1, thickness);
      this.arrows.setMatrixAt(count, matrix.compose(position, rotation, scale));
      count += 1;
    }
    this.arrows.count = count;
    this.arrows.visible = count > 0; // pas d'appel de dessin vide
    this.arrows.instanceMatrix.needsUpdate = true;
  }

  /**
   * Traces : les positions mesurées des dernières secondes, reliées si elles sont proches dans le
   * temps ; la trace du joueur sélectionné est plus claire.
   * @param {Map<number, {time: number, pitch: number[]}[]>} histories
   * @param {object[]} objects personnes visibles (couleur de leur groupe)
   * @param {number|null} selectedId
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — terrain 3D (analyses)
   */
  #updateTrails(histories, objects, selectedId) {
    const positions = this.trails.geometry.attributes.position;
    const colors = this.trails.geometry.attributes.color;
    const color = new THREE.Color();
    const visible = new Map(objects.map((object) => [object.id, object]));
    let segment = 0;
    for (const [id, history] of histories) {
      const object = visible.get(id);
      if (!object) {
        continue;
      }
      color.set(this.pools.get(poolKey(object))?.team.cssColor ?? '#ffffff');
      if (id === selectedId) {
        color.lerp(new THREE.Color(0xf4c542), 0.6);
      }
      for (let index = 1; index < history.length && segment < MAX_TRAIL_SEGMENTS; index += 1) {
        const a = history[index - 1];
        const b = history[index];
        if (!isPlausibleStep(a, b)) {
          continue; // trou dans les données, ou saut d'un échange d'identifiants
        }
        positions.setXYZ(segment * 2, a.pitch[0] * PITCH_SCALE, 0.001, a.pitch[1] * PITCH_SCALE);
        positions.setXYZ(segment * 2 + 1, b.pitch[0] * PITCH_SCALE, 0.001, b.pitch[1] * PITCH_SCALE);
        colors.setXYZ(segment * 2, color.r, color.g, color.b);
        colors.setXYZ(segment * 2 + 1, color.r, color.g, color.b);
        segment += 1;
      }
    }
    this.trails.geometry.setDrawRange(0, segment * 2);
    this.trails.visible = segment > 0;
    positions.needsUpdate = true;
    colors.needsUpdate = true;
  }

  /**
   * Adapte le rendu à la taille du panneau.
   * @param {number} width
   * @param {number} height
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — terrain 3D
   */
  resize(width, height) {
    if (width <= 0 || height <= 0) {
      return;
    }
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Vue de départ : de la tribune principale, en surplomb, comme la caméra de télévision.
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — terrain 3D
   */
  resetView() {
    const distance = this.camera.aspect < 1.2 ? 0.95 : 0.72;
    this.camera.position.set(0, distance * 0.78, distance * 0.62);
    this.controls.target.set(0, 0, 0.01);
    this.controls.update();
  }

  /**
   * Indique si le moteur de rendu tourne sur WebGPU (vérification des tests).
   * @returns {boolean}
   * @responsable Bilel Khlif
   * @date 2026-11-17
   * @role Visualiseur de match — terrain 3D
   */
  get usesWebGpu() {
    return this.renderer.backend?.isWebGPUBackend === true;
  }
}
