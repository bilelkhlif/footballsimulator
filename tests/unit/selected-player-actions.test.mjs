/**
 * Tests unitaires des actions du joueur sélectionné (src/selected-player-actions.mjs) : aide du
 * point de vue selon le curseur, et libellé d'un joueur (équipe, numéro, poste dans la formation).
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FORMATIONS } from '../../src/config.mjs';
import { TacticsBoard } from '../../src/tactics-board.mjs';
import { followTeamNames } from '../../src/team-identity.mjs';
import { ChangeFormationCommand, ChangeTeamIdentityCommand, CommandHistory } from '../../src/commands.mjs';
import { postOfNumber } from '../../src/formations.mjs';
import { describeLook, playerLabel } from '../../src/selected-player-actions.mjs';

test('aide du point de vue : curseur libre ou verrouillé', () => {
  assert.match(describeLook(false), /^Cliquez sur le terrain/);
  assert.match(describeLook(true), /Échap rend le curseur/);
});

test('libellé d\'un joueur : nom de l\'équipe, numéro et poste, qui suivent l\'identité et la formation', () => {
  const board = new TacticsBoard(DEFAULT_FORMATIONS);
  followTeamNames(board);
  const history = new CommandHistory();
  assert.equal(playerLabel(board, 'blue', 9), `Bleus · n° 9 · ${postOfNumber(board.getFormation('blue'), 9)}`);
  history.execute(new ChangeTeamIdentityCommand({ board, teamId: 'blue', name: 'Espérance', kit: 'jaune' }));
  history.execute(new ChangeFormationCommand({ board, teamId: 'blue', formation: '3-5-2' }));
  assert.equal(playerLabel(board, 'blue', 9), `Espérance · n° 9 · ${postOfNumber(board.getFormation('blue'), 9)}`);
});
