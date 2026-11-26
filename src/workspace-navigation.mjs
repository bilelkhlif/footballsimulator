/**
 * Rail et panneaux réutilisés pendant toute la vie de l'application, y compris le DOM Overlay.
 * Les écouteurs sont délégués une fois ; destroy libère les abonnements.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { WORKSPACES } from './workspace-controller.mjs';
import { postOfNumber } from './formations.mjs';
import { teamName } from './team-identity.mjs';

/** Une seule liaison par racine, même en cas de demande répétée. */
const BINDINGS = new WeakMap();

/**
 * Relie les vrais boutons de navigation au contrôleur central et à l'historique du navigateur.
 * @param {object} options
 * @param {HTMLElement} options.root racine DOM Overlay
 * @param {import('./workspace-controller.mjs').WorkspaceController} options.controller
 * @param {() => void} [options.onNavigate] désarme une confirmation devenue hors contexte
 * @returns {{close: () => boolean, destroy: () => void}}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Interface HTML — navigation accessible des espaces
 */
export function createWorkspaceNavigation({ root, controller, onNavigate = () => {} }) {
  if (BINDINGS.has(root)) return BINDINGS.get(root);
  const listeners = new AbortController();
  const panel = root.querySelector('#workspace-panel');
  const title = root.querySelector('#workspace-title');
  const navButtons = [...root.querySelectorAll('[data-workspace]')];
  const sections = [...root.querySelectorAll('[data-workspace-panel]')];
  let trigger = null;
  let fromHistory = false;
  let pendingBack = false;
  let reopenAfterBack = null;
  let destroyed = false;

  /** Retrouve une cible visible après la fermeture, y compris par Retour navigateur. */
  const restoreFocus = () => {
    const fallback = root.querySelector('[data-workspace="more"]');
    const target = trigger?.getClientRects().length && !trigger.disabled ? trigger : fallback;
    target?.focus({ preventScroll: true });
  };

  /** Rend l'espace sans réinitialiser ni recréer ses composants. */
  const render = ({ active, open }) => {
    const previousFocus = document.activeElement;
    onNavigate();
    document.body.dataset.workspace = active;
    document.body.dataset.panelOpen = String(open);
    title.textContent = WORKSPACES[active];
    panel.hidden = !open;
    for (const section of sections) {
      section.hidden = !open || section.dataset.workspacePanel !== active;
      const legacyPanel = section.querySelector('#formation-panel, #sequence-panel');
      if (legacyPanel) legacyPanel.hidden = section.hidden;
    }
    for (const button of navButtons) {
      button.setAttribute('aria-expanded', String(open && button.dataset.workspace === active));
      if (button.dataset.workspace === active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    // Masquer une section peut laisser le focus dans un bouton invisible, ou sur body.
    // Les destinations du débordement mobile n'ont pas forcément de bouton visible dans le rail.
    if (root.contains(previousFocus) && !previousFocus.getClientRects().length) {
      if (!open) restoreFocus();
      else {
        const destination = root.querySelector(`#workspace-nav [data-workspace="${active}"]`);
        const target = destination?.getClientRects().length ? destination : panel.querySelector('[data-workspace-close]');
        target?.focus({ preventScroll: true });
      }
    }
    // Une entrée par ouverture : les changements rapides remplacent cette entrée.
    // Retour navigateur replie le panneau ; Avancer peut le rouvrir, sans requête réseau.
    if (pendingBack) reopenAfterBack = open ? active : null;
    else if (!fromHistory && open) {
      const state = { ...window.history.state, footballWorkspace: active };
      if (window.history.state?.footballWorkspace) window.history.replaceState(state, '');
      else window.history.pushState(state, '');
    }
  };
  /** Ferme le panneau, restitue le focus et retire sa seule entrée d'historique. */
  const close = () => {
    const changed = controller.close();
    if (changed) {
      restoreFocus();
      if (window.history.state?.footballWorkspace && !pendingBack) {
        pendingBack = true;
        window.history.back();
      }
    }
    return changed;
  };
  /** Un clic délégué couvre le rail et les raccourcis de l'espace Plus d'outils. */
  const onClick = (event) => {
    const button = event.target.closest?.('button');
    if (!button || !root.contains(button) || button.disabled) return;
    if (button.matches('[data-workspace]')) {
      trigger = button.closest('#workspace-nav') ? button : root.querySelector(`[data-workspace="${button.dataset.workspace}"]`);
      if (controller.state.open && controller.state.active === button.dataset.workspace) close();
      else controller.open(button.dataset.workspace);
    } else if (button.matches('[data-workspace-close]')) close();
    else if (button.matches('[data-expand-rail]')) {
      const expanded = document.body.dataset.railExpanded !== 'true';
      document.body.dataset.railExpanded = String(expanded);
      button.setAttribute('aria-pressed', String(expanded));
    }
  };
  /** Déplacement du focus dans le rail : flèches, Début et Fin, sans changer d'espace. */
  const onKeyDown = (event) => {
    if (!event.target.closest?.('#workspace-nav')) return;
    const available = navButtons.filter((button) => button.closest('#workspace-nav') && !button.disabled && button.getClientRects().length);
    const index = available.indexOf(event.target);
    if (index < 0) return;
    let next = index;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % available.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + available.length) % available.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = available.length - 1;
    else return;
    event.preventDefault();
    available[next].focus();
  };
  /** Le bouton Retour du navigateur replie le panneau sans quitter le terrain partagé. */
  const onPopState = (event) => {
    if (pendingBack) {
      pendingBack = false;
      const requested = reopenAfterBack;
      reopenAfterBack = null;
      if (requested && controller.state.open) {
        window.history.pushState({ ...event.state, footballWorkspace: requested }, '');
        return;
      }
    }
    fromHistory = true;
    if (Object.hasOwn(WORKSPACES, event.state?.footballWorkspace)) controller.open(event.state.footballWorkspace);
    else controller.close();
    fromHistory = false;
  };
  const offChange = controller.on('change', render);
  const offAvailability = controller.on('availability', ({ unavailable }) => {
    for (const button of navButtons) {
      button.disabled = unavailable.includes(button.dataset.workspace);
      if (button.disabled) button.title = 'Posez le terrain pour accéder à cet espace.';
      else button.removeAttribute('title');
    }
  });
  root.addEventListener('click', onClick, { signal: listeners.signal });
  root.querySelector('#workspace-nav').addEventListener('keydown', onKeyDown, { signal: listeners.signal });
  window.addEventListener('popstate', onPopState, { signal: listeners.signal });
  render(controller.state);
  const binding = {
    close,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      listeners.abort();
      offChange();
      offAvailability();
      BINDINGS.delete(root);
    },
  };
  BINDINGS.set(root, binding);
  return binding;
}

