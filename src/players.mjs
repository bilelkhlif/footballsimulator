/**
 * Fabrique de joueurs (patron Factory, cahier §3.4) : crée un pion 3D selon
 * l'équipe (couleur, numéro, orientation).
 *
 * Géométries et matériaux sont partagés entre les 22 joueurs pour limiter la
 * mémoire et le coût de rendu sur mobile (cahier, §6.1).
 *
 * Sprint 6 : le pion visible est dessiné par instanciation (TeamMeshes) : une instance par joueur
 * dans quelques maillages par équipe, au lieu d'un maillage par joueur (cahier §6.3).
 * Depuis la phase 5, le pion en forme de gélule est remplacé par un footballeur complet
 * (src/player-model.mjs) : maillot et short à la couleur de l'équipe, peau, cheveux et chaussures
 * identiques pour tous. Le socle coloré et la flèche d'orientation restent à ses pieds. Six
 * maillages instanciés par équipe : 12 appels de dessin pour les 22 joueurs.
 * Le groupe de chaque joueur garde son identité (équipe, numéro, poste), son numéro et sa zone de
 * sélection : le raycasting, l'animation et la sélection ne changent pas.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';
import { PLAYER_SIZE } from './config.mjs';
import {
  createFootballerGeometries, createHairGeometries, createShirtNumberGeometry, FOOTBALLER_COLORS,
} from './player-model.mjs';
import { DEFAULT_APPEARANCE, HAIR_STYLE_IDS, hairColorToHex } from './player-appearance.mjs';

/** Matrice d'une instance cachée : échelle nulle (un joueur dans le maillage d'une autre coupe). */
const HIDDEN_INSTANCE = new THREE.Matrix4().makeScale(0, 0, 0);

/** Résolution de la texture d'un numéro, en pixels. */
const LABEL_TEXTURE_SIZE = 128;

/**
 * Dessine le numéro d'un joueur : un disque blanc cerclé de la couleur de l'équipe.
 * @param {{cssColor: string}} team
 * @param {number} number numéro du maillot
 * @returns {THREE.CanvasTexture}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Scène 3D — joueurs (patron Factory)
 */
