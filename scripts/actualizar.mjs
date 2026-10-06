/**
 * Trae los datos del Apps Script y reescribe data.js.
 * El endpoint (la URL /exec del web app) llega por la variable RIVERA_ENDPOINT.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const ENDPOINT = process.env.RIVERA_ENDPOINT;
if (!ENDPOINT) {
  console.error('Falta RIVERA_ENDPOINT. Configúralo en Settings › Secrets › Actions.');
  process.exit(1);
}

const url = ENDPOINT + (ENDPOINT.includes('?') ? '&' : '?') + 'format=json';
console.log('Consultando los datos de Google Apps Script.');

async function leerPayload() {
  const esperas = [5000, 15000];
  for (let intento = 0; intento < 3; intento++) {
    try {
      // El límite incluye las redirecciones y la lectura del cuerpo.
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
      if (!res.ok) {
        const error = new Error('Google respondió HTTP ' + res.status);
        error.reintentable = [404, 408, 429].includes(res.status) || res.status >= 500;
        throw error;
      }
      const texto = await res.text();
      try {
        return JSON.parse(texto);
      } catch {
        throw new Error('Google no devolvió JSON. Revisar la implementación y sus permisos si el error persiste.');
      }
    } catch (error) {
      if (error.reintentable === false || intento === 2) throw error;
      console.warn('Consulta fallida (intento ' + (intento + 1) + '/3). Se reintentará en ' + esperas[intento] / 1000 + ' s.');
      await new Promise(resolve => setTimeout(resolve, esperas[intento]));
    }
  }
}

let p;
try {
  p = await leerPayload();
} catch (error) {
  console.error('No se actualizaron los datos: ' + error.message);
  process.exit(1);
}

// Validación: mejor fallar que publicar un tablero vacío o a medias.
if (!p.data?.ventas || !Object.keys(p.data.ventas).length) {
  console.error('El payload no trae ventas. No se toca data.js.');
  process.exit(1);
}
if (!Number.isInteger(p.hoy) || p.hoy < 1 || p.hoy > 31) {
  console.error('Día de corte inválido: ' + p.hoy);
  process.exit(1);
}
const mesActual = p.actual;
const serie = p.data.ventas[mesActual];
if (!serie || serie.length !== p.hoy) {
  console.error('La serie de ' + mesActual + ' (' + serie?.length + ' días) no coincide con el corte (' + p.hoy + ').');
  process.exit(1);
}

// La hoja escribe "$ -" en los días sin cargar, y Apps Script los devuelve como 0.
// En una serie ACUMULADA eso es imposible: nunca baja. Un 0 que aparece después de
// un valor positivo significa "no se cargó ese día", así que arrastramos el anterior.
// Los ceros del arranque del mes sí son reales (todavía no había vendido nada).
function normalizar(serie) {
  let ultimo = 0;
  return serie.map(v => {
    if (v === null || v === undefined || (v === 0 && ultimo > 0)) return ultimo;
    ultimo = v;
    return v;
  });
}

let corregidos = 0;
for (const grupo of p.schemaVersion === 2 ? [] : Object.keys(p.data)) {
  for (const mes of Object.keys(p.data[grupo] || {})) {
    const antes = p.data[grupo][mes];
    const despues = normalizar(antes);
    corregidos += antes.filter((v, i) => v !== despues[i]).length;
    p.data[grupo][mes] = despues;
  }
}
if (corregidos) console.log('Días sin cargar arrastrados: ' + corregidos);

const salida =
  '// Datos de la hoja Overview 2026 Clinica Dr. Daniel Rivera.\n' +
  '// Generado automáticamente por .github/workflows/actualizar.yml — no editar a mano.\n' +
  'window.RIVERA = ' + JSON.stringify(p.data) + ';\n' +
  'window.RIVERA.periodos = ' + JSON.stringify(p.periodos || {}) + ';\n' +
  'window.RIVERA.anio = ' + JSON.stringify(p.anio || 2026) + ';\n' +
  'window.RIVERA.corte = ' + p.hoy + ';\n' +
  'window.RIVERA.meta = ' + p.meta + ';\n' +
  'window.RIVERA.actualizado = ' + JSON.stringify(p.generado) + ';\n';

const previo = existsSync('data.js') ? readFileSync('data.js', 'utf8') : '';
// La fecha de generación cambia siempre; comparamos solo los datos para no hacer commits vacíos.
const soloDatos = t => t.split('\n').filter(l => !l.startsWith('window.RIVERA.actualizado')).join('\n');
if (soloDatos(previo) === soloDatos(salida)) {
  console.log('Sin cambios en los datos (' + mesActual + ' día ' + p.hoy + '). No se hace commit.');
  process.exit(78); // neutral: el workflow lo lee y se salta el commit
}

writeFileSync('data.js', salida);
console.log('Actualizado: ' + mesActual + ' día ' + p.hoy + ' — ' +
  p.data.ventas[mesActual][p.hoy-1].toLocaleString('es-CO') + ' acumulado');