/**
 * Résumé de sélection et positions courantes : observateurs des mêmes objets tactiques.
 * @param {object} options
 * @param {HTMLElement} options.root racine DOM Overlay
 * @param {import('./tactics-board.mjs').TacticsBoard} options.board
 * @param {import('./tactical-interaction.mjs').TacticalInteraction} options.interaction
 * @returns {() => void} libère les observateurs
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Interface HTML — résumé du terrain et des équipes
 */
export function createWorkspaceSummary({ root, board, interaction }) {
  /** Met à jour le texte avec les données réelles, sans modifier le tableau. */
  const render = () => {
    const selection = interaction.selection;
    const snapshot = board.snapshot();
    /** « Bleus · n° 6 · MDC » : équipe, numéro et poste normalisé dans la formation en place. */
    const label = (teamId, number) => `${teamName(teamId)} · n° ${number} · ${postOfNumber(board.getFormation(teamId), number)}`;
    const identity = selection?.type === 'ball' ? 'Ballon' : selection ? label(selection.teamId, selection.number) : null;
    const position = selection?.type === 'ball' ? snapshot.ball : selection ? snapshot.players[`${selection.teamId}:${selection.number}`] : null;
    for (const element of root.querySelectorAll('[data-selection-summary]')) {
      element.textContent = identity ? `${identity} · x ${position.x.toFixed(2)} · z ${position.z.toFixed(2)} m` : 'Aucune sélection';
    }
    for (const element of root.querySelectorAll('[data-formation-summary]')) element.textContent = board.getFormation(element.dataset.formationSummary).name;
    const mode = { move: 'Déplacer', pass: 'Passe', run: 'Course', dribble: 'Dribble', cross: 'Centre', shot: 'Tir', mark: 'Marquage' }[interaction.mode];
    for (const element of root.querySelectorAll('[data-mode-summary]')) element.textContent = mode;
    root.querySelector('#active-tool').setAttribute('aria-label', `Outil actif : ${mode}. Ouvrir les outils tactiques.`);
    root.querySelector('[data-arrow-count]').textContent = String(snapshot.arrows.length);
    // Les lignes sont construites une fois ; seules les coordonnées changent ensuite.
    const body = root.querySelector('#player-positions');
    if (!body.children.length) {
      for (const key of Object.keys(snapshot.players)) {
        const row = document.createElement('tr');
        row.dataset.player = key;
        for (const text of ['', '', '']) {
          const cell = document.createElement('td');
          cell.textContent = text;
          row.append(cell);
        }
        body.append(row);
      }
    }
    for (const row of body.children) {
      const point = snapshot.players[row.dataset.player];
      const [team, number] = row.dataset.player.split(':');
      // Le poste suit la formation en place : il est réécrit à chaque changement.
      row.children[0].textContent = label(team, Number(number));
      row.children[1].textContent = point.x.toFixed(2);
      row.children[2].textContent = point.z.toFixed(2);
    }
  };
  const offBoard = board.on('change', render);
  const offInteraction = interaction.on('statechange', render);
  render();
  return () => { offBoard(); offInteraction(); };
}

