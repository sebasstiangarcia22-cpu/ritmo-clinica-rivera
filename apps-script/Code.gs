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
  'total ventas':                  'ventas',
  'total leads':                   'leads',
  'total agendamientos marketing': 'agend'
};

const norm = s => String(s).toLowerCase().trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

/**
 * Recorre TODAS las pestañas buscando celdas "Ventas <Mes>", que son el ancla de
 * cada bloque. Así funciona igual cuando agreguen octubre, noviembre y diciembre:
 * no hay rangos escritos a mano.
 */
function leerHoja() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const out = {};

  ss.getSheets().forEach(function (sheet) {
    const v = sheet.getDataRange().getValues();

    for (let r = 0; r < v.length; r++) {
      for (let c = 0; c < v[r].length; c++) {
        const m = norm(v[r][c]).match(/^ventas (\w+)$/);
        if (!m) continue;
        const mes = MESES.find(function (x) { return norm(x) === m[1]; });
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
          out[mes][campo] = v[rr].slice(c + 1, fin).map(function (x) {
            if (typeof x === 'number') return x;
            if (x === '' || x === null) return null;
            const s = String(x).replace(/[^0-9-]/g, ''); // "$ 1.890.000" -> "1890000"
            if (s === '' || s === '-') return null;
            const n = Number(s);
            return isNaN(n) ? null : n;
          });
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

function construirPayload() {
  const raw = leerHoja();
  const meses = MESES.filter(function (m) { return raw[m] && raw[m].ventas; });

  // Último día realmente cargado de cada mes: el bloque siempre trae 30-31 columnas,
  // pero el mes en curso solo tiene llenas las primeras. Sin recortar, el ffill
  // arrastraría el valor de hoy hasta fin de mes y la curva saldría plana.
  const ultimoDia = function (serie) {
    let i = serie.length;
    while (i > 0 && (serie[i - 1] === null || serie[i - 1] === undefined)) i--;
    return i;
  };

  const data = { ventas: {}, leads: {}, agend: {} };
  const corte = {};
  meses.forEach(function (m) {
    corte[m] = ultimoDia(raw[m].ventas);
    data.ventas[m] = ffill(raw[m].ventas).slice(0, corte[m]);
    if (raw[m].leads) data.leads[m] = acum(raw[m].leads).slice(0, corte[m]);
    if (raw[m].agend) data.agend[m] = acum(raw[m].agend).slice(0, corte[m]);
  });

  // El mes en curso es el último con datos; "hoy" es su último día cargado.
  const actual = meses[meses.length - 1];
  const hoy = corte[actual];

  const previos = meses.slice(0, -1);
  const alDia = {};
  meses.forEach(function (m) { alDia[m] = data.ventas[m][hoy - 1]; });

  const mejor = previos.reduce(function (a, b) { return alDia[a] > alDia[b] ? a : b; }, previos[0]);
  const prom  = previos.reduce(function (s, m) { return s + alDia[m]; }, 0) / previos.length;
  const puesto = meses.slice().sort(function (a, b) { return alDia[b] - alDia[a]; }).indexOf(actual) + 1;

  // Proyección por forma de curva: qué fracción de su cierre llevaban los meses previos a este día.
  const fracs = previos.map(function (m) {
    const cierre = data.ventas[m][data.ventas[m].length - 1];
    return cierre ? alDia[m] / cierre : 0;
  }).filter(function (f) { return f > 0; });
  const fracProm = fracs.reduce(function (a, b) { return a + b; }, 0) / fracs.length;

  return {
    data: data, meses: meses, actual: actual, hoy: hoy, alDia: alDia,
    meta: META_MENSUAL, mejor: mejor, promedio: prom, puesto: puesto,
    proyLineal: alDia[actual] / hoy * 30,
    proyCurva: alDia[actual] / fracProm,
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
  const hit = cache.get('payload');
  if (hit) return JSON.parse(hit);
  const p = construirPayload();
  try { cache.put('payload', JSON.stringify(p), CACHE_SEG); } catch (e) {} // >100kb: seguimos sin caché
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
