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

function readAuthCallback(rawUrl = window.location.href) {
  const url = new URL(rawUrl);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const callbackType = hashParams.get('type') || url.searchParams.get('type');
  const errorDescription = hashParams.get('error_description')
    || url.searchParams.get('error_description')
    || '';
  const hasCallbackSignal = url.searchParams.has('code')
    || url.searchParams.has('token_hash')
    || url.searchParams.has('error')
    || hashParams.has('access_token')
    || hashParams.has('refresh_token')
    || hashParams.has('error');

  return {
    isRecovery: callbackType === 'recovery'
      || (url.searchParams.get('auth') === 'recovery' && hasCallbackSignal),
    errorDescription: errorDescription.replace(/\+/g, ' '),
  };
}

const initialAuthCallback = readAuthCallback(window.__INITIAL_AUTH_URL__ || window.location.href);

const authState = {
  loading: false,
  listenerBound: false,
  recoveryRequested: initialAuthCallback.isRecovery,
  recoveryHandled: false,
  recoveryError: initialAuthCallback.errorDescription,
};

function clearAuthCallbackUrl() {
  const url = new URL(window.location.href);
  ['auth', 'code', 'type', 'error', 'error_code', 'error_description'].forEach(key => {
    url.searchParams.delete(key);
  });
  url.hash = '';
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

function openRecoveryFromCallback(user) {
  if (authState.recoveryHandled) return;
  authState.recoveryHandled = true;

  if (user) {
    runtime.currentUser = user;
    updateAuthUI();
    openAuthModal('recovery');
    setAuthModalMessage('Enlace validado. Crea una nueva contraseña para completar la recuperación.', 'success');
    clearAuthCallbackUrl();
    return;
  }

  openAuthModal('forgot');
  setAuthModalMessage(
    authState.recoveryError || 'El enlace no es válido o ya expiró. Solicita uno nuevo.',
    'error',
  );
  clearAuthCallbackUrl();
}

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
    delete el.dataset.type;
    return;
  }

  el.textContent = message;
  el.dataset.type = type;
  el.classList.remove('hidden');
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

  const action = document.getElementById('auth-modal-action');
  if (action) {
    action.setAttribute('aria-busy', String(loading));
    action.classList.toggle('is-loading', loading);
  }
}

