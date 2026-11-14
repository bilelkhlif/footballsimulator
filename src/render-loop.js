/**
 * Boucle de rendu commune à la vue 3D et à la session AR (sprints 2 et 3).
 *
 * three.js appelle cette fonction à chaque image, par renderer.setAnimationLoop :
 * - hors AR, au rythme de l'écran (requestAnimationFrame de la fenêtre) : les contrôles
 *   d'orbite déplacent la caméra ;
 * - en AR, au rythme de la session WebXR (XRSession.requestAnimationFrame), avec l'image WebXR
 *   active (XRFrame) : three.js place la caméra selon la pose du téléphone, et la pose du
 *   terrain (hit test, réticule, ancre) est mise à jour. Les contrôles d'orbite ne doivent
 *   alors plus toucher à la caméra.
 * Dans les deux cas, l'image se termine par renderer.render : three.js encode les commandes
 * WebGPU et les soumet au processeur graphique, vers le canvas ou vers la couche de projection
 * de la session.
 */

/**
 * Aligne le nombre de couches de la cible de rendu XR sur le nombre de vues de la session.
 *
 * three.js r187 crée sa cible de rendu XR WebGPU avec deux couches, une par œil, comme pour un
 * casque. Un téléphone n'a qu'une vue : la passe de sortie (conversion des couleurs) dessinerait
 * alors aussi dans une deuxième couche, qui n'existe pas dans la texture de la session, et WebGPU
 * rejetterait la commande à chaque image. three.js désigne cette cible comme cible de sortie avant
 * d'appeler la boucle de rendu : on la redimensionne à ce moment, par l'API publique.
 * @param {{getOutputRenderTarget: () => ({width: number, height: number, depth: number,
 *   setSize: (width: number, height: number, depth: number) => void}|null),
 *   xr: {getCamera: () => {cameras: unknown[]}}}} renderer
 * @returns {boolean} vrai si la cible a été redimensionnée
 */
export function matchXrTargetToViews(renderer) {
  const target = renderer.getOutputRenderTarget();
  const viewCount = renderer.xr.getCamera().cameras.length;
  if (!target || viewCount === 0 || target.depth === viewCount) {
    return false;
  }
  target.setSize(target.width, target.height, viewCount);
  return true;
}

/**
 * Crée la fonction appelée à chaque image par renderer.setAnimationLoop.
 * @param {object} context
 * @param {{xr: {isPresenting: boolean}, render: (scene: object, camera: object) => void}} context.renderer
 *   moteur de rendu WebGPU (voir aussi matchXrTargetToViews)
 * @param {import('three').Scene} context.scene
 * @param {import('three').Camera} context.camera
 * @param {{update: () => void}} context.controls contrôles d'orbite
 * @param {() => ({update: (frame: XRFrame) => void}|null)} context.getArPlacement renvoie la pose
 *   du terrain de la session en cours (src/ar-surface.js), ou null hors session
 * @returns {(time: number, frame?: XRFrame) => void}
 */
export function createRenderLoop({ renderer, scene, camera, controls, getArPlacement }) {
  return (time, frame) => {
    if (renderer.xr.isPresenting) {
      matchXrTargetToViews(renderer);
      // XRFrame : n'est valable que pendant cet appel (pose du téléphone, hit test, ancres).
      const placement = getArPlacement();
      if (frame && placement) {
        placement.update(frame);
      }
    } else {
      controls.update();
    }
    renderer.render(scene, camera);
  };
}
