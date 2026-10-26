const test = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./simulador.js');

const { ctx: G } = crearEntorno();

test('horas normales: lunes a jueves 9 h, viernes 8 h', () => {
  // 1 al 15 de octubre de 2026: jue 1 ... jue 15 → 9 días lun-jue (81 h) + 2 viernes (16 h)
  assert.strictEqual(G.horasEsperadas('2026-10-01', '2026-10-15', []), 97);
  // Semana completa
  assert.strictEqual(G.horasEsperadas('2026-10-19', '2026-10-25', []), 44);
  // Con feriado un lunes
  assert.strictEqual(G.horasEsperadas('2026-10-19', '2026-10-25', ['2026-10-19']), 35);
  // Fin de semana solo
  assert.strictEqual(G.horasEsperadas('2026-10-24', '2026-10-25', []), 0);
});

test('conceptos: ropa, transporte y herramientas = horas; ticket = horas / 8; descanso y viático = días (horas / 8 redondeado)', () => {
  assert.deepStrictEqual(Array.from(G.calcularConceptos(44)), [44, 44, 44, 5.5, 6, 6]);
  assert.deepStrictEqual(Array.from(G.calcularConceptos(9)), [9, 9, 9, 1.13, 1, 1]);
  assert.deepStrictEqual(Array.from(G.calcularConceptos(18)), [18, 18, 18, 2.25, 2, 2]); // el ejemplo del JORNAL
});

test('quincenas', () => {
  assert.deepStrictEqual({ ...G.quincenaSiguiente('2026-10-15') }, { desde: '2026-10-16', hasta: '2026-10-31' });
  assert.deepStrictEqual({ ...G.quincenaSiguiente('2026-10-31') }, { desde: '2026-11-01', hasta: '2026-11-15' });
  assert.deepStrictEqual({ ...G.quincenaSiguiente('2026-12-31') }, { desde: '2027-01-01', hasta: '2027-01-15' });
  assert.deepStrictEqual({ ...G.quincenaDe('2028-02-20') }, { desde: '2028-02-16', hasta: '2028-02-29' });
});

test('validación de lo que manda el formulario', () => {
  const t = ['Ana'], o = ['Obra A', 'Obra B'];
  assert.deepStrictEqual(JSON.parse(JSON.stringify(G.validarCarga({ trabajador: 'Ana', items: [{ obra: 'Obra A', horas: '40,5' }, { obra: 'Obra B', horas: 4 }] }, t, o))),
    { items: [{ obra: 'Obra A', horas: 40.5 }, { obra: 'Obra B', horas: 4 }], extra: 0 });
  // Obras "Otra" escritas a mano y horas extra
  assert.deepStrictEqual(JSON.parse(JSON.stringify(G.validarCarga({ trabajador: 'Ana', items: [{ obra: 'Obra A', horas: 8 }],
    otras: [{ nombre: '  Casa   de Pedro ', horas: '4,5' }], extra: '6' }, t, o))),
    { items: [{ obra: 'Obra A', horas: 8 }, { obra: 'Otra: Casa de Pedro', horas: 4.5 }], extra: 6 });
  // Solo una "Otra" alcanza
  assert.strictEqual(G.validarCarga({ trabajador: 'Ana', otras: [{ nombre: 'Galpón', horas: 9 }] }, t, o).items[0].obra, 'Otra: Galpón');
  assert.throws(() => G.validarCarga({ trabajador: 'Ana', otras: [{ nombre: ' ', horas: 9 }] }, t, o), /nombre de la obra/);
  assert.throws(() => G.validarCarga({ trabajador: 'Ana', otras: [{ nombre: 'Galpón', horas: 0 }] }, t, o), /Revisá las horas de "Galpón"/);
  assert.throws(() => G.validarCarga({ trabajador: 'Ana', otras: [{ nombre: 'Galpón', horas: 1 }, { nombre: 'galpón', horas: 2 }] }, t, o), /repetida/);
  assert.throws(() => G.validarCarga({ trabajador: 'Ana', items: [{ obra: 'Obra A', horas: 1 }], extra: -2 }, t, o), /horas extra/);
  assert.throws(() => G.validarCarga({ trabajador: 'Ana', extra: 5 }, t, o), /al menos una obra/);
  assert.throws(() => G.validarCarga({ trabajador: 'Pedro', items: [{ obra: 'Obra A', horas: 1 }] }, t, o), /nombre/);
  assert.throws(() => G.validarCarga({ trabajador: 'Ana', items: [] }, t, o), /al menos una obra/);
  assert.throws(() => G.validarCarga({ trabajador: 'Ana', items: [{ obra: 'Obra Z', horas: 1 }] }, t, o), /no está en la lista/);
  assert.throws(() => G.validarCarga({ trabajador: 'Ana', items: [{ obra: 'Obra A', horas: 0 }] }, t, o), /Revisá las horas/);
  assert.throws(() => G.validarCarga({ trabajador: 'Ana', items: [{ obra: 'Obra A', horas: 1 }, { obra: 'Obra A', horas: 2 }] }, t, o), /repetida/);
});

