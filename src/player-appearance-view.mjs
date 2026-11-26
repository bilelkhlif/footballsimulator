/**
 * Apparence des joueurs dans la scène (phase 5) : observateur du tableau tactique (patron
 * Observer). À chaque changement d'apparence, et après une annulation, un rétablissement ou
 * l'ouverture d'une tactique, il donne à chaque joueur sa coupe et la couleur de ses cheveux dans
 * les pions instanciés de son équipe. Il ne modifie jamais le tableau.
 *
 * Il accepte aussi un aperçu : pendant la personnalisation, l'apparence choisie s'affiche aussitôt
 * sur le joueur, sans toucher au tableau ; « Appliquer » crée ensuite une commande, « Annuler »
 * retire l'aperçu et le joueur reprend son apparence enregistrée.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/**
 * Applique les apparences du tableau aux joueurs, puis les suit.
 * @param {object} options
 * @param {import('./tactics-board.mjs').TacticsBoard} options.board
 * @param {Record<string, {setAppearance: Function}>} options.teamMeshes pions instanciés par équipe
 * @param {Record<string, {children: Array<{userData: {number: number}}>}>} options.teamGroups
 *   groupes des équipes, pour connaître leurs numéros
 * @returns {{preview: (teamId: string, number: number, appearance: {hair: string, color: string}) => void,
 *   clearPreview: () => void, stop: () => void}}
 * @responsable Iyed Rachdi
 * @date 2026-11-26
 * @role Scène 3D — apparence des joueurs (observateur)
 */
export function followPlayerAppearances({ board, teamMeshes, teamGroups }) {
  let previewed = null;

  /** Applique l'apparence enregistrée d'un joueur, ou l'aperçu s'il est en cours sur lui. */
  const applyPlayer = (teamId, number) => {
    const appearance = previewed && previewed.teamId === teamId && previewed.number === number
      ? previewed.appearance
      : board.getAppearance(teamId, number);
    teamMeshes[teamId]?.setAppearance(number, appearance);
  };

  /** Applique les apparences de tous les joueurs. */
  const applyAll = () => {
    for (const teamId of board.teamIds) {
      for (const player of teamGroups[teamId]?.children ?? []) {
        applyPlayer(teamId, player.userData.number);
      }
    }
  };

  applyAll();
  const stop = board.on('appearancechange', ({ teamId, number } = {}) => {
    if (teamId && Number.isInteger(number)) {
      applyPlayer(teamId, number);
    } else {
      applyAll();
    }
  });

  return {
    preview(teamId, number, appearance) {
      const previous = previewed;
      previewed = { teamId, number, appearance: { ...appearance } };
      if (previous && (previous.teamId !== teamId || previous.number !== number)) {
        applyPlayer(previous.teamId, previous.number);
      }
      applyPlayer(teamId, number);
    },
    clearPreview() {
      if (!previewed) return;
      const { teamId, number } = previewed;
      previewed = null;
      applyPlayer(teamId, number);
    },
    stop,
  };
}