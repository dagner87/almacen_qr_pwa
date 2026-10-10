# Almacén QR — primera versión

PWA en español para gestionar ubicaciones de racks, pallets mixtos, marcas y cantidades en cajas.

## Funciones incluidas
- Crear racks con cinco niveles y posiciones múltiples por nivel.
- Nomenclatura `R01-N02-P03`: rack, nivel contado desde abajo y posición.
- Crear/editar pallets con ID QR, ubicación, descripción, marca, cajas y notas.
- Generar e imprimir QR de ubicación y pallet.
- Leer QR con cámara (requiere HTTPS y permiso de cámara) o introducir código manualmente.
- Buscar ubicaciones y pallets; mover pallets; registrar movimientos.
- Exportar inventario CSV y copia completa JSON; importar JSON.
- Almacenamiento local con IndexedDB y modo PWA básico.
- Sincronización multi-dispositivo opcional mediante Supabase.

## Abrir / publicar
La aplicación necesita servirse desde un servidor HTTP(S); no abras `index.html` con doble clic para probar la cámara o el service worker.
1. Sube todos los archivos a un repositorio GitHub.
2. En GitHub: Settings → Pages → Deploy from a branch → `main` / root.
3. Abre la URL HTTPS en Safari para iPhone o Chrome en Android.
4. En iPhone: Compartir → Añadir a pantalla de inicio.

Las librerías QR, escáner y Supabase se cargan desde CDN. La aplicación y los datos locales básicos quedan en caché, pero la primera carga de esas librerías necesita Internet. Para uso offline robusto, deben incorporarse las librerías al proyecto y probarse en los dispositivos concretos.

## Primer uso
1. Abre **Ubicaciones** → **Crear racks**.
2. Indica número inicial, cantidad de racks y posiciones por nivel.
3. Imprime la etiqueta QR de cada posición.
4. En **Pallets** crea cada pallet y registra la cantidad total de cajas y la marca.
5. Imprime la etiqueta del pallet y pégala de forma visible.
6. Para moverlo, escanea el QR del pallet y pulsa Mover, o búscalo en Pallets.

### Convención sugerida
- `R01-N01-P01` = Rack 1, nivel 1 (abajo), posición 1.
- `PLT-000001` = ID legible del pallet; el QR contiene ese ID, no todos los datos.
- Una posición es un hueco físico concreto. Si en un nivel caben tres pallets, configura tres posiciones.
- Los pallets mixtos se registran con una descripción general y cantidad de cajas total en esta versión. Si necesitas controlar cada SKU/producto dentro de un pallet mixto, habrá que añadir una tabla de líneas de mercancía por pallet.

## Sincronización Supabase (opcional)
**La sincronización requiere configuración.** Sin ella, los datos se guardan únicamente en el dispositivo actual.

1. Crea un proyecto en Supabase.
2. En SQL Editor, ejecuta el archivo `supabase.sql`.
3. En Project Settings / API copia Project URL y la clave pública `anon`/publishable.
4. En la aplicación abre **Datos / Sync**, pega URL y clave y pulsa **Conectar / sincronizar**.
5. Repite en los demás dispositivos.

**Advertencia de seguridad:** el SQL incluido usa políticas abiertas de desarrollo para facilitar una prueba controlada. Cualquier persona con acceso al proyecto y la clave pública podría leer o modificar el inventario. No lo uses para un almacén operativo compartido hasta configurar autenticación y políticas RLS por usuario/empresa. Nunca incluyas la clave `service_role` en el navegador.

### Limitaciones de esta versión
- No gestiona usuarios, roles ni auditoría con identidad individual.
- La sincronización es manual/al abrir conexión, no en tiempo real; hay que pulsar conectar/sincronizar en cada dispositivo.
- Si dos dispositivos editan el mismo registro offline, puede haber conflictos. Acordar reglas operativas y sincronizar antes de editar.
- Un pallet mixto tiene descripción y total de cajas, pero no desglosa cantidades por producto/SKU dentro del pallet.
- La generación/lectura de QR depende de librerías externas durante la primera carga.
- Capacidad de posición predeterminada = 1 pallet; la estructura permite listar varias posiciones por nivel.

## Recomendación antes de usar en producción
Prueba con un rack, varias posiciones y 3–5 pallets. Verifica las etiquetas impresas, la lectura con los dispositivos reales, el proceso de mover y las copias de seguridad. Después, configura acceso autenticado y sincronización con resolución de conflictos.