test('mensaje y teléfono de WhatsApp', () => {
  assert.strictEqual(G.telefonoWhatsApp('099 123 456'), '59899123456');
  assert.strictEqual(G.telefonoWhatsApp('+598 99 123 456'), '59899123456');
  assert.strictEqual(G.armarMensaje('Hola {nombre}: {link}', { nombre: 'Ana', link: 'https://x' }), 'Hola Ana: https://x');
});

// ---------------------------------------------------------------------------
// Flujo completo sobre la planilla simulada
// ---------------------------------------------------------------------------

function prepararLibro() {
  const env = crearEntorno();
  const { ctx, hoja } = env;
  ctx.instalar();
  const cfg = hoja('Configuración');
  cfg.getRange('B2').setValue(ctx.isoAFecha('2026-10-16'));
  cfg.getRange('B3').setValue(ctx.isoAFecha('2026-10-31'));
  cfg.getRange('B4').setValue('https://script.google.com/macros/s/XYZ/exec');
  cfg.getRange('B6').setValue(false); // estas pruebas usan la lista de nombres; la cédula se prueba aparte
  const obras = hoja('Obras');
  obras.getRange('A2:B5').setValues([['Edificio Pocitos', true], ['Casa Carrasco', true], ['Local Centro', true], ['Obra terminada', false]]);
  const trab = hoja('Trabajadores');
  trab.getRange('A2:C5').setValues([
    ['Juan Pérez', '099123456', true], ['Ana Gómez', '098765432', true], ['Luis Rodríguez', '', true], ['Ex empleado', '', false]
  ]);
  return env;
}

test('instalar crea las hojas', () => {
  const { libro } = prepararLibro();
  assert.deepStrictEqual(libro.getSheets().map(h => h.getName()), [
    'Configuración', 'Obras', 'Trabajadores', 'Respuestas', 'Resumen por obra', 'Detalle por trabajador', 'Control'
  ]);
});

test('preparar mensajes genera códigos, links personales y botón de WhatsApp', () => {
  const { ctx, hoja, dialogos } = prepararLibro();
  ctx.prepararMensajes();
  const trab = hoja('Trabajadores');
  const codigo = trab.getRange('D2').getValue();
  assert.match(codigo, /^[0-9a-f]{10}$/);
  assert.strictEqual(trab.getRange('E2').getValue(), 'https://script.google.com/macros/s/XYZ/exec?c=' + codigo);
  assert.strictEqual(trab.getRange('F2').getValue(), 'Enviar');
  const wa = trab.links['2,6'];
  assert.match(wa, /^https:\/\/wa\.me\/59899123456\?text=/);
  assert.match(decodeURIComponent(wa.split('text=')[1]), /^Hola Juan, por favor cargá tus horas de la quincena del 16\/10\/2026 al 31\/10\/2026 en este link: https:\/\/script.google.com\/macros\/s\/XYZ\/exec\?c=/);
  assert.strictEqual(trab.getRange('F4').getValue(), ''); // Luis no tiene celular
  // Volver a preparar mantiene el mismo código
  ctx.prepararMensajes();
  assert.strictEqual(trab.getRange('D2').getValue(), codigo);
  assert.match(dialogos.at(-1)[1], /Hola, por favor cargá tus horas/);
});

function get(ctx, parametros) { return JSON.parse(ctx.doGet({ parameter: parametros }).texto); }
function post(ctx, pedido) { return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(pedido) } }).texto); }

