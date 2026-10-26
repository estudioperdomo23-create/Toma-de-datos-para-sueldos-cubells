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

test('conceptos: ropa, transporte y herramientas = horas; ticket, descanso y viático = horas / 8', () => {
  assert.deepStrictEqual(Array.from(G.calcularConceptos(44)), [44, 44, 44, 5.5, 5.5, 5.5]);
  assert.deepStrictEqual(Array.from(G.calcularConceptos(9)), [9, 9, 9, 1.13, 1.13, 1.13]);
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
    ['Casa Carrasco', 36, 36, 36, 36, 4.5, 4.5, 4.5, 1],
    ['Edificio Pocitos', 140, 140, 140, 140, 17.5, 17.5, 17.5, 2],
    ['Local Centro', 10.5, 10.5, 10.5, 10.5, 1.31, 1.31, 1.31, 1],
    ['TOTAL', '=SUM(B3:B5)', '=SUM(C3:C5)', '=SUM(D3:D5)', '=SUM(E3:E5)', '=SUM(F3:F5)', '=SUM(G3:G5)', '=SUM(H3:H5)', '=SUM(I3:I5)']
  ]);

  assert.deepStrictEqual(hoja('Detalle por trabajador').valores().slice(2), [
    ['Ana Gómez', 'Edificio Pocitos', 80, 80, 80, 80, 10, 10, 10],
    ['Ana Gómez', 'Local Centro', 10.5, 10.5, 10.5, 10.5, 1.31, 1.31, 1.31],
    ['Juan Pérez', 'Casa Carrasco', 36, 36, 36, 36, 4.5, 4.5, 4.5],
    ['Juan Pérez', 'Edificio Pocitos', 60, 60, 60, 60, 7.5, 7.5, 7.5]
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
    ['Edificio Pocitos', 80, 80, 80, 80, 10, 10, 10, 1],
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
