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
  { nombre: 'Descanso pago', calc: function (h) { return h / HORAS_JORNADA; } },
  { nombre: 'Viático', calc: function (h) { return h / HORAS_JORNADA; } }
];

var MENSAJE_PREDETERMINADO =
  'Hola {nombre}, por favor cargá tus horas de la quincena del {desde} al {hasta} en este link: {link}';

// Filas fijas de la hoja Configuración (columna B)
var CFG = { DESDE: 2, HASTA: 3, LINK: 4, MENSAJE: 5 };

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
  var items = (carga.items || []).filter(function (it) { return it && it.obra; });
  if (!items.length) throw new Error('Elegí al menos una obra.');
  var vistas = Object.create(null);
  return items.map(function (it) {
    if (obrasActivas.indexOf(it.obra) < 0) throw new Error('La obra "' + it.obra + '" no está en la lista.');
    if (vistas[it.obra]) throw new Error('La obra "' + it.obra + '" está repetida.');
    vistas[it.obra] = true;
    var horas = Number(String(it.horas).replace(',', '.'));
    if (!(horas > 0) || horas > 200) throw new Error('Revisá las horas de "' + it.obra + '".');
    return { obra: it.obra, horas: redondear(horas) };
  });
}

/**
 * Arma los resúmenes de una quincena.
 * respuestas: [{trabajador, obra, horas}] de esa quincena.
 */
function resumir(respuestas, trabajadoresActivos, esperadas) {
  var porObra = Object.create(null), porTrabajador = Object.create(null), detalle = Object.create(null);
  respuestas.forEach(function (r) {
    var o = porObra[r.obra] = porObra[r.obra] || { horas: 0, trabajadores: Object.create(null) };
    o.horas += r.horas;
    o.trabajadores[r.trabajador] = true;
    porTrabajador[r.trabajador] = (porTrabajador[r.trabajador] || 0) + r.horas;
    var k = r.trabajador + '\u0000' + r.obra;
    detalle[k] = (detalle[k] || 0) + r.horas;
  });

  var obras = Object.keys(porObra).sort(compararTexto);
  var filasObra = obras.map(function (obra) {
    var h = redondear(porObra[obra].horas);
    return [obra, h].concat(calcularConceptos(h)).concat([Object.keys(porObra[obra].trabajadores).length]);
  });

  var filasDetalle = Object.keys(detalle).map(function (k) {
    var p = k.split('\u0000'), h = redondear(detalle[k]);
    return [p[0], p[1], h].concat(calcularConceptos(h));
  }).sort(function (a, b) { return compararTexto(a[0], b[0]) || compararTexto(a[1], b[1]); });

  var nombres = trabajadoresActivos.slice();
  Object.keys(porTrabajador).forEach(function (n) { if (nombres.indexOf(n) < 0) nombres.push(n); });
  var filasControl = nombres.sort(compararTexto).map(function (n) {
    var cargadas = porTrabajador[n];
    if (cargadas === undefined) return [n, 'No', '', esperadas, '', 'Falta responder'];
    cargadas = redondear(cargadas);
    var dif = redondear(cargadas - esperadas);
    return [n, 'Sí', cargadas, esperadas, dif, dif === 0 ? 'OK' : (dif > 0 ? 'Cargó horas de más' : 'Cargó horas de menos')];
  });

  return { porObra: filasObra, detalle: filasDetalle, control: filasControl };
}

function compararTexto(a, b) { return String(a).localeCompare(String(b), 'es'); }

function armarMensaje(plantilla, datos) {
  return String(plantilla || MENSAJE_PREDETERMINADO).replace(/\{(\w+)\}/g, function (m, k) {
    return datos[k] !== undefined ? datos[k] : m;
  });
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
    cfg.getRange('A7').setValue('Horario normal: lunes a jueves 9 h, viernes 8 h. Ticket, descanso pago y viático = horas ÷ 8.')
      .setFontStyle('italic');
    cfg.setColumnWidth(1, 170); cfg.setColumnWidth(2, 420); cfg.setColumnWidth(4, 190);
  }

  var obras = asegurarHoja(HOJA.OBRAS, ['Obra', 'Activa']);
  if (obras.getLastRow() < 2) {
    obras.getRange('A2:B3').setValues([['Obra de ejemplo 1', true], ['Obra de ejemplo 2', true]]);
  }
  obras.getRange('B2:B200').insertCheckboxes();
  obras.setColumnWidth(1, 260);

  var trab = asegurarHoja(HOJA.TRABAJADORES, ['Nombre', 'Celular', 'Activo', 'Código', 'Link personal', 'Enviar por WhatsApp']);
  if (trab.getLastRow() < 2) trab.getRange('A2:C2').setValues([['Trabajador de ejemplo', '099123456', true]]);
  trab.getRange('C2:C300').insertCheckboxes();
  trab.getRange('B2:B300').setNumberFormat('@');
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
    feriados: feriados,
    esperadas: horasEsperadas(desde, hasta, feriados)
  };
}

