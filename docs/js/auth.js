import {
  app,
  hideOverlay,
  refreshAppData,
  resetState,
  runWithLoading,
  runtime,
  showOverlay,
  supabaseClient,
} from './core.js';

const authState = { loading: false };

function setAuthMessage(message, type = 'info') {
  const el = document.getElementById('auth-status');
  if (!el) return;
  if (!message) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }

  el.textContent = message;
  el.classList.remove('hidden', 'bg-redbg', 'text-red1', 'bg-greenbg', 'text-greentx', 'bg-bluebg', 'text-bluetx');
  if (type === 'error') {
    el.classList.add('bg-redbg', 'text-red1');
  } else if (type === 'success') {
    el.classList.add('bg-greenbg', 'text-greentx');
  } else {
    el.classList.add('bg-bluebg', 'text-bluetx');
  }
}

function setAuthLoading(loading) {
  authState.loading = loading;
  ['auth-email', 'auth-password', 'auth-confirm-password', 'auth-register', 'auth-login', 'auth-logout'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = loading;
  });
}

function updateAuthUI() {
  const register = document.getElementById('auth-register');
  const login = document.getElementById('auth-login');
  const logout = document.getElementById('auth-logout');
  if (!register || !login || !logout) return;

  if (runtime.currentUser) {
    register.classList.add('hidden');
    login.classList.add('hidden');
    logout.classList.remove('hidden');
    setAuthMessage(`Conectado: ${runtime.currentUser.email || runtime.currentUser.id}`, 'success');
    return;
  }

  register.classList.remove('hidden');
  login.classList.remove('hidden');
  logout.classList.add('hidden');
  setAuthMessage('');
}

function setAuthModalMessage(message, type = 'info') {
  const el = document.getElementById('auth-modal-message');
  if (!el) return;
  if (!message) {
    el.textContent = '';
    el.classList.add('hidden');
    el.classList.remove('text-red1', 'text-green1', 'text-blue1');
    return;
  }

  el.textContent = message;
  el.classList.remove('hidden', 'text-red1', 'text-green1', 'text-blue1');
  if (type === 'error') {
    el.classList.add('text-red1');
  } else if (type === 'success') {
    el.classList.add('text-green1');
  } else {
    el.classList.add('text-blue1');
  }
}

function toggleAuthMode(mode) {
  runtime.authMode = mode;
  const loginBtn = document.getElementById('auth-mode-login');
  const registerBtn = document.getElementById('auth-mode-register');
  const title = document.getElementById('auth-modal-title');
  const sub = document.getElementById('auth-modal-sub');
  const action = document.getElementById('auth-modal-action');
  const confirmField = document.getElementById('auth-confirm-field');
  if (!loginBtn || !registerBtn || !title || !sub || !action) return;

  if (mode === 'register') {
    loginBtn.classList.remove('bg-accent', 'text-white');
    loginBtn.classList.add('bg-white', 'text-text2', 'border-borderc');
    registerBtn.classList.remove('bg-white', 'text-text2');
    registerBtn.classList.add('bg-accent', 'text-white');
    title.textContent = 'Crear cuenta';
    sub.textContent = 'Registrate para sincronizar y proteger tus finanzas.';
    action.textContent = 'Registrarme';
    confirmField?.classList.remove('hidden');
    return;
  }

  loginBtn.classList.add('bg-accent', 'text-white');
  loginBtn.classList.remove('bg-white', 'text-text2');
  registerBtn.classList.remove('bg-accent', 'text-white');
  registerBtn.classList.add('bg-white', 'text-text2', 'border-borderc');
  title.textContent = 'Iniciar sesion';
  sub.textContent = 'Accede a tu cuenta para sincronizar datos.';
  action.textContent = 'Ingresar';
  confirmField?.classList.add('hidden');
}

function openAuthModal(mode = 'login') {
  toggleAuthMode(mode);
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-confirm-password').value = '';
  setAuthModalMessage('');
  setAuthMessage('');
  showOverlay('overlay-auth');
}

