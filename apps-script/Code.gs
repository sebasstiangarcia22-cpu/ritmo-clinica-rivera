/**
 * Ritmo Clínica Rivera — web app que lee la hoja en vivo.
 *
 * Despliegue: Implementar › Nueva implementación › Aplicación web
 *   Ejecutar como:        Yo
 *   Quién tiene acceso:   Cualquier usuario con el vínculo
 * El link /exec resultante es fijo: no cambia aunque vuelvas a implementar
 * (usa "Administrar implementaciones › Editar › Nueva versión").
 */

const SHEET_ID    = '1bg6hVjxHqO3vTP8U7yyJKMEXrrJVbYd4YWHGA4OqneA';
const META_MENSUAL = 50000000;
const CACHE_SEG   = 600; // 10 min: evita releer la hoja en cada visita

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/** Filas que nos interesan de cada bloque mensual, y con qué nombre las guardamos. */
const FILAS = {
  'total ventas': 'ventas',
  'marketing acumulado': 'mkt',
  'dr. daniel acumulado': 'propio',
  'total leads': 'leads',
  'total agendamientos marketing': 'agend'
};

/** Las que ya vienen acumuladas en la hoja: se arrastran, no se suman. */
const ACUMULADAS = ['ventas', 'mkt', 'propio'];

const norm = s => String(s).toLowerCase().trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

/**
 * Recorre TODAS las pestañas buscando celdas "Ventas <Mes>", que son el ancla de
 * cada bloque. Así funciona igual cuando agreguen octubre, noviembre y diciembre:
 * no hay rangos escritos a mano.
 */
function leerSerie(fila, encabezados, inicio, fin) {
  const serie = [], faltantes = [];
  for (let c = inicio; c < fin; c++) {
    const dias = String(encabezados[c]).match(/\d+/g).map(Number);
    const dia = dias[dias.length - 1];
    for (let d = dias[0]; d < dia; d++) faltantes.push(d);
    let x = fila[c];
    if (x === '' || x === null || x === undefined) x = null;
    else if (typeof x !== 'number') {
      const limpio = String(x).replace(/[^0-9-]/g, '');
      x = limpio && limpio !== '-' ? Number(limpio) : null;
    }
    serie[dia - 1] = Number.isFinite(x) ? x : null;
  }
  return { serie: Array.from(serie, x => x === undefined ? null : x), faltantes };
}

function leerHoja() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const out = {};

  ss.getSheets().forEach(function (sheet) {
    const v = sheet.getDataRange().getValues();
    const nombre = norm(sheet.getName());
    const mesesDelNombre = MESES.filter(x => new RegExp('(^|[^a-z])' + norm(x) + '([^a-z]|$)').test(nombre));

    for (let r = 0; r < v.length; r++) {
      for (let c = 0; c < v[r].length; c++) {
        const m = norm(v[r][c]).match(/^ventas (\w+)$/);
        if (!m) continue;
        const mes = mesesDelNombre.length === 1 ? mesesDelNombre[0] : MESES.find(function (x) { return norm(x) === m[1]; });
        if (!mes) continue;

        // La fila del ancla trae los números de día hacia la derecha.
        // El bloque termina donde arranca el siguiente "Ventas <Mes>" o se acaban los días.
        // Ojo: marzo trae "28 y 29" en una sola celda, así que un encabezado de día
        // puede ser texto. Aceptamos cualquier celda que ARRANQUE con un día válido.
        const esDia = function (x) {
          const n = typeof x === 'number' ? x : parseInt(String(x), 10);
          return !isNaN(n) && n >= 1 && n <= 31;
        };
        let fin = c + 1;
        while (fin < v[r].length && esDia(v[r][fin])) fin++;
        const nDias = fin - c - 1;
        if (nDias < 5) continue; // no es un bloque real

        out[mes] = out[mes] || {};

        // Bajamos por la columna del ancla leyendo las filas que nos importan,
        // hasta toparnos con el ancla del siguiente mes.
        for (let rr = r + 1; rr < v.length; rr++) {
          const etq = norm(v[rr][c]);
          if (/^ventas \w+$/.test(etq)) break;
          const campo = FILAS[etq];
          if (!campo) continue;
          const lectura = leerSerie(v[rr], v[r], c + 1, fin);
          out[mes][campo] = lectura.serie;
          out[mes].faltantes = lectura.faltantes;
        }
      }
    }
  });

  return out;
}

