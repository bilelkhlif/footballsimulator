/**
 * Maillots dans la scène et l'interface : observateur du tableau tactique (patron Observer). À
 * chaque changement d'identité, il recolore les pions (couleur d'instance, gardien distinct), les
 * disques des numéros et les pastilles de l'interface (variables CSS --kit-<équipe>). Il ne modifie
 * jamais le tableau.
 *
 * Le maillot d'une équipe peut changer le gardien de l'autre (les deux gardiens restent distincts) :
 * les deux équipes sont donc recolorées à chaque changement.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { toLinearRgb } from './team-colors.mjs';

/**
 * Encre du numéro sur le disque blanc : la couleur du maillot, ou un gris foncé si le maillot est
 * trop clair pour se lire sur du blanc (blanc, jaune).
 * @param {number} color couleur sRGB du maillot (0xRRGGBB)
 * @returns {string} couleur CSS
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Interface — maillots des équipes (observateur)
 */
export function labelInk(color) {
  const [r, g, b] = toLinearRgb(color);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? '#2b2b2b' : `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * Applique les maillots du tableau aux pions, aux numéros et à l'interface, puis les suit.
 * @param {object} options
 * @param {import('./tactics-board.mjs').TacticsBoard} options.board
 * @param {Record<string, {setKitColors: Function}>} options.teamMeshes pions instanciés de chaque équipe
 * @param {{setLabelColor: Function}} options.playerFactory fabrique des joueurs (numéros)
 * @param {{style: {setProperty: Function}}|null} [options.root] élément qui porte les variables CSS
 * @returns {() => void} arrête le suivi
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Interface — maillots des équipes (observateur)
 */
export function followTeamKits({ board, teamMeshes, playerFactory, root = null }) {
  /** Recolore les deux équipes d'après le tableau. */
  const apply = () => {
    for (const teamId of board.teamIds) {
      const identity = board.getIdentity(teamId);
      teamMeshes[teamId]?.setKitColors({ kit: identity.color, goalkeeper: identity.goalkeeperColor });
      playerFactory.setLabelColor(teamId, labelInk(identity.color));
      root?.style.setProperty(`--kit-${teamId}`, identity.ui);
    }
  };
  apply();
  return board.on('identitychange', apply);
}
