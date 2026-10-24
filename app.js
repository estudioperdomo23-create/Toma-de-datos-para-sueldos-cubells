(function () {
  'use strict';

  var filas = [];          // registros reconocidos, con campo "incluir"
  var existentes = null;   // registros del Excel cargado (si hay)
  var nombreExcel = null;

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function visibles() {
    var desde = $('desde').value, hasta = $('hasta').value;
    return filas.filter(function (r) {
      return (!desde || r.fecha >= desde) && (!hasta || r.fecha <= hasta);
    });
  }

  function procesar() {
    filas = HorasParser.processChat($('texto').value).map(function (r) { r.incluir = true; return r; });
    dibujar();
  }

  function dibujar() {
    var lista = visibles();
    var revisar = lista.filter(function (r) { return r.estado === 'Revisar'; }).length;
    var personas = {};
    lista.forEach(function (r) { personas[r.funcionario] = true; });
    var total = lista.reduce(function (s, r) { return s + (r.incluir && r.horas ? r.horas : 0); }, 0);

    $('chips').innerHTML = filas.length ? [
      '<span class="chip">' + lista.length + ' registros</span>',
      '<span class="chip">' + Object.keys(personas).length + ' funcionarios</span>',
      '<span class="chip">' + (Math.round(total * 100) / 100) + ' horas</span>',
      revisar ? '<span class="chip warn">' + revisar + ' para revisar</span>' : ''
    ].join('') : '';

    $('descargar').disabled = !lista.some(function (r) { return r.incluir; });

    if (!lista.length) {
      $('tabla').innerHTML = '<div class="vacio">' + (filas.length
        ? 'No hay registros en el período elegido.'
        : 'No se encontraron horas. Revisá que cada mensaje empiece con la fecha y el nombre, por ejemplo “[18:05, 24/10/2026] Juan:”.') + '</div>';
      return;
    }

    var html = '<table><thead><tr><th>Incluir</th><th>Fecha</th><th>Funcionario</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Estado</th><th>Observación</th><th>Mensaje</th></tr></thead><tbody>';
    lista.forEach(function (r) {
      var i = filas.indexOf(r);
      html += '<tr data-i="' + i + '"' + (r.incluir ? '' : ' class="excluida"') + '>' +
        '<td><input type="checkbox" data-campo="incluir"' + (r.incluir ? ' checked' : '') + ' aria-label="Incluir"></td>' +
        '<td><input type="date" class="fecha" data-campo="fecha" value="' + esc(r.fecha) + '"></td>' +
        '<td><input class="nombre" data-campo="funcionario" value="' + esc(r.funcionario) + '"></td>' +
        '<td><input type="time" class="hora" data-campo="entrada" value="' + esc(r.entrada) + '"></td>' +
        '<td><input type="time" class="hora" data-campo="salida" value="' + esc(r.salida) + '"></td>' +
        '<td><input type="number" class="horas" step="0.25" min="0" data-campo="horas" value="' + (r.horas == null ? '' : r.horas) + '"></td>' +
        '<td><span class="estado ' + r.estado + '">' + r.estado + '</span></td>' +
        '<td class="obs">' + esc(r.obs) + '</td>' +
        '<td class="msg">' + esc(r.mensaje) + '</td></tr>';
    });
    $('tabla').innerHTML = html + '</tbody></table>';
  }

  // Edición en la tabla: al corregir a mano, la fila pasa a OK
  $('tabla').addEventListener('change', function (e) {
    var campo = e.target.getAttribute('data-campo');
    var tr = e.target.closest('tr');
    if (!campo || !tr) return;
    var r = filas[+tr.getAttribute('data-i')];
    if (campo === 'incluir') {
      r.incluir = e.target.checked;
    } else {
      r[campo] = campo === 'horas' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
      if ((campo === 'entrada' || campo === 'salida') && r.entrada && r.salida) {
        var a = r.entrada.split(':'), b = r.salida.split(':');
        var min = (+b[0] * 60 + +b[1]) - (+a[0] * 60 + +a[1]);
        if (min <= 0) min += 24 * 60;
        r.horas = Math.round(min / 60 * 100) / 100;
      }
      if (r.horas != null && r.horas > 0) {
        r.estado = 'OK';
        if (!/Corregido a mano/.test(r.obs)) r.obs = (r.obs ? r.obs + '. ' : '') + 'Corregido a mano';
      }
    }
    dibujar();
  });

  $('procesar').addEventListener('click', procesar);
  $('desde').addEventListener('change', dibujar);
  $('hasta').addEventListener('change', dibujar);

  $('archivoChat').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    f.text().then(function (txt) { $('texto').value = txt; procesar(); });
  });

  $('archivoExcel').addEventListener('change', function (e) {
    var f = e.target.files[0];
    existentes = null; nombreExcel = null;
    if (!f) { $('aviso').textContent = ''; return; }
    f.arrayBuffer().then(function (buf) {
      existentes = HorasExcel.leerRegistros(new Uint8Array(buf));
      nombreExcel = f.name;
      $('aviso').textContent = 'Planilla cargada: ' + existentes.length + ' registros existentes. Los nuevos se van a agregar sin repetir los que ya están.';
    }).catch(function () {
      $('aviso').textContent = 'No se pudo leer ese archivo de Excel.';
    });
  });

  $('descargar').addEventListener('click', function () {
    var nuevos = visibles().filter(function (r) { return r.incluir; });
    var res = HorasExcel.unir(existentes || [], nuevos);
    var wb = HorasExcel.crearLibro(HorasParser.marcarDuplicados(res.registros));
    var hoy = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, nombreExcel || ('horas_' + hoy + '.xlsx'));
    $('aviso').textContent = 'Listo: ' + res.agregados + ' registros agregados' +
      (res.repetidos ? ', ' + res.repetidos + ' ya estaban en la planilla' : '') + '.';
  });
})();