function createLabelTexture(team, number) {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_TEXTURE_SIZE;
  canvas.height = LABEL_TEXTURE_SIZE;
  drawLabel(canvas, team.cssColor, number);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Dessine, ou redessine, le disque d'un numéro : blanc, cerclé et chiffré de la couleur donnée.
 * @param {HTMLCanvasElement} canvas
 * @param {string} cssColor couleur du cercle et du chiffre
 * @param {number} number numéro du maillot
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Scène 3D — joueurs (patron Factory)
 */
function drawLabel(canvas, cssColor, number) {
  const ctx = canvas.getContext('2d');
  const center = LABEL_TEXTURE_SIZE / 2;
  ctx.clearRect?.(0, 0, LABEL_TEXTURE_SIZE, LABEL_TEXTURE_SIZE);

  ctx.beginPath();
  ctx.arc(center, center, center - 7, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = cssColor;
  ctx.stroke();

  ctx.fillStyle = cssColor;
  ctx.font = `700 ${number >= 10 ? 56 : 66}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), center, center + 4);
}

/** Résolution de la texture d'un numéro de dos, en pixels. */
const SHIRT_NUMBER_TEXTURE_SIZE = 128;

/**
 * Numéro valable pour un maillot : entier de 1 à 99. Sinon, le dos reste sans numéro.
 * @param {unknown} number
 * @returns {boolean}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Scène 3D — numéros de dos
 */
export function isShirtNumber(number) {
  return Number.isInteger(number) && number >= 1 && number <= 99;
}

/**
 * Couleurs d'un numéro de dos lisible sur un maillot : chiffre blanc et liseré sombre sur un
 * maillot foncé, chiffre presque noir et liseré clair sur un maillot clair (blanc, jaune).
 * @param {number} kitColor couleur sRGB du maillot (0xRRGGBB)
 * @returns {{fill: string, outline: string}} couleurs CSS
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Scène 3D — numéros de dos
 */
export function shirtNumberInk(kitColor) {
  // THREE.Color garde ses composantes en linéaire : la luminance relative se calcule directement.
  const { r, g, b } = new THREE.Color(kitColor);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.35
    ? { fill: '#17181c', outline: 'rgba(255, 255, 255, 0.55)' }
    : { fill: '#ffffff', outline: 'rgba(0, 0, 0, 0.45)' };
}

/**
 * Dessine, ou redessine, un numéro de dos sur un fond transparent : chiffres pleins, larges et
 * serrés, comme un flocage de maillot, avec un fin liseré pour rester lisible.
 * @param {HTMLCanvasElement} canvas
 * @param {{fill: string, outline: string}} ink couleurs (shirtNumberInk)
 * @param {number} number numéro du maillot
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Scène 3D — numéros de dos
 */
function drawShirtNumber(canvas, ink, number) {
  const ctx = canvas.getContext('2d');
  const size = SHIRT_NUMBER_TEXTURE_SIZE;
  ctx.clearRect?.(0, 0, size, size);
  ctx.font = `800 ${number >= 10 ? 92 : 108}px "Arial Black", "Segoe UI", Roboto, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = ink.outline;
  ctx.fillStyle = ink.fill;
  const text = String(number);
  // Deux chiffres : légèrement resserrés pour tenir dans la largeur du dos.
  const scaleX = number >= 10 ? 0.86 : 1;
  ctx.save?.();
  ctx.translate?.(size / 2, size / 2 + 6);
  ctx.scale?.(scaleX, 1);
  ctx.strokeText(text, 0, 0);
  ctx.fillText(text, 0, 0);
  ctx.restore?.();
}

/**
 * Crée la flèche blanche posée au pied du joueur, qui indique son orientation.
 * La géométrie pointe vers +X, l'axe « avant » du joueur.
 * @param {number} radius rayon du pion
 * @returns {THREE.BufferGeometry}
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Scène 3D — joueurs (patron Factory)
 */
function createDirectionMarkerGeometry(radius) {
  const shape = new THREE.Shape();
  shape.moveTo(radius * 2.1, 0);
  shape.lineTo(radius * 1.3, radius * 0.6);
  shape.lineTo(radius * 1.3, -radius * 0.6);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0.0016, 0);
  return geometry;
}

/**
 * Fabrique des pions joueurs.
 * @responsable Bilel Khlif
 * @date 2026-11-05
 * @role Scène 3D — joueurs (patron Factory)
 */
export class PlayerFactory {
  /**
   * Prépare les géométries partagées et les caches de matériaux.
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Scène 3D — joueurs (patron Factory)
   */
  constructor() {
    const { radius, height, hitboxRadius } = PLAYER_SIZE;

    // Footballeur (phase 5) : quatre géométries partagées par les 22 joueurs, debout sur y = 0.
    const footballer = createFootballerGeometries(height);
    this.bodyGeometry = footballer.kit; // maillot et short, à la couleur de l'équipe
    this.skinGeometry = footballer.skin;
    footballer.hair.dispose(); // remplacée par les quatre coupes ci-dessous
    // Quatre coupes partagées (personnalisation) ; la couleur des cheveux vient de chaque instance.
    this.hairGeometries = createHairGeometries(height);
    this.bootsGeometry = footballer.boots;
    this.skinMaterial = new THREE.MeshStandardMaterial({ color: FOOTBALLER_COLORS.skin, roughness: 0.7, metalness: 0 });
    this.hairMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
    this.bootsMaterial = new THREE.MeshStandardMaterial({ color: FOOTBALLER_COLORS.boots, roughness: 0.5, metalness: 0.05 });

    this.baseGeometry = new THREE.CylinderGeometry(radius * 1.3, radius * 1.4, 0.0015, 20);
    this.baseGeometry.translate(0, 0.00075, 0);

    this.markerGeometry = createDirectionMarkerGeometry(radius);
    this.markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Zone de sélection invisible, plus large que le pion, pour le raycasting du sprint 5.
    this.hitboxGeometry = new THREE.CylinderGeometry(hitboxRadius, hitboxRadius, height * 1.5, 12);
    this.hitboxGeometry.translate(0, (height * 1.5) / 2, 0);
    this.hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });

    // Numéro dans le dos (phase 5) : un plan partagé, une texture par équipe et par numéro.
    this.shirtNumberGeometry = createShirtNumberGeometry(height);

    this.bodyMaterials = new Map();
    this.labelMaterials = new Map();
    this.shirtNumberMaterials = new Map();
  }

  /**
   * Renvoie le matériau du numéro de dos d'un joueur, créé une seule fois par équipe et par
   * numéro. Couleur de départ : lisible sur le maillot de l'équipe ; followTeamKits l'ajuste
   * ensuite au maillot choisi et au gardien.
   * @param {{id: string, color: number}} team
   * @param {number} number numéro valable (isShirtNumber)
   * @returns {THREE.MeshBasicMaterial}
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Scène 3D — numéros de dos
   */
  getShirtNumberMaterial(team, number) {
    const key = `${team.id}-${number}`;
    if (!this.shirtNumberMaterials.has(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = SHIRT_NUMBER_TEXTURE_SIZE;
      canvas.height = SHIRT_NUMBER_TEXTURE_SIZE;
      drawShirtNumber(canvas, shirtNumberInk(team.color ?? 0xffffff), number);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.shirtNumberMaterials.set(key, new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.3,
        depthWrite: false,
        toneMapped: false,
        // Imprimé sur le tissu : toujours devant le dos du maillot, jamais en conflit avec lui.
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }));
    }
    return this.shirtNumberMaterials.get(key);
  }

  /**
   * Redessine les numéros de dos d'une équipe pour qu'ils restent lisibles sur son maillot, et sur
   * celui du gardien (n° 1).
   * @param {string} teamId
   * @param {{kit: number, goalkeeper: number}} colors couleurs sRGB des maillots
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Scène 3D — numéros de dos
   */
  setShirtNumberColors(teamId, { kit, goalkeeper }) {
    for (const [key, material] of this.shirtNumberMaterials) {
      const [id, number] = key.split('-');
      if (id !== teamId || !material.map?.image) continue;
      drawShirtNumber(material.map.image, shirtNumberInk(Number(number) === 1 ? goalkeeper : kit), Number(number));
      material.map.needsUpdate = true;
    }
  }

  /**
   * Renvoie le matériau de la tenue d'un joueur (maillot, short et socle), partagé par toute l'équipe.
   * @param {{id: string, color: number}} team
   * @returns {THREE.MeshStandardMaterial}
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Scène 3D — joueurs (patron Factory)
   */
  getBodyMaterial(team) {
    if (!this.bodyMaterials.has(team.id)) {
      // Blanc : la couleur du maillot est celle de chaque instance (TeamMeshes.setKitColors), ce qui
      // donne au gardien un maillot distinct dans le même appel de dessin.
      this.bodyMaterials.set(team.id, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.05 }));
    }
    return this.bodyMaterials.get(team.id);
  }

  /**
   * Redessine les numéros d'une équipe dans une nouvelle couleur (changement de maillot).
   * @param {string} teamId
   * @param {string} cssColor couleur du cercle et du chiffre, lisible sur le disque blanc
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Scène 3D — joueurs (patron Factory)
   */
  setLabelColor(teamId, cssColor) {
    for (const [key, material] of this.labelMaterials) {
      const [id, number] = key.split('-');
      if (id !== teamId || !material.map?.image) continue;
      drawLabel(material.map.image, cssColor, Number(number));
      material.map.needsUpdate = true;
    }
  }

  /**
   * Renvoie le matériau du numéro d'un joueur, créé une seule fois par équipe et par numéro.
   * @param {{id: string, cssColor: string}} team
   * @param {number} number
   * @returns {THREE.SpriteMaterial}
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Scène 3D — joueurs (patron Factory)
   */
  getLabelMaterial(team, number) {
    const key = `${team.id}-${number}`;
    if (!this.labelMaterials.has(key)) {
      this.labelMaterials.set(key, new THREE.SpriteMaterial({ map: createLabelTexture(team, number) }));
    }
    return this.labelMaterials.get(key);
  }

  /**
   * Crée un joueur prêt à être placé sur le terrain, tourné vers le but adverse.
   * Son numéro est un sprite, toujours tourné vers la caméra, donc lisible sous tous les angles.
   * Depuis la phase 5, le même numéro est aussi imprimé dans le dos de son maillot.
   * Depuis le sprint 6, son pion est dessiné par les maillages instanciés de son équipe
   * (createTeamMeshes) : le groupe porte l'identité, la place, le numéro et la zone de sélection.
   * @param {{team: object, number: number, role: string, post?: string}} options rôle et poste normalisé (« MDC »)
   * @returns {THREE.Group} groupe du joueur ; `userData` décrit l'équipe, le numéro et le poste
   * @responsable Bilel Khlif
   * @date 2026-11-05
   * @role Scène 3D — joueurs (patron Factory)
   */
  createPlayer({ team, number, role, post = null }) {
    const player = new THREE.Group();
    player.name = `player-${team.id}-${number}`;
    player.userData = { type: 'player', teamId: team.id, number, role, post };

    const label = new THREE.Sprite(this.getLabelMaterial(team, number));
    label.scale.setScalar(PLAYER_SIZE.labelSize);
    label.position.y = PLAYER_SIZE.height + PLAYER_SIZE.labelSize * 0.62;

    const hitbox = new THREE.Mesh(this.hitboxGeometry, this.hitboxMaterial);
    hitbox.name = 'hitbox';

    player.add(label, hitbox);

    // Numéro imprimé dans le dos du maillot : enfant du joueur, il suit sa place et sa rotation.
    // Un joueur sans numéro valable garde un dos uni.
    if (isShirtNumber(number)) {
      const shirtNumber = new THREE.Mesh(this.shirtNumberGeometry, this.getShirtNumberMaterial(team, number));
      shirtNumber.name = 'shirt-number';
      player.add(shirtNumber);
    }
    player.rotation.y = team.attacksPositiveX ? 0 : Math.PI;
    return player;
  }

  /**
   * Crée les pions visibles d'une équipe : neuf maillages instanciés (socle, flèche, tenue, peau,
   * quatre coupes de cheveux, chaussures), dont l'instance i suit le joueur i. Socle et tenue
   * prennent la couleur du maillot de chaque joueur ; chaque joueur n'apparaît que dans le
   * maillage de sa coupe, avec sa couleur de cheveux ; peau et chaussures sont les mêmes pour tous.
   * @param {{id: string, color: number}} team
   * @param {THREE.Object3D[]} players joueurs de l'équipe (createPlayer), dans un groupe placé à
   *   l'origine du terrain, comme celui des maillages
   * @returns {TeamMeshes}
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Scène 3D — joueurs (patron Factory, instanciation)
   */
  createTeamMeshes(team, players) {
    return new TeamMeshes({
      team,
      players,
      parts: [
        [this.baseGeometry, this.getBodyMaterial(team), true],
        [this.markerGeometry, this.markerMaterial, false],
        [this.bodyGeometry, this.getBodyMaterial(team), true],
        [this.skinGeometry, this.skinMaterial, false],
        // Une coupe par maillage : chaque joueur n'est visible que dans celui de sa coupe.
        ...HAIR_STYLE_IDS.map((style) => [this.hairGeometries[style], this.hairMaterial, false, style]),
        [this.bootsGeometry, this.bootsMaterial, false],
      ],
    });
  }
}

