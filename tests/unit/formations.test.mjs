/**
 * Tests unitaires de src/formations.js (patron Strategy) : chaque formation enregistrée respecte
 * le critère du cahier « 11 joueurs bien placés » (§4.3), et une nouvelle stratégie s'ajoute sans
 * toucher au reste du code.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMATIONS, FormationStrategy, getFormation, toPitchCoordinates,
} from '../../src/formations.js';
import { PITCH_LENGTH, PITCH_WIDTH, PLAYER_SIZE, REAL_PITCH } from '../../src/config.js';

/** Rayon du rond central, en mètres réels (lois du jeu). */
const CENTER_CIRCLE_RADIUS = 9.15;

/** Diamètre du socle d'un pion, en mètres (rayon 1,4 × celui du corps). */
const TOKEN_DIAMETER = PLAYER_SIZE.radius * 2.8;

test('les quatre formations sont enregistrées, dans l\'ordre des boutons', () => {
  assert.deepEqual(Object.keys(FORMATIONS), ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1']);
});

for (const [name, formation] of Object.entries(FORMATIONS)) {
  test(`${name} : 11 joueurs numérotés de 1 à 11, dans leur moitié, hors du rond central, sans chevauchement`, () => {
    const positions = formation.computePositions();

    assert.equal(positions.length, 11);
    assert.deepEqual(positions.map((p) => p.number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const { x, y, role } of positions) {
      assert.ok(x > 0 && x < 0.5, `${role} hors de sa moitié (x = ${x})`);
      assert.ok(y > 0 && y < 1, `${role} hors du terrain (y = ${y})`);
      const fromCenter = Math.hypot((0.5 - x) * REAL_PITCH.length, (0.5 - y) * REAL_PITCH.width);
      assert.ok(fromCenter > CENTER_CIRCLE_RADIUS, `${role} dans le rond central (${fromCenter.toFixed(1)} m)`);
      assert.ok(role.length > 0);
    }
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const gap = Math.hypot((positions[i].x - positions[j].x) * PITCH_LENGTH, (positions[i].y - positions[j].y) * PITCH_WIDTH);
        assert.ok(gap > TOKEN_DIAMETER, `${positions[i].role} et ${positions[j].role} se chevauchent`);
      }
    }
  });
}

test('Strategy : une nouvelle formation est une sous-classe, sans autre changement', () => {
  class FormationTest extends FormationStrategy {
    get name() {
      return '5-4-1';
    }

    get lines() {
      return [
        { x: 0.04, slots: [{ y: 0.5, number: 1, role: 'Gardien' }] },
        { x: 0.16, slots: [0.1, 0.3, 0.5, 0.7, 0.9].map((y, i) => ({ y, number: i + 2, role: 'Défenseur' })) },
        { x: 0.3, slots: [0.15, 0.38, 0.62, 0.85].map((y, i) => ({ y, number: i + 7, role: 'Milieu' })) },
        { x: 0.42, slots: [{ y: 0.5, number: 11, role: 'Attaquant' }] },
      ];
    }
  }

  const positions = new FormationTest().computePositions();
  assert.equal(positions.length, 11);
  assert.equal(positions[0].role, 'Gardien');
});

test('une formation qui ne place pas 11 joueurs est refusée', () => {
  class FormationIncomplete extends FormationStrategy {
    get name() {
      return 'incomplète';
    }

    get lines() {
      return [{ x: 0.04, slots: [{ y: 0.5, number: 1, role: 'Gardien' }] }];
    }
  }

  assert.throws(() => new FormationIncomplete().computePositions(), /1 joueurs au lieu de 11/);
});

test('nom de formation inconnu : erreur explicite', () => {
  assert.equal(getFormation('4-4-2'), FORMATIONS['4-4-2']);
  assert.throws(() => getFormation('2-3-5'), /Formation inconnue : 2-3-5/);
});

test('les Rouges jouent la même formation, tournée de 180° autour du point central', () => {
  const position = { x: 0.17, y: 0.12 };
  const blue = toPitchCoordinates(position, true);
  const red = toPitchCoordinates(position, false);
  assert.ok(Math.abs(blue.x + red.x) < 1e-12);
  assert.ok(Math.abs(blue.z + red.z) < 1e-12);
  assert.ok(blue.x < 0, 'les Bleus défendent du côté -X');
});
