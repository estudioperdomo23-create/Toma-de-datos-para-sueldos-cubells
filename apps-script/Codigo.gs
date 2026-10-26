/**
 * Horas por obra — Cubells
 *
 * Los trabajadores cargan desde el celular (link enviado por WhatsApp) las horas
 * de la quincena en una o varias obras. La planilla arma el resumen por obra y por
 * trabajador con los conceptos para sueldos.
 */

// ---------------------------------------------------------------------------
// Parámetros
// ---------------------------------------------------------------------------

var HOJA = {
  CONFIG: 'Configuración',
  OBRAS: 'Obras',
  TRABAJADORES: 'Trabajadores',
  RESPUESTAS: 'Respuestas',
  POR_OBRA: 'Resumen por obra',
  DETALLE: 'Detalle por trabajador',
  CONTROL: 'Control'
};

// Horario normal por día de la semana (0 = domingo ... 6 = sábado)
var HORAS_POR_DIA = { 1: 9, 2: 9, 3: 9, 4: 9, 5: 8 };

// Horas que equivalen a un día para ticket, descanso pago y viático
var HORAS_JORNADA = 8;

var CONCEPTOS = [
  { nombre: 'Ropa', calc: function (h) { return h; } },
  { nombre: 'Transporte', calc: function (h) { return h; } },
  { nombre: 'Herramientas', calc: function (h) { return h; } },
  { nombre: 'Ticket alimentación', calc: function (h) { return h / HORAS_JORNADA; } },
  { nombre: 'Descanso pago', calc: diasTrabajados },
  { nombre: 'Viático', calc: diasTrabajados }
];

/** Descanso pago y viático van por día trabajado: horas ÷ 8 redondeado al día más cercano. */
function diasTrabajados(h) { return Math.round(h / HORAS_JORNADA); }

// Formato de importación del programa de sueldos (archivo JORNAL, hoja "Movimientos").
// Fila 1: "2" en A1 (lo exige el programa) y códigos de concepto; fila 2: títulos; después un renglón por
// trabajador. El centro de costos de la obra va en el nombre del archivo.
var JORNAL_A1 = '2';
var JORNAL_CODIGOS = ['C102', 'C106', 'C108', 'C132', 'C133', 'C152', 'C111', 'C115', 'C114', 'C116', 'C112', 'I601', 'I651', 'C649', 'C518'];
var JORNAL_TITULOS = ['Horas Normales          ', 'Jornal Feriado NoTrabaja', 'Descanso Pago           ', 'Viatico 20%             ',
  'Viatico 60%             ', 'Tickets Alimentacion $  ', 'Presentismo Semanal     ', 'Ropa                    ',
  'Transporte              ', 'Herramientas            ', 'Presentismo Mes Completo', 'Vales                   ',
  'ANDA CRÉDITO            ', 'Ret Judicial BPC        ', 'SUNCA                   '];

// Obras que el trabajador escribe a mano ("Otra") se guardan con este prefijo
var PREFIJO_OTRA = 'Otra: ';
// Renglón de Respuestas con las horas extra de la quincena (no es una obra)
var FILA_EXTRA = 'Horas extra';

var MENSAJE_PREDETERMINADO =
  'Hola {nombre}, por favor cargá tus horas de la quincena del {desde} al {hasta} en este link: {link}';

// Filas fijas de la hoja Configuración (columna B)
var CFG = { DESDE: 2, HASTA: 3, LINK: 4, MENSAJE: 5, PEDIR_CEDULA: 6 };

// Intentos de cédula equivocados tolerados (en total) cada 10 minutos, para frenar a quien pruebe números
var MAX_FALLOS_CEDULA = 30;

// ---------------------------------------------------------------------------
// Cálculos (sin acceso a la planilla; se prueban en test/)
// ---------------------------------------------------------------------------

function redondear(n) { return Math.round(n * 100) / 100; }

function isoAFecha(iso) { var p = iso.split('-'); return new Date(+p[0], p[1] - 1, +p[2], 12); }

