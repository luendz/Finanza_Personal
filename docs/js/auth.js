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

const authState = {
  loading: false,
  listenerBound: false,
};

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

function setAuthLoading(loading) {
  authState.loading = loading;
  [
    'auth-email',
    'auth-password',
    'auth-confirm-password',
    'auth-register',
    'auth-login',
    'auth-logout',
    'auth-modal-action',
    'auth-mode-login',
    'auth-mode-register',
    'auth-forgot-link',
    'auth-back-link',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = loading;
  });
}

function humanizeAuthError(error) {
  const rawMessage = error?.message || 'No se pudo completar la operación.';
  const message = rawMessage.toLowerCase();

  if (message.includes('invalid login credentials')) return 'Correo o clave incorrectos.';
  if (message.includes('email not confirmed')) return 'Confirma tu correo antes de ingresar.';
  if (message.includes('user already registered')) return 'Ese correo ya tiene una cuenta.';
  if (message.includes('password should be at least')) return 'La clave debe tener al menos 6 caracteres.';
  if (message.includes('same password')) return 'La nueva clave debe ser distinta a la anterior.';
  if (message.includes('unable to validate email address')) return 'Ingresa un correo válido.';
  return rawMessage;
}

function resetPasswordVisibility() {
  ['auth-password', 'auth-confirm-password'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.type = 'password';
  });
  document.querySelectorAll('#overlay-auth button[type="button"]').forEach(button => {
    button.textContent = 'Ver';
  });
}

function validateEmail(email) {
  if (!email) return 'Ingresa tu correo.';
  if (!/^\S+@\S+\.\S+$/.test(email)) return 'Ingresa un correo válido.';
  return null;
}

function validateSignInInputs(email, password) {
  const emailError = validateEmail(email);
  if (emailError) return emailError;
  if (!password) return 'Ingresa tu clave.';
  return null;
}

function validateSignUpInputs(email, password, confirmPassword) {
  const emailError = validateEmail(email);
  if (emailError) return emailError;
  if (!password) return 'Ingresa tu clave.';
  if (!confirmPassword) return 'Confirma tu clave.';
  if (password.length < 6) return 'La clave debe tener al menos 6 caracteres.';
  if (password !== confirmPassword) return 'Las claves no coinciden.';
  return null;
}

