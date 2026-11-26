/**
 * Modèle 3D d'un footballeur, partagé par les 22 joueurs : tête, cheveux, cou, torse, deux bras,
 * deux mains, deux jambes et deux pieds, dans une posture debout, jambes légèrement écartées et bras
 * le long du corps. Le visage n'a aucun trait : une tête couleur peau, coiffée de cheveux courts.
 *
 * Le modèle est construit à partir de formes simples (cylindres, sphères, boîtes) regroupées en
 * quatre géométries, une par matière :
 * - `kit` : maillot (torse, épaules, manches) et short, à la couleur de l'équipe ;
 * - `skin` : tête, cou, bras, mains et jambes, même teint pour tous ;
 * - `hair` : même coupe et même couleur pour tous ;
 * - `boots` : chaussures.
 * Chaque géométrie est dessinée par un maillage instancié par équipe (src/players.mjs) : 22 joueurs
 * restent quelques appels de dessin, sans fichier 3D externe à charger.
 *
 * Repère : le joueur se tient debout sur y = 0, regarde vers +X (l'axe « avant » des pions), son
 * flanc gauche vers -Z. Toutes les dimensions sont des fractions de la hauteur du pion
 * (PLAYER_SIZE.height), pour garder le numéro, la zone de sélection et le point de vue en place.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';

/** Couleurs communes à tous les joueurs (sRGB). */
export const FOOTBALLER_COLORS = Object.freeze({
  skin: 0xc8916c,
  hair: 0x2a1c14,
  boots: 0x1c1c1e,
});

/** Hauteur des yeux du modèle, en fraction de sa hauteur (milieu de la tête). */
export const EYE_LEVEL = 0.925;

/**
 * Numéro dans le dos du maillot, en fractions de la hauteur du joueur : centré sur la colonne
 * vertébrale, entre les omoplates et la taille, juste derrière le dos du torse (le torse est un
 * cylindre aplati d'avant en arrière : rayon 0,104 H à cette hauteur, profondeur × 0,55).
 */
export const SHIRT_NUMBER = Object.freeze({
  size: 0.125,
  y: 0.665,
  depth: 0.104 * 0.55,
  gap: 0.006,
});

/**
 * Cylindre vertical, éventuellement aplati (sx, sz), entre deux hauteurs.
 * @param {number} H hauteur du joueur
 * @param {{top: number, bottom: number, from: number, to: number, x?: number, z?: number,
 *   sx?: number, sz?: number, tilt?: number, segments?: number}} spec rayons et hauteurs en
 *   fractions de H ; tilt : inclinaison autour de X, en radians (négative côté +Z : le bas du
 *   membre s'écarte du corps)
 * @returns {THREE.BufferGeometry}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Scène 3D — modèle du footballeur
 */
function limb(H, { top, bottom, from, to, x = 0, z = 0, sx = 1, sz = 1, tilt = 0, segments = 10 }) {
  const geometry = new THREE.CylinderGeometry(top * H, bottom * H, (to - from) * H, segments, 1);
  geometry.scale(sx, 1, sz);
  if (tilt) {
    geometry.rotateX(tilt);
  }
  geometry.translate(x * H, ((from + to) / 2) * H, z * H);
  return geometry;
}

/**
 * Sphère, éventuellement déformée, centrée en (x, y, z).
 * @param {number} H hauteur du joueur
 * @param {{r: number, x?: number, y: number, z?: number, sx?: number, sy?: number, sz?: number,
 *   width?: number, height?: number}} spec rayon et centre en fractions de H
 * @returns {THREE.BufferGeometry}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Scène 3D — modèle du footballeur
 */
function ball(H, { r, x = 0, y, z = 0, sx = 1, sy = 1, sz = 1, width = 12, height = 8 }) {
  const geometry = new THREE.SphereGeometry(r * H, width, height);
  geometry.scale(sx, sy, sz);
  geometry.translate(x * H, y * H, z * H);
  return geometry;
}

/**
 * Boîte centrée en (x, y, z).
 * @param {number} H hauteur du joueur
 * @param {{w: number, h: number, d: number, x?: number, y: number, z?: number}} spec longueur
 *   (vers l'avant), hauteur et largeur, en fractions de H
 * @returns {THREE.BufferGeometry}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Scène 3D — modèle du footballeur
 */
function block(H, { w, h, d, x = 0, y, z = 0 }) {
  const geometry = new THREE.BoxGeometry(w * H, h * H, d * H);
  geometry.translate(x * H, y * H, z * H);
  return geometry;
}

/**
 * Réunit plusieurs géométries en une seule (positions et normales), pour un seul maillage.
 * Les géométries d'origine sont libérées.
 * @param {THREE.BufferGeometry[]} parts
 * @returns {THREE.BufferGeometry}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Scène 3D — modèle du footballeur
 */