/**
 * En una serie ACUMULADA, un hueco significa "no se cargó": arrastra el último valor.
 * Ojo con los "$ -" de la hoja: Sheets los devuelve como 0, no como celda vacía.
 * Un acumulado nunca baja, así que un 0 después de un valor positivo también es
 * un día sin cargar. Los ceros del arranque del mes sí son reales.
 */
function ffill(a) {
  let last = 0;
  return (a || []).map(function (x) {
    if (x === null || x === undefined || (x === 0 && last > 0)) return last;
    last = x;
    return x;
  });
}
/** Convierte una serie diaria en acumulada. */
function acum(a) {
  let s = 0;
  return (a || []).map(function (x) { s += (x || 0); return s; });
}


/** Fecha de Colombia; el año de esta hoja es explícito para no mezclar periodos. */
const ANIO_DATOS = 2026;
function fechaColombia() {
  const p = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy|M|d').split('|').map(Number);
  return { anio: p[0], mes: p[1] - 1, dia: p[2] };
}
function diasEnMes(anio, mes) { return new Date(anio, mes + 1, 0).getDate(); }
function valorAlDia(serie, dia) {
  if (!serie || !serie.length || dia < 1) return 0;
  return serie[Math.min(dia, serie.length) - 1];
}
function corteDelMes(m, raw, fecha) {
  const indice = MESES.indexOf(m);
  if (ANIO_DATOS > fecha.anio || (ANIO_DATOS === fecha.anio && indice > fecha.mes)) return 0;
  const limite = Math.min(diasEnMes(ANIO_DATOS, indice), raw.ventas.length);
  if (ANIO_DATOS < fecha.anio || indice < fecha.mes) return limite;
  // Las filas diarias dejan vacíos los días pendientes. Un cero cargado sí cuenta.
  // Los acumulados se calculan hasta fin de mes, por lo que no prueban que el día se haya cargado.
  const marcadores = ['leads', 'agend'].map(k => raw[k] || []);
  let ultimo = 0;
  for (let d = 0; d < Math.min(limite, fecha.dia); d++) {
    const venta = Number(raw.ventas[d]) || 0;
    const ventaAnterior = d ? Number(raw.ventas[d - 1]) || 0 : 0;
    if (marcadores.some(a => a[d] !== null && a[d] !== undefined) || venta > ventaAnterior) ultimo = d + 1;
  }
  return ultimo;
}