function validateRecoveryInputs(password, confirmPassword) {
  if (!password) return 'Ingresa tu nueva clave.';
  if (!confirmPassword) return 'Confirma tu nueva clave.';
  if (password.length < 6) return 'La clave debe tener al menos 6 caracteres.';
  if (password !== confirmPassword) return 'Las claves no coinciden.';
  return null;
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

function setModeButtonState(activeButton, inactiveButton) {
  activeButton?.classList.add('bg-accent', 'text-white');
  activeButton?.classList.remove('bg-white', 'text-text2');
  inactiveButton?.classList.remove('bg-accent', 'text-white');
  inactiveButton?.classList.add('bg-white', 'text-text2', 'border-borderc');
}

function toggleAuthMode(mode) {
  runtime.authMode = mode;

  const switcher = document.getElementById('auth-mode-switcher');
  const loginBtn = document.getElementById('auth-mode-login');
  const registerBtn = document.getElementById('auth-mode-register');
  const title = document.getElementById('auth-modal-title');
  const sub = document.getElementById('auth-modal-sub');
  const action = document.getElementById('auth-modal-action');
  const emailField = document.getElementById('auth-email-field');
  const passwordField = document.getElementById('auth-password-field');
  const confirmField = document.getElementById('auth-confirm-field');
  const passwordLabel = document.getElementById('auth-password-label');
  const confirmLabel = document.getElementById('auth-confirm-label');
  const forgotLink = document.getElementById('auth-forgot-link');
  const backLink = document.getElementById('auth-back-link');

  if (!loginBtn || !registerBtn || !title || !sub || !action || !emailField || !passwordField || !confirmField || !passwordLabel || !confirmLabel || !forgotLink || !backLink || !switcher) {
    return;
  }

  resetPasswordVisibility();
  switcher.classList.toggle('hidden', mode === 'forgot' || mode === 'recovery');
  forgotLink.classList.toggle('hidden', mode !== 'login');
  backLink.classList.toggle('hidden', mode !== 'forgot' && mode !== 'recovery');
  emailField.classList.toggle('hidden', mode === 'recovery');
  passwordField.classList.toggle('hidden', mode === 'forgot');
  confirmField.classList.toggle('hidden', mode !== 'register' && mode !== 'recovery');

  if (mode === 'register') {
    setModeButtonState(registerBtn, loginBtn);
    title.textContent = 'Crear cuenta';
    sub.textContent = 'Registrate para sincronizar y proteger tus finanzas.';
    action.textContent = 'Registrarme';
    passwordLabel.textContent = 'Clave';
    confirmLabel.textContent = 'Confirmar clave';
    return;
  }

  if (mode === 'forgot') {
    title.textContent = 'Recuperar clave';
    sub.textContent = 'Te enviaremos un enlace para que elijas una nueva clave.';
    action.textContent = 'Enviar enlace';
    return;
  }

  if (mode === 'recovery') {
    title.textContent = 'Nueva clave';
    sub.textContent = `Elige una nueva clave${runtime.currentUser?.email ? ` para ${runtime.currentUser.email}` : ''}.`;
    action.textContent = 'Actualizar clave';
    passwordLabel.textContent = 'Nueva clave';
    confirmLabel.textContent = 'Confirmar nueva clave';
    return;
  }

  setModeButtonState(loginBtn, registerBtn);
  title.textContent = 'Iniciar sesion';
  sub.textContent = 'Accede a tu cuenta para sincronizar datos.';
  action.textContent = 'Ingresar';
  passwordLabel.textContent = 'Clave';
  confirmLabel.textContent = 'Confirmar clave';
}

function openAuthModal(mode = 'login') {
  toggleAuthMode(mode);
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const confirmInput = document.getElementById('auth-confirm-password');
  if (emailInput) emailInput.value = mode === 'recovery' ? (runtime.currentUser?.email || '') : '';
  if (passwordInput) passwordInput.value = '';
  if (confirmInput) confirmInput.value = '';
  setAuthModalMessage('');
  setAuthMessage('');
  showOverlay('overlay-auth');
}

function closeAuthModal() {
  hideOverlay('overlay-auth');
  setAuthModalMessage('');
  resetPasswordVisibility();
  toggleAuthMode('login');
}

function togglePasswordVisibility(fieldId, trigger) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  const isVisible = input.type === 'text';
  input.type = isVisible ? 'password' : 'text';
  if (trigger) trigger.textContent = isVisible ? 'Ver' : 'Ocultar';
}

function handleAuthKeydown(event) {
  if (event.key !== 'Enter' || authState.loading) return;
  event.preventDefault();
  submitAuthAction();
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
  const validationError = validateSignUpInputs(email, password, confirmPassword);
  if (validationError) {
    setAuthModalMessage(validationError, 'error');
    return;
  }

  setAuthLoading(true);
  setAuthModalMessage('Registrando...', 'info');

  let data;
  try {
    data = await runWithLoading('Creando tu cuenta...', async () => {
      const result = await supabaseClient.auth.signUp({ email, password });
      if (result.error) throw result.error;
      if (result.data.session?.user) {
        runtime.currentUser = result.data.session.user;
        await refreshAfterAuth();
      }
      return result.data;
    });
  } catch (error) {
    setAuthModalMessage(humanizeAuthError(error), 'error');
    return;
  } finally {
    setAuthLoading(false);
  }

  if (data?.session?.user) {
    updateAuthUI();
    closeAuthModal();
    setAuthMessage(`Bienvenido ${runtime.currentUser.email}`, 'success');
    return;
  }

  toggleAuthMode('login');
  setAuthModalMessage('Cuenta creada. Revisa tu correo para confirmar y luego ingresa.', 'success');
}

