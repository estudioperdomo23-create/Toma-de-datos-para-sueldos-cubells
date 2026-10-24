/*
 * Reconoce las horas trabajadas en mensajes de WhatsApp.
 *
 * Acepta texto copiado desde WhatsApp Web y chats exportados (Android/iPhone),
 * y devuelve un registro por día y funcionario:
 *   { fecha, funcionario, entrada, salida, horas, estado, obs, mensaje, enviado }
 *
 * Funciona en el navegador (window.HorasParser) y en Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HorasParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_HORAS_DIA = 16;

  // ---------------------------------------------------------------------------
  // Fechas (siempre como {y, m, d} para evitar problemas de zona horaria)
  // ---------------------------------------------------------------------------

  var DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  var DIAS_TXT = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function mkDate(y, m, d) { return new Date(y, m - 1, d, 12); }
  function fromJs(dt) { return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() }; }
  function addDays(f, n) { var dt = mkDate(f.y, f.m, f.d); dt.setDate(dt.getDate() + n); return fromJs(dt); }
  function cmp(a, b) { return (a.y - b.y) || (a.m - b.m) || (a.d - b.d); }
  function isoDate(f) { return f.y + '-' + pad(f.m) + '-' + pad(f.d); }
  function weekday(f) { return mkDate(f.y, f.m, f.d).getDay(); }
  function validDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    var dt = mkDate(y, m, d);
    return dt.getMonth() === m - 1;
  }
  function fullYear(y) { y = +y; return y < 100 ? 2000 + y : y; }
  function hhmm(min) { return pad(Math.floor(min / 60) % 24) + ':' + pad(min % 60); }

  // ---------------------------------------------------------------------------
  // 1) Separar el chat en mensajes
  // ---------------------------------------------------------------------------

  var AMPM = '(?:\\s*([ap])\\.?\\s?m\\.?)?';
  var AUTHOR = '(?:([^:]+?):\\s?)?(.*)$';
  var HEADERS = [
    // WhatsApp Web (copiar mensajes): [10:32, 24/10/2026] Juan: texto
    { re: new RegExp('^\\[(\\d{1,2}):(\\d{2})(?::\\d{2})?' + AMPM + ',\\s*(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2,4})\\]\\s*' + AUTHOR, 'i'),
      idx: { h: 1, mi: 2, ap: 3, d: 4, mo: 5, y: 6, au: 7, tx: 8 } },
    // iPhone exportado: [24/10/26, 10:32:15] Juan: texto
    { re: new RegExp('^\\[(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2,4}),?\\s+(\\d{1,2}):(\\d{2})(?::\\d{2})?' + AMPM + '\\]\\s*' + AUTHOR, 'i'),
      idx: { d: 1, mo: 2, y: 3, h: 4, mi: 5, ap: 6, au: 7, tx: 8 } },
    // Android exportado: 24/10/2026, 10:32 - Juan: texto
    { re: new RegExp('^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2,4}),?\\s+(\\d{1,2}):(\\d{2})' + AMPM + '\\s+-\\s+' + AUTHOR, 'i'),
      idx: { d: 1, mo: 2, y: 3, h: 4, mi: 5, ap: 6, au: 7, tx: 8 } }
  ];

  var IGNORAR = /^<?\s*(multimedia omitido|media omitted|archivo omitido|se elimin[oó] este mensaje|this message was deleted|mensaje eliminado)/i;

  function cleanLine(line) {
    return line
      .replace(/[‎‏‪-‮⁦-⁩﻿]/g, '')
      .replace(/[  ]/g, ' ')
      .replace(/\s+$/, '');
  }

  function parseChat(text) {
    var messages = [];
    var current = null;
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var line = cleanLine(raw);
      for (var i = 0; i < HEADERS.length; i++) {
        var m = HEADERS[i].re.exec(line);
        if (!m) continue;
        var k = HEADERS[i].idx;
        var y = fullYear(m[k.y]), mo = +m[k.mo], d = +m[k.d];
        if (!validDate(y, mo, d)) continue;
        var h = +m[k.h];
        var ap = (m[k.ap] || '').toLowerCase();
        if (ap === 'p' && h < 12) h += 12;
        if (ap === 'a' && h === 12) h = 0;
        current = m[k.au] ? {
          fecha: { y: y, m: mo, d: d },
          hora: pad(h) + ':' + m[k.mi],
          autor: m[k.au].trim(),
          texto: m[k.tx]
        } : null; // mensaje del sistema (sin autor)
        if (current) messages.push(current);
        return;
      }
      // Línea sin encabezado: continuación del mensaje anterior
      if (current) current.texto += '\n' + line;
    });
    return messages.filter(function (msg) {
      msg.texto = msg.texto.trim();
      return msg.texto && !IGNORAR.test(msg.texto);
    });
  }

  // ---------------------------------------------------------------------------
  // 2) Reconocer horas dentro de un mensaje
  // ---------------------------------------------------------------------------

  function normalize(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Una hora: 7 | 7:30 | 7.30 | 7h30 | 7 am | 7:30hs
  var T = '(\\d{1,2})(?:[:.h](\\d{2}))?\\s*(?:([ap])\\.?\\s?m\\.?)?(?:\\s*(?:hs?|hrs?|horas?)\\b\\.?)?';
  var RE_RANGO = new RegExp('(?:\\b(?:de|desde)\\s+(?:las\\s+)?)?\\b' + T + '\\s*(?:-|–|—|\\ba\\b|\\bal\\b|\\bhasta\\b)\\s*(?:las\\s+)?' + T);
  var RE_ENTRADA = new RegExp('\\b(?:entr\\w*|ingres\\w*|llegu\\w*|empec\\w*|arranqu\\w*)\\b\\D{0,15}?\\b' + T);
  var RE_SALIDA = new RegExp('\\b(?:sal\\w*|me fui|egres\\w*|termin\\w*)\\b\\D{0,15}?\\b' + T);
  var RE_TOTAL = /\b(\d{1,2}(?:[.,:]\d{1,2})?)\s*(?:hs?|hrs?|horas?)\b\.?(\s*y\s*(?:media|1\/2))?/;
  var RE_DESCANSO = /(descanso|almuerzo|almorce|pausa)/;
  var RE_PISTA = /\d.*(hora|\bhs?\b|\bhrs?\b|entr|sal|trabaj)|(hora|\bhs?\b|\bhrs?\b|entr|sal|trabaj).*\d/;

  var DIA_RE = '(?:domingo|lunes|martes|miercoles|jueves|viernes|sabado)';
  var RE_SEGMENTOS = new RegExp('\\n|;|,(?=\\s*(?:' + DIA_RE + '|\\d{1,2}\\/\\d{1,2}))');

  function toMin(h, mi, ap) {
    h = +h; mi = +(mi || 0);
    if (ap === 'p' && h < 12) h += 12;
    if (ap === 'a' && h === 12) h = 0;
    if (h > 24 || mi > 59) return null;
    return h * 60 + mi;
  }

  function parseTotal(str, media) {
    var h;
    if (str.indexOf(':') >= 0) {
      var p = str.split(':'); h = +p[0] + +p[1] / 60;
    } else if (/\.\d\d$/.test(str)) { // 8.30 hs = 8 horas 30 minutos
      var q = str.split('.'); h = +q[0] + +q[1] / 60;
    } else {
      h = parseFloat(str.replace(',', '.'));
    }
    if (media) h += 0.5;
    return h;
  }

  // Busca una fecha en el segmento. Devuelve {fecha, resto} o null.
  function findDate(seg, msgFecha) {
    var m, f;
    // 21/10 o 21/10/2026
    if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(seg))) {
      var d = +m[1], mo = +m[2];
      var y = m[3] ? fullYear(m[3]) : msgFecha.y;
      if (validDate(y, mo, d)) {
        f = { y: y, m: mo, d: d };
        // Sin año y "en el futuro" lejano: es del año anterior (ej. 30/12 enviado el 2/1)
        if (!m[3] && cmp(f, addDays(msgFecha, 31)) > 0 && validDate(y - 1, mo, d)) f = { y: y - 1, m: mo, d: d };
        var res = { fecha: f, resto: seg.replace(m[0], ' ') };
        var dia = new RegExp('\\b' + DIA_RE + '\\b').exec(seg);
        if (dia && DIAS.indexOf(dia[0]) !== weekday(f)) res.aviso = 'Dice "' + DIAS_TXT[DIAS.indexOf(dia[0])] + '" pero el ' + pad(d) + '/' + pad(mo) + ' es ' + DIAS_TXT[weekday(f)];
        return res;
      }
    }
    // 21 de octubre
    if ((m = new RegExp('\\b(\\d{1,2})\\s+de\\s+(' + MESES.join('|') + '|septiembre)\\b').exec(seg))) {
      var mes = m[2] === 'septiembre' ? 9 : MESES.indexOf(m[2]) + 1;
      var yy = msgFecha.y;
      if (cmp({ y: yy, m: mes, d: +m[1] }, addDays(msgFecha, 31)) > 0) yy -= 1;
      if (validDate(yy, mes, +m[1])) return { fecha: { y: yy, m: mes, d: +m[1] }, resto: seg.replace(m[0], ' ') };
    }
    if ((m = /\b(anteayer|antes de ayer|ayer|hoy)\b/.exec(seg))) {
      var off = m[1] === 'hoy' ? 0 : m[1] === 'ayer' ? -1 : -2;
      return { fecha: addDays(msgFecha, off), resto: seg.replace(m[0], ' ') };
    }
    // Día de la semana: el más reciente que no sea posterior al mensaje
    if ((m = new RegExp('\\b(' + DIA_RE + '|sab|mier|mie)\\b').exec(seg))) {
      var nombre = m[1] === 'sab' ? 'sabado' : (m[1] === 'mier' || m[1] === 'mie') ? 'miercoles' : m[1];
      var diff = (weekday(msgFecha) - DIAS.indexOf(nombre) + 7) % 7;
      return { fecha: addDays(msgFecha, -diff), resto: seg.replace(m[0], ' ') };
    }
    return null;
  }

  function findHours(seg) {
    var r = { entrada: null, salida: null, total: null, descanso: 0 };
    var m;
    if ((m = RE_RANGO.exec(seg))) {
      var a = toMin(m[1], m[2], m[3]), b = toMin(m[4], m[5], m[6]);
      if (a !== null && b !== null) {
        // "7 a 4" sin am/pm: se entiende 7 a 16
        if (b <= a && !m[6] && b < 12 * 60 && b + 12 * 60 > a && b + 12 * 60 - a <= MAX_HORAS_DIA * 60) b += 12 * 60;
        r.entrada = a; r.salida = b;
        seg = seg.replace(m[0], ' ');
      }
    }
    if (r.entrada === null && (m = RE_ENTRADA.exec(seg))) {
      r.entrada = toMin(m[1], m[2], m[3]);
      seg = seg.replace(m[0], ' ');
    }
    if (r.salida === null && (m = RE_SALIDA.exec(seg))) {
      r.salida = toMin(m[1], m[2], m[3]);
      if (r.entrada !== null && r.salida !== null && r.salida <= r.entrada && !m[3] && r.salida < 12 * 60) r.salida += 12 * 60;
      seg = seg.replace(m[0], ' ');
    }
    if (RE_DESCANSO.test(seg)) {
      var dm = /(\d{1,3})\s*(?:min|minutos)\b/.exec(seg);
      if (dm) { r.descanso = +dm[1]; seg = seg.replace(dm[0], ' '); }
      else if (/media hora/.test(seg)) { r.descanso = 30; seg = seg.replace('media hora', ' '); }
      else if ((dm = /\b(\d)\s*(?:hs?|horas?)\b/.exec(seg))) { r.descanso = +dm[1] * 60; seg = seg.replace(dm[0], ' '); }
    }
    if ((m = RE_TOTAL.exec(seg))) {
      var t = parseTotal(m[1], !!m[2]);
      if (!isNaN(t)) r.total = t;
    }
    r.encontrado = r.entrada !== null || r.salida !== null || r.total !== null;
    return r;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function extractEntries(msg) {
    var norm = normalize(msg.texto);
    var segs = norm.split(RE_SEGMENTOS);
    var entries = [];
    var fechaArrastre = null;

    segs.forEach(function (seg) {
      if (!seg.trim()) return;
      var fd = findDate(seg, msg.fecha);
      var resto = fd ? fd.resto : seg;
      var h = findHours(resto);
      if (!h.encontrado) {
        if (fd) fechaArrastre = fd.fecha; // "Lunes 21/10" en una línea y las horas en la siguiente
        return;
      }
      var obs = [];
      var fecha = fd ? fd.fecha : fechaArrastre;
      if (!fecha) { fecha = msg.fecha; obs.push('Fecha tomada del día del mensaje'); }
      var revisar = false;
      if (fd && fd.aviso) { obs.push(fd.aviso); revisar = true; }

      var horas = null, calculadas = null;
      if (h.entrada !== null && h.salida !== null) {
        var sal = h.salida;
        if (sal <= h.entrada) sal += 24 * 60; // turno nocturno
        calculadas = round2((sal - h.entrada - h.descanso) / 60);
        if (h.descanso) obs.push('Descuenta ' + h.descanso + ' min de descanso');
      }
      if (h.total !== null) {
        horas = round2(h.total);
        if (calculadas !== null && Math.abs(calculadas - horas) > 0.01) {
          obs.push('El total indicado (' + horas + ') no coincide con el horario (' + calculadas + ')');
          revisar = true;
        }
      } else if (calculadas !== null) {
        horas = calculadas;
      } else {
        obs.push(h.entrada !== null ? 'Falta hora de salida' : 'Falta hora de entrada');
        revisar = true;
      }
      if (horas !== null && (horas <= 0 || horas > MAX_HORAS_DIA)) {
        obs.push('Cantidad de horas fuera de lo normal');
        revisar = true;
      }
      if (cmp(fecha, msg.fecha) > 0) { obs.push('Fecha posterior al mensaje'); revisar = true; }

      entries.push({
        fecha: isoDate(fecha),
        funcionario: msg.autor,
        entrada: h.entrada !== null ? hhmm(h.entrada) : '',
        salida: h.salida !== null ? hhmm(h.salida) : '',
        horas: horas,
        estado: revisar ? 'Revisar' : 'OK',
        obs: obs.join('. '),
        mensaje: msg.texto,
        enviado: isoDate(msg.fecha) + ' ' + msg.hora
      });
    });

    // Parece hablar de horas pero no se entendió: se muestra para cargar a mano
    if (!entries.length && RE_PISTA.test(norm)) {
      entries.push({
        fecha: isoDate(msg.fecha), funcionario: msg.autor, entrada: '', salida: '', horas: null,
        estado: 'Revisar', obs: 'No se pudo interpretar el mensaje', mensaje: msg.texto,
        enviado: isoDate(msg.fecha) + ' ' + msg.hora
      });
    }
    return entries;
  }

  // ---------------------------------------------------------------------------
  // 3) Proceso completo
  // ---------------------------------------------------------------------------

  // Marca para revisar los días con más de un registro del mismo funcionario
  function marcarDuplicados(rows) {
    var porDia = {};
    rows.forEach(function (r) {
      var k = r.funcionario.toLowerCase() + '|' + r.fecha;
      (porDia[k] = porDia[k] || []).push(r);
    });
    Object.keys(porDia).forEach(function (k) {
      var grupo = porDia[k];
      if (grupo.length < 2) return;
      var nota = 'Hay ' + grupo.length + ' registros para este día (¿corrección?)';
      grupo.forEach(function (r) {
        r.estado = 'Revisar';
        var obs = String(r.obs || '').replace(/(\. )?Hay \d+ registros para este día \(¿corrección\?\)/g, '');
        r.obs = (obs ? obs + '. ' : '') + nota;
      });
    });
    return rows;
  }

  function processChat(text) {
    var rows = [];
    parseChat(text).forEach(function (msg) { rows = rows.concat(extractEntries(msg)); });
    rows.sort(function (a, b) {
      return a.funcionario.localeCompare(b.funcionario) || a.fecha.localeCompare(b.fecha) || a.enviado.localeCompare(b.enviado);
    });
    return marcarDuplicados(rows);
  }

  function rowKey(r) {
    return [String(r.funcionario).toLowerCase().trim(), r.fecha, r.entrada || '', r.salida || '', r.horas == null ? '' : +r.horas].join('|');
  }

  return {
    parseChat: parseChat,
    extractEntries: extractEntries,
    processChat: processChat,
    marcarDuplicados: marcarDuplicados,
    rowKey: rowKey
  };
});