function datosDeHoja(nombre) {
  var h = hoja(nombre);
  return h.getLastRow() < 2 ? [] : h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues();
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
    .map(function (r) { return { nombre: String(r[0]).trim(), celular: r[1], codigo: String(r[3]).trim() }; });
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

  var general = armarMensaje(cfg.mensaje, { nombre: '', desde: isoATexto(cfg.desde), hasta: isoATexto(cfg.hasta), link: cfg.link })
    .replace(/^Hola\s*,/, 'Hola,');
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px sans-serif">' +
    '<p><b>Para cada trabajador:</b> en la hoja "Trabajadores", tocá <i>Enviar</i> en su fila. Se abre WhatsApp con el mensaje y su link personal listos; solo tenés que darle enviar.</p>' +
    '<p><b>Para el grupo:</b> copiá este mensaje (cada uno elige su nombre en el formulario):</p>' +
    '<textarea style="width:100%;height:110px" onclick="this.select()">' + escaparHtml(general) + '</textarea></div>'
  ).setWidth(460).setHeight(300);
  SpreadsheetApp.getUi().showModalDialog(html, 'Mensajes de la quincena listos');
}

function escaparHtml(s) {
  return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

/** Rehace las hojas de resumen para la quincena de Configuración. */
function actualizarResumen() {
  var cfg = leerConfig();
  var nombres = trabajadores().map(function (t) { return t.nombre; });
  var r = resumir(respuestasDeQuincena(cfg), nombres, cfg.esperadas);
  var titulo = 'Quincena del ' + isoATexto(cfg.desde) + ' al ' + isoATexto(cfg.hasta);
  var conceptos = CONCEPTOS.map(function (c) { return c.nombre; });

  escribirTabla(HOJA.POR_OBRA, titulo, ['Obra', 'Horas'].concat(conceptos).concat(['Trabajadores']), r.porObra, true);
  escribirTabla(HOJA.DETALLE, titulo, ['Trabajador', 'Obra', 'Horas'].concat(conceptos), r.detalle, false);
  escribirTabla(HOJA.CONTROL, titulo + ' — horas normales: ' + cfg.esperadas,
    ['Trabajador', 'Respondió', 'Horas cargadas', 'Horas de la quincena', 'Diferencia', 'Estado'], r.control, false);

  var control = hoja(HOJA.CONTROL);
  if (r.control.length) {
    var colores = r.control.map(function (f) {
      var c = f[5] === 'OK' ? '#e5f6ec' : f[5] === 'Falta responder' ? '#fde2e1' : '#fff4d6';
      return [c, c, c, c, c, c];
    });
    control.getRange(3, 1, r.control.length, 6).setBackgrounds(colores);
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
//   GET  ?accion=datos&c=CODIGO          -> datos para armar el formulario
//   POST {accion: 'guardar', carga}      -> guarda la respuesta
//   POST {accion: 'anterior', trabajador} -> lo que ya cargó en la quincena
// Safari del iPhone a veces bloquea esas llamadas; entonces la página usa JSONP:
//   GET  ?accion=guardar&datos=JSON&callback=fn   (y lo mismo con datos/anterior)

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.accion === 'datos') {
    return responder_(function () { return datosFormulario(String(p.c || '').trim()); }, p.callback);
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

/** Lo que necesita la página para armar el formulario. Con un código válido, el nombre ya viene elegido. */
function datosFormulario(codigo) {
  var cfg = leerConfig();
  var lista = trabajadores();
  var elegido = null;
  if (codigo) lista.forEach(function (t) { if (t.codigo && t.codigo === codigo) elegido = t.nombre; });
  return {
    desde: isoATexto(cfg.desde),
    hasta: isoATexto(cfg.hasta),
    esperadas: cfg.esperadas,
    obras: obrasActivas(),
    trabajadores: elegido ? [] : lista.map(function (t) { return t.nombre; }).sort(compararTexto),
    trabajador: elegido,
    codigo: elegido ? codigo : '',
    anterior: elegido ? respuestaAnterior_(cfg, elegido) : null
  };
}

function respuestaAnterior_(cfg, trabajador) {
  var items = respuestasDeQuincena(cfg)
    .filter(function (r) { return r.trabajador === trabajador; })
    .map(function (r) { return { obra: r.obra, horas: r.horas }; });
  return items.length ? items : null;
}

/** La pide el formulario al elegir un nombre de la lista. */
function obtenerRespuestaAnterior(trabajador) {
  return respuestaAnterior_(leerConfig(), String(trabajador));
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
    }
    var items = validarCarga(carga, lista.map(function (t) { return t.nombre; }), obrasActivas());

    var h = hoja(HOJA.RESPUESTAS);
    var datos = datosDeHoja(HOJA.RESPUESTAS);
    for (var i = datos.length - 1; i >= 0; i--) {
      if (String(datos[i][3]) === carga.trabajador && aIso(datos[i][1]) === cfg.desde && aIso(datos[i][2]) === cfg.hasta) {
        h.deleteRow(i + 2);
      }
    }
    var ahora = new Date();
    var filas = items.map(function (it) {
      return [ahora, isoAFecha(cfg.desde), isoAFecha(cfg.hasta), carga.trabajador, it.obra, it.horas];
    });
    h.getRange(h.getLastRow() + 1, 1, filas.length, 6).setValues(filas);
    h.getRange(2, 1, h.getLastRow() - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm');
    h.getRange(2, 2, h.getLastRow() - 1, 2).setNumberFormat('dd/mm/yyyy');

    actualizarResumen();
    var total = redondear(items.reduce(function (s, it) { return s + it.horas; }, 0));
    return { trabajador: carga.trabajador, total: total, esperadas: cfg.esperadas, items: items };
  } finally {
    lock.releaseLock();
  }
}