function closeAuthModal() {
  hideOverlay('overlay-auth');
  setAuthModalMessage('');
}

function validateSignUpInputs(email, password, confirmPassword) {
  if (!email) return 'Ingresa tu correo.';
  if (!password) return 'Ingresa tu clave.';
  if (!confirmPassword) return 'Confirma tu clave.';
  if (!/^\S+@\S+\.\S+$/.test(email)) return 'Ingresa un correo valido.';
  if (password.length < 6) return 'La clave debe tener al menos 6 caracteres.';
  if (password !== confirmPassword) return 'Las claves no coinciden.';
  return null;
}

function validateSignInInputs(email, password) {
  if (!email) return 'Ingresa tu correo.';
  if (!password) return 'Ingresa tu clave.';
  if (!/^\S+@\S+\.\S+$/.test(email)) return 'Ingresa un correo valido.';
  return null;
}

async function refreshAfterAuth() {
  try {
    await refreshAppData();
  } catch (error) {
    console.error(error);
    setAuthMessage('No se pudo cargar tu informacion.', 'error');
  }
}

async function signUp() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  const confirmPassword = document.getElementById('auth-confirm-password').value.trim();
  const errorMessage = validateSignUpInputs(email, password, confirmPassword);
  if (errorMessage) {
    setAuthModalMessage(errorMessage, 'error');
    return;
  }

  setAuthLoading(true);
  setAuthModalMessage('Registrando...', 'info');
  let data;
  try {
    data = await runWithLoading('Creando tu cuenta...', async () => {
      const result = await supabaseClient.auth.signUp({ email, password });
      if (result.error) throw result.error;
      if (result.data.user) {
        runtime.currentUser = result.data.user;
        await refreshAfterAuth();
      }
      return result.data;
    });
  } catch (error) {
    setAuthModalMessage(error.message, 'error');
    return;
  } finally {
    setAuthLoading(false);
  }

  setAuthModalMessage('Cuenta creada. Revisa tu correo para confirmar.', 'success');
  if (data?.user) {
    updateAuthUI();
    closeAuthModal();
    setAuthMessage(`Bienvenido ${runtime.currentUser.email}`, 'success');
  }
}

async function signIn() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  const errorMessage = validateSignInInputs(email, password);
  if (errorMessage) {
    setAuthModalMessage(errorMessage, 'error');
    return;
  }

  setAuthLoading(true);
  setAuthModalMessage('Iniciando sesion...', 'info');
  try {
    await runWithLoading('Ingresando a tu cuenta...', async () => {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      runtime.currentUser = data.user;
      await refreshAfterAuth();
    });
  } catch (error) {
    setAuthModalMessage(error.message, 'error');
    return;
  } finally {
    setAuthLoading(false);
  }

  updateAuthUI();
  setAuthMessage(`Bienvenido ${runtime.currentUser.email}`, 'success');
  closeAuthModal();
}

async function signOutUser() {
  setAuthLoading(true);
  try {
    await runWithLoading('Cerrando sesion...', async () => {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
    });
  } catch (error) {
    setAuthMessage(error.message, 'error');
    return;
  } finally {
    setAuthLoading(false);
  }

  runtime.currentUser = null;
  resetState();
  updateAuthUI();
  app.actions.updateAll?.();
  closeAuthModal();
  setAuthMessage('Sesion cerrada.', 'info');
}

function submitAuthAction() {
  if (runtime.authMode === 'register') {
    signUp();
  } else {
    signIn();
  }
}

export async function initAuth() {
  try {
    await runWithLoading('Cargando tu sesion...', async () => {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      runtime.currentUser = data.session?.user ?? null;
      updateAuthUI();
      if (runtime.currentUser) {
        await refreshAfterAuth();
      }
    });
  } catch (error) {
    console.error(error);
    setAuthMessage('Error al comprobar sesion', 'error');
  }
}

app.actions.initAuth = initAuth;

Object.assign(window, {
  closeAuthModal,
  openAuthModal,
  signOutUser,
  submitAuthAction,
  toggleAuthMode,
});
