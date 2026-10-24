/*
 * Lectura y escritura de la planilla Excel de horas.
 *
 * Hojas que genera:
 *   Registros - un renglón por funcionario y día (la "base" editable)
 *   Resumen   - total de horas por funcionario (fórmulas sobre Registros)
 *   Planilla  - grilla funcionario x día (fórmulas sobre Registros)
 *
 * Requiere XLSX (SheetJS) y HorasParser. Funciona en navegador y en Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lib/xlsx.full.min.js'), require('./parser.js'));
  else root.HorasExcel = factory(root.XLSX, root.HorasParser);
})(typeof self !== 'undefined' ? self : this, function (XLSX, HorasParser) {
  'use strict';

  var COLUMNAS = ['Fecha', 'Día', 'Funcionario', 'Entrada', 'Salida', 'Horas', 'Estado', 'Observación', 'Mensaje original', 'Enviado'];
  var DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  function isoToDate(iso) { var p = iso.split('-'); return new Date(+p[0], p[1] - 1, +p[2]); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateToIso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function celdaAIso(v) {
    if (v instanceof Date) return dateToIso(v);
    if (typeof v === 'number') { var p = XLSX.SSF.parse_date_code(v); return p.y + '-' + pad(p.m) + '-' + pad(p.d); }
    var s = String(v || '').trim(), m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    return '';
  }

  function celdaAHora(v) {
    if (v instanceof Date) return pad(v.getHours()) + ':' + pad(v.getMinutes());
    if (typeof v === 'number') { var min = Math.round(v * 24 * 60); return pad(Math.floor(min / 60) % 24) + ':' + pad(min % 60); }
    return String(v || '').trim();
  }

  // Lee los registros de una planilla generada antes por esta herramienta
  function leerRegistros(data) {
    var wb = XLSX.read(data, { type: 'array', cellDates: true });
    var ws = wb.Sheets.Registros || wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { defval: '' }).map(function (r) {
      var horas = r.Horas === '' ? null : Number(String(r.Horas).replace(',', '.'));
      return {
        fecha: celdaAIso(r.Fecha),
        funcionario: String(r.Funcionario || '').trim(),
        entrada: celdaAHora(r.Entrada),
        salida: celdaAHora(r.Salida),
        horas: isNaN(horas) ? null : horas,
        estado: String(r.Estado || 'OK'),
        obs: String(r['Observación'] || ''),
        mensaje: String(r['Mensaje original'] || ''),
        enviado: r.Enviado instanceof Date ? dateToIso(r.Enviado) + ' ' + celdaAHora(r.Enviado) : String(r.Enviado || '')
      };
    }).filter(function (r) { return r.fecha && r.funcionario; });
  }

  // Une registros existentes con nuevos, sin repetir los idénticos
  function unir(existentes, nuevos) {
    var vistos = {};
    var out = [];
    var agregados = 0;
    existentes.forEach(function (r) { vistos[HorasParser.rowKey(r)] = true; out.push(r); });
    nuevos.forEach(function (r) {
      var k = HorasParser.rowKey(r);
      if (vistos[k]) return;
      vistos[k] = true; out.push(r); agregados++;
    });
    out.sort(function (a, b) {
      return a.funcionario.localeCompare(b.funcionario) || a.fecha.localeCompare(b.fecha) || String(a.enviado).localeCompare(String(b.enviado));
    });
    return { registros: out, agregados: agregados, repetidos: nuevos.length - agregados };
  }

  function colLetter(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  function hojaRegistros(registros) {
    var aoa = [COLUMNAS].concat(registros.map(function (r) {
      var f = isoToDate(r.fecha);
      return [f, DIAS[f.getDay()], r.funcionario, r.entrada, r.salida, r.horas == null ? '' : r.horas, r.estado, r.obs, r.mensaje, r.enviado];
    }));
    var ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    for (var i = 1; i < aoa.length; i++) {
      var c = ws['A' + (i + 1)]; if (c) c.z = 'dd/mm/yyyy';
      var h = ws['F' + (i + 1)]; if (h && h.t === 'n') h.z = '0.00';
    }
    ws['!cols'] = [12, 11, 24, 8, 8, 7, 9, 40, 50, 17].map(function (w) { return { wch: w }; });
    ws['!autofilter'] = { ref: 'A1:J' + Math.max(aoa.length, 1) };
    return ws;
  }

  function funcionarios(registros) {
    var vistos = {}, lista = [];
    registros.forEach(function (r) { if (!vistos[r.funcionario]) { vistos[r.funcionario] = true; lista.push(r.funcionario); } });
    return lista.sort(function (a, b) { return a.localeCompare(b); });
  }

  function hojaResumen(registros) {
    var nombres = funcionarios(registros);
    var rango = function (col) { return 'Registros!$' + col + ':$' + col; };
    var aoa = [['Funcionario', 'Días con horas', 'Total horas', 'Registros a revisar']];
    nombres.forEach(function (nom, i) {
      var fila = i + 2;
      var mios = registros.filter(function (r) { return r.funcionario === nom; });
      var total = mios.reduce(function (s, r) { return s + (r.horas || 0); }, 0);
      aoa.push([
        nom,
        { t: 'n', v: mios.filter(function (r) { return r.horas > 0; }).length, f: 'COUNTIFS(' + rango('C') + ',$A' + fila + ',' + rango('F') + ',">0")' },
        { t: 'n', v: Math.round(total * 100) / 100, f: 'SUMIFS(' + rango('F') + ',' + rango('C') + ',$A' + fila + ')', z: '0.00' },
        { t: 'n', v: mios.filter(function (r) { return r.estado === 'Revisar'; }).length, f: 'COUNTIFS(' + rango('C') + ',$A' + fila + ',' + rango('G') + ',"Revisar")' }
      ]);
    });
    var ult = nombres.length + 1;
    var sum = function (col) { return 'SUM(' + col + '2:' + col + Math.max(ult, 2) + ')'; };
    aoa.push(['TOTAL',
      { t: 'n', v: 0, f: sum('B') },
      { t: 'n', v: Math.round(registros.reduce(function (s, r) { return s + (r.horas || 0); }, 0) * 100) / 100, f: sum('C'), z: '0.00' },
      { t: 'n', v: 0, f: sum('D') }]);
    aoa[aoa.length - 1][1].v = aoa.slice(1, -1).reduce(function (s, r) { return s + r[1].v; }, 0);
    aoa[aoa.length - 1][3].v = aoa.slice(1, -1).reduce(function (s, r) { return s + r[3].v; }, 0);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 24 }, { wch: 15 }, { wch: 12 }, { wch: 19 }];
    return ws;
  }

  // Grilla funcionario x día, entre la primera y la última fecha con registros
  function hojaPlanilla(registros) {
    if (!registros.length) return XLSX.utils.aoa_to_sheet([['Sin registros']]);
    var fechas = registros.map(function (r) { return r.fecha; }).sort();
    var dias = [];
    for (var d = isoToDate(fechas[0]); dateToIso(d) <= fechas[fechas.length - 1] && dias.length < 120; d.setDate(d.getDate() + 1)) {
      dias.push(new Date(d.getTime()));
    }
    var rango = function (col) { return 'Registros!$' + col + ':$' + col; };
    var nombres = funcionarios(registros);
    var suma = {};
    registros.forEach(function (r) { var k = r.funcionario + '|' + r.fecha; suma[k] = (suma[k] || 0) + (r.horas || 0); });

    var ws = XLSX.utils.aoa_to_sheet([['Funcionario']]);
    dias.forEach(function (dia, j) {
      ws[colLetter(j + 1) + '1'] = { t: 'd', v: dia, z: 'dd/mm' };
    });
    var colTotal = colLetter(dias.length + 1);
    ws[colTotal + '1'] = { t: 's', v: 'Total' };
    nombres.forEach(function (nom, i) {
      var fila = i + 2, total = 0;
      ws['A' + fila] = { t: 's', v: nom };
      dias.forEach(function (dia, j) {
        var col = colLetter(j + 1);
        var v = Math.round((suma[nom + '|' + dateToIso(dia)] || 0) * 100) / 100;
        total += v;
        ws[col + fila] = { t: 'n', v: v, z: 'General;-General;""', f: 'SUMIFS(' + rango('F') + ',' + rango('C') + ',$A' + fila + ',' + rango('A') + ',' + col + '$1)' };
      });
      ws[colTotal + fila] = { t: 'n', v: Math.round(total * 100) / 100, z: '0.00', f: 'SUM(B' + fila + ':' + colLetter(dias.length) + fila + ')' };
    });
    ws['!ref'] = 'A1:' + colTotal + (nombres.length + 1);
    ws['!cols'] = [{ wch: 24 }].concat(dias.map(function () { return { wch: 6 }; })).concat([{ wch: 8 }]);
    return ws;
  }

  function crearLibro(registros) {
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, hojaResumen(registros), 'Resumen');
    XLSX.utils.book_append_sheet(wb, hojaPlanilla(registros), 'Planilla');
    XLSX.utils.book_append_sheet(wb, hojaRegistros(registros), 'Registros');
    return wb;
  }

  return { leerRegistros: leerRegistros, unir: unir, crearLibro: crearLibro };
});
