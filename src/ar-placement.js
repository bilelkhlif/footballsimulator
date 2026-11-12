/**
 * Placement du terrain devant l'utilisateur au début d'une session AR (sprint 2).
 *
 * Sans hit test (sprint 3), le terrain ne peut pas encore être posé sur la vraie table.
 * Il est placé d'après la pose du téléphone au premier rendu de la session : à l'horizontale,
 * devant l'utilisateur et un peu plus bas, à peu près à hauteur de table, sa longueur face
 * à l'utilisateur comme dans la vue « télévision » hors AR.
 */

/** Distance horizontale entre le téléphone et le centre du terrain, en mètres. */
export const PLACEMENT_DISTANCE = 0.9;

/** Distance verticale entre le téléphone et le terrain, en mètres. */
export const PLACEMENT_DROP = 0.5;

/**
 * Calcule la position et l'orientation du terrain devant l'utilisateur.
 * @param {{position: {x: number, y: number, z: number}, orientation: {x: number, y: number, z: number, w: number}}} viewerTransform
 *   pose de la vue dans l'espace local-floor (un XRRigidTransform)
 * @returns {{position: {x: number, y: number, z: number}, rotationY: number}} position du centre
 *   du terrain et rotation autour de l'axe vertical, en radians
 */
export function computePitchPlacement({ position, orientation }) {
  const { x, y, z, w } = orientation;

  // Direction du regard : l'axe -Z de la vue tourné par le quaternion d'orientation,
  // ramené à l'horizontale pour ignorer l'inclinaison du téléphone.
  let forwardX = -2 * (x * z + w * y);
  let forwardZ = 2 * (x * x + y * y) - 1;
  const horizontalLength = Math.hypot(forwardX, forwardZ);
  if (horizontalLength < 1e-3) {
    // Téléphone pointé droit vers le sol : la direction n'est pas définie, on garde -Z.
    forwardX = 0;
    forwardZ = -1;
  } else {
    forwardX /= horizontalLength;
    forwardZ /= horizontalLength;
  }

  return {
    position: {
      x: position.x + forwardX * PLACEMENT_DISTANCE,
      y: position.y - PLACEMENT_DROP,
      z: position.z + forwardZ * PLACEMENT_DISTANCE,
    },
    // Rotation qui amène l'axe -Z du terrain sur la direction du regard : l'utilisateur voit
    // le terrain de côté, les Bleus attaquant vers sa droite.
    rotationY: Math.atan2(-forwardX, -forwardZ),
  };
}
