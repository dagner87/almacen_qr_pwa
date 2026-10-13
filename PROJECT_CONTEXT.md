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
- `app.js`: datos, formularios, pallets, búsqueda, QR, escáner y sincronización.
- `styles.css`, `admin.css`, `barcodes.css`: apariencia general y estilos especializados.
- `sw.js`: archivos precargados y número de versión de caché.
- `supabase.sql`, `supabase-config.js`, `netlify.toml`: backend y despliegue.
- `README.md`: guía de publicación y uso; revisar que refleje las funciones actuales.

## Estado de los cambios recientes

- El alta de pallet permite múltiples productos; cada fila requiere código y entero positivo para cantidad. Descripción puede quedar vacía.
- El QR de pallet se genera como `ALMACEN_PALLET:` seguido de JSON con `type`, `code`, `locationCode` y todos los productos, cada uno con `productCode`, `description` y `quantity`.
- Al escanear ese QR, `handleCode()` decodifica el JSON y presenta una tabla de código, descripción y cantidad, también sin depender de que el pallet exista en el almacenamiento local.
- `openPalletQr()` prepara ese payload en `app.js`. La caché del service worker está en `almacen-qr-v26` (`sw.js`).
- Se ajustó la regla `@media print` en `styles.css`: oculta el resto de la app, imprime solo el diálogo QR y evita mostrar el canvas oculto junto a la imagen del QR.
- Para el cambio reciente del QR, título de commit sugerido: `Incluir productos completos en el QR del pallet`.

- El flujo de escaneo permite seleccionar una ubicación y luego escanear el QR/código del pallet; antes de actualizar su ubicación pide confirmación. El cambio queda en el historial de movimientos.

## Preferencias del usuario

- Comunicarse en español.
- Si se cambia código, el usuario hará el commit manualmente. **No intentar crear commits**; indicar un título de commit cuando sea útil y dejarlo a su cargo.
- Mantener el flujo de agregar varios productos, permitir descripción opcional y asegurar impresión/escaneo del QR.

## Al retomar

1. Leer este archivo y revisar el estado actual de `app.js`, `styles.css` y `sw.js` antes de modificar.
2. Si se cambia un archivo que sirve el service worker, incrementar la versión de caché en `sw.js`.
3. No dar por hecho que el QR impreso/escaneado funciona visualmente solo por tener el payload en código; confirmar el recorrido esperado por el usuario si el siguiente problema reportado es de interfaz o dispositivo.
4. En este entorno Git no está disponible como comando, y el usuario no quiere que se intente hacer commit. Entregar solo el título sugerido al finalizar una modificación.

## Incidencias conocidas de inspección

- Se corrigió el texto mal codificado en `app.js`; se hizo una búsqueda de patrones típicos de mojibake en el resto del proyecto y no quedaron coincidencias en los archivos de aplicación.
- No se han ejecutado pruebas en los últimos cambios.
