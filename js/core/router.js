/* Navegación entre pantallas y render general. */
function showView(view) {
  if (view !== 'scan' && pendingLocationId) pendingLocationId = '';
  if (ADMIN_VIEWS.includes(view) && currentProfile?.role !== 'admin') {
    view = 'dashboard';
    toast('Esta sección requiere permisos de administrador.');
  }
  if (!ADMIN_VIEWS.includes(view) && !canAccessModule(view)) {
    view = MODULES.map(([key]) => key).find(canAccessModule) || 'dashboard';
    toast('No tienes permiso para abrir ese módulo.');
  }
  document.querySelectorAll('.view').forEach((item) => item.classList.toggle('active', item.id === view));
  document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  updateBreadcrumb(view);
  if (view === 'scan') $('manualCode').focus();
  if (view === 'admin') renderAdminTools();
  if (view === 'inventory') renderInventory();
}

function renderAll() {
  renderDashboard();
  renderLocations();
  renderPallets();
  fillLocationOptions();
  renderRecent();
  renderLowStock();
  renderMoves();
  renderProductLookup();
  if ($('inventory')?.classList.contains('active') && !inventoryPending.size) renderInventory();
  if (currentProfile?.role === 'admin' && $('admin').classList.contains('active')) renderAdminTools(false);
}
function updateBreadcrumb(view) {
  const breadcrumb = $('breadcrumb');
  if (!breadcrumb) return;
  const tab = [...document.querySelectorAll('.tab')].find((item) => item.dataset.view === view);
  const label = tab?.textContent.trim() || view;
  const canGoHome = view !== 'dashboard' && canAccessModule('dashboard');
  breadcrumb.innerHTML = `<ol>${canGoHome ? '<li><button type="button" data-breadcrumb-home>Inicio</button></li><li aria-current="page">' : '<li aria-current="page">'}${label}</li></ol>`;
  const home = breadcrumb.querySelector('[data-breadcrumb-home]');
  if (home) home.addEventListener('click', () => showView('dashboard'));
}
