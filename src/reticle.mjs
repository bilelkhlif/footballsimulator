/**
 * Réticule de visée (sprint 3) : un anneau posé à plat sur la surface que vise le téléphone.
 *
 * Son matériau est écrit en TSL (Three Shading Language) : three.js traduit ces nœuds en WGSL,
 * le langage de shaders de WebGPU. L'opacité de l'anneau suit une sinusoïde du temps, calculée
 * sur le processeur graphique : le réticule pulse sans aucun code JavaScript par image.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { DoubleSide, Mesh, MeshBasicNodeMaterial, RingGeometry } from 'three/webgpu';
import { color, oscSine, time } from 'three/tsl';

/** Rayons intérieur et extérieur de l'anneau, en mètres. */
export const RETICLE_RADII = Object.freeze({ inner: 0.05, outer: 0.065 });

/** Couleur du réticule : l'or de l'interface, visible sur une table claire comme foncée. */
const RETICLE_COLOR = 0xe3a81a;

/** Fréquence de la pulsation, en battements par seconde. */
const PULSE_FREQUENCY = 0.8;

/**
 * Crée le réticule, masqué tant qu'aucune surface n'est visée.
 * Sa matrice est écrite directement depuis la pose du hit test (matrixAutoUpdate désactivé).
 * @returns {Mesh}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Réalité augmentée — réticule (matériau TSL)
 */
export function createReticle() {
  // L'anneau est couché dans le plan horizontal XZ : l'axe Y de la pose du hit test est la
  // normale de la surface.
  const geometry = new RingGeometry(RETICLE_RADII.inner, RETICLE_RADII.outer, 48).rotateX(-Math.PI / 2);
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
  material.colorNode = color(RETICLE_COLOR);
  // oscSine(t) varie de 0 à 1 : opacité entre 0,55 et 1.
  material.opacityNode = oscSine(time.mul(PULSE_FREQUENCY)).mul(0.45).add(0.55);

  const reticle = new Mesh(geometry, material);
  reticle.name = 'reticle';
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  return reticle;
}
