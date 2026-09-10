# Apps Script

El puente entre la hoja de cálculo y este repositorio.

| Archivo | Para qué |
|---|---|
| `Code.gs` | **El que importa.** Lee la hoja y expone `?format=json`, que es lo que consume la Action. |
| `Index.html` | Opcional. Sirve el mismo tablero desde Apps Script en vez de GitHub Pages. No hace falta si usas Pages. |

## Instalar o actualizar

1. [script.google.com](https://script.google.com) → proyecto **Ritmo Clínica Rivera**
   (o **+ Nuevo proyecto** si es la primera vez).
2. Reemplazar el contenido de `Código.gs` con `Code.gs`. Guardar con `Cmd+S`.
3. Correr la función **`probar`** y revisar el registro de ejecución.

### Primera vez — desplegar

**Implementar › Nueva implementación › Aplicación web**
- Ejecutar como: **Yo**
- Quién tiene acceso: **Cualquier usuario con el vínculo**

Copiar la URL `/exec` y guardarla como secret `RIVERA_ENDPOINT` en
Settings › Secrets and variables › Actions.

### Actualizaciones siguientes

**Implementar › Administrar implementaciones › ✏️ Editar › Versión: Nueva versión › Implementar**

Mantiene la misma URL, así que no hay que tocar el secret.

## Qué corrige al leer la hoja

- Los `$ -` llegan como `0` numérico. En una serie acumulada eso es imposible,
  así que un `0` después de un valor positivo se trata como día sin cargar y se
  arrastra el anterior. Los ceros del arranque del mes sí son reales.
- Marzo trae `28 y 29` en una celda: el encabezado de día puede ser texto.
- El mes en curso tiene 30-31 columnas pero solo las primeras llenas; se recorta
  en el último día cargado para que la curva no salga plana hasta fin de mes.
- Los bloques se ubican buscando las celdas `Ventas <Mes>`, no por rangos fijos:
  al agregar octubre aparece solo.