async function signIn() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  const validationError = validateSignInInputs(email, password);
  if (validationError) {
    setAuthModalMessage(validationError, 'error');
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
    setAuthModalMessage(humanizeAuthError(error), 'error');
    return;
  } finally {
    setAuthLoading(false);
  }

  updateAuthUI();
  setAuthMessage(`Bienvenido ${runtime.currentUser.email}`, 'success');
  closeAuthModal();
}

async function requestPasswordReset() {
  const email = document.getElementById('auth-email').value.trim();
  const validationError = validateEmail(email);
  if (validationError) {
    setAuthModalMessage(validationError, 'error');
    return;
  }

  setAuthLoading(true);
  setAuthModalMessage('Enviando enlace...', 'info');
  try {
    await runWithLoading('Enviando enlace de recuperacion...', async () => {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    });
  } catch (error) {
    setAuthModalMessage(humanizeAuthError(error), 'error');
    return;
  } finally {
    setAuthLoading(false);
  }

  setAuthModalMessage('Te enviamos un enlace para restablecer tu clave.', 'success');
}

async function updateRecoveredPassword() {
  const password = document.getElementById('auth-password').value.trim();
  const confirmPassword = document.getElementById('auth-confirm-password').value.trim();
  const validationError = validateRecoveryInputs(password, confirmPassword);
  if (validationError) {
    setAuthModalMessage(validationError, 'error');
    return;
  }

  setAuthLoading(true);
  setAuthModalMessage('Actualizando clave...', 'info');
  try {
    await runWithLoading('Actualizando tu clave...', async () => {
      const { data, error } = await supabaseClient.auth.updateUser({ password });
      if (error) throw error;
      runtime.currentUser = data.user ?? runtime.currentUser;
      await refreshAfterAuth();
    });
  } catch (error) {
    setAuthModalMessage(humanizeAuthError(error), 'error');
    return;
  } finally {
    setAuthLoading(false);
  }

  updateAuthUI();
  closeAuthModal();
  setAuthMessage('Clave actualizada. Ya puedes seguir usando tu cuenta.', 'success');
}

async function signOutUser() {
  setAuthLoading(true);
  try {
    await runWithLoading('Cerrando sesion...', async () => {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
    });
  } catch (error) {
    setAuthMessage(humanizeAuthError(error), 'error');
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
    return;
  }
  if (runtime.authMode === 'forgot') {
    requestPasswordReset();
    return;
  }
  if (runtime.authMode === 'recovery') {
    updateRecoveredPassword();
    return;
  }
  signIn();
}

function bindAuthListener() {
  if (authState.listenerBound) return;
  authState.listenerBound = true;

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      runtime.currentUser = session?.user ?? runtime.currentUser;
      updateAuthUI();
      openAuthModal('recovery');
      setAuthModalMessage('Elige una nueva clave para completar la recuperacion.', 'info');
      return;
    }

    if (event === 'SIGNED_OUT') {
      runtime.currentUser = null;
      resetState();
      updateAuthUI();
      app.actions.updateAll?.();
    }
  });
}

export async function initAuth() {
  bindAuthListener();
  try {
    await runWithLoading('Cargando tu sesion...', async () => {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      runtime.currentUser = data.session?.user ?? null;
      updateAuthUI();
      if (runtime.currentUser) {
        await refreshAfterAuth();
      } else {
        app.actions.updateAll?.();
      }
    });
  } catch (error) {
    console.error(error);
    setAuthMessage('Error al comprobar sesion.', 'error');
  }
}

app.actions.initAuth = initAuth;

Object.assign(window, {
  closeAuthModal,
  handleAuthKeydown,
  openAuthModal,
  signOutUser,
  submitAuthAction,
  toggleAuthMode,
  togglePasswordVisibility,
});