test('API del formulario: con link personal viene el nombre; sin link, la lista', () => {
  const { ctx, hoja } = prepararLibro();
  ctx.prepararMensajes();
  const codigo = hoja('Trabajadores').getRange('D3').getValue();

  const personal = get(ctx, { accion: 'datos', codigo });
  assert.strictEqual(get(ctx, { accion: 'datos', c: codigo }).resultado.trabajador, 'Ana Gómez'); // compatibilidad
  assert.strictEqual(personal.ok, true);
  assert.strictEqual(personal.resultado.trabajador, 'Ana Gómez');
  assert.deepStrictEqual(personal.resultado.trabajadores, []);
  assert.deepStrictEqual(personal.resultado.obras, ['Casa Carrasco', 'Edificio Pocitos', 'Local Centro']);
  assert.strictEqual(personal.resultado.esperadas, 96); // 16 al 31/10/2026: viernes 16, 23 y 30 (24 h) + 8 días lun-jue (72 h)
  assert.strictEqual(personal.resultado.desde, '16/10/2026');

  const general = get(ctx, { accion: 'datos' }).resultado;
  assert.strictEqual(general.trabajador, null);
  assert.deepStrictEqual(general.trabajadores, ['Ana Gómez', 'Juan Pérez', 'Luis Rodríguez']);
  assert.strictEqual(get(ctx, { accion: 'datos', c: 'falso' }).resultado.trabajador, null);

  // Guardar y consultar por POST
  const ok = post(ctx, { accion: 'guardar', carga: { codigo, items: [{ obra: 'Local Centro', horas: 96 }] } });
  assert.deepStrictEqual([ok.ok, ok.resultado.trabajador, ok.resultado.total], [true, 'Ana Gómez', 96]);
  assert.deepStrictEqual(post(ctx, { accion: 'anterior', trabajador: 'Ana Gómez' }).resultado, [{ obra: 'Local Centro', horas: 96 }]);
  assert.deepStrictEqual(post(ctx, { accion: 'guardar', carga: { trabajador: 'Nadie', items: [] } }),
    { ok: false, error: 'Elegí tu nombre de la lista.' });
  assert.strictEqual(post(ctx, { accion: 'otra' }).ok, false);

  // JSONP (para Safari del iPhone): lo mismo por GET con callback
  const js = ctx.doGet({ parameter: { accion: 'guardar', datos: JSON.stringify({ trabajador: 'Juan Pérez', items: [{ obra: 'Casa Carrasco', horas: 8 }] }), callback: 'cb1' } }).texto;
  assert.match(js, /^cb1\(\{"ok":true,"resultado":\{"trabajador":"Juan Pérez","total":8,/);
  assert.match(ctx.doGet({ parameter: { accion: 'anterior', trabajador: 'Juan Pérez', callback: 'cb2' } }).texto, /^cb2\(\{"ok":true,"resultado":\[\{"obra":"Casa Carrasco","horas":8\}\]\}\);$/);
  assert.match(ctx.doGet({ parameter: { accion: 'datos', callback: 'cb3' } }).texto, /^cb3\(\{"ok":true/);
  // Un callback raro no se ejecuta como código
  assert.match(ctx.doGet({ parameter: { accion: 'datos', callback: 'alert(1)//' } }).texto, /^\{"ok":true/);

  // Abrir el link de Apps Script directo lleva a la página
  hoja('Configuración').getRange('B4').setValue('https://estudio.github.io/horas/');
  assert.match(ctx.doGet({ parameter: {} }).contenido, /href="https:\/\/estudio.github.io\/horas\/"/);
});

test('respuestas, reemplazo y resumen por obra con conceptos', () => {
  const { ctx, hoja } = prepararLibro();
  ctx.prepararMensajes();
  const codigoAna = hoja('Trabajadores').getRange('D3').getValue();

  ctx.guardarRespuesta({ trabajador: 'Juan Pérez', items: [{ obra: 'Edificio Pocitos', horas: 60 }, { obra: 'Casa Carrasco', horas: 36 }] });
  // Ana primero se equivoca y después corrige: queda solo lo último
  ctx.guardarRespuesta({ codigo: codigoAna, items: [{ obra: 'Edificio Pocitos', horas: 10 }] });
  const res = ctx.guardarRespuesta({ codigo: codigoAna, items: [{ obra: 'Edificio Pocitos', horas: 80 }, { obra: 'Local Centro', horas: '10,5' }] });
  assert.strictEqual(res.trabajador, 'Ana Gómez');
  assert.strictEqual(res.total, 90.5);
  assert.strictEqual(res.esperadas, 96);

  assert.strictEqual(hoja('Respuestas').getLastRow(), 5); // encabezado + 2 de Juan + 2 de Ana

  assert.throws(() => ctx.guardarRespuesta({ codigo: 'otro', items: [{ obra: 'Local Centro', horas: 1 }] }), /link no es válido/);
  assert.throws(() => ctx.guardarRespuesta({ trabajador: 'Ex empleado', items: [{ obra: 'Local Centro', horas: 1 }] }), /nombre/);
  assert.throws(() => ctx.guardarRespuesta({ trabajador: 'Juan Pérez', items: [{ obra: 'Obra terminada', horas: 1 }] }), /no está en la lista/);

  const porObra = hoja('Resumen por obra').valores();
  assert.strictEqual(porObra[0][0], 'Quincena del 16/10/2026 al 31/10/2026');
  assert.deepStrictEqual(porObra[1], ['Obra', 'Horas', 'Ropa', 'Transporte', 'Herramientas', 'Ticket alimentación', 'Descanso pago', 'Viático', 'Trabajadores']);
  assert.deepStrictEqual(porObra.slice(2), [
    // Días hábiles 16-31/10: 11. Juan (36 + 60 = 96 h) daría 12 días: tope 11, repartidos 4 y 7.
    // Ana (80 + 10,5 = 90,5 h): 11 días, repartidos 10 y 1.
    ['Casa Carrasco', 36, 36, 36, 36, 4.5, 4, 4, 1],
    ['Edificio Pocitos', 140, 140, 140, 140, 17.5, 17, 17, 2],
    ['Local Centro', 10.5, 10.5, 10.5, 10.5, 1.31, 1, 1, 1],
    ['TOTAL', '=SUM(B3:B5)', '=SUM(C3:C5)', '=SUM(D3:D5)', '=SUM(E3:E5)', '=SUM(F3:F5)', '=SUM(G3:G5)', '=SUM(H3:H5)', '=SUM(I3:I5)']
  ]);

  assert.deepStrictEqual(hoja('Detalle por trabajador').valores().slice(2), [
    ['Ana Gómez', 'Edificio Pocitos', 80, 80, 80, 80, 10, 10, 10],
    ['Ana Gómez', 'Local Centro', 10.5, 10.5, 10.5, 10.5, 1.31, 1, 1],
    ['Juan Pérez', 'Casa Carrasco', 36, 36, 36, 36, 4.5, 4, 4],
    ['Juan Pérez', 'Edificio Pocitos', 60, 60, 60, 60, 7.5, 7, 7]
  ]);

  assert.deepStrictEqual(hoja('Control').valores().slice(2), [
    ['Ana Gómez', 'Sí', 90.5, 96, -5.5, 0, 'Cargó horas de menos'],
    ['Juan Pérez', 'Sí', 96, 96, 0, 0, 'OK'],
    ['Luis Rodríguez', 'No', '', 96, '', '', 'Falta responder']
  ]);

  // La respuesta anterior se ofrece para corregir
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.obtenerRespuestaAnterior('Juan Pérez'))),
    [{ obra: 'Edificio Pocitos', horas: 60 }, { obra: 'Casa Carrasco', horas: 36 }]);
  assert.strictEqual(ctx.obtenerRespuestaAnterior('Luis Rodríguez'), null);
});

test('pasar a la quincena siguiente deja el resumen vacío y conserva las respuestas', () => {
  const { ctx, hoja } = prepararLibro();
  ctx.guardarRespuesta({ trabajador: 'Juan Pérez', items: [{ obra: 'Local Centro', horas: 105 }] });
  ctx.pasarQuincenaSiguiente();
  assert.match(hoja('Resumen por obra').getRange('A1').getValue(), /01\/11\/2026 al 15\/11\/2026/);
  assert.strictEqual(hoja('Resumen por obra').getRange('A3').getValue(), 'Todavía no hay respuestas para esta quincena.');
  assert.strictEqual(hoja('Respuestas').getLastRow(), 2);
  // Volver a la quincena anterior muestra de nuevo sus datos
  hoja('Configuración').getRange('B2').setValue(ctx.isoAFecha('2026-10-16'));
  hoja('Configuración').getRange('B3').setValue(ctx.isoAFecha('2026-10-31'));
  ctx.actualizarResumen();
  assert.strictEqual(hoja('Resumen por obra').getRange('A3').getValue(), 'Local Centro');
});

test('feriados de la hoja Configuración descuentan horas', () => {
  const { ctx, hoja } = prepararLibro();
  hoja('Configuración').getRange('D2').setValue(ctx.isoAFecha('2026-10-19'));
  assert.strictEqual(ctx.leerConfig().esperadas, 87); // 96 - lunes 19/10
});

test('obras "Otra" y horas extra en los resúmenes', () => {
  const { ctx, hoja } = prepararLibro();
  const res = ctx.guardarRespuesta({ trabajador: 'Juan Pérez', items: [{ obra: 'Edificio Pocitos', horas: 80 }],
    otras: [{ nombre: 'Casa de Pedro', horas: 16 }], extra: 10 });
  assert.deepStrictEqual([res.total, res.extra], [96, 10]);
  ctx.guardarRespuesta({ trabajador: 'Ana Gómez', otras: [{ nombre: 'Casa de Pedro', horas: 8 }], extra: '2,5' });

  assert.deepStrictEqual(hoja('Respuestas').valores().slice(1).map(r => [r[3], r[4], r[5]]), [
    ['Juan Pérez', 'Edificio Pocitos', 80], ['Juan Pérez', 'Otra: Casa de Pedro', 16], ['Juan Pérez', 'Horas extra', 10],
    ['Ana Gómez', 'Otra: Casa de Pedro', 8], ['Ana Gómez', 'Horas extra', 2.5]
  ]);

  // Las horas extra no se suman a las obras ni a los conceptos
  const porObra = hoja('Resumen por obra').valores();
  assert.deepStrictEqual(porObra.slice(2, 4), [
    // Juan: 80 + 16 = 96 h -> tope 11 días, repartidos 9 y 2; Ana: 8 h -> 1 día
    ['Edificio Pocitos', 80, 80, 80, 80, 10, 9, 9, 1],
    ['Otra: Casa de Pedro', 24, 24, 24, 24, 3, 3, 3, 2]
  ]);
  assert.strictEqual(porObra[4][0], 'TOTAL');
  assert.deepStrictEqual(porObra[6].slice(0, 2), ['Horas extra (aparte, no incluidas arriba)', 12.5]);

  assert.deepStrictEqual(hoja('Detalle por trabajador').valores().slice(2).map(r => r.slice(0, 4)), [
    ['Ana Gómez', 'Otra: Casa de Pedro', 8, 8],
    ['Ana Gómez', 'Horas extra', 2.5, ''],
    ['Juan Pérez', 'Edificio Pocitos', 80, 80],
    ['Juan Pérez', 'Otra: Casa de Pedro', 16, 16],
    ['Juan Pérez', 'Horas extra', 10, '']
  ]);
  assert.deepStrictEqual(hoja('Control').valores().slice(2, 4), [
    ['Ana Gómez', 'Sí', 8, 96, -88, 2.5, 'Cargó horas de menos'],
    ['Juan Pérez', 'Sí', 96, 96, 0, 10, 'OK']
  ]);

  // La respuesta anterior incluye las "Otra" y las horas extra, para corregir
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.obtenerRespuestaAnterior('Juan Pérez'))), [
    { obra: 'Edificio Pocitos', horas: 80 }, { obra: 'Otra: Casa de Pedro', horas: 16 }, { obra: 'Horas extra', horas: 10 }
  ]);
  // Corregir sin horas extra borra el renglón de extra
  ctx.guardarRespuesta({ trabajador: 'Juan Pérez', items: [{ obra: 'Edificio Pocitos', horas: 96 }] });
  assert.deepStrictEqual(hoja('Control').valores()[3], ['Juan Pérez', 'Sí', 96, 96, 0, 0, 'OK']);
});