/**
 * Pions instanciés d'une équipe. À chaque image (update), seuls les joueurs qui ont bougé ou
 * tourné réécrivent leur matrice d'instance, et la mémoire du processeur graphique n'est mise à
 * jour que dans ce cas : un terrain immobile ne coûte aucun envoi.
 * @responsable Bilel Khlif
 * @date 2026-11-16
 * @role Scène 3D — joueurs (instanciation)
 */
export class TeamMeshes {
  #players;
  #meshes;
  /** Dernière pose écrite de chaque joueur : x, y, z et angle autour de Y. */
  #written;
  /** Maillages qui prennent la couleur du maillot (socle et tenue). */
  #kitMeshes;
  /** Maillages des coupes de cheveux, avec la coupe de chacun. */
  #hairMeshes;
  /** Coupe de chaque joueur, par indice d'instance. */
  #hairStyles;

  /**
   * @param {object} options
   * @param {{id: string}} options.team
   * @param {THREE.Object3D[]} options.players joueurs de l'équipe
   * @param {Array<[THREE.BufferGeometry, THREE.Material, boolean?, string?]>} options.parts géométrie
   *   et matériau de chaque partie du pion, partagés avec la fabrique ; vrai si la partie prend la
   *   couleur du maillot (socle et tenue), faux sinon ; enfin, pour une coupe de cheveux, son
   *   identifiant (HAIR_STYLE_IDS) : seuls les joueurs de cette coupe y sont visibles
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Scène 3D — joueurs (instanciation)
   */
  constructor({ team, players, parts }) {
    this.group = new THREE.Group();
    this.group.name = `player-meshes-${team.id}`;
    this.#players = players;
    this.#meshes = parts.map(([geometry, material]) => {
      const mesh = new THREE.InstancedMesh(geometry, material, players.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Les joueurs se déplacent sur tout le terrain : la sphère englobante des instances de départ
      // ne vaut plus après un déplacement.
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    });
    this.#kitMeshes = this.#meshes.filter((mesh, index) => parts[index][2]);
    this.#hairMeshes = this.#meshes
      .map((mesh, index) => ({ mesh, style: parts[index][3] ?? null }))
      .filter(({ style }) => style !== null);
    this.#hairStyles = players.map(() => DEFAULT_APPEARANCE.hair);
    this.#written = new Float64Array(players.length * 4).fill(Number.NaN);
    // Couleurs d'instance créées avant le premier rendu : le matériau les prend en compte dès sa
    // compilation. Ensuite, un changement de maillot ne fait que réécrire ces couleurs.
    this.setKitColors({ kit: team.color ?? 0xffffff, goalkeeper: team.color ?? 0xffffff });
    for (const { number } of players.map((player) => player.userData)) {
      this.setAppearance(number, DEFAULT_APPEARANCE);
    }
    this.update();
  }

  /**
   * Couleur du maillot de chaque instance : celle de l'équipe, et une couleur distincte pour le
   * gardien (n° 1).
   * @param {{kit: number, goalkeeper: number}} colors couleurs sRGB (0xRRGGBB)
   * @responsable Iyed Rachdi
   * @date 2026-11-25
   * @role Scène 3D — joueurs (instanciation)
   */
  setKitColors({ kit, goalkeeper }) {
    const kitColor = new THREE.Color(kit);
    const keeperColor = new THREE.Color(goalkeeper);
    for (const mesh of this.#kitMeshes) {
      for (let index = 0; index < this.#players.length; index += 1) {
        mesh.setColorAt(index, this.#players[index].userData.number === 1 ? keeperColor : kitColor);
      }
      mesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Apparence d'un joueur, reconnu par son numéro : sa coupe (seul le maillage de cette coupe le
   * montre) et la couleur de ses cheveux. Les autres joueurs ne changent pas.
   * @param {number} number numéro du joueur
   * @param {{hair: string, color: string}} appearance coupe et couleur « #rrggbb »
   * @returns {boolean} faux si aucun joueur de l'équipe ne porte ce numéro
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Scène 3D — joueurs (instanciation)
   */
  setAppearance(number, { hair, color }) {
    const index = this.#players.findIndex((player) => player.userData.number === number);
    if (index < 0) {
      return false;
    }
    const hairColor = new THREE.Color(hairColorToHex(color));
    for (const { mesh } of this.#hairMeshes) {
      mesh.setColorAt(index, hairColor);
      mesh.instanceColor.needsUpdate = true;
    }
    if (this.#hairStyles[index] !== hair) {
      this.#hairStyles[index] = hair;
      this.#written[index * 4] = Number.NaN; // pose à réécrire : la coupe visible a changé
    }
    return true;
  }

  /**
   * Force la réécriture de toutes les instances à la prochaine image (après qu'un autre module les
   * a modifiées, comme le point de vue qui masque un joueur).
   * @responsable Iyed Rachdi
   * @date 2026-11-26
   * @role Scène 3D — joueurs (instanciation)
   */
  invalidate() {
    this.#written.fill(Number.NaN);
  }

  /**
   * Maillages instanciés de l'équipe (socle, flèche, tenue, peau, quatre coupes, chaussures).
   * @returns {THREE.InstancedMesh[]}
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Scène 3D — joueurs (instanciation)
   */
  get meshes() {
    return this.#meshes;
  }

  /**
   * Travail d'une image : recopie la pose des joueurs qui ont bougé dans leurs instances. Boucles
   * indexées, sans allocation.
   * @returns {boolean} vrai si au moins une instance a changé
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Scène 3D — joueurs (instanciation)
   */
  update() {
    const written = this.#written;
    const meshes = this.#meshes;
    let changed = false;
    for (let index = 0; index < this.#players.length; index += 1) {
      const player = this.#players[index];
      const { x, y, z } = player.position;
      const yaw = player.rotation.y;
      const offset = index * 4;
      if (written[offset] === x && written[offset + 1] === y && written[offset + 2] === z && written[offset + 3] === yaw) {
        continue;
      }
      written[offset] = x;
      written[offset + 1] = y;
      written[offset + 2] = z;
      written[offset + 3] = yaw;
      player.updateMatrix();
      for (let part = 0; part < meshes.length; part += 1) {
        meshes[part].setMatrixAt(index, player.matrix);
      }
      // Coupes : le joueur n'est visible que dans le maillage de la sienne.
      for (let hair = 0; hair < this.#hairMeshes.length; hair += 1) {
        const { mesh, style } = this.#hairMeshes[hair];
        if (style !== this.#hairStyles[index]) {
          mesh.setMatrixAt(index, HIDDEN_INSTANCE);
        }
      }
      changed = true;
    }
    if (changed) {
      for (let part = 0; part < meshes.length; part += 1) {
        meshes[part].instanceMatrix.needsUpdate = true;
      }
    }
    return changed;
  }

  /**
   * Libère les tampons d'instances et retire les maillages de la scène ; géométries et matériaux
   * restent à la fabrique, qui les partage.
   * @responsable Bilel Khlif
   * @date 2026-11-16
   * @role Scène 3D — joueurs (instanciation)
   */
  dispose() {
    for (const mesh of this.#meshes) {
      mesh.dispose();
    }
    this.group.removeFromParent();
  }
}