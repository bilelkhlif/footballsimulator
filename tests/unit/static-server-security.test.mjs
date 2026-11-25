/**
 * Confinement du serveur de développement, y compris les séparateurs Windows encodés.
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
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

test('le serveur refuse liens extérieurs, lecteurs, UNC, flux NTFS et encodages imbriqués sans arrêter le processus', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'football-server-boundary-'));
  const root = path.join(base, 'root');
  const privateDir = path.join(base, 'private');
  await mkdir(root);
  await mkdir(privateDir);
  await writeFile(path.join(root, 'index.html'), 'public');
  await writeFile(path.join(privateDir, 'canary.txt'), 'outside-root-canary');
  await symlink(privateDir, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const server = await startServer({ root });
  try {
    for (const target of ['linked/canary.txt', '%zz', '%00', '%252e%252e%255cprivate/canary.txt',
      'C:%5cWindows/win.ini', '%5c%5cserver/share/file', 'index.html:stream', '..%5cprivate/canary.txt']) {
      const response = await fetch(server.url + target);
      assert.ok([400, 403, 404].includes(response.status), `${target} : ${response.status}`);
      assert.notEqual(await response.text(), 'outside-root-canary');
    }
    assert.equal(await (await fetch(server.url)).text(), 'public');
  } finally {
    await server.close();
    assert.ok(path.resolve(base).startsWith(path.resolve(os.tmpdir()) + path.sep + 'football-server-boundary-'));
    await rm(base, { recursive: true });
  }
});
