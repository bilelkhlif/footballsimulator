/**
 * Parcours des panneaux par leurs vrais boutons, partagé par les tests existants et nouveaux.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */

/**
 * Ouvre un espace, y compris depuis le débordement du rail en portrait.
 * @param {import('playwright-core').Page} page
 * @param {string} id espace du contrôleur
 * @returns {Promise<void>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout — parcours de navigation
 */
export async function openWorkspace(page, id) {
  const state = await page.evaluate(() => ({ active: document.body.dataset.workspace, open: document.body.dataset.panelOpen }));
  if (state.active === id && state.open === 'true') return;
  const primary = page.locator(`#workspace-nav [data-workspace="${id}"]`);
  if (await primary.isVisible()) await primary.click();
  else {
    await openWorkspace(page, 'more');
    await page.locator(`[data-workspace-panel="more"] [data-workspace="${id}"]`).click();
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/**
 * Atteint une commande dans son nouvel espace avant de cliquer : aucune visibilité forcée.
 * Les assertions métier d'origine restent inchangées.
 * @param {import('playwright-core').Page} page
 * @param {string} selector commande réelle
 * @param {boolean} [touch] geste tactile
 * @returns {Promise<void>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout — accès aux commandes existantes
 */
export async function clickUi(page, selector, touch = false) {
  const workspace = await page.locator(selector).first().evaluate((element) => element.closest('[data-workspace-panel]')?.dataset.workspacePanel ?? null);
  if (workspace) await openWorkspace(page, workspace);
  if (touch) await page.locator(selector).tap();
  else await page.locator(selector).click();
}

/**
 * Variante tactile de clickUi.
 * @param {import('playwright-core').Page} page
 * @param {string} selector commande réelle
 * @returns {Promise<void>}
 * @responsable Bilel Khlif
 * @date 2026-11-24
 * @role Tests de bout en bout — accès tactile aux commandes
 */
export async function tapUi(page, selector) {
  await clickUi(page, selector, true);
}

/**
 * Script de page (sprint 5) : outils de visée, installés dans window.__aim. La caméra active est
 * celle de la vue 3D, ou en AR la caméra de la vue WebXR (pose et projection de la session). Un
 * point ne convient que s'il est à l'écran, hors de l'interface, et si le rayon qui passe par ce
 * pixel touche bien ce qui est visé : le test vérifie le raycasting de l'application, pas un clic
 * caché par un autre joueur.
 * @responsable Bilel Khlif
 * @date 2026-11-15
 * @role Tests de bout en bout — outillage de l'interaction tactique
 */
export function installAimTools() {
  /** Éléments d'interface qui reçoivent les touchers. */
  const ui = 'button, .ui-surface, .notice';
  window.__aim = {
    async context() {
      const THREE = await import('three');
      const app = window.__footballSimulator;
      const camera = app.renderer.xr.isPresenting ? app.renderer.xr.getCamera().cameras[0] : app.camera;
      app.pitchGroup.updateMatrixWorld(true);
      return { THREE, app, camera, rect: app.renderer.domElement.getBoundingClientRect() };
    },
    // Pixel d'un point monde, et s'il est utilisable (à l'écran, hors de l'interface).
    toScreen({ THREE, camera, rect }, world) {
      const ndc = world.clone().applyMatrix4(new THREE.Matrix4().copy(camera.matrixWorld).invert()).applyMatrix4(camera.projectionMatrix);
      const x = rect.left + ((ndc.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - ndc.y) / 2) * rect.height;
      const onScreen = Math.abs(ndc.x) < 0.92 && Math.abs(ndc.y) < 0.92 && ndc.z > -1 && ndc.z < 1;
      return { x, y, usable: onScreen && !document.elementFromPoint(x, y)?.closest(ui) };
    },
    // Premier objet touché par le rayon de la caméra vers un point monde.
    firstHit({ THREE, app, camera }, world) {
      const origin = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
      const raycaster = new THREE.Raycaster(origin, world.clone().sub(origin).normalize());
      return raycaster.intersectObjects(app.tacticalView.hitboxes, false)[0]?.object.parent ?? null;
    },
    async player(teamId, exclude = []) {
      const context = await this.context();
      const { THREE, app } = context;
      for (const player of app.pitchGroup.getObjectByName(`team-${teamId}`).children) {
        if (exclude.includes(player.userData.number)) {
          continue;
        }
        const head = player.localToWorld(new THREE.Vector3(0, 0.03, 0));
        const screen = this.toScreen(context, head);
        if (screen.usable && this.firstHit(context, head) === player) {
          return { number: player.userData.number, x: screen.x, y: screen.y };
        }
      }
      return null;
    },
    async ball() {
      const context = await this.context();
      const { THREE, app } = context;
      const ball = app.pitchGroup.getObjectByName('ball');
      const center = ball.getWorldPosition(new THREE.Vector3());
      const screen = this.toScreen(context, center);
      return screen.usable && this.firstHit(context, center) === ball ? { x: screen.x, y: screen.y } : null;
    },
    async spot(candidates) {
      const context = await this.context();
      const { THREE, app } = context;
      for (const [x, z] of candidates) {
        const world = app.pitchGroup.localToWorld(new THREE.Vector3(x, 0, z));
        const screen = this.toScreen(context, world);
        if (screen.usable && this.firstHit(context, world) === null) {
          return { x, z, sx: screen.x, sy: screen.y };
        }
      }
      return null;
    },
  };
}
