# Almacén QR

PWA en español para gestionar ubicaciones de racks, pallets mixtos, marcas y cantidades en cajas.

## Funciones incluidas
- Crear racks con cinco niveles y posiciones múltiples por nivel; restaurar o eliminar niveles y eliminar posiciones/racks desde la administración.
- Nomenclatura `R01-N02-P03`: rack, nivel contado desde abajo y posición.
- Generar e imprimir etiquetas de código de barras Code 128 para todas las ubicaciones o por rack.
- Crear/editar pallets mixtos con ID QR, ubicación, varios códigos de producto y cantidades por código; también permite pegar una lista tabulada o en formato `| código | cantidad |`.
- Generar e imprimir QR de ubicación y pallet.
- Leer QR y Code 128 con cámara (requiere HTTPS y permiso de cámara) o introducir código manualmente.
- Buscar ubicaciones y pallets; mover pallets; registrar movimientos con usuario y hora.
- Exportar inventario CSV y copia completa JSON; importar JSON.
- Acceso autenticado Supabase con roles de administrador y operador.
- Panel de administración para crear/eliminar la estructura y asignar roles.
- Sincronización Supabase Realtime; sin conexión, los datos ya sincronizados quedan en modo de solo consulta.
- Almacenamiento local con IndexedDB y modo PWA básico.

## Abrir / publicar
La aplicación necesita servirse desde un servidor HTTP(S); no abras `index.html` con doble clic para probar la cámara o el service worker.
1. Sube todos los archivos a un repositorio GitHub.
2. En GitHub: Settings → Pages → Deploy from a branch → `main` / root.
3. Abre la URL HTTPS en Safari para iPhone o Chrome en Android.
4. En iPhone: Compartir → Añadir a pantalla de inicio.

Las librerías QR, lector, código de barras y Supabase se cargan desde CDN. La aplicación y los datos locales básicos quedan en caché, pero la primera carga de esas librerías necesita Internet. Para uso offline robusto, deben incorporarse las librerías al proyecto y probarse en los dispositivos concretos.

### Publicar en Netlify
El archivo `netlify.toml` configura el directorio raíz como sitio estático; no se necesita comando de compilación.
1. En Netlify, importa `dagner87/almacen_qr_pwa` desde GitHub.
2. Para probar esta versión, selecciona la rama `dagner87-netlify-deployment` como rama de publicación; Netlify usará la configuración del repositorio.
3. Abre la URL HTTPS asignada por Netlify y prueba la cámara, que requiere permiso del navegador.

## Primer uso
1. Configura Supabase siguiendo la sección siguiente y pega la URL del proyecto y la clave pública en la pantalla de acceso.
2. Crea una cuenta en **Supabase Authentication → Users**.
3. Asigna el rol inicial de administrador con la instrucción SQL de arranque que aparece al final de `supabase.sql`.
4. Inicia sesión. Los administradores pueden crear racks, niveles y posiciones y asignar roles; los operadores solo pueden crear, editar y mover pallets en posiciones existentes.
5. Abre **Administrar** → **Crear racks**, indica número inicial, cantidad de racks y posiciones por nivel.
6. En **Ubicaciones**, pulsa **Imprimir códigos**, elige un rack o todos e imprime las etiquetas Code 128.
7. En **Pallets** crea cada pallet, agrega productos/cantidades o pega una lista de dos columnas; imprime la etiqueta QR del pallet.
8. El administrador crea las cuentas adicionales en Supabase Authentication. Al iniciar sesión por primera vez, cada cuenta recibe rol de operador; el administrador puede cambiar su rol en la sección **Administrar**.

### Convención sugerida
- `R01-N01-P01` = Rack 1, nivel 1 (abajo), posición 1.
- `PLT-000001` = ID legible del pallet; el QR contiene ese ID, no todos los datos.
- Una posición es un hueco físico concreto. Si en un nivel caben tres pallets, configura tres posiciones.
- Las cantidades de productos se guardan en cada pallet como líneas con código y cantidad. Los pallets de respaldos anteriores, que solo registraban cajas, siguen siendo compatibles.

## Supabase, autenticación y tiempo real
Supabase es requerido para iniciar sesión, guardar cambios y compartir inventario entre dispositivos. Los usuarios y sus credenciales se crean en **Supabase Authentication**; nunca se crea ni almacena una contraseña desde esta app.

1. Crea un proyecto en Supabase.
2. En SQL Editor, ejecuta `supabase.sql`. La migración habilita RLS, perfiles, auditoría de cambios de pallet y publicación Realtime. Se puede volver a ejecutar para aplicar columnas/políticas idempotentes.
3. En **Project Settings → API**, copia Project URL y la clave pública `anon`/publishable.
4. En la pantalla de acceso, guarda la URL y clave pública en cada dispositivo.
5. Crea la primera cuenta desde **Authentication → Users**. Luego, en SQL Editor, sustituye el correo en la última instrucción comentada de `supabase.sql` para asignar el primer rol `admin`; ejecútala una sola vez.
6. Inicia sesión como administrador y crea usuarios adicionales en Supabase Authentication. Esos perfiles empiezan como `operator`; el administrador puede promoverlos desde **Administrar → Usuarios y roles**.

Los permisos también están protegidos por políticas RLS y triggers de base de datos: solo administradores cambian la estructura, los usuarios autenticados actualizan pallets y los cambios de stock generan entradas de auditoría con el usuario y correo autenticados. El SQL no permite borrar ubicaciones ocupadas ni dejar el almacén sin administradores. Nunca incluyas una clave `service_role` en el navegador.

### Limitaciones operativas
- La app bloquea los cambios cuando no hay conexión a Internet o la suscripción Realtime no está activa; la vista ya sincronizada queda disponible como solo lectura.
- Realtime actualiza los clientes conectados; en caso de desconexión, la app vuelve a descargar el estado al reconectar.
- No se deben compartir cuentas: la auditoría registra la identidad autenticada de cada usuario.
- La generación/lectura de QR depende de librerías externas durante la primera carga.
- Capacidad de posición predeterminada = 1 pallet; la estructura permite listar varias posiciones por nivel.

## Recomendación antes de usar en producción
Prueba con un administrador, un operador, un rack y varios pallets en dispositivos reales. Verifica que el operador no pueda cambiar estructura/roles, que los movimientos se reflejen en todas las sesiones, que la auditoría indique el usuario correcto y que una posición ocupada no se pueda eliminar.
