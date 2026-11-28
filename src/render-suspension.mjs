/**
 * Rendu suspendu quand l'onglet est masqué (phase 6) : onglet changé, application mise en
 * arrière-plan, écran verrouillé. La boucle de rendu est retirée (setAnimationLoop(null)) : plus
 * aucune image n'est calculée ni soumise au processeur graphique, ce qui économise la batterie du
 * téléphone, et le navigateur ne la relance pas d'un seul coup avec des minutes de retard.
 *
 * Au retour, la boucle est remise, sans rien perdre : le tableau tactique, la séquence et la vue
 * n'ont pas changé. Une lecture de séquence en cours est mise en pause au masquage, puis reprise
 * au même instant de l'action : sans cela, le temps passé onglet masqué ferait sauter la lecture
 * jusqu'à la fin. Pendant une session AR, rien n'est suspendu : la boucle appartient alors à la
 * session WebXR, qui gère elle-même sa mise en pause.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/**
 * Suspend et reprend la boucle de rendu selon la visibilité de la page.
 * @param {object} options
 * @param {{setAnimationLoop: (loop: Function|null) => unknown, xr: {isPresenting: boolean}}} options.renderer
 * @param {(time: number, frame?: object) => void} options.loop boucle de rendu (createRenderLoop)
 * @param {{addEventListener: Function, removeEventListener: Function, visibilityState: string}} options.target
 *   le document, qui émet visibilitychange
 * @param {{state: string, pause: () => void, play: () => boolean}} [options.player] lecteur de la séquence
 * @param {(suspended: boolean) => void} [options.onChange] prévenu à chaque suspension et reprise
 * @returns {{readonly suspended: boolean, detach: () => void}}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Boucle de rendu — suspension quand la page est masquée
 */
export function attachRenderSuspension({ renderer, loop, target, player = null, onChange = () => {} }) {
  let suspended = false;
  let resumePlayback = false;

  /** visibilitychange : suspend à la page masquée, reprend à la page visible. */
  const onVisibilityChange = () => {
    if (target.visibilityState === 'hidden') {
      if (suspended || renderer.xr.isPresenting) {
        return;
      }
      suspended = true;
      resumePlayback = player?.state === 'playing';
      if (resumePlayback) {
        player.pause();
      }
      renderer.setAnimationLoop(null);
      onChange(true);
      return;
    }
    if (!suspended) {
      return;
    }
    suspended = false;
    renderer.setAnimationLoop(loop);
    if (resumePlayback && player?.state === 'paused') {
      player.play();
    }
    resumePlayback = false;
    onChange(false);
  };
  target.addEventListener('visibilitychange', onVisibilityChange);
  return {
    get suspended() {
      return suspended;
    },
    detach() {
      target.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
