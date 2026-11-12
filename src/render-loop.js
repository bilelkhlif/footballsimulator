/**
 * Boucle de rendu commune à la vue 3D et à la session AR.
 *
 * Hors AR, les contrôles d'orbite déplacent la caméra. En AR, c'est la session WebXR :
 * three.js place la caméra selon la pose du téléphone, et la vue AR place le terrain dès que
 * cette pose est connue. Les contrôles d'orbite ne doivent alors plus toucher à la caméra.
 */

/**
 * Crée la fonction appelée à chaque image par renderer.setAnimationLoop.
 * @param {object} context
 * @param {import('three').WebGLRenderer} context.renderer
 * @param {import('three').Scene} context.scene
 * @param {import('three').Camera} context.camera
 * @param {{update: () => void}} context.controls contrôles d'orbite
 * @param {{needsPlacement: boolean, placeInFront: (viewerTransform: object) => void}} context.arView
 * @returns {(time: number, frame?: XRFrame) => void}
 */
export function createRenderLoop({ renderer, scene, camera, controls, arView }) {
  return (time, frame) => {
    if (renderer.xr.isPresenting) {
      if (frame && arView.needsPlacement) {
        // Pose du téléphone dans l'espace local-floor ; null tant que le suivi n'est pas établi.
        const pose = frame.getViewerPose(renderer.xr.getReferenceSpace());
        if (pose) {
          arView.placeInFront(pose.transform);
        }
      }
    } else {
      controls.update();
    }
    renderer.render(scene, camera);
  };
}
