/**
 * Client de l'API du serveur d'analyse (analysis/football_analysis/server.py), servi par la même
 * origine que la page.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/** Intervalle entre deux interrogations de l'état d'une analyse, en millisecondes. */
export const POLL_INTERVAL_MS = 1000;

/**
 * Lit une réponse JSON ; lève une erreur avec le message du serveur en cas d'échec.
 * @param {Response} response
 * @returns {Promise<any>}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — client de l'API d'analyse
 */
async function readJson(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error ?? `Erreur du serveur (${response.status}).`);
  }
  return body;
}

/**
 * État du serveur d'analyse, ou null s'il ne répond pas (page ouverte sans serveur).
 * @param {typeof fetch} [fetcher]
 * @returns {Promise<object|null>}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — client de l'API d'analyse
 */
export async function getHealth(fetcher = fetch) {
  try {
    return await readJson(await fetcher('api/health', { cache: 'no-store' }));
  } catch {
    return null;
  }
}

/**
 * Liste des analyses, de la plus récente à la plus ancienne.
 * @param {typeof fetch} [fetcher]
 * @returns {Promise<object[]>}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — client de l'API d'analyse
 */
export async function listAnalyses(fetcher = fetch) {
  return readJson(await fetcher('api/analyses', { cache: 'no-store' }));
}

/**
 * État d'une analyse.
 * @param {string} id
 * @param {typeof fetch} [fetcher]
 * @returns {Promise<object>}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — client de l'API d'analyse
 */
export async function getAnalysis(id, fetcher = fetch) {
  return readJson(await fetcher(`api/analyses/${encodeURIComponent(id)}`, { cache: 'no-store' }));
}

/**
 * Document de suivi d'une analyse terminée.
 * @param {string} id
 * @param {typeof fetch} [fetcher]
 * @returns {Promise<object>}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — client de l'API d'analyse
 */
export async function getTracking(id, fetcher = fetch) {
  return readJson(await fetcher(`api/analyses/${encodeURIComponent(id)}/tracking`));
}

/**
 * En-tête d'une analyse stockée par fenêtres ; null si l'ancien serveur ne le propose pas.
 * @param {string} id
 * @param {typeof fetch} [fetcher]
 * @returns {Promise<object|null>}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Visualiseur de match — client de l'API d'analyse (lecture par fenêtres)
 */
export async function getTrackingManifest(id, fetcher = fetch) {
  const response = await fetcher(`api/analyses/${encodeURIComponent(id)}/manifest`, { cache: 'no-store' });
  if (response.status === 404 || response.status === 405) {
    return null;
  }
  return readJson(response);
}

/**
 * Images et trajectoires d'une fenêtre horodatée, avec ses images voisines aux bornes.
 * @param {string} id
 * @param {number} from début en secondes
 * @param {number} to fin en secondes
 * @param {{selectedId?: number|null, signal?: AbortSignal, fetcher?: typeof fetch}} [options]
 * @returns {Promise<object>}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Visualiseur de match — client de l'API d'analyse (lecture par fenêtres)
 */
export async function getTrackingWindow(id, from, to, { selectedId = null, signal, fetcher = fetch } = {}) {
  const query = new URLSearchParams({ from: String(from), to: String(to) });
  if (selectedId !== null) {
    query.set('selected', String(selectedId));
  }
  return readJson(await fetcher(`api/analyses/${encodeURIComponent(id)}/frames?${query}`, { signal, cache: 'no-store' }));
}

/**
 * Reprend une analyse interrompue depuis son dernier segment validé.
 * @param {string} id
 * @param {typeof fetch} [fetcher]
 * @returns {Promise<object>}
 * @responsable Bilel Khlif
 * @date 2026-11-23
 * @role Visualiseur de match — reprise des analyses
 */
export async function resumeAnalysis(id, fetcher = fetch) {
  return readJson(await fetcher(`api/analyses/${encodeURIComponent(id)}/resume`, { method: 'POST' }));
}

/**
 * Adresse de la vidéo source d'une analyse, lisible par un élément <video> (lecture partielle).
 * @param {string} id
 * @returns {string}
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — client de l'API d'analyse
 */
export function videoUrl(id) {
  return `api/analyses/${encodeURIComponent(id)}/video`;
}

/**
 * Téléverse une vidéo (corps brut) et suit la progression de l'envoi.
 * @param {File} file
 * @param {(fraction: number) => void} [onProgress]
 * @returns {Promise<object>} état de l'analyse créée
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — client de l'API d'analyse
 */
export function uploadVideo(file, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `api/analyses?name=${encodeURIComponent(file.name)}`);
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    });
    request.addEventListener('load', () => {
      let body = null;
      try {
        body = JSON.parse(request.responseText);
      } catch {
        // réponse vide ou illisible : traitée comme une erreur ci-dessous
      }
      if (request.status >= 200 && request.status < 300 && body) {
        resolve(body);
      } else {
        reject(new Error(body?.error ?? `Téléversement refusé (${request.status}).`));
      }
    });
    request.addEventListener('error', () => reject(new Error('Serveur d\'analyse injoignable.')));
    request.send(file);
  });
}

/**
 * Attend la fin d'une analyse, en signalant chaque état reçu.
 * @param {string} id
 * @param {(status: object) => void} onStatus
 * @param {{fetcher?: typeof fetch, interval?: number, signal?: AbortSignal}} [options]
 * @returns {Promise<object>} état final (« done » ou « failed »)
 * @responsable Bilel Khlif
 * @date 2026-11-17
 * @role Visualiseur de match — client de l'API d'analyse
 */
export async function waitForAnalysis(id, onStatus, { fetcher = fetch, interval = POLL_INTERVAL_MS, signal } = {}) {
  for (;;) {
    const status = await getAnalysis(id, fetcher);
    onStatus(status);
    if (['done', 'failed', 'interrupted'].includes(status.status) || signal?.aborted) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
