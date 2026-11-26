/**
 * Panneau « Situations » : la bibliothèque de situations de jeu, une carte par situation (thème,
 * titre, principe pour l'entraîneur) avec un bouton « Charger ». Le chargement passe par l'action
 * `load`, qui crée une commande annulable ; le panneau ne touche jamais au tableau.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/**
 * Construit la liste des situations.
 * @param {object} options
 * @param {HTMLElement} options.root conteneur du panneau
 * @param {Promise<{scenarios: object[], rejected: Array<{file: string, errors: string[]}>}>} options.library
 *   bibliothèque en cours de chargement (loadScenarioLibrary)
 * @param {(scenario: object) => void} options.load action d'un bouton « Charger »
 * @returns {Promise<{buttons: HTMLButtonElement[]}>} une fois la bibliothèque affichée
 * @responsable Iyed Rachdi
 * @date 2026-11-25
 * @role Interface HTML — bibliothèque de situations
 */
export async function createScenarioPanel({ root, library, load }) {
  const status = document.createElement('p');
  status.className = 'muted';
  status.textContent = 'Chargement des situations…';
  root.append(status);
  let result;
  try {
    result = await library;
  } catch (error) {
    status.textContent = `Situations indisponibles : ${error.message}`;
    return { buttons: [] };
  }
  const { scenarios, rejected } = result;
  status.textContent = scenarios.length
    ? `${scenarios.length} situation${scenarios.length > 1 ? 's' : ''} prête${scenarios.length > 1 ? 's' : ''} à charger. Chargez, puis « Lecture » pour la jouer.`
    : 'Aucune situation dans la bibliothèque.';
  if (rejected.length) {
    status.textContent += ` ${rejected.length} fichier${rejected.length > 1 ? 's' : ''} écarté${rejected.length > 1 ? 's' : ''} (format invalide).`;
  }
  const list = document.createElement('ul');
  list.className = 'scenario-list';
  const buttons = scenarios.map((scenario) => {
    const item = document.createElement('li');
    item.className = 'scenario-card';
    item.dataset.scenario = scenario.id;
    const theme = document.createElement('span');
    theme.className = 'scenario-card__theme';
    theme.textContent = scenario.theme;
    const title = document.createElement('h4');
    title.textContent = scenario.title;
    const description = document.createElement('p');
    description.textContent = scenario.description;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--secondary';
    button.dataset.loadScenario = scenario.id;
    button.textContent = 'Charger';
    button.setAttribute('aria-label', `Charger la situation : ${scenario.title}`);
    button.addEventListener('click', () => load(scenario));
    item.append(theme, title, description, button);
    list.append(item);
    return button;
  });
  root.append(list);
  return { buttons };
}
