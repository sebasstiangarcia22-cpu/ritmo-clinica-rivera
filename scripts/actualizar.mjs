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
console.log('Leyendo', url.replace(/\/[^/]*exec/, '/***/exec'));

// Apps Script responde con un 302 hacia googleusercontent; fetch lo sigue solo.
const res = await fetch(url, { redirect: 'follow' });
if (!res.ok) {
  console.error('El endpoint respondió ' + res.status + ' ' + res.statusText);
  process.exit(1);
}

const texto = await res.text();
let p;
try {
  p = JSON.parse(texto);
} catch (e) {
  // Si el web app perdió permisos, Google devuelve una página de login en HTML.
  console.error('La respuesta no es JSON. ¿El deploy quedó como "Cualquier usuario con el vínculo"?');
  console.error(texto.slice(0, 300));
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
for (const grupo of ['ventas', 'leads', 'agend']) {
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