export function mergeParts(parts) {
  const flat = parts.map((part) => {
    const geometry = part.index ? part.toNonIndexed() : part;
    if (geometry !== part) {
      part.dispose();
    }
    return geometry;
  });
  const count = flat.reduce((total, geometry) => total + geometry.attributes.position.count, 0);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  let offset = 0;
  for (const geometry of flat) {
    positions.set(geometry.attributes.position.array, offset);
    normals.set(geometry.attributes.normal.array, offset);
    offset += geometry.attributes.position.count * 3;
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Construit les quatre géométries du footballeur, pour une hauteur donnée.
 * @param {number} height hauteur du joueur, en mètres de la maquette (PLAYER_SIZE.height)
 * @returns {{kit: THREE.BufferGeometry, skin: THREE.BufferGeometry, hair: THREE.BufferGeometry,
 *   boots: THREE.BufferGeometry}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Scène 3D — modèle du footballeur
 */
export function createFootballerGeometries(height) {
  const H = height;
  const kit = [];
  const skin = [];
  const boots = [];
  for (const side of [-1, 1]) {
    // Jambes légèrement écartées : cuisse, genou et tibia, puis la chaussure, pointe vers l'avant.
    skin.push(limb(H, { top: 0.043, bottom: 0.032, from: 0.27, to: 0.43, z: side * 0.066 }));
    skin.push(limb(H, { top: 0.031, bottom: 0.022, from: 0.045, to: 0.28, z: side * 0.069 }));
    boots.push(block(H, { w: 0.14, h: 0.045, d: 0.058, x: 0.028, y: 0.0225, z: side * 0.069 }));
    // Short : une jambe de short par cuisse.
    kit.push(limb(H, { top: 0.054, bottom: 0.05, from: 0.4, to: 0.52, z: side * 0.06 }));
    // Épaule, manche courte, bras et main, le long du corps, légèrement écartés.
    kit.push(ball(H, { r: 0.05, y: 0.772, z: side * 0.112, sx: 0.85, sy: 0.75 }));
    kit.push(limb(H, { top: 0.038, bottom: 0.034, from: 0.69, to: 0.79, z: side * 0.137, tilt: -side * 0.06 }));
    skin.push(limb(H, { top: 0.03, bottom: 0.026, from: 0.6, to: 0.71, z: side * 0.142, tilt: -side * 0.05 }));
    skin.push(limb(H, { top: 0.026, bottom: 0.021, from: 0.47, to: 0.61, x: 0.008, z: side * 0.147, tilt: -side * 0.03 }));
    skin.push(ball(H, { r: 0.03, x: 0.012, y: 0.44, z: side * 0.149, sx: 0.8, sy: 1.3, sz: 0.62 }));
  }
  // Bassin du short, puis torse du maillot, plus large aux épaules et aplati d'avant en arrière.
  kit.push(block(H, { w: 0.115, h: 0.08, d: 0.19, y: 0.505 }));
  kit.push(limb(H, { top: 0.112, bottom: 0.095, from: 0.52, to: 0.8, sx: 0.55, segments: 14 }));
  // Cou et tête, sans aucun trait du visage.
  skin.push(limb(H, { top: 0.03, bottom: 0.033, from: 0.79, to: 0.865 }));
  skin.push(ball(H, { r: 0.063, y: EYE_LEVEL - 0.01, sx: 1, sy: 1.1, sz: 0.95, width: 16, height: 12 }));

  // Cheveux courts : une calotte sur le haut du crâne, basculée vers l'arrière pour dégager le front.
  const hair = new THREE.SphereGeometry(0.068 * H, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
  hair.scale(1, 1.12, 0.98);
  hair.rotateZ(0.32);
  hair.translate(-0.004 * H, (EYE_LEVEL - 0.005) * H, 0);

  return { kit: mergeParts(kit), skin: mergeParts(skin), hair: mergeParts([hair]), boots: mergeParts(boots) };
}

/**
 * Plan du numéro dans le dos : carré, tourné vers l'arrière du joueur (-X), posé juste derrière le
 * maillot pour ne jamais disparaître dans le torse ni scintiller contre lui. Partagé par tous les
 * joueurs ; seul le matériau (la texture du chiffre) change d'un joueur à l'autre.
 * @param {number} height hauteur du joueur, en mètres de la maquette (PLAYER_SIZE.height)
 * @returns {THREE.PlaneGeometry}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Scène 3D — modèle du footballeur
 */
export function createShirtNumberGeometry(height) {
  const H = height;
  const geometry = new THREE.PlaneGeometry(SHIRT_NUMBER.size * H, SHIRT_NUMBER.size * H);
  // Le plan regarde vers +Z : un quart de tour l'oriente vers -X, le dos du joueur.
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(-(SHIRT_NUMBER.depth + SHIRT_NUMBER.gap) * H, SHIRT_NUMBER.y * H, 0);
  return geometry;
}