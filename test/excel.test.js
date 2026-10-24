const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('../lib/xlsx.full.min.js');
const P = require('../parser.js');
const E = require('../excel.js');

const CHAT1 = [
  '[18:05, 24/10/2026] Juan Pérez: Lunes 20/10 7 a 16\nMartes 21/10 7 a 15',
  '[18:06, 24/10/2026] Ana Gómez: 21/10 8 horas',
  '[18:07, 24/10/2026] Luis: entré a las 7'
].join('\n');

function aArray(wb) {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

test('genera las tres hojas con fórmulas y valores', () => {
  const wb = E.crearLibro(E.unir([], P.processChat(CHAT1)).registros);
  assert.deepStrictEqual(wb.SheetNames, ['Resumen', 'Planilla', 'Registros']);

  const resumen = XLSX.utils.sheet_to_json(wb.Sheets.Resumen);
  assert.deepStrictEqual(resumen.map(r => [r.Funcionario, r['Total horas']]), [
    ['Ana Gómez', 8], ['Juan Pérez', 17], ['Luis', 0], ['TOTAL', 25]
  ]);
  assert.match(wb.Sheets.Resumen.C2.f, /^SUMIFS\(Registros!/);

  const planilla = wb.Sheets.Planilla;
  assert.strictEqual(planilla.A2.v, 'Ana Gómez');
  assert.strictEqual(planilla.C2.v, 8); // 21/10 (B1 = 20/10)
  assert.strictEqual(planilla.G1.v, 'Total'); // 20/10 a 24/10 en B:F
  assert.strictEqual(planilla.G3.v, 17); // total Juan
});

test('actualizar un Excel existente no duplica y conserva lo editado a mano', () => {
  const wb1 = E.crearLibro(E.unir([], P.processChat(CHAT1)).registros);
  // El usuario corrige a mano la salida de Luis en el Excel
  const ws = wb1.Sheets.Registros;
  const filaLuis = XLSX.utils.sheet_to_json(ws).findIndex(r => r.Funcionario === 'Luis') + 2;
  ws['E' + filaLuis] = { t: 's', v: '16:00' };
  ws['F' + filaLuis] = { t: 'n', v: 9 };
  ws['G' + filaLuis] = { t: 's', v: 'OK' };

  const existentes = E.leerRegistros(aArray(wb1));
  assert.strictEqual(existentes.length, 4);
  assert.strictEqual(existentes.find(r => r.funcionario === 'Luis').horas, 9);
  assert.strictEqual(existentes[0].fecha, '2026-10-21');

  const chat2 = CHAT1 + '\n[09:00, 27/10/2026] Ana Gómez: ayer 6 hs';
  const res = E.unir(existentes, P.processChat(chat2));
  assert.strictEqual(res.agregados, 2); // lo de Ana del 26/10 y lo de Luis sin corregir (difiere)
  const wb2 = E.crearLibro(res.registros);
  const resumen = XLSX.utils.sheet_to_json(wb2.Sheets.Resumen);
  assert.strictEqual(resumen.find(r => r.Funcionario === 'Ana Gómez')['Total horas'], 14);
});