function humanizeAuthError(error) {
  const rawMessage = error?.message || 'No se pudo completar la operación.';
  const message = rawMessage.toLowerCase();

  if (message.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (message.includes('email not confirmed')) return 'Confirma tu correo antes de ingresar.';
  if (message.includes('user already registered')) return 'Ese correo ya tiene una cuenta.';
  if (message.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (message.includes('same password')) return 'La nueva contraseña debe ser distinta a la anterior.';
  if (message.includes('unable to validate email address')) return 'Ingresa un correo válido.';
  if (message.includes('rate limit') || message.includes('too many requests')) return 'Has realizado varios intentos. Espera unos minutos y vuelve a intentarlo.';
  if (message.includes('network') || message.includes('fetch')) return 'No pudimos conectar con el servicio. Revisa tu conexión e inténtalo nuevamente.';
  return rawMessage;
}

function resetPasswordVisibility() {
  ['auth-password', 'auth-confirm-password'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.type = 'password';
  });
  document.querySelectorAll('#overlay-auth [data-password-toggle]').forEach(button => {
    button.textContent = 'Ver';
  });
}

function getPasswordStrength(password) {
  if (!password) return 0;
  let score = password.length >= 6 ? 1 : 0;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

function updatePasswordStrength() {
  const strength = document.getElementById('auth-password-strength');
  const label = document.getElementById('auth-strength-label');
  const input = document.getElementById('auth-password');
  if (!strength || !label || !input) return;

  const score = getPasswordStrength(input.value);
  const labels = ['Escribe una contraseña', 'Débil', 'Aceptable', 'Buena', 'Segura'];
  strength.dataset.score = String(score);
  label.textContent = labels[score];
}

function validateEmail(email) {
  if (!email) return 'Ingresa tu correo.';
  if (!/^\S+@\S+\.\S+$/.test(email)) return 'Ingresa un correo válido.';
  return null;
}

function validateSignInInputs(email, password) {
  const emailError = validateEmail(email);
  if (emailError) return emailError;
  if (!password) return 'Ingresa tu contraseña.';
  return null;
}

function validateSignUpInputs(email, password, confirmPassword) {
  const emailError = validateEmail(email);
  if (emailError) return emailError;
  if (!password) return 'Ingresa tu contraseña.';
  if (!confirmPassword) return 'Confirma tu contraseña.';
  if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
  if (password !== confirmPassword) return 'Las contraseñas no coinciden.';
  return null;
}

function validateRecoveryInputs(password, confirmPassword) {
  if (!password) return 'Ingresa tu nueva contraseña.';
  if (!confirmPassword) return 'Confirma tu nueva contraseña.';
  if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
  if (password !== confirmPassword) return 'Las contraseñas no coinciden.';
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
  activeButton?.classList.add('active');
  activeButton?.setAttribute('aria-pressed', 'true');
  inactiveButton?.classList.remove('active');
  inactiveButton?.setAttribute('aria-pressed', 'false');
}

function toggleAuthMode(mode) {
  runtime.authMode = mode;

  const switcher = document.getElementById('auth-mode-switcher');
  const loginBtn = document.getElementById('auth-mode-login');
  const registerBtn = document.getElementById('auth-mode-register');
  const title = document.getElementById('auth-modal-title');
  const sub = document.getElementById('auth-modal-sub');
  const actionLabel = document.getElementById('auth-action-label');
  const emailField = document.getElementById('auth-email-field');
  const passwordField = document.getElementById('auth-password-field');
  const confirmField = document.getElementById('auth-confirm-field');
  const passwordLabel = document.getElementById('auth-password-label');
  const confirmLabel = document.getElementById('auth-confirm-label');
  const forgotLink = document.getElementById('auth-forgot-link');
  const backLink = document.getElementById('auth-back-link');
  const contextCopy = document.getElementById('auth-context-copy');
  const modeKicker = document.getElementById('auth-mode-kicker');
  const modeIcon = document.getElementById('auth-mode-icon-mobile');
  const passwordHelp = document.getElementById('auth-password-help');
  const passwordStrength = document.getElementById('auth-password-strength');
  const passwordInput = document.getElementById('auth-password');

  if (!loginBtn || !registerBtn || !title || !sub || !actionLabel || !emailField || !passwordField || !confirmField || !passwordLabel || !confirmLabel || !forgotLink || !backLink || !switcher) {
    return;
  }

  resetPasswordVisibility();
  switcher.classList.toggle('hidden', mode === 'forgot' || mode === 'recovery');
  forgotLink.classList.toggle('hidden', mode !== 'login');
  backLink.classList.toggle('hidden', mode !== 'forgot' && mode !== 'recovery');
  emailField.classList.toggle('hidden', mode === 'recovery');
  passwordField.classList.toggle('hidden', mode === 'forgot');
  confirmField.classList.toggle('hidden', mode !== 'register' && mode !== 'recovery');
  passwordHelp?.classList.toggle('hidden', mode !== 'register' && mode !== 'recovery');
  passwordStrength?.classList.toggle('hidden', mode !== 'register' && mode !== 'recovery');

  if (passwordInput) {
    passwordInput.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  }

  if (mode === 'register') {
    setModeButtonState(registerBtn, loginBtn);
    title.textContent = 'Crear cuenta';
    sub.textContent = 'Crea tu espacio personal y mantén tus finanzas sincronizadas.';
    actionLabel.textContent = 'Crear mi cuenta';
    passwordLabel.textContent = 'Contraseña';
    confirmLabel.textContent = 'Confirmar contraseña';
    if (contextCopy) contextCopy.textContent = 'Después del registro podrías recibir un correo para confirmar tu cuenta.';
    if (modeKicker) modeKicker.textContent = 'Tu espacio personal';
    if (modeIcon) modeIcon.textContent = '+';
    updatePasswordStrength();
    return;
  }

  if (mode === 'forgot') {
    title.textContent = 'Recuperar contraseña';
    sub.textContent = 'Te enviaremos un enlace seguro para crear una nueva contraseña.';
    actionLabel.textContent = 'Enviar enlace de recuperación';
    if (contextCopy) contextCopy.textContent = 'Ingresa el correo asociado a tu cuenta. El enlace tendrá una duración limitada.';
    if (modeKicker) modeKicker.textContent = 'Recuperación segura';
    if (modeIcon) modeIcon.textContent = '↗';
    return;
  }

  if (mode === 'recovery') {
    title.textContent = 'Crea una nueva contraseña';
    sub.textContent = `Protege nuevamente tu cuenta${runtime.currentUser?.email ? ` ${runtime.currentUser.email}` : ''}.`;
    actionLabel.textContent = 'Guardar nueva contraseña';
    passwordLabel.textContent = 'Nueva contraseña';
    confirmLabel.textContent = 'Confirmar nueva contraseña';
    if (contextCopy) contextCopy.textContent = 'Usa una contraseña que no hayas utilizado anteriormente.';
    if (modeKicker) modeKicker.textContent = 'Actualiza tu acceso';
    if (modeIcon) modeIcon.textContent = '✓';
    updatePasswordStrength();
    return;
  }

  setModeButtonState(loginBtn, registerBtn);
  title.textContent = 'Iniciar sesión';
  sub.textContent = 'Accede a tu cuenta para sincronizar tus datos.';
  actionLabel.textContent = 'Ingresar a mi cuenta';
  passwordLabel.textContent = 'Contraseña';
  confirmLabel.textContent = 'Confirmar contraseña';
  if (contextCopy) contextCopy.textContent = 'Usa el correo con el que registraste tu cuenta.';
  if (modeKicker) modeKicker.textContent = 'Acceso seguro';
  if (modeIcon) modeIcon.textContent = '→';
}

function openAuthModal(mode = 'login') {
  toggleAuthMode(mode);
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const confirmInput = document.getElementById('auth-confirm-password');
  if (emailInput) emailInput.value = mode === 'recovery' ? (runtime.currentUser?.email || '') : '';
  if (passwordInput) passwordInput.value = '';
  if (confirmInput) confirmInput.value = '';
  updatePasswordStrength();
  setAuthModalMessage('');
  setAuthMessage('');
  showOverlay('overlay-auth');
  requestAnimationFrame(() => {
    const target = mode === 'recovery' ? passwordInput : emailInput;
    target?.focus();
  });
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
    setAuthMessage('No se pudo cargar tu información.', 'error');
  }
}

async function signUp() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const confirmPassword = document.getElementById('auth-confirm-password').value;
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
  const password = document.getElementById('auth-password').value;
  const validationError = validateSignInInputs(email, password);
  if (validationError) {
    setAuthModalMessage(validationError, 'error');
    return;
  }

  setAuthLoading(true);
  setAuthModalMessage('Iniciando sesión...', 'info');
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
    await runWithLoading('Enviando enlace de recuperación...', async () => {
      const redirectUrl = new URL(window.location.href);
      redirectUrl.search = '';
      redirectUrl.hash = '';
      redirectUrl.searchParams.set('auth', 'recovery');
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl.toString(),
      });
      if (error) throw error;
    });
  } catch (error) {
    setAuthModalMessage(humanizeAuthError(error), 'error');
    return;
  } finally {
    setAuthLoading(false);
  }

  setAuthModalMessage('Enlace enviado. Revisa tu correo y sigue las instrucciones para crear una nueva contraseña.', 'success');
}