test('identificación por cédula con el link general', () => {
  const { ctx, hoja, dialogos } = prepararLibro();
  const cfg = hoja('Configuración');
  assert.strictEqual(cfg.getRange('A6').getValue(), 'Pedir cédula (link general)');
  cfg.getRange('B6').setValue(true);
  assert.strictEqual(hoja('Trabajadores').getRange('G1').getValue(), 'Cédula');
  hoja('Trabajadores').getRange('G2:G3').setValues([['1.234.567-8'], ['4.567.890-1']]);

  // Sin cédula: no se muestra la lista de nombres
  const sin = get(ctx, { accion: 'datos' }).resultado;
  assert.deepStrictEqual([sin.pideCedula, sin.trabajadores, sin.trabajador, sin.version], [true, [], null, 3]);

  // Con cédula (con o sin puntos): viene el nombre fijo
  const juan = get(ctx, { accion: 'datos', cedula: '12345678' }).resultado;
  assert.deepStrictEqual([juan.pideCedula, juan.trabajador, juan.codigo], [false, 'Juan Pérez', '']);
  assert.strictEqual(get(ctx, { accion: 'datos', cedula: '4567890-1' }).resultado.trabajador, 'Ana Gómez');

  // Cédula equivocada
  assert.deepStrictEqual(get(ctx, { accion: 'datos', cedula: '99999999' }),
    { ok: false, error: 'No encontramos esa cédula. Revisala o avisale a la oficina.' });

  // Guardar exige cédula (o link personal); el nombre que mande la página no alcanza
  assert.deepStrictEqual(post(ctx, { accion: 'guardar', carga: { trabajador: 'Juan Pérez', items: [{ obra: 'Local Centro', horas: 8 }] } }),
    { ok: false, error: 'Ingresá tu cédula.' });
  const ok = post(ctx, { accion: 'guardar', carga: { cedula: '1.234.567-8', trabajador: 'Ana Gómez', items: [{ obra: 'Local Centro', horas: 8 }] } });
  assert.strictEqual(ok.resultado.trabajador, 'Juan Pérez'); // manda la cédula, no el nombre
  // Al volver a entrar con la cédula, viene lo que ya cargó
  assert.deepStrictEqual(get(ctx, { accion: 'datos', cedula: '12345678' }).resultado.anterior, [{ obra: 'Local Centro', horas: 8 }]);
  // Nadie puede ver las horas de otro por nombre
  assert.strictEqual(post(ctx, { accion: 'anterior', trabajador: 'Juan Pérez' }).ok, false);

  // El link personal sigue funcionando sin cédula; el diálogo avisa quién no tiene cédula
  ctx.prepararMensajes();
  assert.match(dialogos.at(-1)[1], /sin cédula cargada.*Luis Rodríguez/);
  assert.doesNotMatch(dialogos.at(-1)[1], /sin cédula cargada.*Juan Pérez/);
  const codigo = hoja('Trabajadores').getRange('D3').getValue();
  assert.strictEqual(get(ctx, { accion: 'datos', codigo }).resultado.trabajador, 'Ana Gómez');
  assert.strictEqual(post(ctx, { accion: 'guardar', carga: { codigo, items: [{ obra: 'Local Centro', horas: 9 }] } }).ok, true);
});

