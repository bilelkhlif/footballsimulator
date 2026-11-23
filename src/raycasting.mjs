/**
 * Raycasting du sprint 5 (cahier §3.3) : le calcul commun à la souris, au doigt et à la réalité
 * augmentée.
 *
 * Un rayon a une origine O et une direction unitaire d : ses points sont P(t) = O + t·d, t ≥ 0.
 * - Hors AR, il part de la caméra et passe par le point touché : les coordonnées du pointeur sont
 *   ramenées entre -1 et 1 (coordonnées normalisées, NDC), puis THREE.Raycaster.setFromCamera
 *   les projette en sens inverse avec la caméra.
 * - En AR, il vient de la source d'entrée WebXR : sa pose dans l'espace de référence de la session
 *   (frame.getPose(inputSource.targetRaySpace, espace)) donne O, la position, et d, l'axe -Z tourné
 *   par l'orientation (spécification WebXR). Sur un téléphone, ce rayon part de la caméra et passe
 *   par le point touché. three.js reçoit le même espace local-floor : ses coordonnées « monde »
 *   sont celles de cet espace, et le rayon s'emploie tel quel.
 *
 * Le rayon est ensuite confronté aux zones de sélection invisibles des joueurs et du ballon
 * (pickTarget), ou au plan du gazon (intersectPitchPlane). Ce plan est celui du terrain tel qu'il
 * est posé : pitchGroup peut être déplacé et tourné par son ancre, et le point trouvé est ramené
 * dans le repère du terrain par l'inverse de sa matrice monde. Les objets de calcul sont réutilisés :
 * aucune allocation à chaque appel.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import * as THREE from 'three';

/** Direction d'un rayon WebXR dans son propre espace : l'axe -Z. */
const XR_RAY_DIRECTION = new THREE.Vector3(0, 0, -1);

/** Objets de calcul réutilisés. */
const scratch = {
  quaternion: new THREE.Quaternion(),
  normal: new THREE.Vector3(),
  origin: new THREE.Vector3(),
  plane: new THREE.Plane(),
  intersections: [],
};

/**
 * Convertit la position d'un pointeur en coordonnées normalisées (NDC) : -1 à gauche et en bas,
 * 1 à droite et en haut.
 * @param {number} clientX
 * @param {number} clientY
 * @param {{left: number, top: number, width: number, height: number}} rect rectangle du canvas
 * @param {THREE.Vector2} [target] vecteur réutilisé
 * @returns {THREE.Vector2}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Raycasting — coordonnées normalisées du pointeur
 */
export function pointerToNdc(clientX, clientY, rect, target = new THREE.Vector2()) {
  return target.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
}

/**
 * Oriente un rayon depuis la caméra, à travers un point de l'écran (vue 3D hors AR).
 * @param {THREE.Raycaster} raycaster
 * @param {THREE.Vector2} ndc coordonnées normalisées du pointeur
 * @param {THREE.Camera} camera caméra active
 * @returns {THREE.Raycaster}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Raycasting — rayon depuis la caméra
 */
export function setRayFromCamera(raycaster, ndc, camera) {
  camera.updateMatrixWorld();
  raycaster.setFromCamera(ndc, camera);
  return raycaster;
}

/**
 * Oriente un rayon depuis la pose d'une source d'entrée WebXR (targetRaySpace) : origine à sa
 * position, direction -Z tournée par son orientation.
 * @param {THREE.Raycaster} raycaster
 * @param {{position: {x: number, y: number, z: number}, orientation: {x: number, y: number, z: number, w: number}}} transform
 *   pose du rayon dans l'espace de référence de la session (XRRigidTransform)
 * @returns {THREE.Raycaster}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Raycasting — rayon WebXR (targetRaySpace)
 */
export function setRayFromXrPose(raycaster, { position, orientation }) {
  raycaster.ray.origin.set(position.x, position.y, position.z);
  scratch.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w).normalize();
  raycaster.ray.direction.copy(XR_RAY_DIRECTION).applyQuaternion(scratch.quaternion).normalize();
  return raycaster;
}

/**
 * Cherche la zone de sélection la plus proche sur le rayon : celle d'un joueur ou du ballon.
 * @param {THREE.Raycaster} raycaster
 * @param {THREE.Object3D[]} hitboxes zones de sélection, enfants directs de leur joueur ou du ballon
 * @returns {{object: THREE.Object3D, distance: number}|null} le joueur ou le ballon touché
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Raycasting — sélection des joueurs et du ballon
 */
