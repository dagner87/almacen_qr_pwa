# Migraciones de Supabase

`supabase.sql` en la raíz es el esquema completo (instalación nueva). **No lo vuelvas a ejecutar entero en una base que ya funciona.**

Para cambios posteriores se crea un archivo nuevo aquí, con nombre `AAAAMMDD_NNN_descripcion.sql`, que sea idempotente (`if not exists`, `create or replace`, `drop ... if exists`) y solo contenga ese cambio. El mismo cambio se refleja en `supabase.sql`.

Se ejecutan en orden, una sola vez cada una, en Supabase > SQL Editor.

| Archivo | Qué hace |
| --- | --- |
| `20261014_001_repair_profile_access.sql` | Recrea perfiles faltantes y la política de lectura; restablece el admin. Úsalo si aparece «No se encontró tu perfil». |
| `20261014_002_operator_permissions.sql` | Operador con escaneo y ubicaciones. |
| `20261014_003_stock_movements_trigger.sql` | Registro de entradas, salidas y ajustes de stock. |

Las columnas `placed_*`, `moves.products` y los triggers anteriores están en `supabase.sql`.
