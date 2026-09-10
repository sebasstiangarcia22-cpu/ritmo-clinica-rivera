# Ritmo Clínica Rivera

Tablero de ritmo mensual: cómo va el mes en curso contra **el mismo día** de cada
mes del año, en ventas, leads y agendamientos.

**Sitio:** https://sebasstiangarcia22-cpu.github.io/ritmo-clinica-rivera/

## Archivos

| | |
|---|---|
| `index.html` | El tablero completo. Sin dependencias ni build. |
| `data.js` | Los datos. **Es el único archivo que hay que tocar para actualizar.** |

## Actualización automática

El tablero se actualiza solo **de lunes a sábado a las 12:00 de Colombia**
(`.github/workflows/actualizar.yml`, cron `0 17 * * 1-6` en UTC).

El flujo es: Apps Script lee la hoja → devuelve JSON → la Action reescribe
`data.js` y hace commit → Pages republica.

```
Google Sheet ──▶ Apps Script (/exec?format=json) ──▶ GitHub Action ──▶ data.js ──▶ Pages
     dueño: Stephanie        corre como Sebastián        12:00 lun-sáb
```

Si los datos no cambiaron, no hace commit. Si la hoja no responde o el payload
viene incompleto, **falla en vez de publicar un tablero a medias**.

### Puesta en marcha (una sola vez)

1. En [script.google.com](https://script.google.com), proyecto nuevo, pegar `Code.gs`.
   Para el feed JSON no hace falta `Index.html`.
2. **Implementar › Nueva implementación › Aplicación web** —
   *Ejecutar como: Yo* · *Acceso: cualquier usuario con el vínculo*.
3. Copiar la URL `/exec` y guardarla en el repo como secret **`RIVERA_ENDPOINT`**
   (Settings › Secrets and variables › Actions › New repository secret).
4. Actions › *Actualizar tablero* › **Run workflow** para probarlo sin esperar al cron.

### Correr a mano

Pestaña **Actions › Actualizar tablero › Run workflow**. Sirve cuando cargan
datos fuera de horario y quieren verlos ya.

### Notas

- El cron de GitHub Actions **no es puntual**: suele correr entre 5 y 20 minutos
  después de la hora, y en horas pico puede tardar más. Para un tablero diario
  no importa; si alguna vez importa, se corre a mano.
- Si el repo pasa 60 días sin commits de personas, GitHub **desactiva los cron**
  y manda un aviso por correo. Se reactivan con un clic.

## Actualizar a mano (sin Apps Script)

Editar `data.js` y hacer commit. Pages republica en ~1 minuto.

```js
window.RIVERA = {
  ventas: { Febrero: [...], ... },  // ACUMULADO por día del mes
  leads:  { ... },                  // ACUMULADO
  agend:  { ... }                   // ACUMULADO
};
window.RIVERA.corte = 9;            // último día cargado del mes en curso
window.RIVERA.meta  = 50000000;     // meta mensual en COP
window.RIVERA.actualizado = '10 de septiembre de 2026';
```

Todo lo demás —posición del mes, comparaciones, proyección, comentarios— se
recalcula solo. Al agregar un mes nuevo a `ventas` aparece en el tablero sin
tocar el HTML.

## Origen de los datos

Hoja *Overview 2026 Clínica Dr. Daniel Rivera*, fila `Total ventas` de cada
bloque mensual (ya viene acumulada), `Total Leads` y `Total agendamientos Marketing`.

Tres correcciones aplicadas al leer la hoja:

- Febrero tiene días en blanco dentro de una serie acumulada: se arrastra el
  último valor conocido en vez de leerlos como cero.
- Marzo trae `28 y 29` en una sola celda.
- El 6 de septiembre el total de agendas dice `11`, pero sus componentes suman `1`.

La meta de $50 M/mes está deducida del `% de Cumplimiento` de la propia hoja.