test('freno a quien prueba muchas cédulas', () => {
  const { ctx, hoja } = prepararLibro();
  hoja('Configuración').getRange('B6').setValue(true);
  hoja('Trabajadores').getRange('G2').setValue('12345678');
  for (let i = 0; i < 30; i++) assert.strictEqual(get(ctx, { accion: 'datos', cedula: String(10000000 + i) }).ok, false);
  assert.match(get(ctx, { accion: 'datos', cedula: '12345678' }).error, /Demasiados intentos/);
});

test('JORNAL por obra: formato del programa de sueldos', () => {
  const respuestas = [
    { trabajador: 'Pérez Rodríguez, Juan Carlos', obra: 'Summit', horas: 18 },
    { trabajador: 'Pedro Siempre Veinte', obra: 'Selenza', horas: 44 },
    { trabajador: 'Ana', obra: 'Selenza', horas: 20 },
    { trabajador: 'Ana', obra: 'Summit', horas: 76 },
    { trabajador: 'Ana', obra: 'Horas extra', horas: 5 },
    { trabajador: 'Pepe', obra: 'Otra: Galpón', horas: 9 }
  ];
  const trab = { 'Pérez Rodríguez, Juan Carlos': { numero: 101 }, 'Pedro Siempre Veinte': { numero: 31, siempre20: true }, Ana: { numero: 40 } };
  const obras = { Summit: { centro: '2' }, Selenza: { centro: 'Selenza', viatico60: true } };
  const j = JSON.parse(JSON.stringify(G.armarJornales(respuestas, trab, obras)));
  assert.deepStrictEqual(j.map(x => [x.obra, x.centro]), [['Otra: Galpón', ''], ['Selenza', 'Selenza'], ['Summit', '2']]);
  // Igual al renglón del ejemplo que mandó la oficina
  assert.deepStrictEqual(j[2].filas.find(f => f[0] === 101), [101, 'Pérez Rodríguez, Juan Carlos', 18, '', 2, 2, '', 2.25, 18, 18, 18, 18, '', '', '', '', '']);
  assert.deepStrictEqual(j[2].filas.find(f => f[0] === 40), [40, 'Ana', 76, '', 10, 10, '', 9.5, 76, 76, 76, 76, '', '', '', '', '']);
  // Selenza va al 60%, salvo quien tiene "Viático siempre 20%". Ana: 20 h en Selenza -> 3 días (2,5 redondea arriba)
  assert.deepStrictEqual(j[1].filas.map(f => [f[1], f[5], f[6]]), [['Ana', '', 3], ['Pedro Siempre Veinte', 6, '']]);
  // Avisos: obra sin centro y trabajador sin número; las horas extra no entran
  assert.deepStrictEqual(j[0].avisos, ['la obra no tiene centro de costos', 'Pepe no tiene Nº de funcionario']);
  assert.ok(!j.some(x => x.obra === 'Horas extra'));
});