export function pickTarget(raycaster, hitboxes) {
  const intersections = scratch.intersections;
  intersections.length = 0;
  raycaster.intersectObjects(hitboxes, false, intersections);
  const nearest = intersections[0];
  intersections.length = 0;
  return nearest ? { object: nearest.object.parent, distance: nearest.distance } : null;
}

/**
 * Indique si le rayon traverse la zone de sélection d'un objet donné, même derrière d'autres zones
 * (le ballon caché par un joueur, vu de côté en AR).
 * @param {THREE.Raycaster} raycaster
 * @param {THREE.Object3D[]} hitboxes zones de sélection, enfants directs de leur joueur ou du ballon
 * @param {(object: THREE.Object3D) => boolean} accept objet recherché (le joueur ou le ballon)
 * @returns {THREE.Object3D|null} l'objet trouvé sur le rayon, ou null
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Raycasting — sélection des joueurs et du ballon
 */
export function findTargetOnRay(raycaster, hitboxes, accept) {
  const intersections = scratch.intersections;
  intersections.length = 0;
  raycaster.intersectObjects(hitboxes, false, intersections);
  const found = intersections.find(({ object }) => accept(object.parent))?.object.parent ?? null;
  intersections.length = 0;
  return found;
}

/**
 * Point où le rayon rencontre le plan du gazon, dans le repère du terrain.
 *
 * Le plan passe par l'origine de pitchGroup, de normale n = son axe Y en coordonnées monde. Le
 * rayon le coupe en t = ((C - O) · n) / (d · n), s'il n'y est pas parallèle et si t ≥ 0
 * (THREE.Ray.intersectPlane). Le point monde P(t) est ensuite ramené dans le repère du terrain par
 * l'inverse de la matrice monde de pitchGroup : le résultat ne dépend ni de la position ni de
 * l'orientation de l'ancre.
 * @param {THREE.Raycaster} raycaster
 * @param {THREE.Object3D} pitchGroup groupe racine du terrain
 * @param {THREE.Vector3} [target] vecteur réutilisé
 * @returns {THREE.Vector3|null} point (x, 0, z) dans le repère du terrain, ou null si le rayon
 *   ne rencontre pas le plan
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Raycasting — plan du terrain et changement de repère
 */
export function intersectPitchPlane(raycaster, pitchGroup, target = new THREE.Vector3()) {
  pitchGroup.updateWorldMatrix(true, false);
  scratch.normal.set(0, 1, 0).transformDirection(pitchGroup.matrixWorld);
  scratch.origin.setFromMatrixPosition(pitchGroup.matrixWorld);
  scratch.plane.setFromNormalAndCoplanarPoint(scratch.normal, scratch.origin);
  if (raycaster.ray.intersectPlane(scratch.plane, target) === null) {
    return null;
  }
  pitchGroup.worldToLocal(target);
  target.y = 0; // sur le gazon, aux erreurs d'arrondi près
  return target;
}

/**
 * Ramène un point monde dans le repère du terrain.
 * @param {THREE.Object3D} pitchGroup groupe racine du terrain
 * @param {THREE.Vector3} worldPoint point en coordonnées monde (espace local-floor en AR)
 * @param {THREE.Vector3} [target] vecteur réutilisé
 * @returns {THREE.Vector3}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Raycasting — plan du terrain et changement de repère
 */
export function worldToPitch(pitchGroup, worldPoint, target = new THREE.Vector3()) {
  pitchGroup.updateWorldMatrix(true, false);
  return pitchGroup.worldToLocal(target.copy(worldPoint));
}

/**
 * Exprime un point du repère du terrain en coordonnées monde.
 * @param {THREE.Object3D} pitchGroup groupe racine du terrain
 * @param {{x: number, y?: number, z: number}} pitchPoint point dans le repère du terrain
 * @param {THREE.Vector3} [target] vecteur réutilisé
 * @returns {THREE.Vector3}
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Raycasting — plan du terrain et changement de repère
 */
export function pitchToWorld(pitchGroup, pitchPoint, target = new THREE.Vector3()) {
  pitchGroup.updateWorldMatrix(true, false);
  return pitchGroup.localToWorld(target.set(pitchPoint.x, pitchPoint.y ?? 0, pitchPoint.z));
}
