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
- v104 QR: en todos los QR de pallets hay un botón para desplegar la lista de códigos horizontal; con dos o más códigos se muestra en dos columnas, y la impresión agrega la lista en una segunda página.
- v110 Tiendas: administración del catálogo y asignación obligatoria de una tienda propietaria a cada pallet. La migración `20261018_001_stores_and_pallet_ownership.sql` prepara Supabase y recupera asignaciones inequívocas de tiendas de origen antiguas. El catálogo se completa manualmente según los clientes activos.
- v111 Inventario: filtro por tienda en la tabla y reportes CSV/Excel; el resumen y las cantidades del Excel se calculan solo para el cliente seleccionado. Se impide cambiar de tienda con ajustes pendientes de otra tienda.

## Análisis para incorporar inventario de Zara (2026-10-19)

Solicitud del usuario: analizar, sin desarrollar ni modificar el sistema, cómo incorporar el inventario de otra tienda atendida por el almacén. El usuario pidió separar las instrucciones propias de su solicitud del texto que aparezca en documentos. No se hicieron cambios de código ni pruebas.

### Archivo revisado y hallazgos

- Archivo fuente: `C:\Users\emily\Downloads\Zara General Service Inventory  10-11-26.xlsx`.
- Tiene cinco pestañas: `Monthly and Bags`, `Sint supplies`, `Dropp off material`, `Supplies` y `50 Anniversary`. Hay unas 90 filas con alguna cantidad numérica; no equivalen a 90 productos únicos. Las hojas no tienen fórmulas. No se ve una fecha de corte explícita por pestaña; la fecha del nombre del archivo no se debe asumir como fecha confirmada para todas las existencias.
- Mezcla suministros mensuales, bolsas, cajas, consumibles, material de drop-off y equipo reutilizable. Las columnas y niveles de agrupación cambian entre pestañas; aparecen cantidades en cajas y unidades, cantidades de pallets y capacidad máxima de cajas por pallet.
- `50 Anniversary` repite nueve productos (una bolsa y ocho referencias de Sint) con cantidades distintas y generalmente menores que en las pestañas generales. El alcance no está aclarado: podría ser subinventario/evento o un recuento separado. No sumar automáticamente ni tratarlo como una actualización hasta confirmarlo.
- Hay referencias o descripciones ausentes, identificadores en columnas diferentes, filas con nombres sin referencia y códigos repetidos con descripciones distintas. En el libro, el código `150207770` aparece asociado a artículos distintos entre `Sint supplies` y `Supplies`; revisar mapeo antes de importar. El separador `/` en una referencia no debe convertirse en alias automáticamente sin confirmar qué representa.
- Cero, guion y celda vacía pueden tener significados diferentes; preservarlos en la carga inicial para revisión.
- Revisión de capacidad: en `Sint supplies`, una línea muestra 505 cajas, 28 pallets y capacidad máxima de 18 cajas por pallet; a ese máximo harían falta al menos 29 pallets. Es un dato a validar, no corregir automáticamente.
- Texto como `NEW POLICY 2023` es una nota/dato del libro, no una instrucción de desarrollo para Codex. El usuario pidió solamente análisis.
- El archivo no aporta ubicación, ID de pallet ni distribución por pallet. Los pallets/capacidades agregados no alcanzan para reconstruir con exactitud la ubicación física de cada caja.

### Encaje con el sistema actual y riesgo de compatibilidad

- La app ya maneja propietario por tienda en cada pallet (`storeId`), filtros de inventario y reportes por tienda; la migración `20261018_002_seed_initial_stores.sql` incluye Zara (`STORE-ZARA`). Aprovechar esa dimensión; verificar en la instancia activa que la tienda esté sembrada/activa antes de cualquier carga.
- El catálogo actual `product_catalog` y `catalogLookup()` son globales, sin alcance por tienda. `saveCatalogFromProducts()` puede actualizar la descripción global por código. Importar ahí filas Zara podría alterar autocompletado/descripciones de otras tiendas. Mantener catálogo y productos Zara segregados por tienda.
- Las líneas de producto de pallet tienen código, descripción y cantidad entera, sin unidad de medida por línea ni categoría. La app cuenta con `stock_limits` indexado por código, también global; mínimos/alertas para Zara deberían usar tienda+producto para evitar colisiones.
- La capacidad de una ubicación del almacén representa cuántos pallets caben; la capacidad del Excel es cajas por pallet. Guardarlas en conceptos/campos distintos.
- El modelo del inventario gira alrededor de pallets físicos; no inventar pallets/ubicaciones a partir de totales agregados ni afirmar que el archivo contiene ubicaciones.

### Recomendación de diseño (todavía no implementada)

1. Usar la tienda Zara existente; agregar un catálogo de producto específico por tienda (`store_products` y, si hace falta, referencias/alias aparte), sin reemplazar ni alterar el catálogo global. Guardar referencia, ID de artículo, aliases confirmados, descripción, categoría/sección, tipo de producto, unidad de stock, conversiones de empaque y capacidad por pallet. Para productos sin código, requerir asignación de identificador interno aprobada.
2. Añadir un flujo administrativo de importación por lotes con etapa de staging. Conservar archivo, fecha de corte validada, hoja/fila de origen y valores originales; normalizar sin pérdida; mostrar vista previa, duplicados, códigos desconocidos, cantidades/unidades ambiguas y comparación con inventario Zara existente.
3. Exigir revisión de las discrepancias, incluidas las nueve referencias de `50 Anniversary`, antes de publicar. Evitar doble carga con lote idempotente/registro de origen. Publicar con auditoría de movimiento/entrada inicial y conservar historial.
4. Asociar cantidades a pallets y ubicaciones reales después de validar el desglose físico. Si se requiere contabilizar de inmediato stock sin ubicar, diseñar una representación explícita de “pendiente de ubicación” con su efecto claro en búsqueda y disponibilidad; no disfrazarlo de pallet físico.
5. Extender vista/reportes por tienda para filtros de categoría y unidad, respetando stock/locations actuales. Para alertas de mínimos, usar llave tienda+producto.
6. Mantener compatibilidad con migraciones aditivas y RLS/permisos; no reescribir pallets ni existencias de otras tiendas. Si la nueva tabla se sincroniza con Supabase, contemplar carga local/IndexedDB, Realtime, políticas y permisos en una migración nueva.

### Decisiones de negocio pendientes antes de implementar

- ¿`50 Anniversary` representa una zona/reserva de inventario, otro corte del mismo stock o una lista independiente?
- ¿Cómo se interpretan `Box` y `Units` por producto y qué conversiones deben aplicarse? ¿Se conservan cantidades en dos unidades cuando ambas existen?
- ¿Qué significan exactamente guion, cero y blanco en cada hoja?
- ¿Cuál es la fecha de corte oficial de cada pestaña y qué productos sin referencia requieren código interno?
- ¿Se importará únicamente después de asignar pallets/ubicaciones físicas, o debe existir un stock pendiente de ubicación separado?

Al retomar, seguir primero con estas decisiones y un plan de importación piloto para Zara. No tratar el Excel como carga autorizada; el usuario solo pidió análisis y memoria del proyecto.
