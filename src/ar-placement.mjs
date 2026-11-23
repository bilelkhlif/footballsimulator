/**
 * Calculs de placement du terrain en AR (sprints 2 et 3). Fonctions pures, sans three.js ni
 * WebXR : elles prennent et rendent des positions et des orientations simples, ce qui permet
 * de les tester sous Node.js.
 *
 * - Sprint 3 : le terrain est posé sur la surface réelle détectée par le hit test, à l'endroit
 *   du réticule, sa longueur face à l'utilisateur comme dans la vue « télévision » hors AR.
 * - Sprint 2, gardé en secours quand l'appareil n'a pas de hit test : le terrain est placé
 *   devant l'utilisateur et un peu plus bas, à peu près à hauteur de table.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { BOARD_THICKNESS } from './config.mjs';

/** Distance horizontale entre le téléphone et le centre du terrain placé devant lui, en mètres. */
export const PLACEMENT_DISTANCE = 0.9;

/** Distance verticale entre le téléphone et le terrain placé devant lui, en mètres. */
export const PLACEMENT_DROP = 0.5;

/**
 * Hauteur du gazon au-dessus de la surface détectée : le plateau, épais de 8 mm, repose
 * sur la table au lieu de s'y enfoncer.
 */
export const SURFACE_OFFSET = BOARD_THICKNESS;

/**
 * Normalise une direction horizontale ; sans direction définie (regard vertical, ou point
 * juste sous le téléphone), renvoie -Z, la direction du regard au départ d'une session.
 * @param {number} x
 * @param {number} z
 * @returns {{x: number, z: number}}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Réalité augmentée — calcul de la pose du terrain
 */
function horizontalDirection(x, z) {
  const length = Math.hypot(x, z);
  if (length < 1e-3) {
    return { x: 0, z: -1 };
  }
  return { x: x / length, z: z / length };
}

/**
 * Rotation autour de l'axe vertical qui amène l'axe -Z du terrain sur une direction
 * horizontale : l'utilisateur voit alors le terrain de côté, les Bleus attaquant vers sa droite.
 * @param {{x: number, z: number}} direction direction horizontale du regard, normalisée
 * @returns {number} angle en radians
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Réalité augmentée — calcul de la pose du terrain
 */
function yawFacing(direction) {
  return Math.atan2(-direction.x, -direction.z);
}

/**
 * Calcule la position et l'orientation du terrain devant l'utilisateur (sprint 2).
 * @param {{position: {x: number, y: number, z: number}, orientation: {x: number, y: number, z: number, w: number}}} viewerTransform
 *   pose de la vue dans l'espace local-floor (un XRRigidTransform)
 * @returns {{position: {x: number, y: number, z: number}, rotationY: number}} position du centre
 *   du terrain et rotation autour de l'axe vertical, en radians
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Réalité augmentée — calcul de la pose du terrain
 */
export function computePitchPlacement({ position, orientation }) {
  const { x, y, z, w } = orientation;

  // Direction du regard : l'axe -Z de la vue tourné par le quaternion d'orientation,
  // ramené à l'horizontale pour ignorer l'inclinaison du téléphone.
  const forward = horizontalDirection(-2 * (x * z + w * y), 2 * (x * x + y * y) - 1);

  return {
    position: {
      x: position.x + forward.x * PLACEMENT_DISTANCE,
      y: position.y - PLACEMENT_DROP,
      z: position.z + forward.z * PLACEMENT_DISTANCE,
    },
    rotationY: yawFacing(forward),
  };
}

/**
 * Calcule la pose du terrain posé sur une surface réelle (sprint 3).
 * @param {{x: number, y: number, z: number}} surfacePoint point de la surface sous le réticule,
 *   dans l'espace local-floor (position du résultat du hit test)
 * @param {{x: number, y: number, z: number}} viewerPosition position du téléphone, même espace
 * @returns {{position: {x: number, y: number, z: number}, rotationY: number}} centre du gazon,
 *   juste au-dessus de la surface, et rotation autour de l'axe vertical, en radians
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Réalité augmentée — calcul de la pose du terrain
 */
export function computeSurfacePlacement(surfacePoint, viewerPosition) {
  // Direction horizontale du téléphone vers le point visé : le terrain se présente de côté.
  const forward = horizontalDirection(surfacePoint.x - viewerPosition.x, surfacePoint.z - viewerPosition.z);
  return {
    position: { x: surfacePoint.x, y: surfacePoint.y + SURFACE_OFFSET, z: surfacePoint.z },
    rotationY: yawFacing(forward),
  };
}

/**
 * Quaternion d'une rotation autour de l'axe vertical, au format de WebXR (DOMPointInit).
 * Sert à créer l'ancre exactement à la pose du terrain.
 * @param {number} rotationY angle en radians
 * @returns {{x: number, y: number, z: number, w: number}}
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Réalité augmentée — calcul de la pose du terrain
 */
export function yawToQuaternion(rotationY) {
  return { x: 0, y: Math.sin(rotationY / 2), z: 0, w: Math.cos(rotationY / 2) };
}
