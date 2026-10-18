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
- La caché del service worker es `almacen-qr-v47` en `sw.js`; incrementarla con cada cambio de un archivo servido. Todo archivo nuevo debe estar en `CORE` de `sw.js` y en `index.html` (`node scripts/verify-assets.js` lo comprueba). La app se recarga sola al actualizarse el SW.
- La app está modularizada en `js/` (core, domain, features, services); ya no existe un `app.js` único. Ver README.
- Producción: Netlify (`https://capable-gnome-27d030.netlify.app`), rama `main`; rama de trabajo `dagner87-netlify-deployment`. Backend: Supabase (proyecto `etzkqrsboocffdvdhmcy`), esquema y RLS en `supabase.sql`.

## Historial de modificaciones (más reciente al final)

- Refactor modular de `app.js` a 19 archivos en `js/`; el build de Netlify corre `scripts/verify-assets.js`.
- Sync: `syncToCloud` usa `select('*')` (error "racks.updatedAt does not exist") (v34).
- `responsive.css`: barra de pestañas inferior en móvil, objetivos táctiles, diálogos tipo hoja (v35).
- Operador puede crear pallets (`DEFAULT_OPERATOR_PERMISSIONS.pallets=true` y defaults de `supabase.sql`) (v36).
- Rotación: `logMove` guarda `products`; `productRotation()` y panel "Mercadería con más rotación" en Movimientos con filtro 30/90/365/todo; fecha de creación y nº de movimientos en pallets; `rotation.css` (v37).
- Trazabilidad: columnas `placed_by`, `placed_by_email`, `placed_at` y trigger `stamp_pallet_actor`; "Ubicado por … · fecha" en pallets (v38). Requiere ejecutar `supabase.sql` en el SQL Editor.
- Menú del dashboard en columna izquierda en pantallas >620 px (v39).
- Ubicación del pallet en un único campo autocompletable (`#palletLocationInput` + datalist; `fillLocationOptions` y `resolveLocationInput` en `locations.js`) (v40).
- Carga inicial desde `Inventario MD (2).xlsx` a `carga-inicial-almacen.json` (1 rack R34, 11 ubicaciones, 11 pallets, 117 productos) importada con "Importar respaldo". Códigos repetidos en la misma ubicación se suman; se dejan separados los que están en varias ubicaciones.
- QR de pallet compacto (código, ubicación y, por producto, código y cantidad), corrección `L`, tamaño dinámico y tabla HTML bajo el QR (v41).
- Búsqueda: columna Pallet oculta para operador (v42); `locLabel` muestra `(id)` si no resuelve (v43); recarga automática del SW (v44).
- Búsqueda consulta siempre Supabase (con "Cargando…", debounce 300 ms, fallback local sin conexión) (v45); operador sin columna Descripción (v46); mínimo 3 caracteres (v47).
- Búsqueda: mínimo 3 caracteres (v47); al agregar producto en el pallet se desplaza a la nueva fila (v48); operador con `scan` (v49) y `locations` + botón "Agregar pallet" por ubicación (v50).
- Menú **Inventario** (solo admin, v51): cuadrícula editable tipo Excel (`js/features/inventory-grid.js`, `inventory.css`). Columnas Stock / + Entrada / − Salida / Nuevo stock (editable); Enter y flechas navegan; filtro, exportar CSV, guardar/descartar y panel de últimas entradas y salidas. El trigger `record_pallet_activity` calcula las diferencias por producto y registra `Entrada de stock`, `Salida de stock` o `Ajuste de stock` (requiere ejecutar `supabase.sql`). `ADMIN_VIEWS` en `config.js` lista las vistas solo admin.
- Pendiente de confirmar por el usuario: ejecutar `supabase.sql`, crear usuario operador, revocar el token de Supabase y corregir la Site URL (de localhost a Netlify).
- Ideas ofrecidas, no solicitadas: botón "Importar Excel" en la app; excluir "Misceláneos" del ranking de rotación.
- Se corrigieron textos mal codificados en `app.js` y se revisaron patrones comunes de mojibake en archivos de aplicación.
- No se han ejecutado pruebas en los últimos cambios.

## Preferencias del usuario

- Comunicarse en español.
- Responder corto y en español. El usuario autoriza que el asistente haga commit y push (a `dagner87-netlify-deployment` y `main`) tras cada cambio verificado; incluir el trailer `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`.
- Mantener los flujos descritos arriba: productos múltiples, descripción opcional, ubicaciones separadas salvo confirmación de consolidación, e información completa en el QR.

## Al retomar

1. Leer este archivo y revisar el estado actual de `app.js`, `styles.css` y `sw.js` antes de modificar.
2. Si se cambia un archivo que sirve el service worker, incrementar la versión de caché en `sw.js`.
3. No dar por hecho que el QR impreso/escaneado funciona visualmente solo por tener el payload en código; confirmar el recorrido esperado por el usuario si el siguiente problema reportado es de interfaz o dispositivo.
4. Tras modificar código: verificar (`scripts/verify-assets.js`), subir `CACHE`, hacer commit y push, y confirmar el despliegue en Netlify.
5. **Todo cambio de base de datos va como migración** en `supabase/migrations/` (idempotente, solo ese cambio) y se refleja en `supabase.sql`. Nunca pedir al usuario que reejecute `supabase.sql` entero. Si el login falla con «No se encontró tu perfil», usar `20261014_001_repair_profile_access.sql`.

## Incidencias conocidas de inspección

- Se corrigió el texto mal codificado en `app.js`; se hizo una búsqueda de patrones típicos de mojibake en el resto del proyecto y no quedaron coincidencias en los archivos de aplicación.
- No se han ejecutado pruebas en los últimos cambios.

### v52–v56 (resumen)
- v52 Editar pallet escaneado usa el pallet guardado. v53 dashboard a ancho completo. v54 diseño tablet. v55 filtro Disponibles/Ocupadas en Ubicaciones.
- v56 Configuración: mínimos/máximos por producto (stock_limits), alertas por correo (lert_config, stock_alert_state), panel "Stock bajo" en el dashboard. Código: js/features/stock-limits.js, stock.css, Edge Function supabase/functions/stock-alerts (Resend). Migración 20261014_004.
- Despliegue de la alerta: ejecutar la migración 004; supabase functions deploy stock-alerts; secrets RESEND_API_KEY (y opcional ALERT_FROM).
- v99 Devoluciones: nueva vista agrupada por tienda con búsqueda por tienda, código de caja, pallet y ubicación; filtros de estado, totales de cajas/pallets activos y accesos para editar o abrir el QR. Reutiliza el permiso `pallets`; interfaz en `js/features/returns.js` y `returns.css`.
- v100 Dashboard del operador: acceso con icono a Devoluciones, después de Crear pallet, Escanear y Buscar; conserva el permiso de `pallets`.
- v101 Operador: el panel de accesos (Crear pallet, Escanear, Buscar, Devoluciones) también se muestra en escritorio; pantalla de inicio ya no depende del ancho.
- v102 Operador: acceso “Nuevo pallet” siempre disponible para operadores aunque no tengan el permiso general de pallets; crea desde el panel sin ubicación inicial y sin permisos para editar/mover otros pallets. Se añade política RLS de inserción por rol; aplicar el SQL de actualización antes de crear en Supabase.
- v103 Devoluciones: el botón QR muestra la etiqueta y el código QR; al imprimir una devolución, la primera página contiene el QR y la segunda página lista los códigos en dos columnas.
