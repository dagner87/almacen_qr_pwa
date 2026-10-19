# Migraciones de Supabase

`supabase.sql` en la raíz es el esquema completo (instalación nueva). **No lo vuelvas a ejecutar entero en una base que ya funciona.**

Para cambios posteriores se crea un archivo nuevo aquí, con nombre `AAAAMMDD_NNN_descripcion.sql`, que sea idempotente (`if not exists`, `create or replace`, `drop ... if exists`) y solo contenga ese cambio. El mismo cambio se refleja en `supabase.sql`.

Se ejecutan en orden, una sola vez cada una, en Supabase > SQL Editor.

| Archivo | Que hace |
| --- | --- |
| `20261014_001_repair_profile_access.sql` | Repara perfiles y acceso; usar solo si aparece "No se encontro tu perfil". |
| `20261014_002_operator_permissions.sql` | Permisos predeterminados para operadores. |
| `20261014_003_stock_movements_trigger.sql` | Registro de entradas, salidas y ajustes de stock. |
| `20261014_004_stock_limits_alerts.sql` | Tablas de minimos/maximos y configuracion de alertas. |
| `20261014_005_product_catalog.sql` | Crea y carga el catalogo inicial de productos. |
| `20261015_001_product_catalog_descriptions.sql` | Permite actualizar descripciones del catalogo con permisos RLS. |
| `20261018_001_stores_and_pallet_ownership.sql` | Catalogo de tiendas y asignacion de tienda propietaria a pallets. |
| `20261018_002_seed_initial_stores.sql` | Registra Mango, Zara y Massimo Dutty sin duplicar tiendas existentes. |
Las columnas `placed_*`, `moves.products` y los triggers anteriores están en `supabase.sql`.