function fechaAIso(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function isoATexto(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

/** Horas de trabajo normales entre dos fechas (inclusive), sin contar feriados. */
function horasEsperadas(desdeIso, hastaIso, feriadosIso) {
  var feriados = Object.create(null);
  (feriadosIso || []).forEach(function (f) { feriados[f] = true; });
  var total = 0;
  for (var d = isoAFecha(desdeIso); fechaAIso(d) <= hastaIso; d.setDate(d.getDate() + 1)) {
    if (!feriados[fechaAIso(d)]) total += HORAS_POR_DIA[d.getDay()] || 0;
  }
  return total;
}

/** Días hábiles entre dos fechas (inclusive): lunes a viernes, sin feriados. */
function diasHabiles(desdeIso, hastaIso, feriadosIso) {
  var feriados = Object.create(null);
  (feriadosIso || []).forEach(function (f) { feriados[f] = true; });
  var total = 0;
  for (var d = isoAFecha(desdeIso); fechaAIso(d) <= hastaIso; d.setDate(d.getDate() + 1)) {
    if (HORAS_POR_DIA[d.getDay()] && !feriados[fechaAIso(d)]) total++;
  }
  return total;
}

/**
 * Días (descanso pago o viático) de un trabajador en cada obra: horas de la obra ÷ 8 redondeado
 * al día más cercano, así misma cantidad de horas da siempre los mismos días. Si la suma pasa el
 * tope (días hábiles de la quincena), el tope se reparte en proporción a las horas de cada obra y
 * los días que sobran del redondeo van a las obras con mayor resto.
 * horasPorObra: {obra: horas} -> {obra: días}
 */
function repartirDias(horasPorObra, tope) {
  var obras = Object.keys(horasPorObra).filter(function (o) { return horasPorObra[o] > 0; });
  var dias = Object.create(null);
  obras.forEach(function (o) { dias[o] = diasTrabajados(horasPorObra[o]); });
  if (obras.reduce(function (s, o) { return s + dias[o]; }, 0) <= tope) return dias;

  var suma = obras.reduce(function (s, o) { return s + horasPorObra[o]; }, 0);
  var total = tope;
  var restos = obras.map(function (o) {
    var cuota = horasPorObra[o] * total / suma;
    dias[o] = Math.floor(cuota + 1e-9);
    return { obra: o, resto: cuota - dias[o], horas: horasPorObra[o] };
  });
  var faltan = total - obras.reduce(function (s, o) { return s + dias[o]; }, 0);
  restos.sort(function (a, b) { return (b.resto - a.resto) || (b.horas - a.horas) || compararTexto(a.obra, b.obra); });
  for (var i = 0; i < faltan; i++) dias[restos[i].obra]++;
  return dias;
}

/**
 * Horas y días por trabajador y obra (sin horas extra).
 * Devuelve {trabajador: {obra: {horas, descanso, viatico}}}. Las obras con "Sin viático" no
 * cuentan para el viático.
 */
function diasPorTrabajador(respuestas, infoObras, tope) {
  var horas = Object.create(null);
  respuestas.forEach(function (r) {
    if (r.obra === FILA_EXTRA || !(r.horas > 0)) return;
    var t = horas[r.trabajador] = horas[r.trabajador] || Object.create(null);
    t[r.obra] = (t[r.obra] || 0) + r.horas;
  });
  var salida = Object.create(null);
  Object.keys(horas).forEach(function (n) {
    var conViatico = Object.create(null);
    Object.keys(horas[n]).forEach(function (o) { if (!(infoObras[o] || {}).sinViatico) conViatico[o] = horas[n][o]; });
    var descanso = repartirDias(horas[n], tope);
    var viatico = repartirDias(conViatico, tope);
    salida[n] = Object.create(null);
    Object.keys(horas[n]).forEach(function (o) {
      salida[n][o] = { horas: redondear(horas[n][o]), descanso: descanso[o] || 0, viatico: viatico[o] || 0 };
    });
  });
  return salida;
}

/** Conceptos para una cantidad de horas: [ropa, transporte, herramientas, ticket, descanso, viático] */
function calcularConceptos(horas) {
  return CONCEPTOS.map(function (c) { return redondear(c.calc(horas)); });
}

/** La quincena siguiente: 1–15 o 16–fin de mes. */
function quincenaSiguiente(hastaIso) {
  var d = isoAFecha(hastaIso);
  d.setDate(d.getDate() + 1);
  var desde = fechaAIso(d);
  var hasta = d.getDate() <= 15
    ? fechaAIso(new Date(d.getFullYear(), d.getMonth(), 15, 12))
    : fechaAIso(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
  return { desde: desde, hasta: hasta };
}

/** La quincena que contiene una fecha. */
function quincenaDe(iso) {
  var d = isoAFecha(iso);
  return d.getDate() <= 15
    ? { desde: fechaAIso(new Date(d.getFullYear(), d.getMonth(), 1, 12)), hasta: fechaAIso(new Date(d.getFullYear(), d.getMonth(), 15, 12)) }
    : { desde: fechaAIso(new Date(d.getFullYear(), d.getMonth(), 16, 12)), hasta: fechaAIso(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)) };
}

/**
 * Valida lo que manda el formulario. Devuelve los renglones a guardar o lanza un error
 * con un mensaje para mostrarle al trabajador.
 */
function validarCarga(carga, trabajadoresActivos, obrasActivas) {
  if (!carga || trabajadoresActivos.indexOf(carga.trabajador) < 0) throw new Error('Elegí tu nombre de la lista.');
  var items = [];
  (carga.items || []).filter(function (it) { return it && it.obra; }).forEach(function (it) {
    if (obrasActivas.indexOf(it.obra) < 0) throw new Error('La obra "' + it.obra + '" no está en la lista.');
    items.push({ obra: it.obra, horas: horasValidas_(it.horas, it.obra) });
  });
  (carga.otras || []).forEach(function (o) {
    var nombre = String((o && o.nombre) || '').replace(/\s+/g, ' ').trim();
    if (!nombre) throw new Error('Escribí el nombre de la obra en "Otra".');
    if (nombre.length > 60) throw new Error('El nombre "' + nombre.slice(0, 25) + '…" es muy largo.');
    items.push({ obra: PREFIJO_OTRA + nombre, horas: horasValidas_(o.horas, nombre) });
  });
  if (!items.length) throw new Error('Elegí al menos una obra.');
  var vistas = Object.create(null);
  items.forEach(function (it) {
    var k = it.obra.toLowerCase();
    if (vistas[k]) throw new Error('La obra "' + it.obra.replace(PREFIJO_OTRA, '') + '" está repetida.');
    vistas[k] = true;
  });
  var extra = carga.extra == null || carga.extra === '' ? 0 : Number(String(carga.extra).replace(',', '.'));
  if (!(extra >= 0) || extra > 200) throw new Error('Revisá las horas extra.');
  return { items: items, extra: redondear(extra) };
}

function horasValidas_(valor, obra) {
  var horas = Number(String(valor).replace(',', '.'));
  if (!(horas > 0) || horas > 200) throw new Error('Revisá las horas de "' + obra + '".');
  return redondear(horas);
}

/**
 * Arma los resúmenes de una quincena.
 * respuestas: [{trabajador, obra, horas}] de esa quincena. Los renglones FILA_EXTRA son las horas
 * extra: no se suman a las obras ni a los conceptos, se muestran aparte.
 */
function resumir(respuestas, trabajadoresActivos, esperadas, infoObras, tope) {
  var dias = diasPorTrabajador(respuestas, infoObras || {}, tope == null ? Infinity : tope);
  function conceptos(trabajador, obra, h) {
    var c = calcularConceptos(h), d = dias[trabajador][obra];
    c[4] = d.descanso; // Descanso pago
    c[5] = d.viatico;  // Viático
    return c;
  }
  var porObra = Object.create(null), porTrabajador = Object.create(null), detalle = Object.create(null);
  var extras = Object.create(null), totalExtra = 0;
  respuestas.forEach(function (r) {
    if (r.obra === FILA_EXTRA) {
      extras[r.trabajador] = (extras[r.trabajador] || 0) + r.horas;
      totalExtra += r.horas;
      return;
    }
    var o = porObra[r.obra] = porObra[r.obra] || { horas: 0, trabajadores: Object.create(null) };
    o.horas += r.horas;
    o.trabajadores[r.trabajador] = true;
    porTrabajador[r.trabajador] = (porTrabajador[r.trabajador] || 0) + r.horas;
    var k = r.trabajador + '\u0000' + r.obra;
    detalle[k] = (detalle[k] || 0) + r.horas;
  });

  // Los conceptos de cada obra son la suma de los de cada trabajador (los días se redondean por trabajador)
  var conceptosObra = Object.create(null);
  Object.keys(detalle).forEach(function (k) {
    var obra = k.split('\u0000')[1];
    var p = k.split('\u0000');
    var c = conceptos(p[0], obra, redondear(detalle[k]));
    conceptosObra[obra] = (conceptosObra[obra] || c.map(function () { return 0; })).map(function (v, i) { return v + c[i]; });
  });
  var obras = Object.keys(porObra).sort(compararTexto);
  var filasObra = obras.map(function (obra) {
    var h = redondear(porObra[obra].horas);
    return [obra, h].concat(conceptosObra[obra].map(redondear)).concat([Object.keys(porObra[obra].trabajadores).length]);
  });

  var filasDetalle = Object.keys(detalle).map(function (k) {
    var p = k.split('\u0000'), h = redondear(detalle[k]);
    return [p[0], p[1], h].concat(conceptos(p[0], p[1], h));
  });
  Object.keys(extras).forEach(function (n) {
    filasDetalle.push([n, FILA_EXTRA, redondear(extras[n]), '', '', '', '', '', '']);
  });
  filasDetalle.sort(function (a, b) {
    return compararTexto(a[0], b[0]) || ((a[1] === FILA_EXTRA) - (b[1] === FILA_EXTRA)) || compararTexto(a[1], b[1]);
  });

  var nombres = trabajadoresActivos.slice();
  Object.keys(porTrabajador).forEach(function (n) { if (nombres.indexOf(n) < 0) nombres.push(n); });
  var filasControl = nombres.sort(compararTexto).map(function (n) {
    var cargadas = porTrabajador[n];
    if (cargadas === undefined) return [n, 'No', '', esperadas, '', '', 'Falta responder'];
    cargadas = redondear(cargadas);
    var dif = redondear(cargadas - esperadas);
    var extra = extras[n] ? redondear(extras[n]) : 0;
    return [n, 'Sí', cargadas, esperadas, dif, extra, dif === 0 ? 'OK' : (dif > 0 ? 'Cargó horas de más' : 'Cargó horas de menos')];
  });

  return { porObra: filasObra, detalle: filasDetalle, control: filasControl, totalExtra: redondear(totalExtra) };
}

/**
 * Arma, para cada obra, los renglones del JORNAL del programa de sueldos.
 * respuestas: [{trabajador, obra, horas}] de la quincena (los de FILA_EXTRA no van).
 * infoTrabajadores: {nombre: {numero, siempre20}}; infoObras: {obra: {centro, viatico60, sinViatico}}.
 * tope: días hábiles de la quincena (máximo de descanso pago y de viático por trabajador).
 * Devuelve [{obra, centro, filas: [[nº, nombre, C102..C518]], avisos: []}] ordenado por obra.
 */
function armarJornales(respuestas, infoTrabajadores, infoObras, tope) {
  var dias = diasPorTrabajador(respuestas, infoObras, tope == null ? Infinity : tope);
  var porObra = Object.create(null);
  respuestas.forEach(function (r) {
    if (r.obra === FILA_EXTRA || !(r.horas > 0)) return;
    var o = porObra[r.obra] = porObra[r.obra] || Object.create(null);
    o[r.trabajador] = (o[r.trabajador] || 0) + r.horas;
  });
  return Object.keys(porObra).sort(compararTexto).map(function (obra) {
    var io = infoObras[obra] || {};
    var avisos = [];
    if (!io.centro) avisos.push('la obra no tiene centro de costos');
    var filas = Object.keys(porObra[obra]).sort(compararTexto).map(function (nombre) {
      var it = infoTrabajadores[nombre] || {};
      if (!it.numero) avisos.push(nombre + ' no tiene Nº de funcionario');
      var h = redondear(porObra[obra][nombre]);
      var d = dias[nombre][obra];
      var viatico = io.sinViatico ? '' : d.viatico;
      var al60 = !!io.viatico60 && !it.siempre20;
      return [it.numero || '', nombre,
        h,                         // C102 Horas Normales
        '',                        // C106 Jornal Feriado NoTrabaja
        d.descanso,                // C108 Descanso Pago
        al60 ? '' : viatico,       // C132 Viático 20%
        al60 ? viatico : '',       // C133 Viático 60%
        redondear(h / HORAS_JORNADA), // C152 Tickets Alimentación
        h,                         // C111 Presentismo Semanal
        h, h, h,                   // C115 Ropa, C114 Transporte, C116 Herramientas
        '', '', '', '', ''];       // C112, I601, I651, C649, C518
    });
    return { obra: obra, centro: io.centro || '', filas: filas, avisos: avisos };
  });
}

function compararTexto(a, b) { return String(a).localeCompare(String(b), 'es'); }

function armarMensaje(plantilla, datos) {
  return String(plantilla || MENSAJE_PREDETERMINADO).replace(/\{(\w+)\}/g, function (m, k) {
    return datos[k] !== undefined ? datos[k] : m;
  });
}

/** La cédula solo con dígitos: "1.234.567-8" -> "12345678". */
function normalizarCedula(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

function buscarPorCedula(lista, cedula) {
  var c = normalizarCedula(cedula);
  if (c.length < 6) return null;
  return lista.filter(function (t) { return t.cedula && t.cedula === c; })[0] || null;
}

/** Deja solo los dígitos del teléfono; si es un celular uruguayo local (09...), agrega 598. */
function telefonoWhatsApp(tel) {
  var t = String(tel || '').replace(/\D/g, '');
  if (/^09\d{7}$/.test(t)) t = '598' + t.slice(1);
  return t;
}

// ---------------------------------------------------------------------------
// Planilla
// ---------------------------------------------------------------------------

function libro() { return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('LIBRO_ID')); }
function zona() { return libro().getSpreadsheetTimeZone(); }
function hoja(nombre) { return libro().getSheetByName(nombre); }

function aIso(v) {
  if (v instanceof Date) return Utilities.formatDate(v, zona(), 'yyyy-MM-dd');
  var s = String(v || '').trim(), m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return s;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Horas')
    .addItem('1. Preparar mensajes de WhatsApp', 'prepararMensajes')
    .addItem('2. Actualizar resumen', 'actualizarResumen')
    .addItem('3. Descargar Excel', 'descargarExcel')
    .addItem('4. Generar planillas para sueldos (JORNAL)', 'generarJornales')
    .addSeparator()
    .addItem('Pasar a la quincena siguiente', 'pasarQuincenaSiguiente')
    .addItem('Instalar / reparar hojas', 'instalar')
    .addToUi();
}

/** Crea las hojas que falten con sus encabezados. Se puede correr las veces que haga falta. */
function instalar() {
  var ss = libro();
  PropertiesService.getScriptProperties().setProperty('LIBRO_ID', ss.getId());

  var cfg = asegurarHoja(HOJA.CONFIG, ['Parámetro', 'Valor', '', 'Feriados (no se trabaja)']);
  if (!cfg.getRange('A2').getValue()) {
    var q = quincenaDe(Utilities.formatDate(new Date(), zona(), 'yyyy-MM-dd'));
    cfg.getRange('A2:B5').setValues([
      ['Quincena desde', isoAFecha(q.desde)],
      ['Quincena hasta', isoAFecha(q.hasta)],
      ['Link del formulario', '(pegar acá el link de la página del formulario)'],
      ['Mensaje de WhatsApp', MENSAJE_PREDETERMINADO]
    ]);
    cfg.getRange('B2:B3').setNumberFormat('dd/mm/yyyy');
    cfg.getRange('D2:D40').setNumberFormat('dd/mm/yyyy');
    cfg.getRange('A8').setValue('Horario normal: lunes a jueves 9 h, viernes 8 h. Ticket, descanso pago y viático = horas ÷ 8.')
      .setFontStyle('italic');
    cfg.setColumnWidth(1, 170); cfg.setColumnWidth(2, 420); cfg.setColumnWidth(4, 190);
  }

  if (!cfg.getRange(CFG.PEDIR_CEDULA, 1).getValue()) {
    cfg.getRange(CFG.PEDIR_CEDULA, 1, 1, 2).setValues([['Pedir cédula (link general)', true]]);
    cfg.getRange(CFG.PEDIR_CEDULA, 2).insertCheckboxes();
  }

  var obras = asegurarHoja(HOJA.OBRAS, ['Obra', 'Activa']);
  if (obras.getLastRow() < 2) {
    obras.getRange('A2:B3').setValues([['Obra de ejemplo 1', true], ['Obra de ejemplo 2', true]]);
  }
  obras.getRange('B2:B200').insertCheckboxes();
  if (!obras.getRange('C1').getValue()) obras.getRange('C1:D1').setValues([['Centro de costos', 'Viático 60%']]).setFontWeight('bold');
  if (!obras.getRange('E1').getValue()) obras.getRange('E1').setValue('Sin viático').setFontWeight('bold');
  obras.getRange('C2:C200').setNumberFormat('@');
  obras.getRange('D2:E200').insertCheckboxes();
  obras.setColumnWidth(1, 260); obras.setColumnWidth(3, 130);

  var trab = asegurarHoja(HOJA.TRABAJADORES, ['Nombre', 'Celular', 'Activo', 'Código', 'Link personal', 'Enviar por WhatsApp']);
  if (trab.getLastRow() < 2) trab.getRange('A2:C2').setValues([['Trabajador de ejemplo', '099123456', true]]);
  trab.getRange('C2:C300').insertCheckboxes();
  trab.getRange('B2:B300').setNumberFormat('@');
  if (!trab.getRange('G1').getValue()) trab.getRange('G1').setValue('Cédula').setFontWeight('bold');
  trab.getRange('G2:G300').setNumberFormat('@');
  if (!trab.getRange('H1').getValue()) trab.getRange('H1:I1').setValues([['Nº funcionario', 'Viático siempre 20%']]).setFontWeight('bold');
  trab.getRange('I2:I300').insertCheckboxes();
  trab.setColumnWidth(1, 220); trab.setColumnWidth(5, 300); trab.setColumnWidth(6, 150);

  asegurarHoja(HOJA.RESPUESTAS, ['Enviado', 'Quincena desde', 'Quincena hasta', 'Trabajador', 'Obra', 'Horas']);
  asegurarHoja(HOJA.POR_OBRA, []);
  asegurarHoja(HOJA.DETALLE, []);
  asegurarHoja(HOJA.CONTROL, []);

  var hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hoja1 && ss.getSheets().length > 1 && hoja1.getLastRow() === 0) ss.deleteSheet(hoja1);

  actualizarResumen();
}

function asegurarHoja(nombre, encabezados) {
  var ss = libro();
  var h = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  if (encabezados.length && !h.getRange(1, 1).getValue()) {
    h.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold');
    h.setFrozenRows(1);
  }
  return h;
}

function leerConfig() {
  var cfg = hoja(HOJA.CONFIG);
  var desde = aIso(cfg.getRange(CFG.DESDE, 2).getValue());
  var hasta = aIso(cfg.getRange(CFG.HASTA, 2).getValue());
  var feriados = cfg.getRange('D2:D60').getValues()
    .map(function (r) { return r[0] ? aIso(r[0]) : ''; })
    .filter(function (f) { return f; });
  return {
    desde: desde,
    hasta: hasta,
    link: String(cfg.getRange(CFG.LINK, 2).getValue()).trim(),
    mensaje: String(cfg.getRange(CFG.MENSAJE, 2).getValue()),
    pedirCedula: cfg.getRange(CFG.PEDIR_CEDULA, 2).getValue() === true,
    feriados: feriados,
    esperadas: horasEsperadas(desde, hasta, feriados),
    diasHabiles: diasHabiles(desde, hasta, feriados)
  };
}

function datosDeHoja(nombre) {
  var h = hoja(nombre);
  return h.getLastRow() < 2 ? [] : h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues();
}

/** Datos de cada obra para los cálculos: {obra: {centro, viatico60, sinViatico}} */
function infoObras() {
  var info = Object.create(null);
  datosDeHoja(HOJA.OBRAS).forEach(function (r) {
    var obra = String(r[0]).trim();
    if (obra) info[obra] = { centro: String(r[2] == null ? '' : r[2]).trim(), viatico60: r[3] === true, sinViatico: r[4] === true };
  });
  return info;
}

function obrasActivas() {
  return datosDeHoja(HOJA.OBRAS)
    .filter(function (r) { return String(r[0]).trim() && r[1] === true; })
    .map(function (r) { return String(r[0]).trim(); })
    .sort(compararTexto);
}

function trabajadores() {
  return datosDeHoja(HOJA.TRABAJADORES)
    .filter(function (r) { return String(r[0]).trim() && r[2] === true; })
    .map(function (r) { return { nombre: String(r[0]).trim(), celular: r[1], codigo: String(r[3]).trim(), cedula: normalizarCedula(r[6]) }; });
}

function respuestasDeQuincena(cfg) {
  return datosDeHoja(HOJA.RESPUESTAS)
    .filter(function (r) { return aIso(r[1]) === cfg.desde && aIso(r[2]) === cfg.hasta; })
    .map(function (r) { return { enviado: r[0], trabajador: String(r[3]), obra: String(r[4]), horas: Number(r[5]) || 0 }; });
}

/** Genera el código, el link personal y el botón de WhatsApp de cada trabajador. */
function prepararMensajes() {
  var cfg = leerConfig();
  if (!/^https:\/\//.test(cfg.link)) {
    SpreadsheetApp.getUi().alert('Falta el link del formulario', 'Pegá el link de la página del formulario en la hoja "Configuración" (fila "Link del formulario"). Ver README.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  var h = hoja(HOJA.TRABAJADORES);
  var filas = h.getLastRow() - 1;
  if (filas < 1) return;
  var datos = h.getRange(2, 1, filas, 4).getValues();
  var salida = datos.map(function (r) {
    var nombre = String(r[0]).trim();
    if (!nombre) return ['', '', ''];
    var codigo = String(r[3]).trim() || Utilities.getUuid().replace(/-/g, '').slice(0, 10);
    var link = cfg.link + '?c=' + codigo;
    var texto = armarMensaje(cfg.mensaje, { nombre: nombre.split(' ')[0], desde: isoATexto(cfg.desde), hasta: isoATexto(cfg.hasta), link: link });
    var tel = telefonoWhatsApp(r[1]);
    var wa = r[2] === true && tel ? 'https://wa.me/' + tel + '?text=' + encodeURIComponent(texto) : '';
    return [codigo, link, wa];
  });
  h.getRange(2, 4, filas, 2).setValues(salida.map(function (f) { return [f[0], f[1]]; }));
  h.getRange(2, 6, filas, 1).setRichTextValues(salida.map(function (f) {
    var v = SpreadsheetApp.newRichTextValue().setText(f[2] ? 'Enviar' : '');
    return [f[2] ? v.setLinkUrl(f[2]).build() : v.build()];
  }));

  var sinCedula = cfg.pedirCedula
    ? trabajadores().filter(function (t) { return !t.cedula; }).map(function (t) { return t.nombre; })
    : [];
  var general = armarMensaje(cfg.mensaje, { nombre: '', desde: isoATexto(cfg.desde), hasta: isoATexto(cfg.hasta), link: cfg.link })
    .replace(/^Hola\s*,/, 'Hola,');
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px sans-serif">' +
    '<p><b>Para cada trabajador:</b> en la hoja "Trabajadores", tocá <i>Enviar</i> en su fila. Se abre WhatsApp con el mensaje y su link personal listos; solo tenés que darle enviar.</p>' +
    '<p><b>Para el grupo o una lista de difusión:</b> copiá este mensaje (' +
    (cfg.pedirCedula ? 'cada uno pone su cédula en el formulario' : 'cada uno elige su nombre en el formulario') + '):</p>' +
    '<textarea style="width:100%;height:110px" onclick="this.select()">' + escaparHtml(general) + '</textarea>' +
    (sinCedula.length ? '<p style="color:#b3261e"><b>Ojo:</b> sin cédula cargada en "Trabajadores" (no van a poder entrar con el link general): ' +
      escaparHtml(sinCedula.join(', ')) + '</p>' : '') + '</div>'
  ).setWidth(460).setHeight(sinCedula.length ? 360 : 300);
  SpreadsheetApp.getUi().showModalDialog(html, 'Mensajes de la quincena listos');
}

function escaparHtml(s) {
  return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

/** Rehace las hojas de resumen para la quincena de Configuración. */
function actualizarResumen() {
  var cfg = leerConfig();
  var nombres = trabajadores().map(function (t) { return t.nombre; });
  var r = resumir(respuestasDeQuincena(cfg), nombres, cfg.esperadas, infoObras(), cfg.diasHabiles);
  var titulo = 'Quincena del ' + isoATexto(cfg.desde) + ' al ' + isoATexto(cfg.hasta);
  var conceptos = CONCEPTOS.map(function (c) { return c.nombre; });

  escribirTabla(HOJA.POR_OBRA, titulo, ['Obra', 'Horas'].concat(conceptos).concat(['Trabajadores']), r.porObra, true);
  escribirTabla(HOJA.DETALLE, titulo, ['Trabajador', 'Obra', 'Horas'].concat(conceptos), r.detalle, false);
  if (r.porObra.length && r.totalExtra) {
    var filaExtra = r.porObra.length + 5; // títulos, obras, TOTAL y un renglón en blanco
    hoja(HOJA.POR_OBRA).getRange(filaExtra, 1, 1, 2).setValues([['Horas extra (aparte, no incluidas arriba)', r.totalExtra]])
      .setFontWeight('bold');
  }
  escribirTabla(HOJA.CONTROL, titulo + ' — horas normales: ' + cfg.esperadas + ' — días hábiles: ' + cfg.diasHabiles,
    ['Trabajador', 'Respondió', 'Horas en obras', 'Horas de la quincena', 'Diferencia', 'Horas extra', 'Estado'], r.control, false);

  var control = hoja(HOJA.CONTROL);
  if (r.control.length) {
    var colores = r.control.map(function (f) {
      var c = f[6] === 'OK' ? '#e5f6ec' : f[6] === 'Falta responder' ? '#fde2e1' : '#fff4d6';
      return [c, c, c, c, c, c, c];
    });
    control.getRange(3, 1, r.control.length, 7).setBackgrounds(colores);
  }
  return r;
}

function escribirTabla(nombre, titulo, encabezados, filas, conTotal) {
  var h = hoja(nombre);
  h.clear();
  h.getRange(1, 1).setValue(titulo).setFontWeight('bold').setFontSize(12);
  h.getRange(2, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold').setBackground('#eef1f4');
  h.setFrozenRows(2);
  if (!filas.length) {
    h.getRange(3, 1).setValue('Todavía no hay respuestas para esta quincena.').setFontStyle('italic');
    return;
  }
  h.getRange(3, 1, filas.length, encabezados.length).setValues(filas);
  if (conTotal) {
    var fila = filas.length + 3;
    var total = ['TOTAL'];
    for (var c = 2; c <= encabezados.length; c++) {
      var col = String.fromCharCode(64 + c);
      total.push('=SUM(' + col + '3:' + col + (fila - 1) + ')');
    }
    h.getRange(fila, 1, 1, total.length).setValues([total]).setFontWeight('bold').setBackground('#eef1f4');
  }
  h.getRange(3, 2, filas.length + (conTotal ? 1 : 0), encabezados.length - 1).setNumberFormat('0.00');
  if (encabezados[encabezados.length - 1] === 'Trabajadores') {
    h.getRange(3, encabezados.length, filas.length + 1, 1).setNumberFormat('0');
  }
  h.autoResizeColumns(1, encabezados.length);
}

function pasarQuincenaSiguiente() {
  var ui = SpreadsheetApp.getUi();
  var cfg = leerConfig();
  var q = quincenaSiguiente(cfg.hasta);
  var ok = ui.alert('Quincena siguiente',
    'La quincena va a pasar a ser del ' + isoATexto(q.desde) + ' al ' + isoATexto(q.hasta) +
    '.\nLas respuestas anteriores quedan guardadas en "Respuestas".\n\n¿Continuar?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  var h = hoja(HOJA.CONFIG);
  h.getRange(CFG.DESDE, 2).setValue(isoAFecha(q.desde));
  h.getRange(CFG.HASTA, 2).setValue(isoAFecha(q.hasta));
  actualizarResumen();
}

function descargarExcel() {
  actualizarResumen();
  var cfg = leerConfig();
  var url = 'https://docs.google.com/spreadsheets/d/' + libro().getId() + '/export?format=xlsx';
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px sans-serif"><p>Resumen actualizado (quincena del ' + isoATexto(cfg.desde) + ' al ' + isoATexto(cfg.hasta) + ').</p>' +
    '<p><a href="' + url + '" target="_blank" style="font-size:16px">Descargar el Excel</a></p>' +
    '<p style="color:#666">Incluye las hojas "Resumen por obra", "Detalle por trabajador" y "Control".</p></div>'
  ).setWidth(380).setHeight(170);
  SpreadsheetApp.getUi().showModalDialog(html, 'Descargar Excel');
}

// ---------------------------------------------------------------------------
// Formulario web
// ---------------------------------------------------------------------------

// La página del formulario (carpeta docs/, publicada en GitHub Pages) habla con este
// script sin cookies de Google, así no falla en celulares con varias cuentas abiertas.
//   GET  ?accion=datos&codigo=CODIGO     -> datos para armar el formulario
//   POST {accion: 'guardar', carga}      -> guarda la respuesta
//   POST {accion: 'anterior', trabajador} -> lo que ya cargó en la quincena
// Safari del iPhone a veces bloquea esas llamadas; entonces la página usa JSONP:
//   GET  ?accion=guardar&datos=JSON&callback=fn   (y lo mismo con datos/anterior)

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.accion === 'datos') {
    // "codigo": Google rechaza (400) los pedidos con un parámetro "c"; se acepta "c" por compatibilidad
    return responder_(function () { return datosFormulario(String(p.codigo || p.c || '').trim(), p.cedula); }, p.callback);
  }
  if (p.accion === 'guardar') {
    return responder_(function () { return guardarRespuesta(JSON.parse(p.datos || '{}')); }, p.callback);
  }
  if (p.accion === 'anterior') {
    return responder_(function () { return obtenerRespuestaAnterior(p.trabajador); }, p.callback);
  }
  // Alguien abrió el link de Apps Script directamente: se lo manda a la página del formulario
  var link = leerConfig().link;
  return HtmlService.createHtmlOutput(
    '<div style="font:18px sans-serif;padding:24px">' +
    (/^https:\/\//.test(link) && !/script\.google\.com/.test(link)
      ? '<a target="_top" href="' + escaparHtml(link) + '">Abrir el formulario de horas</a>'
      : 'El formulario todavía no está configurado.') +
    '</div>').setTitle('Horas de la quincena');
}

function doPost(e) {
  return responder_(function () {
    var pedido = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (pedido.accion === 'guardar') return guardarRespuesta(pedido.carga);
    if (pedido.accion === 'anterior') return obtenerRespuestaAnterior(pedido.trabajador);
    throw new Error('Pedido no válido.');
  });
}

function responder_(fn, callback) {
  var salida;
  try {
    salida = { ok: true, resultado: fn() };
  } catch (err) {
    salida = { ok: false, error: (err && err.message) || String(err) };
  }
  var json = JSON.stringify(salida);
  if (callback && /^[A-Za-z_$][\w$]{0,60}$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Lo que necesita la página para armar el formulario. Con un código (link personal) o una cédula
 * válidos, el nombre ya viene elegido. Si la planilla pide cédula, sin ella no se muestra la lista.
 */
function datosFormulario(codigo, cedula) {
  var cfg = leerConfig();
  var lista = trabajadores();
  var elegido = null;
  if (codigo) {
    lista.forEach(function (t) { if (t.codigo && t.codigo === codigo) elegido = t.nombre; });
  } else if (cedula) {
    elegido = identificarPorCedula_(lista, cedula).nombre;
  }
  return {
    version: 3, // 2: admite obras "Otra" y horas extra; 3: identificación por cédula
    desde: isoATexto(cfg.desde),
    hasta: isoATexto(cfg.hasta),
    esperadas: cfg.esperadas,
    obras: obrasActivas(),
    pideCedula: cfg.pedirCedula && !elegido,
    trabajadores: elegido || cfg.pedirCedula ? [] : lista.map(function (t) { return t.nombre; }).sort(compararTexto),
    trabajador: elegido,
    codigo: elegido && codigo ? codigo : '',
    anterior: elegido ? respuestaAnterior_(cfg, elegido) : null
  };
}

function identificarPorCedula_(lista, cedula) {
  var cache = CacheService.getScriptCache();
  var fallos = Number(cache.get('fallosCedula') || 0);
  if (fallos >= MAX_FALLOS_CEDULA) throw new Error('Demasiados intentos. Probá de nuevo en unos minutos.');
  var t = buscarPorCedula(lista, cedula);
  if (!t) {
    cache.put('fallosCedula', String(fallos + 1), 600);
    throw new Error('No encontramos esa cédula. Revisala o avisale a la oficina.');
  }
  return t;
}

function respuestaAnterior_(cfg, trabajador) {
  var items = respuestasDeQuincena(cfg)
    .filter(function (r) { return r.trabajador === trabajador; })
    .map(function (r) { return { obra: r.obra, horas: r.horas }; });
  return items.length ? items : null;
}

/** La pide el formulario al elegir un nombre de la lista (no se ofrece si la planilla pide cédula). */
function obtenerRespuestaAnterior(trabajador) {
  var cfg = leerConfig();
  if (cfg.pedirCedula) throw new Error('Ingresá tu cédula.');
  return respuestaAnterior_(cfg, String(trabajador));
}

/** La pide el formulario al enviar. Reemplaza lo que el trabajador haya cargado antes en la quincena. */
function guardarRespuesta(carga) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var cfg = leerConfig();
    var lista = trabajadores();
    if (carga && carga.codigo) {
      var porCodigo = lista.filter(function (t) { return t.codigo === carga.codigo; })[0];
      if (!porCodigo) throw new Error('El link no es válido. Pedí uno nuevo.');
      carga.trabajador = porCodigo.nombre;
    } else if (carga && carga.cedula) {
      carga.trabajador = identificarPorCedula_(lista, carga.cedula).nombre;
    } else if (cfg.pedirCedula) {
      throw new Error('Ingresá tu cédula.');
    }
    var carga2 = validarCarga(carga, lista.map(function (t) { return t.nombre; }), obrasActivas());
    var items = carga2.items;

    var h = hoja(HOJA.RESPUESTAS);
    var datos = datosDeHoja(HOJA.RESPUESTAS);
    for (var i = datos.length - 1; i >= 0; i--) {
      if (String(datos[i][3]) === carga.trabajador && aIso(datos[i][1]) === cfg.desde && aIso(datos[i][2]) === cfg.hasta) {
        h.deleteRow(i + 2);
      }
    }
    var ahora = new Date();
    var filas = items.concat(carga2.extra ? [{ obra: FILA_EXTRA, horas: carga2.extra }] : []).map(function (it) {
      return [ahora, isoAFecha(cfg.desde), isoAFecha(cfg.hasta), carga.trabajador, it.obra, it.horas];
    });
    h.getRange(h.getLastRow() + 1, 1, filas.length, 6).setValues(filas);
    h.getRange(2, 1, h.getLastRow() - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm');
    h.getRange(2, 2, h.getLastRow() - 1, 2).setNumberFormat('dd/mm/yyyy');

    actualizarResumen();
    var total = redondear(items.reduce(function (s, it) { return s + it.horas; }, 0));
    return { trabajador: carga.trabajador, total: total, extra: carga2.extra, esperadas: cfg.esperadas, items: items };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Planillas para el programa de sueldos (una por obra)
// ---------------------------------------------------------------------------

function generarJornales() {
  var cfg = leerConfig();
  var infoTrabajadores = Object.create(null);
  datosDeHoja(HOJA.TRABAJADORES).forEach(function (r) {
    var nombre = String(r[0]).trim();
    if (nombre) infoTrabajadores[nombre] = { numero: r[7] === '' || r[7] == null ? '' : r[7], siempre20: r[8] === true };
  });
  var jornales = armarJornales(respuestasDeQuincena(cfg), infoTrabajadores, infoObras(), cfg.diasHabiles);
  if (!jornales.length) {
    SpreadsheetApp.getUi().alert('Todavía no hay respuestas para la quincena del ' + isoATexto(cfg.desde) + ' al ' + isoATexto(cfg.hasta) + '.');
    return;
  }

  var hora = Utilities.formatDate(new Date(), zona(), 'dd-MM HH.mm');
  var carpeta = DriveApp.createFolder('Sueldos ' + isoATexto(cfg.desde).replace(/\//g, '-') + ' al ' +
    isoATexto(cfg.hasta).replace(/\//g, '-') + ' (generado ' + hora + ')');
  var filasHtml = jornales.map(function (j) {
    var nombre = 'JORNAL ' + (j.centro || 'SIN CENTRO') + ' - ' + j.obra;
    var ss = SpreadsheetApp.create(nombre);
    var h = ss.getSheets()[0].setName('Movimientos');
    var ancho = 2 + JORNAL_CODIGOS.length;
    h.getRange(1, 1, 2, ancho).setNumberFormat('@').setValues([
      [JORNAL_A1, ''].concat(JORNAL_CODIGOS),
      ['', 'Nombre'].concat(JORNAL_TITULOS)
    ]);
    h.getRange(3, 1, j.filas.length, ancho).setValues(j.filas);
    DriveApp.getFileById(ss.getId()).moveTo(carpeta);
    var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
    return '<tr><td>' + escaparHtml(j.obra) + '</td><td>' + escaparHtml(j.centro || '—') + '</td><td>' + j.filas.length +
      '</td><td><a href="' + url + '" target="_blank">Descargar</a></td></tr>' +
      (j.avisos.length ? '<tr><td colspan="4" style="color:#b3261e;font-size:12px">⚠ ' + escaparHtml(j.avisos.join('; ')) + '</td></tr>' : '');
  }).join('');

  var html = HtmlService.createHtmlOutput(
    '<div style="font:13px sans-serif"><p>Quincena del ' + isoATexto(cfg.desde) + ' al ' + isoATexto(cfg.hasta) +
    '. Un archivo por obra, con el formato del JORNAL.</p>' +
    '<table style="border-collapse:collapse;width:100%" cellpadding="4"><tr style="text-align:left"><th>Obra</th><th>Centro</th><th>Trab.</th><th></th></tr>' +
    filasHtml + '</table><p><a href="' + carpeta.getUrl() + '" target="_blank">Abrir la carpeta en Drive</a></p>' +
    '<p style="color:#666">Las horas extra no van en estos archivos (se ven en la hoja Control).</p></div>'
  ).setWidth(520).setHeight(Math.min(560, 190 + jornales.length * 34));
  SpreadsheetApp.getUi().showModalDialog(html, 'Planillas para sueldos');
}