async function updateRecoveredPassword() {
  const password = document.getElementById('auth-password').value;
  const confirmPassword = document.getElementById('auth-confirm-password').value;
  const validationError = validateRecoveryInputs(password, confirmPassword);
  if (validationError) {
    setAuthModalMessage(validationError, 'error');
    return;
  }

  setAuthLoading(true);
  setAuthModalMessage('Actualizando contraseña...', 'info');
  try {
    await runWithLoading('Actualizando tu contraseña...', async () => {
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
    await runWithLoading('Cerrando sesión...', async () => {
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
  setAuthMessage('Sesión cerrada.', 'info');
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
    if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && authState.recoveryRequested)) {
      authState.recoveryRequested = true;
      openRecoveryFromCallback(session?.user ?? runtime.currentUser);
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
    await runWithLoading('Cargando tu sesión...', async () => {
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

    if (authState.recoveryRequested && !authState.recoveryHandled) {
      openRecoveryFromCallback(runtime.currentUser);
    }
  } catch (error) {
    console.error(error);
    if (authState.recoveryRequested && !authState.recoveryHandled) {
      authState.recoveryError = humanizeAuthError(error);
      openRecoveryFromCallback(null);
    } else {
      setAuthMessage('Error al comprobar la sesión.', 'error');
    }
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
  updatePasswordStrength,
});
