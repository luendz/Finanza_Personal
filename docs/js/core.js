const SUPABASE_URL = 'https://yrufxaubdztblkdfkpvw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jzmn10WLpF_UXfKojxuJpQ_j0Q5MXpk';

const existingApp = window.financeApp ?? {};

export const app = window.financeApp = existingApp;
export const supabaseClient = app.supabaseClient ?? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const MS = app.MS ?? [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
export const MSH = app.MSH ?? ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const CSTYLE = app.CSTYLE ?? {
  'Maria Elena': { bg: '#f3eaf8', tx: '#7a3fa0', bar: '#b07fd4' },
  Personal: { bg: '#eef5fd', tx: '#1d5899', bar: '#4a90d9' },
  Carro: { bg: '#fef4eb', tx: '#8a4a10', bar: '#f0923a' },
  Viejo: { bg: '#f1f2f4', tx: '#5a6275', bar: '#9aa0b0' },
  Vane: { bg: '#feeef5', tx: '#8a1f55', bar: '#e06090' },
};

export const runtime = app.runtime ?? {
  currentUser: null,
  curM: new Date().getMonth(),
  curY: new Date().getFullYear(),
  editId: null,
  editingNoteId: null,
  movingNoteId: null,
  editingPrestamoId: null,
  abonoPrestamoId: null,
  editingAbonoRef: null,
  editingExtraId: null,
  authMode: 'login',
};

export const uiState = app.uiState ?? {
  carrySelection: new Set(),
  noteBulkSelection: new Set(),
  loadingStack: [],
  toastTimer: null,
};

export const state = app.state ?? {
  categorias: [],
  ingresosExtra: [],
  anotaciones: [],
  prestamos: [],
  gastos: [],
  userSettings: { sueldo: null, sueldosMensuales: {} },
};

app.actions ??= {};
app.supabaseClient = supabaseClient;
app.MS = MS;
app.MSH = MSH;
app.CSTYLE = CSTYLE;
app.runtime = runtime;
app.uiState = uiState;
app.state = state;

export function resetState() {
  state.categorias = [];
  state.ingresosExtra = [];
  state.anotaciones = [];
  state.prestamos = [];
  state.gastos = [];
  state.userSettings = { sueldo: null, sueldosMensuales: {} };
}

export function cs(cat) {
  return CSTYLE[cat] || { bg: '#fef9ec', tx: '#7a5c10', bar: '#e8b84b' };
}

export function fmt(value) {
  return `S/ ${Math.abs(Number(value) || 0).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function syncYearInputs() {
  const mainInput = document.getElementById('year-input-main');
  const catsInput = document.getElementById('year-input-cats');
  if (mainInput) mainInput.value = runtime.curY;
  if (catsInput) catsInput.value = runtime.curY;
}

export function changeYear(delta) {
  runtime.curY = Math.min(2100, Math.max(2000, runtime.curY + delta));
  app.actions.updateAll?.();
}

export function applyYearInput(value) {
  runtime.curY = Math.min(2100, Math.max(2000, parseInt(value, 10) || runtime.curY));
  app.actions.updateAll?.();
}

export function setM(monthIndex) {
  runtime.curM = monthIndex;
  app.actions.updateAll?.();
}

export function rMonths(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = MSH.map((month, index) => (
    `<button class="month-btn ${index === runtime.curM ? 'active' : ''}" onclick="setM(${index})">${month}</button>`
  )).join('');
}

export function goTo(id, btn) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.add('hidden');
    page.classList.remove('block', 'animate-up', 'active');
  });
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
  const page = document.getElementById(`page-${id}`);
  if (!page) return;
  page.classList.remove('hidden');
  page.classList.add('block', 'animate-up', 'active');
  btn?.classList.add('active');
  app.actions.updateAll?.();
}

export function showOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.add('flex');
}

export function hideOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('flex');
  el.classList.add('hidden');
}

function syncLoadingOverlay() {
  const overlay = document.getElementById('loading-screen');
  const message = document.getElementById('loading-screen-message');
  const activeMessage = uiState.loadingStack[uiState.loadingStack.length - 1] || 'Procesando...';

  if (message) {
    message.textContent = activeMessage;
  }

  if (!overlay) return;

  if (uiState.loadingStack.length) {
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    document.body.classList.add('overflow-hidden');
    return;
  }

  overlay.classList.remove('flex');
  overlay.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}

export function showLoading(message = 'Procesando...') {
  uiState.loadingStack.push(message || 'Procesando...');
  syncLoadingOverlay();
}

export function hideLoading() {
  if (uiState.loadingStack.length) {
    uiState.loadingStack.pop();
  }
  syncLoadingOverlay();
}

export async function runWithLoading(message, task) {
  showLoading(message);
  try {
    return await task();
  } finally {
    hideLoading();
  }
}

export async function refreshAppData() {
  await app.actions.loadCloudData?.();
  app.actions.updateAll?.();
}

function closeOnBackdrop(event, closeFn) {
  if (event.target === event.currentTarget) closeFn?.();
}

export function maybeClose(event) {
  closeOnBackdrop(event, window.closeModal);
}

export function maybeCloseAuth(event) {
  closeOnBackdrop(event, window.closeAuthModal);
}

export function maybeCloseExtra(event) {
  closeOnBackdrop(event, window.closeExtraModal);
}

export function maybeCloseCarry(event) {
  closeOnBackdrop(event, window.closeCarryModal);
}

export function maybeCloseNote(event) {
  closeOnBackdrop(event, window.closeNoteModal);
}

export function maybeCloseNoteMove(event) {
  closeOnBackdrop(event, window.closeNoteMoveModal);
}

export function maybeCloseBulkMoveNotes(event) {
  closeOnBackdrop(event, window.closeBulkMoveNotesModal);
}

export function maybeClosePrestamo(event) {
  closeOnBackdrop(event, window.closePrestamoModal);
}

export function maybeCloseAbono(event) {
  closeOnBackdrop(event, window.closeAbonoModal);
}

export function maybeCloseSueldo(event) {
  closeOnBackdrop(event, window.closeSueldoModal);
}

export function fillMonthOptions(selectId) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const current = parseInt(el.value, 10);
  const selectedIndex = Number.isInteger(current) && current >= 0 && current < MS.length ? current : runtime.curM;
  el.innerHTML = MS.map((name, index) => (
    `<option value="${index}" ${index === selectedIndex ? 'selected' : ''}>${name}</option>`
  )).join('');
}

export function fillCategorySelectors() {
  const categoryOptions = state.categorias.map(category => `<option value="${category}">${category}</option>`).join('');
  const gastosFilter = document.getElementById('fcat');
  if (gastosFilter) {
    const selected = gastosFilter.value || '';
    gastosFilter.innerHTML = `<option value="">Todas las categorias</option>${categoryOptions}`;
    if (selected) gastosFilter.value = selected;
  }
  const notesFilter = document.getElementById('note-cat-filter');
  if (notesFilter) {
    const selected = notesFilter.value || '';
    notesFilter.innerHTML = `<option value="">Todas las categorias</option>${categoryOptions}`;
    if (selected) notesFilter.value = selected;
  }
  const gastoCat = document.getElementById('fcatModal');
  if (gastoCat) gastoCat.innerHTML = categoryOptions;
  const noteCat = document.getElementById('note-cat');
  if (noteCat) noteCat.innerHTML = categoryOptions;
}

export function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  if (uiState.toastTimer) clearTimeout(uiState.toastTimer);
  uiState.toastTimer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(60px)';
  }, 2500);
}

export function requireCurrentUser() {
  if (!runtime.currentUser) {
    alert('Primero inicia sesion.');
    return null;
  }
  return runtime.currentUser;
}

export function active() {
  return state.gastos.filter(gasto => {
    const gastoYear = typeof gasto.anio === 'number' ? gasto.anio : runtime.curY;
    if (gasto.tipo === 'cuotas') {
      return gasto.cuotaAct <= gasto.cuotas && (gastoYear < runtime.curY || (gastoYear === runtime.curY && gasto.mes <= runtime.curM));
    }
    return gastoYear === runtime.curY && gasto.mes === runtime.curM;
  });
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function paymentDateForView() {
  const today = new Date();
  const safeDay = Math.min(today.getDate(), daysInMonth(runtime.curY, runtime.curM));
  return `${runtime.curY}-${String(runtime.curM + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

export function isSameMonthYear(dateStr, monthIndex, year) {
  if (!dateStr) return false;
  const [yy, mm] = String(dateStr).split('-').map(Number);
  return yy === year && mm === monthIndex + 1;
}

export function formatLocalDate(dateStr) {
  if (!dateStr) return '';
  const [yy, mm, dd] = String(dateStr).split('-').map(Number);
  if (!yy || !mm || !dd) return dateStr;
  return new Date(yy, mm - 1, dd).toLocaleDateString('es-PE');
}

export function isCurrentViewMonth() {
  const today = new Date();
  return runtime.curY === today.getFullYear() && runtime.curM === today.getMonth();
}

export function gastoPaidInView(gasto) {
  if (!gasto?.pagado) return false;
  return !gasto.fechaPagado || isSameMonthYear(gasto.fechaPagado, runtime.curM, runtime.curY);
}

export function gastoPaymentStatus(gasto) {
  if (gastoPaidInView(gasto)) {
    return {
      key: 'pagado',
      label: 'Pagado',
      detail: gasto.fechaPagado ? `Pagado ${formatLocalDate(gasto.fechaPagado)}` : 'Marcado como pagado',
    };
  }
  if (isCurrentViewMonth() && Number(gasto.dia) < new Date().getDate()) {
    return {
      key: 'vencido',
      label: 'Vencido',
      detail: `Vencio el dia ${gasto.dia}`,
    };
  }
  return {
    key: 'pendiente',
    label: 'Pendiente',
    detail: `Pago esperado el dia ${gasto.dia}`,
  };
}

export function gastoCuotaLabel(gasto) {
  if (gasto.tipo !== 'cuotas') return '';
  const cuotaVisible = gastoPaidInView(gasto)
    ? Math.max((gasto.cuotaAct || 1) - 1, 1)
    : Math.min(gasto.cuotaAct || 1, gasto.cuotas || 1);
  return gastoPaidInView(gasto)
    ? `Cuota ${cuotaVisible} de ${gasto.cuotas} pagada`
    : `Cuota ${cuotaVisible} de ${gasto.cuotas}`;
}

export function prestamoSaldo(prestamo) {
  return Math.max((prestamo.montoTotal || 0) - (prestamo.montoPagado || 0), 0);
}

export function prestamoEstado(prestamo) {
  if (prestamoSaldo(prestamo) <= 0) return 'pagado';
  if ((prestamo.montoPagado || 0) > 0) return 'parcial';
  return 'pendiente';
}

export function updateAll() {
  syncYearInputs();
  app.actions.syncSueldoInput?.();
  rMonths('mbtns1');
  rMonths('mbtns-cats');
  fillCategorySelectors();
  app.actions.updateInicio?.();
  app.actions.renderGastos?.();
  app.actions.renderNotes?.();
  app.actions.renderPrestamos?.();
  app.actions.renderCompromisosResumen?.();
  app.actions.renderCats?.();
}

app.actions.updateAll = updateAll;
app.actions.refreshAppData = refreshAppData;

Object.assign(window, {
  applyYearInput,
  changeYear,
  goTo,
  maybeClose,
  maybeCloseAbono,
  maybeCloseAuth,
  maybeCloseBulkMoveNotes,
  maybeCloseCarry,
  maybeCloseExtra,
  maybeCloseNote,
  maybeCloseNoteMove,
  maybeClosePrestamo,
  maybeCloseSueldo,
  setM,
});
