/**
 * Confinement du serveur de développement, y compris les séparateurs Windows encodés.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../serve.mjs';

test('le serveur refuse une sortie vers un dossier frère qui partage le préfixe de la racine', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'football-server-boundary-'));
  const root = path.join(base, 'root');
  await mkdir(root);
  await mkdir(path.join(base, 'root-secret'));
  await writeFile(path.join(root, 'index.html'), 'public');
  await writeFile(path.join(base, 'root-secret', 'canary.txt'), 'outside-root-canary');
  const server = await startServer({ root });
  try {
    assert.equal((await fetch(server.url)).status, 200);
    const response = await fetch(server.url + '%2e%2e%5croot-secret/canary.txt');
    assert.ok([403, 404].includes(response.status));
    assert.notEqual(await response.text(), 'outside-root-canary');
  } finally {
    await server.close();
    assert.ok(path.resolve(base).startsWith(path.resolve(os.tmpdir()) + path.sep + 'football-server-boundary-'));
    await rm(base, { recursive: true });
  }
});
