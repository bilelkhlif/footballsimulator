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
 * Dans les deux cas, les déplacements de joueurs en cours (changement de formation, sprint 4 ;
 * déplacement à la main, sprint 5) avancent. Viennent ensuite les tâches de l'image (sprint 5) :
 * l'aperçu d'une flèche suit le rayon de la source d'entrée WebXR, l'anneau de sélection suit son
 * joueur, et le mode diagnostic compte l'image. L'image se termine par renderer.render : three.js
 * encode les commandes WebGPU et les soumet au processeur graphique, vers le canvas ou vers la
 * couche de projection de la session.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/**
 * Aligne le nombre de couches de la cible de rendu XR sur le nombre de vues de la session.
 *
 * three.js r187 crée sa cible de rendu XR WebGPU avec deux couches, une par œil, comme pour un
 * casque. Un téléphone n'a qu'une vue : la passe de sortie (conversion des couleurs) dessinerait
 * alors aussi dans une deuxième couche, qui n'existe pas dans la texture de la session, et WebGPU
 * rejetterait la commande à chaque image. three.js désigne cette cible comme cible de sortie avant
 * d'appeler la boucle de rendu : on la redimensionne à ce moment, par l'API publique.
 * En mode test WebGL, la cible XR de three.js a déjà une couche par vue : rien à faire.
 * @param {{backend?: {isWebGPUBackend?: boolean}, getOutputRenderTarget: () => ({width: number,
 *   height: number, depth: number, setSize: (width: number, height: number, depth: number) => void}|null),
 *   xr: {getCamera: () => {cameras: unknown[]}}}} renderer
 * @returns {boolean} vrai si la cible a été redimensionnée
 * @responsable Bilel Khlif
 * @date 2026-11-14
 * @role Boucle de rendu — cible de rendu XR en WebGPU
 */
export function matchXrTargetToViews(renderer) {
  if (renderer.backend?.isWebGPUBackend !== true) {
    return false;
  }
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
 * @param {{update: () => void}} [context.animator] déplacements de joueurs (src/formation-transition.mjs)
 * @param {() => (import('three').Camera|null)} [context.getViewCamera] caméra qui remplace celle de
 *   la vue normale hors AR, ou null (point de vue d'un joueur, src/point-of-view.mjs)
 * @param {() => ({update: (frame: XRFrame) => void}|null)} context.getArPlacement renvoie la pose
 *   du terrain de la session en cours (src/ar-surface.mjs), ou null hors session
 * @param {Array<{update: (time: number, frame?: XRFrame) => void, beforeFrame?: (time: number) => void, afterRender?: (time: number) => void}>} [context.tasks]
 *   tâches de chaque image (sprint 5) : update est appelée dans l'ordre après les déplacements et
 *   avant le rendu ; afterRender, si elle existe, juste après le rendu. three.js remet à zéro ses
 *   statistiques (renderer.info) au début de chaque image : c'est après le rendu qu'elles décrivent
 *   l'image dessinée. beforeFrame, si elle existe, est appelée au tout début de l'image (sprint 6 :
 *   mesure du temps de processeur central de l'image entière).
 * @returns {(time: number, frame?: XRFrame) => void}
 * @responsable Bilel Khlif
 * @date 2026-11-09
 * @role Boucle de rendu — travail de chaque image
 */
export function createRenderLoop({
  renderer, scene, camera, controls, animator = null, getArPlacement, tasks = [], getViewCamera = () => null,
}) {
  return (time, frame) => {
    for (let index = 0; index < tasks.length; index += 1) {
      tasks[index].beforeFrame?.(time);
    }
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
    animator?.update();
    // Boucles indexées : aucun itérateur créé à chaque image.
    for (let index = 0; index < tasks.length; index += 1) {
      tasks[index].update(time, frame);
    }
    // En AR, la caméra du casque ou du téléphone ; sinon celle du point de vue s'il est actif.
    renderer.render(scene, renderer.xr.isPresenting ? camera : (getViewCamera() ?? camera));
    for (let index = 0; index < tasks.length; index += 1) {
      tasks[index].afterRender?.(time);
    }
  };
}