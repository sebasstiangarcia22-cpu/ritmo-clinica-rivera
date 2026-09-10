# Ritmo Clínica Rivera

Tablero de ritmo mensual: cómo va el mes en curso contra **el mismo día** de cada
mes del año, en ventas, leads y agendamientos.

**Sitio:** https://sebasstiangarcia22-cpu.github.io/ritmo-clinica-rivera/

## Archivos

| | |
|---|---|
| `index.html` | El tablero completo. Sin dependencias ni build. |
| `data.js` | Los datos. **Es el único archivo que hay que tocar para actualizar.** |

## Actualizar

Editar `data.js` y hacer commit. GitHub Pages republica solo en ~1 minuto.

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
