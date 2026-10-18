/* Reglas de acceso por módulo y rol. */
function canAccessModule(module) {
  if (AUTH_DISABLED || currentProfile?.role === 'admin') return true;
  const permission = module === 'returns' ? 'pallets' : module;
  return currentProfile?.permissions?.[permission] === true;
}

function defaultPermissionsFor(role) {
  return role === 'admin'
    ? Object.fromEntries(MODULES.map(([key]) => [key, true]))
    : { ...DEFAULT_OPERATOR_PERMISSIONS };
}

function canWrite(adminOnly = false) {
  if (AUTH_DISABLED) return true;
  if (!currentUser || !currentProfile) {
    toast('Inicia sesión para realizar cambios.');
    return false;
  }
  if (adminOnly && currentProfile.role !== 'admin') {
    toast('Esta acción requiere permisos de administrador.');
    return false;
  }
  if (!adminOnly && !canAccessModule('pallets')) {
    toast('No tienes permiso para modificar pallets.');
    return false;
  }
  if (!navigator.onLine || !realtimeReady) {
    toast('Sin conexión en tiempo real: el sistema está en modo de solo consulta.');
    return false;
  }
  return true;
}