/**
 * Présente les capacités détectées et l'état PWA sans annoncer une installation ou une AR fictive.
 * @param {{root: HTMLElement}} options racine DOM Overlay
 * @returns {() => void} libère les écouteurs et l'observateur
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Interface HTML — états du navigateur et de l'application
 */
export function createWorkspaceStatus({ root }) {
  const listeners = new AbortController();
  const badge = root.querySelector('#xr-status');
  const capability = root.querySelector('#ar-capability');
  /** Copie le résultat réel de la détection WebXR. */
  const refreshAr = () => { capability.textContent = badge.textContent; };
  const observer = new MutationObserver(refreshAr);
  observer.observe(badge, { childList: true, characterData: true, subtree: true });
  refreshAr();
  /** État réseau observable ; la préparation du cache est présentée séparément. */
  const refreshNetwork = () => {
    root.querySelector('#connection-summary').textContent = navigator.onLine ? 'En ligne' : 'Hors ligne · accès au terrain conservé si sa préparation est terminée.';
  };
  window.addEventListener('online', refreshNetwork, { signal: listeners.signal });
  window.addEventListener('offline', refreshNetwork, { signal: listeners.signal });
  refreshNetwork();
  const offline = root.querySelector('#offline-cache-status');
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.ready.then(() => {
      offline.textContent = 'Application prête pour une prochaine ouverture hors ligne.';
    }).catch(() => { offline.textContent = 'Préparation hors ligne indisponible.'; });
  } else offline.textContent = 'Accès hors ligne indisponible sur cette origine.';
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  /** Rappelle la préférence du système déjà respectée par les animations. */
  const refreshMotion = () => {
    root.querySelector('#motion-preference').textContent = motion.matches
      ? 'Préférence système : animations réduites. Les déplacements utilisent ce réglage au lancement de l’application.'
      : 'Préférence système : animations standard. Un changement de préférence s’applique aux déplacements au prochain lancement.';
  };
  motion.addEventListener('change', refreshMotion, { signal: listeners.signal });
  refreshMotion();
  return () => { observer.disconnect(); listeners.abort(); };
}