test('generar los archivos JORNAL desde la planilla', () => {
  const { ctx, hoja, dialogos, creados } = prepararLibro();
  hoja('Obras').getRange('C2:D3').setValues([['10', true], ['4', false]]);
  hoja('Trabajadores').getRange('H2:I2').setValues([[101, false]]);
  ctx.guardarRespuesta({ trabajador: 'Juan Pérez', items: [{ obra: 'Edificio Pocitos', horas: 18 }, { obra: 'Casa Carrasco', horas: 78 }], extra: 3 });
  ctx.generarJornales();
  assert.deepStrictEqual(creados.map(c => c.nombre), ['JORNAL 4 - Casa Carrasco', 'JORNAL 10 - Edificio Pocitos']);
  const mov = creados[1].hoja;
  assert.strictEqual(mov.getName(), 'Movimientos');
  const v = mov.valores();
  assert.deepStrictEqual(v[0].slice(0, 4), ['2', '', 'C102', 'C106']); // A1 siempre "2"; el centro (10) va en el nombre
  assert.deepStrictEqual(v[1].slice(0, 3), ['', 'Nombre', 'Horas Normales          ']);
  assert.deepStrictEqual(v[2], [101, 'Juan Pérez', 18, '', 2, '', 2, 2.25, 18, 18, 18, 18, '', '', '', '', '']);
  assert.match(dialogos.at(-1)[1], /export\?format=xlsx/);
});

