/**
 * Carte « Zones surlignées » de l'espace Outils tactiques (phase 6) : la liste des zones du
 * tableau, chacune décrite en mètres réels et par sa place (tiers et couloir), avec un bouton
 * « Retirer » qui passe par une commande annulable (RemoveZoneCommand).
 *
 * Observateur du tableau tactique (patron Observer) : la liste suit chaque changement, y compris
 * une annulation ou l'ouverture d'une tactique enregistrée.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { PITCH_SCALE } from './config.mjs';
import { RemoveZoneCommand } from './commands.mjs';
import { describePitchArea } from './pitch-zones.mjs';
import { MAX_ZONES } from './tactics-board.mjs';

/**
 * Description d'une zone : « 18 × 12 m · tiers central, demi-espace ».
 * @param {{from: {x: number, z: number}, to: {x: number, z: number}}} zone rangée, en mètres de maquette
 * @returns {string}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Interface HTML — zones surlignées
 */
export function describeZone({ from, to }) {
  const length = Math.round((to.x - from.x) / PITCH_SCALE);
  const width = Math.round((to.z - from.z) / PITCH_SCALE);
  const { third, lane } = describePitchArea({ x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 });
  return `${length} × ${width} m · ${third}, ${lane}`;
}

/**
 * Construit la carte et la relie au tableau tactique et à l'historique.
 * @param {object} options
 * @param {HTMLElement} options.root conteneur de la carte
 * @param {import('./tactics-board.mjs').TacticsBoard} options.board
 * @param {import('./commands.mjs').CommandHistory} options.history
 * @param {(feedback: {kind: string, message: string}) => void} [options.onFeedback]
 * @returns {{render: () => void, dispose: () => void}}
 * @responsable Ghassen588
 * @date 2026-11-28
 * @role Interface HTML — zones surlignées
 */
export function createZonePanel({ root, board, history, onFeedback = () => {} }) {
  const status = document.createElement('p');
  status.className = 'muted';
  status.setAttribute('role', 'status');
  const list = document.createElement('ul');
  list.className = 'zone-list';
  list.setAttribute('aria-label', 'Zones surlignées sur le terrain');
  root.append(status, list);

  /** Redessine la liste. */
  const render = () => {
    const zones = board.getZones();
    list.replaceChildren(...zones.map((zone, index) => {
      const item = document.createElement('li');
      item.className = 'zone-list__item';
      item.dataset.zone = String(zone.id);
      const text = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = `Zone ${index + 1}`;
      text.append(title, ` · ${describeZone(zone)}`);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button button--secondary button--small';
      remove.dataset.removeZone = String(zone.id);
      remove.textContent = 'Retirer';
      remove.setAttribute('aria-label', `Retirer la zone ${index + 1}`);
      remove.addEventListener('click', () => {
        if (history.execute(new RemoveZoneCommand({ board, id: zone.id }))) {
          onFeedback({ kind: 'info', message: `Zone ${index + 1} retirée ; « Annuler » la rétablit.` });
          // La liste vient d'être redessinée : le focus passe au bouton suivant, ou au précédent.
          (list.querySelectorAll('[data-remove-zone]')[Math.min(index, list.children.length - 1)])?.focus();
        }
      });
      item.append(text, remove);
      return item;
    }));
    status.textContent = zones.length
      ? `${zones.length} zone${zones.length > 1 ? 's' : ''} sur ${MAX_ZONES} possibles.`
      : 'Aucune zone : outil « Zone », puis deux coins opposés sur le terrain.';
  };
  const off = board.on('change', render);
  render();
  return { render, dispose: off };
}
