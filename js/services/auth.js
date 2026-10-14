/* Sesión, perfiles y conexión con Supabase. */
function syncMessage(msg) {
  $('syncMessage').textContent = msg;
}

function authMessage(msg) {
  $('authMessage').textContent = msg;
}

function showPasswordUpdate(user) {
  passwordRecoveryUser = user || null;
  $('authGate').hidden = false;
  $('appContent').hidden = true;
  $('loginForm').hidden = true;
  $('forgotPasswordForm').hidden = true;
  $('updatePasswordForm').hidden = false;
  authMessage('Enlace verificado. Escribe y confirma tu nueva contraseña.');
}

function showLogin(message) {
  passwordRecoveryUser = null;
  $('loginForm').hidden = false;
  $('forgotPasswordForm').hidden = true;
  $('updatePasswordForm').hidden = true;
  $('newPassword').value = '';
  $('confirmPassword').value = '';
  authMessage(message);
}

function lockApplication(message = 'Inicia sesión para acceder al inventario.') {
  currentUser = null;
  currentProfile = null;
  realtimeReady = false;
  if (realtimeChannel && supabaseClient) supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel = null;
  $('appContent').hidden = true;
  $('authGate').hidden = false;
  $('loginPassword').value = '';
  showLogin(message);
  updateConnectivity();
}

async function configureSupabase() {
  const config = window.ALMACEN_SUPABASE_CONFIG || {},
    hasUrl = Boolean(config.url),
    hasKey = Boolean(config.anonKey);
  if (hasUrl !== hasKey) throw new Error('Configura juntas SUPABASE_URL y SUPABASE_ANON_KEY en Netlify.');
  const url = (config.url || state.settings.supabaseUrl || '').trim(),
    key = (config.anonKey || state.settings.supabaseKey || '').trim();
  if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_ANON_KEY en las variables de entorno de Netlify.');
  if (!window.supabase) throw new Error('No se cargó la librería Supabase. Comprueba la conexión.');
  if (realtimeChannel && supabaseClient) await supabaseClient.removeChannel(realtimeChannel);
  supabaseClient = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') lockApplication();
    if (event === 'PASSWORD_RECOVERY') showPasswordUpdate(session?.user);
  });
}

async function loadProfile(user) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('user_id,email,role,permissions')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new Error(
      'No se encontró tu perfil. Ejecuta supabase.sql y confirma que la cuenta exista en Authentication.',
    );
  if (!['admin', 'operator'].includes(data.role))
    throw new Error('Tu cuenta no tiene un rol válido. Solicita ayuda al administrador.');
  return data;
}

async function signIn(e) {
  e.preventDefault();
  if (!supabaseClient) {
    try {
      await configureSupabase();
    } catch (err) {
      authMessage('No se pudo conectar con Supabase: ' + err.message);
      return;
    }
  }
  authMessage('Validando acceso…');
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: $('loginEmail').value.trim(),
    password: $('loginPassword').value,
  });
  if (error) {
    authMessage('No se pudo iniciar sesión: ' + error.message);
    return;
  }
  await activateSession(data.user);
}

async function sendPasswordRecovery(event) {
  event.preventDefault();
  if (!supabaseClient) {
    authMessage('No se pudo conectar con Supabase. Revisa la configuración del sitio.');
    return;
  }
  const email = $('loginEmail').value.trim();
  if (!email) {
    authMessage('Escribe primero el correo de tu cuenta.');
    $('loginEmail').focus();
    return;
  }
  authMessage('Enviando enlace de recuperación…');
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) {
    authMessage('No se pudo enviar el enlace: ' + error.message);
    return;
  }
  authMessage('Si el correo pertenece a una cuenta, recibirás un enlace para restablecer la contraseña.');
}

async function updatePassword(event) {
  event.preventDefault();
  if (!supabaseClient || !passwordRecoveryUser) {
    authMessage('El enlace de recuperación no es válido o ya venció. Solicita uno nuevo.');
    return;
  }
  const password = $('newPassword').value;
  if (password !== $('confirmPassword').value) {
    authMessage('Las contraseñas no coinciden.');
    return;
  }
  authMessage('Actualizando contraseña…');
  const { data, error } = await supabaseClient.auth.updateUser({ password });
  if (error) {
    authMessage('No se pudo actualizar la contraseña: ' + error.message);
    return;
  }
  passwordRecoveryUser = null;
  $('newPassword').value = '';
  $('confirmPassword').value = '';
  authMessage('Contraseña actualizada. Iniciando sesión…');
  await activateSession(data.user);
}

async function signOut() {
  if (supabaseClient) {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      authMessage('No se pudo cerrar sesión: ' + error.message);
      return;
    }
  }
  lockApplication('Sesión cerrada.');
}

function updateConnectivity() {
  const ready = AUTH_DISABLED || Boolean(currentUser && currentProfile && navigator.onLine && realtimeReady);
  $('syncBadge').textContent = AUTH_DISABLED ? 'Modo local' : ready ? 'En tiempo real' : 'Solo consulta';
  $('signOutBtn').hidden = AUTH_DISABLED || !currentUser;
  $('signedInAs').textContent = AUTH_DISABLED
    ? ''
    : currentProfile
      ? `${currentProfile.email} · ${currentProfile.role === 'admin' ? 'Administrador' : 'Operador'}`
      : '';
  document.querySelectorAll('[data-role="admin"]').forEach((element) => {
    element.hidden = currentProfile?.role !== 'admin';
  });
  document.querySelectorAll('[data-module]').forEach((element) => {
    element.hidden = !canAccessModule(element.dataset.module);
  });
  if ($('dashboardMoves')) $('dashboardMoves').hidden = !canAccessModule('moves');
  const activeView = document.querySelector('.view.active')?.id;
  if (activeView && !ADMIN_VIEWS.includes(activeView) && !canAccessModule(activeView)) {
    const firstAllowed = MODULES.map(([key]) => key).find(canAccessModule);
    if (firstAllowed) showView(firstAllowed);
  }
  document.querySelectorAll('[data-write]').forEach((element) => {
    element.disabled = !ready || (element.dataset.role === 'admin' && currentProfile?.role !== 'admin');
  });
  if (currentProfile?.role !== 'admin' && ADMIN_VIEWS.some((view) => $(view).classList.contains('active'))) showView('dashboard');
}

async function activateSession(user) {
  currentUser = user;
  try {
    currentProfile = await loadProfile(user);
    $('authGate').hidden = true;
    $('appContent').hidden = false;
    const livePromise = startRealtime();
    await syncFromCloud();
    const live = await Promise.race([livePromise, new Promise((resolve) => setTimeout(() => resolve(false), 6000))]);
    if (live && currentProfile.role === 'admin') await syncToCloud();
    updateConnectivity();
    renderAll();
    if (currentProfile.role === 'admin') renderAdminTools();
    if (live) authMessage('Sesión iniciada. Los cambios se sincronizan en tiempo real.');
    else syncMessage('Sin conexión Realtime; el inventario queda en solo consulta.');
  } catch (error) {
    lockApplication('No se pudo iniciar sesión: ' + error.message);
  }
}
