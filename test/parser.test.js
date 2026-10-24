const test = require('node:test');
const assert = require('node:assert');
const P = require('../parser.js');

// Mensaje enviado el sábado 24/10/2026
function uno(texto, autor = 'Juan Pérez') {
  return P.processChat(`[18:05, 24/10/2026] ${autor}: ${texto}`);
}

test('formatos de chat: WhatsApp Web, Android, iPhone', () => {
  const chat = [
    '[18:05, 24/10/2026] Juan Pérez: 7 a 16',
    '24/10/2026, 18:06 - Ana Gómez: 8 horas',
    '[24/10/26, 6:07:10 p. m.] Luis: de 8 a 17',
    '24/10/2026, 18:08 - Ana Gómez se unió usando el enlace de invitación',
    '‎[24/10/26, 18:09:00] Luis: ‎<Multimedia omitido>'
  ].join('\n');
  const rows = P.processChat(chat);
  assert.deepStrictEqual(rows.map(r => [r.funcionario, r.fecha, r.horas]), [
    ['Ana Gómez', '2026-10-24', 8],
    ['Juan Pérez', '2026-10-24', 9],
    ['Luis', '2026-10-24', 9]
  ]);
  assert.strictEqual(rows.find(r => r.funcionario === 'Luis').enviado, '2026-10-24 18:07');
});

test('entrada y salida en distintas formas', () => {
  const casos = {
    '7 a 16': ['07:00', '16:00', 9],
    '7:30 - 15:45': ['07:30', '15:45', 8.25],
    'Entré 7 salí 16': ['07:00', '16:00', 9],
    'entrada 6.30 salida 15': ['06:30', '15:00', 8.5],
    'de 7 a 4': ['07:00', '16:00', 9],
    'desde las 22 hasta las 6': ['22:00', '06:00', 8],
    '7am a 3pm': ['07:00', '15:00', 8],
    '7hs a 16hs': ['07:00', '16:00', 9]
  };
  for (const [texto, [e, s, h]] of Object.entries(casos)) {
    const [r] = uno(texto);
    assert.deepStrictEqual([r.entrada, r.salida, r.horas, r.estado], [e, s, h, 'OK'], texto);
  }
});

test('totales de horas', () => {
  const casos = { '8 horas': 8, 'hoy 9 hs': 9, '8,5 hs': 8.5, '7.30 hs': 7.5, '8:15 horas': 8.25, '8 horas y media': 8.5, 'trabajé 6h': 6 };
  for (const [texto, h] of Object.entries(casos)) {
    const [r] = uno(texto);
    assert.strictEqual(r.horas, h, texto);
  }
});

test('fechas: explícita, día de la semana, ayer, arrastre de línea', () => {
  assert.strictEqual(uno('21/10 7 a 16')[0].fecha, '2026-10-21');
  assert.strictEqual(uno('21 de octubre 8 hs')[0].fecha, '2026-10-21');
  assert.strictEqual(uno('ayer 8 horas')[0].fecha, '2026-10-23');
  assert.strictEqual(uno('lunes 8 hs')[0].fecha, '2026-10-19');
  assert.strictEqual(uno('viernes 8 hs')[0].fecha, '2026-10-23');
  assert.strictEqual(uno('sábado 8 hs')[0].fecha, '2026-10-24');
  const [r] = uno('Jueves 22/10\n7 a 15');
  assert.deepStrictEqual([r.fecha, r.horas], ['2026-10-22', 8]);
  const sinFecha = uno('7 a 16')[0];
  assert.match(sinFecha.obs, /día del mensaje/);
});

test('fin de año: 30/12 enviado en enero es del año anterior', () => {
  const [r] = P.processChat('[09:00, 2/1/2027] Ana: 30/12 8 hs');
  assert.strictEqual(r.fecha, '2026-12-30');
});

test('varios días en un mismo mensaje', () => {
  const rows = uno('Lunes 7 a 16\nmartes 7 a 15\nmiércoles 8 hs');
  assert.deepStrictEqual(rows.map(r => [r.fecha, r.horas]), [
    ['2026-10-19', 9], ['2026-10-20', 8], ['2026-10-21', 8]
  ]);
  const enLinea = uno('lunes 7 a 16, martes 7 a 15; jueves 9 hs');
  assert.deepStrictEqual(enLinea.map(r => [r.fecha, r.horas]), [
    ['2026-10-19', 9], ['2026-10-20', 8], ['2026-10-22', 9]
  ]);
});

test('descanso', () => {
  const [r] = uno('7 a 16 con 30 min de almuerzo');
  assert.deepStrictEqual([r.horas, r.estado], [8.5, 'OK']);
  assert.strictEqual(uno('de 7 a 16, media hora de descanso')[0].horas, 8.5);
});

test('casos a revisar', () => {
  assert.match(uno('entré a las 7')[0].obs, /Falta hora de salida/);
  assert.strictEqual(uno('7 a 16 (8 horas)')[0].estado, 'Revisar');
  assert.strictEqual(uno('20 horas')[0].estado, 'Revisar');
  assert.strictEqual(uno('trabajé toda la mañana y 3 de la tarde horas extras raras')[0].estado, 'Revisar');
  const dup = P.processChat('[18:05, 24/10/2026] Ana: 8 hs\n[18:30, 24/10/2026] Ana: perdón, 9 hs');
  assert.deepStrictEqual(dup.map(r => r.estado), ['Revisar', 'Revisar']);
});

test('mensajes sin horas se ignoran', () => {
  const chat = '[18:05, 24/10/2026] Jefe: Recuerden mandar las horas\n[18:06, 24/10/2026] Ana: ok gracias\n[18:07, 24/10/2026] Ana: 👍';
  assert.deepStrictEqual(P.processChat(chat), []);
});

test('mensajes de varias líneas', () => {
  const chat = '24/10/2026, 18:05 - Juan: Buenas, mis horas:\nLunes 20/10 7 a 16\nMartes 21/10 7 a 16\n24/10/2026, 18:06 - Ana: 8 hs';
  const rows = P.processChat(chat);
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(rows.filter(r => r.funcionario === 'Juan').map(r => r.fecha), ['2026-10-20', '2026-10-21']);
});

test('marcar duplicados dos veces no repite la nota', () => {
  const rows = P.processChat('[18:05, 24/10/2026] Ana: 8 hs\n[18:30, 24/10/2026] Ana: 9 hs');
  P.marcarDuplicados(rows);
  assert.strictEqual(rows[0].obs.match(/Hay 2 registros/g).length, 1);
});

test('día de la semana que no coincide con la fecha se marca', () => {
  const [r] = uno('Lunes 20/10 7 a 16');
  assert.strictEqual(r.fecha, '2026-10-20');
  assert.strictEqual(r.estado, 'Revisar');
  assert.match(r.obs, /es martes/);
  assert.strictEqual(uno('Martes 20/10 7 a 16')[0].estado, 'OK');
});