test('días hábiles de la quincena', () => {
  assert.strictEqual(G.diasHabiles('2026-10-16', '2026-10-31', []), 11);
  assert.strictEqual(G.diasHabiles('2026-10-01', '2026-10-15', []), 11);
  assert.strictEqual(G.diasHabiles('2026-10-16', '2026-10-31', ['2026-10-19']), 10);
});

test('reparto de días entre obras con tope', () => {
  const r = (h, t) => ({ ...G.repartirDias(h, t) });
  assert.deepStrictEqual(r({ A: 18 }, 11), { A: 2 });                 // el ejemplo: 18 h -> 2 días
  assert.deepStrictEqual(r({ A: 20 }, 11), { A: 3 });                 // 2,5 -> 3
  assert.deepStrictEqual(r({ A: 120 }, 11), { A: 11 });               // 15 días -> tope 11
  assert.deepStrictEqual(r({ A: 4, B: 4, C: 4 }, 11), { A: 1, B: 1, C: 1 }); // cada obra por separado
  // El caso de la oficina: misma cantidad de horas en cada obra -> mismos días
  assert.deepStrictEqual(r({ Gala: 10, Selenza: 10, Chacho: 10 }, 11), { Gala: 1, Selenza: 1, Chacho: 1 });
  assert.deepStrictEqual(r({ Selenza: 10, Chacho: 10 }, 11), { Selenza: 1, Chacho: 1 });
  assert.deepStrictEqual(r({ A: 60, B: 36 }, 11), { A: 7, B: 4 });    // 12 -> tope 11
  assert.deepStrictEqual(r({}, 11), {});
});

test('obras sin viático y tope en el JORNAL', () => {
  const resp = [
    { trabajador: 'Ana', obra: 'Gala', horas: 40 },
    { trabajador: 'Ana', obra: 'Summit', horas: 56 },
    { trabajador: 'Beto', obra: 'Summit', horas: 120 }
  ];
  const obras = { Gala: { centro: '8', sinViatico: true }, Summit: { centro: '2' } };
  const j = JSON.parse(JSON.stringify(G.armarJornales(resp, { Ana: { numero: 1 }, Beto: { numero: 2 } }, obras, 11)));
  const fila = (obra, n) => j.find(x => x.obra === obra).filas.find(f => f[1] === n);
  // Ana: descanso 96 h -> 12 días -> tope 11, repartidos Gala 5 y Summit 6; viático solo por Summit (56 h -> 7)
  assert.deepStrictEqual(fila('Gala', 'Ana').slice(4, 7), [5, '', '']);
  assert.deepStrictEqual(fila('Summit', 'Ana').slice(4, 7), [6, 7, '']);
  // Beto: 120 h -> 15 días -> tope 11 en descanso y en viático
  assert.deepStrictEqual(fila('Summit', 'Beto').slice(4, 7), [11, 11, '']);
  // En los resúmenes, Gala no suma viático
  const r = JSON.parse(JSON.stringify(G.resumir(resp, ['Ana', 'Beto'], 96, obras, 11)));
  assert.deepStrictEqual(r.porObra.map(f => [f[0], f[6], f[7]]), [['Gala', 5, 0], ['Summit', 17, 18]]);
});

