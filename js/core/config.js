/* Constantes de configuración y catálogo de módulos (pantallas). */
const DB_NAME = 'almacenQRDB',
  DB_VERSION = 1;

const AUTH_DISABLED = !(
  window.ALMACEN_SUPABASE_CONFIG &&
  window.ALMACEN_SUPABASE_CONFIG.url &&
  window.ALMACEN_SUPABASE_CONFIG.anonKey
);

const sharedStores = ['racks', 'locations', 'pallets', 'moves'];

const MODULES = [
  ['dashboard', 'Inicio'],
  ['search', 'Buscar producto'],
  ['locations', 'Ubicaciones'],
  ['pallets', 'Pallets'],
  ['scan', 'Escanear'],
  ['moves', 'Movimientos'],
];

const DEFAULT_OPERATOR_PERMISSIONS = {
  dashboard: false,
  search: true,
  locations: true,
  pallets: true,
  scan: true,
  moves: false,
};
