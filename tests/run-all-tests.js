/* tests/run-all-tests.js — uruchamia wszystkie suity tego repozytorium.
 *
 * PLAN-D-X 08.2026 (14.08.2026). Do tego dnia `gamechange-diagnoza` nie miało
 * ANI JEDNEGO testu — stąd ten plik. Wzorzec: `gamechange-app/tests/run-all-tests.js`.
 *
 * Bierze każdy plik `tests/test-*.js`, uruchamia w osobnym procesie i sumuje.
 * Kod wyjścia ≠ 0, gdy którakolwiek suita jest czerwona.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const KATALOG = __dirname;
const suity = fs.readdirSync(KATALOG)
  .filter(f => /^test-.*\.js$/.test(f))
  .sort();

if (suity.length === 0) {
  // Pusty przebieg NIE MOŻE wyglądać jak sukces.
  console.error('BŁĄD: nie znaleziono ani jednej suity `tests/test-*.js`.');
  process.exit(1);
}

let zielone = 0, czerwone = 0, sumaOk = 0;

for (const plik of suity) {
  const wynik = spawnSync(process.execPath, [path.join(KATALOG, plik)], { encoding: 'utf8' });
  const wyjscie = (wynik.stdout || '') + (wynik.stderr || '');
  process.stdout.write(wyjscie);
  const m = wyjscie.match(/^\s*ok:\s+(\d+)\s*$/m);
  if (m) sumaOk += Number(m[1]);
  if (wynik.status === 0) zielone++; else czerwone++;
}

console.log('\n########################################');
console.log('  suity:     ' + suity.length + '  (zielone: ' + zielone + ', czerwone: ' + czerwone + ')');
console.log('  asercje ok: ' + sumaOk);
console.log('########################################');
process.exit(czerwone ? 1 : 0);
