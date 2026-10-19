/* Navegación entre pantallas y render general. */
function toggleMobileMenu(force) {
  const menu = $('mainTabs'),
    button = $('menuToggle');
  if (!menu || !button) return;
  const open = typeof force === 'boolean' ? force : !menu.classList.contains('open');
  menu.classList.toggle('open', open);
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', open ? 'Cerrar menu' : 'Abrir menu');
}
function showView(view) {
  if (view !== 'scan' && pendingLocationId) pendingLocationId = '';
  if (ADMIN_VIEWS.includes(view) && currentProfile?.role !== 'admin') {
    view = 'dashboard';
    toast('Esta sección requiere permisos de administrador.');
  }
  const operatorDeviceHome = view === 'dashboard' && currentProfile?.role === 'operator';
  if (!ADMIN_VIEWS.includes(view) && !canAccessModule(view) && !operatorDeviceHome) {
    view = MODULES.map(([key]) => key).find(canAccessModule) || 'dashboard';
    toast('No tienes permiso para abrir ese módulo.');
  }
  document.querySelectorAll('.view').forEach((item) => item.classList.toggle('active', item.id === view));
  document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  updateBreadcrumb(view);
  toggleMobileMenu(false);
  if (view === 'scan') $('manualCode').focus();
  if (view === 'admin') renderAdminTools();
  if (view === 'inventory') renderInventory();
  if (view === 'returns') renderReturns();
}

function renderAll() {
  renderDashboard();
  renderLocations();
  renderStores();
  renderPallets();
  fillLocationOptions();
  renderRecent();
  renderLowStock();
  renderMoves();
  renderReturns();
  renderProductLookup();
  if ($('inventory')?.classList.contains('active') && !inventoryPending.size) renderInventory();
  if (currentProfile?.role === 'admin' && $('admin').classList.contains('active')) renderAdminTools(false);
}
function updateBreadcrumb(view) {
  const breadcrumb = $('breadcrumb');
  if (!breadcrumb) return;
  const tab = [...document.querySelectorAll('.tab')].find((item) => item.dataset.view === view);
  const label = tab?.textContent.trim() || view;
  const canGoHome = view !== 'dashboard' && (canAccessModule('dashboard') || currentProfile?.role === 'operator');
  breadcrumb.innerHTML = `<ol>${canGoHome ? '<li><button type="button" data-breadcrumb-home>Inicio</button></li><li aria-current="page">' : '<li aria-current="page">'}${label}</li></ol>`;
  const home = breadcrumb.querySelector('[data-breadcrumb-home]');
  if (home) home.addEventListener('click', () => showView('dashboard'));
}
