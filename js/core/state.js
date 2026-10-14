/* Estado global compartido de la aplicación. */
let db,
  supabaseClient = null,
  scanEngine = null,
  scanRunning = false,
  pendingLocationId = '',
  currentQr = { code: '', title: '' },
  currentUser = null,
  currentProfile = null,
  realtimeChannel = null,
  realtimeReady = false,
  realtimeFirstSubscription = true,
  passwordRecoveryUser = null;

const $ = (id) => document.getElementById(id);

const state = { racks: [], locations: [], pallets: [], moves: [], settings: {} };
