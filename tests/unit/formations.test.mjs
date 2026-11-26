/**
 * Tests unitaires de src/formations.mjs (patron Strategy) : chaque formation enregistrée respecte
 * le critère du cahier « 11 joueurs bien placés » (§4.3), et une nouvelle stratégie s'ajoute sans
 * toucher au reste du code.
 *
 * Assistance à l'implémentation : voir ATTRIBUTION.md (§4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMATIONS, FormationStrategy, getFormation, POSTS, postOfNumber, postOfRole, toPitchCoordinates,
} from '../../src/formations.mjs';
import { PITCH_LENGTH, PITCH_WIDTH, PLAYER_SIZE, REAL_PITCH } from '../../src/config.mjs';

/** Rayon du rond central, en mètres réels (lois du jeu). */
const CENTER_CIRCLE_RADIUS = 9.15;

/** Diamètre du socle d'un pion, en mètres (rayon 1,4 × celui du corps). */
const TOKEN_DIAMETER = PLAYER_SIZE.radius * 2.8;

test('les formations sont enregistrées, dans l\'ordre des boutons', () => {
  assert.deepEqual(Object.keys(FORMATIONS), ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '4-1-4-1', '3-4-3', '5-3-2', '4-4-2 losange']);
});

test('4-4-2 losange : quatre milieux dans le couloir central, en losange, contre deux dans le 4-4-2 à plat', () => {
  const central = (name) => FORMATIONS[name].computePositions()
    .filter((p) => /Milieu|Sentinelle|Meneur/.test(p.role) && p.y >= 0.25 && p.y <= 0.75);
  const diamond = central('4-4-2 losange');
  assert.equal(diamond.length, 4, 'les quatre milieux du losange sont dans l\'axe');
  assert.equal(central('4-4-2').length, 2, 'le 4-4-2 à plat n\'a que deux milieux axiaux');
  const base = diamond.find((p) => p.role === 'Sentinelle');
  const tip = diamond.find((p) => p.role === 'Meneur de jeu');
  assert.ok(base.y === 0.5 && tip.y === 0.5 && tip.x > base.x, 'sentinelle et meneur sur l\'axe, le meneur devant');
  for (const p of diamond.filter((m) => m.role === 'Milieu relayeur')) assert.ok(p.x > base.x && p.x < tip.x);
});

test('5-3-2 : bloc bas de cinq défenseurs à hauteur de la surface, milieu à trois resserré, deux attaquants', () => {
  const positions = FORMATIONS['5-3-2'].computePositions();
  const defenders = positions.filter((p) => /Défenseur|Piston/.test(p.role));
  const midfield = positions.filter((p) => p.role.startsWith('Milieu'));
  const forwards = positions.filter((p) => /attaquant|Avant-centre/i.test(p.role));
  assert.equal(defenders.length, 5);
  assert.equal(midfield.length, 3);
  assert.equal(forwards.length, 2);
  // Bloc bas : toute la défense à moins de 18 m de son but (surface de réparation : 16,5 m).
  for (const { x, role } of defenders) assert.ok(x * 105 < 18, `${role} trop haut (${(x * 105).toFixed(1)} m)`);
  // Lignes resserrées : au plus 13 m entre la défense centrale et le milieu.
  const meanX = (players) => players.reduce((sum, p) => sum + p.x, 0) / players.length;
  assert.ok((meanX(midfield) - meanX(defenders)) * 105 <= 13);
});

test('3-4-3 : trois centraux, et la largeur donnée par les pistons, plus larges que les attaquants', () => {
  const positions = FORMATIONS['3-4-3'].computePositions();
  const centreBacks = positions.filter((p) => p.role === 'Défenseur central');
  const wingBacks = positions.filter((p) => p.role.startsWith('Piston'));
  const forwards = positions.filter((p) => /Ailier|Avant-centre/.test(p.role));
  assert.equal(centreBacks.length, 3);
  assert.equal(forwards.length, 3);
  // Pistons à moins de 6 m de la ligne de touche (terrain de 68 m de large).
  for (const { y } of wingBacks) assert.ok(Math.min(y, 1 - y) * 68 < 6);
  const width = (players) => (Math.max(...players.map((p) => p.y)) - Math.min(...players.map((p) => p.y))) * 68;
  assert.ok(width(wingBacks) > width(forwards), 'les pistons sont les joueurs les plus larges');
});

test('4-1-4-1 : une seule sentinelle entre la défense et la ligne de quatre, dans l\'axe', () => {
  const positions = FORMATIONS['4-1-4-1'].computePositions();
  const sentinel = positions.find((p) => p.role === 'Sentinelle');
  const defenders = positions.filter((p) => /Arrière|Défenseur/.test(p.role));
  const midfield = positions.filter((p) => /Milieu/.test(p.role));
  assert.equal(sentinel.number, 6);
  assert.equal(sentinel.y, 0.5);
  assert.equal(midfield.length, 4, 'ligne de quatre milieux');
  assert.ok(defenders.every((p) => p.x < sentinel.x) && midfield.every((p) => p.x > sentinel.x));
  // Bloc compact : moins de 25 m entre la défense et la ligne de quatre, sur un terrain de 105 m.
  assert.ok((midfield[0].x - defenders[0].x) * 105 < 25);
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

test('chaque place de chaque formation a un poste normalisé connu', () => {
  for (const [name, formation] of Object.entries(FORMATIONS)) {
    for (const { post, role } of formation.computePositions()) {
      assert.ok(Object.hasOwn(POSTS, post), `${name} : ${role} sans poste normalisé (${post})`);
    }
    const posts = formation.computePositions().map((p) => p.post);
    assert.equal(posts.filter((p) => p === 'GB').length, 1, `${name} : un seul gardien`);
  }
});

test('postes : ce qu\'un entraîneur écrirait au tableau', () => {
  const post = (formation, number) => postOfNumber(FORMATIONS[formation], number);
  assert.equal(post('4-3-3', 6), 'MDC', 'milieu défensif du 4-3-3');
  assert.equal(post('4-1-4-1', 6), 'MDC', 'la sentinelle');
  assert.equal(post('4-3-3', 7), 'AD');
  assert.equal(post('4-3-3', 11), 'AG');
  assert.equal(post('4-4-2', 2), 'DD');
  assert.equal(post('4-4-2', 3), 'DG');
  assert.equal(post('4-4-2', 11), 'MG', 'milieu gauche d\'une ligne de quatre, pas un ailier');
  assert.equal(post('3-4-3', 3), 'PG', 'piston gauche');
  assert.equal(post('5-3-2', 2), 'PD');
  assert.equal(post('4-4-2 losange', 10), 'MOC');
  assert.equal(post('4-2-3-1', 9), 'AT');
  assert.equal(postOfNumber(FORMATIONS['4-4-2'], 12), null);
});

test('un rôle sans poste normalisé est refusé', () => {
  assert.equal(postOfRole('Sentinelle'), 'MDC');
  assert.throws(() => postOfRole('Libéro'), /Rôle sans poste normalisé : Libéro/);
});