test('JORNAL: el caso de la oficina (10 h en Gala, Selenza y Chacho)', () => {
  const resp = ['Gala', 'Selenza', 'Chacho'].map(obra => ({ trabajador: 'Ana', obra, horas: 10 }));
  const obras = { Gala: { centro: '8', sinViatico: true }, Selenza: { centro: 'SELENZA', viatico60: true }, Chacho: { centro: 'CHACHO' } };
  const j = JSON.parse(JSON.stringify(G.armarJornales(resp, { Ana: { numero: 46 } }, obras, 11)));
  // [obra, descanso, viático 20%, viático 60%, tickets]
  assert.deepStrictEqual(j.map(x => [x.obra, x.filas[0][4], x.filas[0][5], x.filas[0][6], x.filas[0][7]]), [
    ['Chacho', 1, 1, '', 1.25],
    ['Gala', 1, '', '', 1.25],
    ['Selenza', 1, '', 1, 1.25]
  ]);
});

test('Presentismo Mes Completo en la quincena que cierra el mes', () => {
  assert.strictEqual(G.esFinDeMes('2026-10-31'), true);
  assert.strictEqual(G.esFinDeMes('2026-10-15'), false);
  assert.strictEqual(G.esFinDeMes('2028-02-29'), true);
  // Octubre 2026: 1-15 = 97 h, 16-31 = 96 h -> 193 h
  assert.strictEqual(G.horasEsperadas('2026-10-01', '2026-10-31', []), 193);
  const mes = [
    { trabajador: 'Ana', obra: 'Summit', horas: 97 }, { trabajador: 'Ana', obra: 'Summit', horas: 60 },
    { trabajador: 'Ana', obra: 'Gala', horas: 36 },
    { trabajador: 'Beto', obra: 'Summit', horas: 97 }, { trabajador: 'Beto', obra: 'Summit', horas: 90 },
    { trabajador: 'Beto', obra: 'Horas extra', horas: 10 } // las extra no cuentan
  ];
  assert.deepStrictEqual(Array.from(G.trabajadoresMesCompleto(mes, 193)), ['Ana']);

  // Va un 1 en C112 solo en la obra con más horas de la quincena
  const quincena = [{ trabajador: 'Ana', obra: 'Summit', horas: 60 }, { trabajador: 'Ana', obra: 'Gala', horas: 36 },
    { trabajador: 'Beto', obra: 'Summit', horas: 90 }];
  const j = JSON.parse(JSON.stringify(G.armarJornales(quincena, {}, { Gala: {}, Summit: {} }, 11, ['Ana'])));
  const c112 = (obra, n) => j.find(x => x.obra === obra).filas.find(f => f[1] === n)[12];
  assert.deepStrictEqual([c112('Summit', 'Ana'), c112('Gala', 'Ana'), c112('Summit', 'Beto')], [1, '', '']);
});

test('generar JORNAL a fin de mes pone el presentismo del mes', () => {
  const { ctx, hoja, dialogos, creados } = prepararLibro();
  const cfg = hoja('Configuración');
  // Primera quincena de octubre
  cfg.getRange('B2').setValue(ctx.isoAFecha('2026-10-01'));
  cfg.getRange('B3').setValue(ctx.isoAFecha('2026-10-15'));
  ctx.guardarRespuesta({ trabajador: 'Juan Pérez', items: [{ obra: 'Edificio Pocitos', horas: 97 }] });
  ctx.guardarRespuesta({ trabajador: 'Ana Gómez', items: [{ obra: 'Edificio Pocitos', horas: 80 }] });
  ctx.generarJornales(); // primera quincena: no va
  assert.doesNotMatch(dialogos.at(-1)[1], /Presentismo Mes Completo/);
  assert.strictEqual(creados.at(-1).hoja.valores()[2][12], '');
  // Segunda quincena
  cfg.getRange('B2').setValue(ctx.isoAFecha('2026-10-16'));
  cfg.getRange('B3').setValue(ctx.isoAFecha('2026-10-31'));
  ctx.guardarRespuesta({ trabajador: 'Juan Pérez', items: [{ obra: 'Edificio Pocitos', horas: 96 }] });
  ctx.guardarRespuesta({ trabajador: 'Ana Gómez', items: [{ obra: 'Edificio Pocitos', horas: 96 }] });
  creados.length = 0;
  ctx.generarJornales();
  assert.match(dialogos.at(-1)[1], /Presentismo Mes Completo<\/b> \(horas normales del mes: 193\): Juan Pérez\./);
  const filas = creados[0].hoja.valores().slice(2);
  assert.deepStrictEqual(filas.map(f => [f[1], f[12]]), [['Ana Gómez', ''], ['Juan Pérez', 1]]);
});
