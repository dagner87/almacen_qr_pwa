# Contexto del proyecto Almacén QR

Resumen para retomar trabajo en otra sesión. Actualizado el 13 de octubre de 2026.

## Proyecto

PWA en español para administrar inventario de almacén, ubicaciones de racks, pallets y productos. Se sirve como aplicación web y puede trabajar en modo local con IndexedDB o sincronizar con Supabase. Usa HTML/CSS/JavaScript sin framework principal, Supabase, QRCode.js y html5-qrcode desde CDN, y un service worker para caché.

## Funciones principales

- Crear racks, niveles y posiciones; códigos de ubicación sugeridos con forma `R01-N02-P03`.
- Administrar ubicaciones y etiquetas de barras Code 128.
- Crear y editar pallets con filas dinámicas de productos: código obligatorio, cantidad obligatoria y descripción opcional.
- Buscar inventario por código o descripción y ver cantidades, pallets y ubicación resaltada.
- Escanear QR/Code 128 con cámara o introducir el contenido manualmente.
- Mover pallets, consultar actividad, exportar/importar respaldos y CSV.
- Roles/permisos y sincronización opcional con Supabase; IndexedDB en modo local.

## Archivos importantes

- `index.html`: estructura de pantallas, diálogos y formularios.
- `js/`: código de la aplicación dividido por responsabilidad (ver "Arquitectura" en `README.md`). Reemplaza al antiguo `app.js`.
- `scripts/verify-assets.js`: comprueba en el build que `index.html` y `sw.js` referencien archivos existentes.
- `styles.css`, `admin.css`, `barcodes.css`: apariencia general y estilos especializados.
- `sw.js`: archivos precargados y número de versión de caché.
- `supabase.sql`, `supabase-config.js`, `netlify.toml`: backend y despliegue.
- `README.md`: guía de publicación y uso; revisar que refleje las funciones actuales.

## Flujos actuales

### Crear o editar un pallet

1. El usuario abre el formulario de pallet y agrega filas en una tabla dinámica; el control para agregar otro producto permanece visible mientras la lista de filas se desplaza en su propio scroll.
2. Cada fila necesita un código de producto y una cantidad entera positiva. La descripción es opcional. No se debe volver a agregar un campo de texto único debajo de la tabla ni el botón «Convertir lista en fila».
3. Si el mismo código aparece más de una vez en el pallet que se está editando, se avisa, se bloquea el guardado y se enfoca la cantidad de la fila existente para que el usuario la corrija.
4. Al detectar ese código en otros pallets activos, se informa dónde está y qué cantidad hay en cada ubicación. Al guardar, se solicita confirmación por los pallets afectados. Aceptar traslada/suma esas cantidades al pallet actual y quita el producto de los pallets origen; cancelar conserva existencias separadas. No se debe tratar como duplicado un producto solo por existir en otra ubicación.
5. La consolidación guarda el pallet destino y los pallets origen modificados en una operación conjunta: bulk upsert de Supabase o transacción de escritura de IndexedDB en modo local. En modo local también se registra el movimiento.

### Buscar un producto

- El usuario busca por código o por descripción opcional usando el botón de búsqueda integrado en el campo.
- Los resultados muestran las coincidencias de inventario por pallet con sus cantidades y ubicación. La ubicación se resalta para hacerla fácil de identificar; un mismo producto puede aparecer en varias posiciones.
- El filtro de pallets también tiene el botón de búsqueda dentro del campo.

### Asociar un pallet con una ubicación mediante escaneo

1. Se escanea o introduce el código de barras de la ubicación.
2. El usuario elige «Asociar pallet aquí»; se inicia el escaneo del QR/código del pallet, con posibilidad de introducir el código manualmente o cancelar.
3. Antes de cambiar la ubicación del pallet, la aplicación pide confirmación. Al aceptar, actualiza la asociación y registra el movimiento en el historial.

### QR de pallet e impresión

- `openPalletQr()` crea el QR con el prefijo `ALMACEN_PALLET:` y JSON que incluye `type`, `code`, `locationCode` y la lista completa de productos (`productCode`, `description`, `quantity`).
- Al leerlo, `handleCode()` presenta una tabla con código, descripción y cantidad, incluso si el pallet no existe en el almacenamiento local.
- La regla `@media print` de `styles.css` aísla el diálogo QR y evita que el canvas oculto aparezca junto a la imagen. La impresión física debe verificarse en la impresora/dispositivo si vuelve a reportarse un recorte.

### Estado técnico

- Los botones de búsqueda están dentro de sus campos y alineados a la derecha.
- La caché del service worker es `almacen-qr-v28` en `sw.js`; incrementarla cuando cambien recursos que precarga.
- Se corrigieron textos mal codificados en `app.js` y se revisaron patrones comunes de mojibake en archivos de aplicación.
- No se han ejecutado pruebas en los últimos cambios.

## Preferencias del usuario

- Comunicarse en español.
- Si se cambia código, el usuario hará el commit manualmente. **No intentar crear commits**; indicar un título de commit cuando sea útil y dejarlo a su cargo.
- Mantener los flujos descritos arriba: productos múltiples, descripción opcional, ubicaciones separadas salvo confirmación de consolidación, e información completa en el QR.

## Al retomar

1. Leer este archivo y revisar el estado actual de `app.js`, `styles.css` y `sw.js` antes de modificar.
2. Si se cambia un archivo que sirve el service worker, incrementar la versión de caché en `sw.js`.
3. No dar por hecho que el QR impreso/escaneado funciona visualmente solo por tener el payload en código; confirmar el recorrido esperado por el usuario si el siguiente problema reportado es de interfaz o dispositivo.
4. En este entorno Git no está disponible como comando, y el usuario no quiere que se intente hacer commit. Tras modificar código, entregar un título de commit sugerido para que el usuario lo cree manualmente. Para una actualización de memoria/documentación no hace falta proponerlo.

## Incidencias conocidas de inspección

- Se corrigió el texto mal codificado en `app.js`; se hizo una búsqueda de patrones típicos de mojibake en el resto del proyecto y no quedaron coincidencias en los archivos de aplicación.
- No se han ejecutado pruebas en los últimos cambios.