function construirPayload() {
  const raw = leerHoja();
  const fecha = fechaColombia();
  const meses = MESES.filter(function (m) {
    return raw[m] && raw[m].ventas && corteDelMes(m, raw[m], fecha) > 0;
  });
  if (!meses.length) throw new Error('No hay meses con datos diarios cargados para el periodo de la hoja.');
  const data = { ventas: {}, mkt: {}, propio: {}, leads: {}, agend: {} };
  const corte = {}, periodos = {};
  meses.forEach(function (m) {
    corte[m] = corteDelMes(m, raw[m], fecha);
    const indice = MESES.indexOf(m);
    periodos[m] = { anio: ANIO_DATOS, dias: diasEnMes(ANIO_DATOS, indice), corte: corte[m],
      cerrado: ANIO_DATOS < fecha.anio || indice < fecha.mes, faltantes: raw[m].faltantes || [] };
    data.ventas[m] = ffill(raw[m].ventas).slice(0, corte[m]);
    // mkt y propio ya vienen acumuladas en la hoja, igual que ventas
    if (raw[m].mkt)    data.mkt[m]    = ffill(raw[m].mkt).slice(0, corte[m]);
    if (raw[m].propio) data.propio[m] = ffill(raw[m].propio).slice(0, corte[m]);
    if (raw[m].leads) data.leads[m] = acum(raw[m].leads).slice(0, corte[m]);
    if (raw[m].agend) data.agend[m] = acum(raw[m].agend).slice(0, corte[m]);
  });

  // El mes en curso es el último con datos; "hoy" es su último día cargado.
  // Preserve unknown days instead of inventing a split for grouped source columns.
  meses.forEach(m => (periodos[m].faltantes || []).forEach(d => {
    Object.keys(data).forEach(k => { if (data[k][m] && d <= data[k][m].length) data[k][m][d - 1] = null; });
  }));
  const actual = meses[meses.length - 1];
  const hoy = corte[actual];

  const previos = meses.slice(0, -1);
  const alDia = {};
  meses.forEach(function (m) { alDia[m] = valorAlDia(data.ventas[m], hoy); });

  const mejor = previos.reduce(function (a, b) { return alDia[a] > alDia[b] ? a : b; }, previos[0] || actual);
  const prom = previos.length ? previos.reduce(function (s, m) { return s + alDia[m]; }, 0) / previos.length : 0;
  const puesto = meses.slice().sort(function (a, b) { return alDia[b] - alDia[a]; }).indexOf(actual) + 1;

  // Proyección por forma de curva: qué fracción de su cierre llevaban los meses previos a este día.
  const fracs = previos.map(function (m) {
    const cierre = data.ventas[m][data.ventas[m].length - 1];
    return cierre ? alDia[m] / cierre : 0;
  }).filter(function (f) { return f > 0; });
  const fracProm = fracs.length ? fracs.reduce(function (a, b) { return a + b; }, 0) / fracs.length : 0;

  return {
    data: data, meses: meses, actual: actual, hoy: hoy, alDia: alDia,
    schemaVersion: 2, anio: ANIO_DATOS, cortes: corte, periodos: periodos,
    meta: META_MENSUAL, mejor: mejor, promedio: prom, puesto: puesto,
    proyLineal: alDia[actual] / hoy * diasEnMes(ANIO_DATOS, MESES.indexOf(actual)),
    proyCurva: fracProm > 0 ? alDia[actual] / fracProm : null,
    fracProm: fracProm,
    generado: (function () {
      // formatDate usa el locale del script y escribiría "September". Lo armamos a mano.
      const b = Utilities.formatDate(new Date(), 'America/Bogota', 'd|M|yyyy|HH:mm').split('|');
      return b[0] + ' de ' + MESES[Number(b[1]) - 1].toLowerCase() + ' ' + b[2] + ', ' + b[3];
    })()
  };
}

function payloadCacheado() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('ritmo-periodos-v3');
  if (hit) return JSON.parse(hit);
  const p = construirPayload();
  try { cache.put('ritmo-periodos-v3', JSON.stringify(p), CACHE_SEG); } catch (e) {} // >100kb: seguimos sin caché
  return p;
}

function doGet(e) {
  // ?format=json devuelve los datos crudos, por si querés alimentar otra cosa.
  if (e && e.parameter && e.parameter.format === 'json') {
    return ContentService
      .createTextOutput(JSON.stringify(payloadCacheado()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const t = HtmlService.createTemplateFromFile('Index');
  t.payload = payloadCacheado();
  return t.evaluate()
    .setTitle('Ritmo Clínica Rivera')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Corre esto una vez desde el editor para comprobar que la hoja se lee bien. */
function probar() {
  const p = construirPayload();
  Logger.log('Meses detectados: ' + p.meses.join(', '));
  Logger.log('Mes en curso: ' + p.actual + ' — día ' + p.hoy);
  Logger.log('Acumulado hoy: ' + p.alDia[p.actual].toLocaleString('es-CO'));
  Logger.log('Mejor al mismo día: ' + p.mejor + ' (' + p.alDia[p.mejor].toLocaleString('es-CO') + ')');
  Logger.log('Puesto: ' + p.puesto + ' de ' + p.meses.length);
  Logger.log('Proyección cierre: ' + Math.round(p.proyCurva).toLocaleString('es-CO'));
}

