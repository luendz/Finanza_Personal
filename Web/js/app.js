// --- Configuración de Supabase ---
const SUPABASE_URL = 'https://yrufxaubdztblkdfkpvw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jzmn10WLpF_UXfKojxuJpQ_j0Q5MXpk';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

// --- Constantes y estado global ---
const MS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MSH = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
let curM = new Date().getMonth(), curY = new Date().getFullYear(), editId = null, editMode = 'gasto', editingNoteId = null, movingNoteId = null, editingPrestamoId = null, abonoPrestamoId = null, editingAbonoRef = null, nid = 50, editingExtraId = null;

const CSTYLE = {
  'Maria Elena':{ bg:'#f3eaf8', tx:'#7a3fa0', bar:'#b07fd4' },
  'Personal':   { bg:'#eef5fd', tx:'#1d5899', bar:'#4a90d9' },
  'Carro':      { bg:'#fef4eb', tx:'#8a4a10', bar:'#f0923a' },
  'Viejo':      { bg:'#f1f2f4', tx:'#5a6275', bar:'#9aa0b0' },
  'Vane':       { bg:'#feeef5', tx:'#8a1f55', bar:'#e06090' },
};
function cs(cat){ return CSTYLE[cat]||{bg:'#fef9ec',tx:'#7a5c10',bar:'#e8b84b'}; }

let state = {
  categorias: [],
  ingresosExtra: [],
  anotaciones: [],
  prestamos: [],
  gastos: []
};

// --- Inicialización y autenticación ---
const authState = { loading: false };
let authMode = 'login';

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
    if (!el) return;
    el.disabled = loading;
  });
}

function updateAuthUI() {
  const register = document.getElementById('auth-register');
  const login = document.getElementById('auth-login');
  const logout = document.getElementById('auth-logout');
  if (currentUser) {
    register.classList.add('hidden');
    login.classList.add('hidden');
    logout.classList.remove('hidden');
    setAuthMessage(`Conectado: ${currentUser.email || currentUser.id}`, 'success');
  } else {
    register.classList.remove('hidden');
    login.classList.remove('hidden');
    logout.classList.add('hidden');
    setAuthMessage('');
  }
}

async function initAuth() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) { console.error(error); setAuthMessage('Error al comprobar sesión', 'error'); return; }
  currentUser = data.session?.user ?? null;
  updateAuthUI();
  if (currentUser) {
    await loadCloudData();
    updateAll();
  }
}

function validateSignUpInputs(email, password, confirmPassword) {
  if (!email) return 'Ingresa tu correo.';
  if (!password) return 'Ingresa tu clave.';
  if (!confirmPassword) return 'Confirma tu clave.';
  if (!/^\S+@\S+\.\S+$/.test(email)) return 'Ingresa un correo válido.';
  if (password.length < 6) return 'La clave debe tener al menos 6 caracteres.';
  if (password !== confirmPassword) return 'Las claves no coinciden.';
  return null;
}

function validateSignInInputs(email, password) {
  if (!email) return 'Ingresa tu correo.';
  if (!password) return 'Ingresa tu clave.';
  if (!/^\S+@\S+\.\S+$/.test(email)) return 'Ingresa un correo válido.';
  return null;
}

async function signUp() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  const confirmPassword = document.getElementById('auth-confirm-password').value.trim();
  const errorMessage = validateSignUpInputs(email, password, confirmPassword);
  if (errorMessage) { setAuthModalMessage(errorMessage, 'error'); return; }
  setAuthLoading(true);
  setAuthModalMessage('Registrando...', 'info');
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  setAuthLoading(false);
  if (error) { setAuthModalMessage(error.message, 'error'); return; }
  setAuthModalMessage('Cuenta creada. Revisa tu correo para confirmar.', 'success');
  if (data.user) {
    currentUser = data.user;
    updateAuthUI();
    await loadCloudData();
    updateAll();
    closeAuthModal();
    setAuthMessage(`Bienvenido ${currentUser.email}`, 'success');
  }
}

async function signIn() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  const errorMessage = validateSignInInputs(email, password);
  if (errorMessage) { setAuthModalMessage(errorMessage, 'error'); return; }
  setAuthLoading(true);
  setAuthModalMessage('Iniciando sesión...', 'info');
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  setAuthLoading(false);
  if (error) { setAuthModalMessage(error.message, 'error'); return; }
  currentUser = data.user;
  updateAuthUI();
  await loadCloudData();
  updateAll();
  setAuthMessage(`Bienvenido ${currentUser.email}`, 'success');
  closeAuthModal();
}

async function signOutUser() {
  setAuthLoading(true);
  const { error } = await supabaseClient.auth.signOut();
  setAuthLoading(false);
  if (error) { setAuthMessage(error.message, 'error'); return; }
  currentUser = null;
  state = { categorias:[], ingresosExtra:[], anotaciones:[], prestamos:[], gastos:[] };
  updateAuthUI();
  updateAll();
  closeAuthModal();
  setAuthMessage('Sesión cerrada.', 'info');
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

function openAuthModal(mode = 'login') {
  authMode = mode;
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

function maybeCloseAuth(event) {
  if (event.target === event.currentTarget) closeAuthModal();
}

function toggleAuthMode(mode) {
  authMode = mode;
  const loginBtn = document.getElementById('auth-mode-login');
  const registerBtn = document.getElementById('auth-mode-register');
  const title = document.getElementById('auth-modal-title');
  const sub = document.getElementById('auth-modal-sub');
  const action = document.getElementById('auth-modal-action');
  if (!loginBtn || !registerBtn || !title || !sub || !action) return;
  const confirmField = document.getElementById('auth-confirm-field');
  if (mode === 'register') {
    loginBtn.classList.remove('bg-accent', 'text-white');
    loginBtn.classList.add('bg-white', 'text-text2', 'border-borderc');
    registerBtn.classList.remove('bg-white', 'text-text2');
    registerBtn.classList.add('bg-accent', 'text-white');
    title.textContent = 'Crear cuenta';
    sub.textContent = 'Regístrate para sincronizar y proteger tus finanzas.';
    action.textContent = 'Registrarme';
    if (confirmField) confirmField.classList.remove('hidden');
  } else {
    loginBtn.classList.add('bg-accent', 'text-white');
    loginBtn.classList.remove('bg-white', 'text-text2');
    registerBtn.classList.remove('bg-accent', 'text-white');
    registerBtn.classList.add('bg-white', 'text-text2', 'border-borderc');
    title.textContent = 'Iniciar sesión';
    sub.textContent = 'Accede a tu cuenta para sincronizar datos.';
    action.textContent = 'Ingresar';
    if (confirmField) confirmField.classList.add('hidden');
  }
}

function submitAuthAction() {
  if (authMode === 'register') {
    signUp();
  } else {
    signIn();
  }
}

// --- Carga de datos desde Supabase ---
async function loadCloudData() {
  if (!currentUser) {
    state = { categorias:[], ingresosExtra:[], anotaciones:[], prestamos:[], gastos:[] };
    return;
  }

  const [
    categoriasRes,
    gastosRes,
    ingresosRes,
    anotacionesRes,
    prestamosRes,
    abonosRes
  ] = await Promise.all([
    supabaseClient.from('categorias').select('*').eq('user_id', currentUser.id).order('nombre'),
    supabaseClient.from('gastos').select('*').eq('user_id', currentUser.id).order('id'),
    supabaseClient.from('ingresos_extra').select('*').eq('user_id', currentUser.id).order('id'),
    supabaseClient.from('anotaciones').select('*').eq('user_id', currentUser.id).order('id'),
    supabaseClient.from('prestamos').select('*').eq('user_id', currentUser.id).order('id'),
    supabaseClient.from('abonos_prestamos').select('*').eq('user_id', currentUser.id).order('id')
  ]);

  if (categoriasRes.error) throw categoriasRes.error;
  if (gastosRes.error) throw gastosRes.error;
  if (ingresosRes.error) throw ingresosRes.error;
  if (anotacionesRes.error) throw anotacionesRes.error;
  if (prestamosRes.error) throw prestamosRes.error;
  if (abonosRes.error) throw abonosRes.error;

  state.categorias = (categoriasRes.data || []).map(x => String(x.nombre || '').trim());

  state.gastos = (gastosRes.data || []).map(g => ({
    id: Number(g.id),
    desc: String(g.descripcion || '').trim(),
    cat: String(g.categoria || '').trim(),
    dia: Number(g.dia_pago || 1),
    tipo: String(g.tipo || 'unico').trim(),
    monto: Number(g.monto || 0),
    mes: Number(g.mes),
    anio: Number(g.anio),
    origenMes: g.origen_mes ?? g.mes,
    origenAnio: g.origen_anio ?? g.anio,
    cuotaAct: Number(g.cuota_actual || 1),
    cuotas: Number(g.total_cuotas || 0)
  }));

  state.ingresosExtra = (ingresosRes.data || []).map(x => ({
    id: Number(x.id),
    desc: String(x.descripcion || '').trim(),
    monto: Number(x.monto || 0),
    mes: Number(x.mes),
    anio: Number(x.anio)
  }));

  state.anotaciones = (anotacionesRes.data || []).map(n => ({
    id: Number(n.id),
    desc: String(n.descripcion || '').trim(),
    cat: String(n.categoria || '').trim(),
    dia: Number(n.dia_pago || 1),
    tipo: String(n.tipo || 'unico').trim(),
    monto: Number(n.monto || 0),
    creadoMes: Number(n.creado_mes),
    creadoAnio: Number(n.creado_anio),
    cuotaAct: Number(n.cuota_actual || 1),
    cuotas: Number(n.total_cuotas || 0)
  }));

  const prestamosData = prestamosRes.data || [];
  const abonosData = abonosRes.data || [];
  state.prestamos = prestamosData.map(p => {
    const historial = abonosData
      .filter(a => a.prestamo_id === p.id)
      .map(a => ({
        id: Number(a.id),
        fecha: a.fecha || new Date().toISOString(),
        mes: Number(a.mes),
        monto: Number(a.monto),
        impacto: a.impacto || 'ninguno',
        nota: a.nota || '',
        linkedType: a.linked_type,
        linkedId: a.linked_id ? Number(a.linked_id) : null
      }))
      .sort((a,b) => new Date(a.fecha) - new Date(b.fecha));
    return {
      id: Number(p.id),
      tipo: p.tipo,
      persona: p.persona,
      desc: p.descripcion,
      montoTotal: Number(p.monto_total),
      montoPagado: Number(p.monto_pagado),
      fecha: p.fecha,
      vencimiento: p.vencimiento,
      notas: p.notas,
      historial
    };
  });

  nid = Math.max(...state.gastos.map(g => g.id), 49) + 1;
}

// --- Utilidades de formato y UI ---
function fmt(n){ return 'S/ '+Math.abs(n).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function monthYearLabel(){ return `${MS[curM]} ${curY}`; }

function syncYearInputs(){
  document.getElementById('year-input-main').value = curY;
  document.getElementById('year-input-cats').value = curY;
}

function changeYear(delta){ curY = Math.min(2100, Math.max(2000, curY + delta)); updateAll(); }
function applyYearInput(val){ curY = Math.min(2100, Math.max(2000, parseInt(val)||curY)); updateAll(); }
function setM(m){ curM = m; updateAll(); }

function rMonths(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.innerHTML = MSH.map((m,i)=>`<button class="month-btn ${i===curM?'active':''}" onclick="setM(${i})">${m}</button>`).join('');
}

function goTo(id, btn){
  document.querySelectorAll('.page').forEach(p => { p.classList.add('hidden'); p.classList.remove('block','animate-up','active'); });
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  const page = document.getElementById('page-'+id);
  page.classList.remove('hidden');
  page.classList.add('block','animate-up','active');
  btn.classList.add('active');
  updateAll();
}

// --- Funciones de cálculo para el dashboard ---
function active(){
  return state.gastos.filter(g => {
    const gy = typeof g.anio === 'number' ? g.anio : curY;
    if(g.tipo === 'cuotas'){
      return g.cuotaAct <= g.cuotas && (gy < curY || (gy === curY && g.mes <= curM));
    }
    return gy === curY && g.mes === curM;
  });
}
function total(){ return active().reduce((s,g)=>s+g.monto,0); }
function extrasDelMes(){ return (state.ingresosExtra||[]).filter(x => Number(x.mes)===curM && Number(x.anio||curY)===curY); }
function totalExtras(){ return extrasDelMes().reduce((s,x)=>s+Number(x.monto||0),0); }
function totalIngresos(){ return (parseFloat(document.getElementById('sueldo').value)||0) + totalExtras(); }

// --- Renderizado principal ---

function updateInicio(){
  const sueldoBase = parseFloat(document.getElementById('sueldo').value)||0;
  localStorage.setItem('mf3_sueldo', sueldoBase);
  const extras = totalExtras();
  const ingresos = totalIngresos();
  const gastos = total();
  const resta = ingresos - gastos;
  const pct = ingresos>0 ? (gastos/ingresos)*100 : 0;

  document.getElementById('inicio-sub').textContent = `Tu resumen de ${MS[curM]} ${curY}`;
  document.getElementById('cextra').textContent = fmt(extras);
  document.getElementById('cextrasub').textContent = `${extrasDelMes().length} ingreso(s) extra este mes`;
  document.getElementById('cing').textContent = fmt(ingresos);
  document.getElementById('cg').textContent = fmt(gastos);
  document.getElementById('cgsub').textContent = `${active().length} gastos activos`;
  document.getElementById('cr').textContent = fmt(Math.abs(resta));

  const rcard = document.getElementById('rcard');
  const crv = document.getElementById('cr');
  if(resta>=0){
    crv.className = 'font-heading text-[34px] font-bold leading-none text-bluetx';
    document.getElementById('ricon-wrap').textContent = 'Disponible';
    document.getElementById('crsub').textContent = 'disponible';
    rcard.className = 'rounded-[22px] border border-[#d8e4fb] bg-gradient-to-br from-bluebg via-white to-white px-6 py-5 shadow-soft ring-1 ring-[#dde8fb]';
  } else {
    crv.className = 'font-heading text-[34px] font-bold leading-none text-red1';
    document.getElementById('ricon-wrap').textContent = 'Alerta';
    document.getElementById('crsub').textContent = 'te pasaste';
    rcard.className = 'rounded-[22px] border border-[#f4d6d6] bg-gradient-to-br from-redbg via-white to-white px-6 py-5 shadow-soft ring-1 ring-[#f8e1e1]';
  }

  const pf = document.getElementById('pfill');
  pf.style.width = Math.min(pct,100).toFixed(1)+'%';
  pf.className = 'h-full rounded-full transition-all duration-500 ' + (pct>=100?'bg-red1':pct>=80?'bg-[#e8b84b]':'bg-green1');

  document.getElementById('ppct').textContent = pct.toFixed(0)+'%';
  document.getElementById('pleft').textContent = fmt(gastos)+' gastado';
  document.getElementById('pright').textContent = resta>=0 ? fmt(resta)+' disponible' : '⚠️ Te pasaste '+fmt(Math.abs(resta));

  const bycat = {};
  active().forEach(g => { bycat[g.cat] = (bycat[g.cat]||0) + g.monto; });
  const sorted = Object.entries(bycat).sort((a,b)=>b[1]-a[1]);
  drawDonut(sorted, gastos, ingresos);
}

let carrySelection = new Set();
let noteBulkSelection = new Set();
let toastTimer = null;

function showOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.add('flex');
}

function hideOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('flex');
  el.classList.add('hidden');
}

function maybeClose(event) { if (event.target === event.currentTarget) closeModal(); }
function maybeCloseExtra(event) { if (event.target === event.currentTarget) closeExtraModal(); }
function maybeCloseCarry(event) { if (event.target === event.currentTarget) closeCarryModal(); }
function maybeCloseNote(event) { if (event.target === event.currentTarget) closeNoteModal(); }
function maybeCloseNoteMove(event) { if (event.target === event.currentTarget) closeNoteMoveModal(); }
function maybeCloseBulkMoveNotes(event) { if (event.target === event.currentTarget) closeBulkMoveNotesModal(); }
function maybeClosePrestamo(event) { if (event.target === event.currentTarget) closePrestamoModal(); }
function maybeCloseAbono(event) { if (event.target === event.currentTarget) closeAbonoModal(); }

function fillMonthOptions(selectId) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const current = parseInt(el.value, 10);
  const selectedIndex = Number.isInteger(current) && current >= 0 && current < MS.length ? current : curM;
  el.innerHTML = MS.map((name, index) => `<option value="${index}" ${index===selectedIndex?'selected':''}>${name}</option>`).join('');
}

function fillCategorySelectors() {
  const categoryOptions = state.categorias.map(c => `<option value="${c}">${c}</option>`).join('');
  const fcat = document.getElementById('fcat');
  if (fcat) {
    const selected = fcat.value || '';
    fcat.innerHTML = `<option value="">Todas las categorías</option>${categoryOptions}`;
    if (selected) fcat.value = selected;
  }
  const noteFilter = document.getElementById('note-cat-filter');
  if (noteFilter) {
    const selected = noteFilter.value || '';
    noteFilter.innerHTML = `<option value="">Todas las categorías</option>${categoryOptions}`;
    if (selected) noteFilter.value = selected;
  }
  const fcatModal = document.getElementById('fcatModal');
  if (fcatModal) fcatModal.innerHTML = categoryOptions;
  const noteCat = document.getElementById('note-cat');
  if (noteCat) noteCat.innerHTML = categoryOptions;
}

function renderExtraList() {
  const list = document.getElementById('extra-list');
  if (!list) return;
  const extras = state.ingresosExtra.filter(x => Number(x.mes)===curM && Number(x.anio)===curY);
  if (!extras.length) {
    list.innerHTML = '<div class="text-xs text-text2">No hay ingresos adicionales para este mes.</div>';
    return;
  }
  list.innerHTML = extras.map(x => `
    <div class="mb-2 rounded-smapp border border-borderc bg-white p-3 text-[13px] text-text1">
      <div class="flex items-center justify-between gap-2">
        <span>${x.desc}</span>
        <div class="flex items-center gap-2">
          <span class="font-bold">${fmt(x.monto)}</span>
          <button class="rounded-md border-0 bg-transparent px-1.5 py-0.5 text-[16px] leading-none text-text3 transition hover:bg-bluebg hover:text-accent" onclick="editExtra(${x.id})">✎</button>
          <button class="rounded-md border-0 bg-transparent px-1.5 py-0.5 text-[20px] leading-none text-text3 transition hover:bg-redbg hover:text-red1" onclick="delExtra(${x.id})">×</button>
        </div>
      </div>
      <div class="mt-1 text-[11px] text-text3">${MS[x.mes]} ${x.anio}</div>
    </div>
  `).join('');
}

function updateAll() {
  syncYearInputs();
  rMonths('mbtns1');
  rMonths('mbtns-cats');
  fillCategorySelectors();
  updateInicio();
  renderGastos();
  renderNotes();
  renderPrestamos();
  renderCompromisosResumen();
  renderCuotas();
  renderCats();
}

function openModal() {
  editMode = 'gasto';
  editId = null;
  document.getElementById('mh').textContent = 'Agregar gasto';
  document.getElementById('fdesc').value = '';
  document.getElementById('fmonto').value = '';
  document.getElementById('fcatModal').value = state.categorias[0] || '';
  document.getElementById('fdia').value = 15;
  document.getElementById('ftipo').value = 'unico';
  document.getElementById('fcuotas').value = '';
  document.getElementById('fcuotaact').value = 1;
  toggleQ();
  showOverlay('overlay');
}

function closeModal() {
  hideOverlay('overlay');
  editId = null;
}

function resetExtraForm() {
  document.getElementById('extra-desc').value = '';
  document.getElementById('extra-monto').value = '';
  fillMonthOptions('extra-mes');
  document.getElementById('extra-mh').textContent = 'Agregar ingreso adicional';
  document.getElementById('extra-save-btn').textContent = 'Guardar ✓';
  editingExtraId = null;
}

function openExtraModal() {
  resetExtraForm();
  renderExtraList();
  showOverlay('overlay-extra');
}

function closeExtraModal() {
  hideOverlay('overlay-extra');
  resetExtraForm();
}

function openCarryModal() {
  carrySelection = new Set();
  document.getElementById('carry-summary').textContent = '';
  refreshCarryList();
  showOverlay('overlay-carry');
}

function closeCarryModal() {
  hideOverlay('overlay-carry');
}

function refreshCarryList() {
  const carryContainer = document.getElementById('carry-list');
  if (!carryContainer) return;
  const items = active();
  if (!items.length) {
    carryContainer.innerHTML = '<div class="p-4 text-sm text-text2">No hay gastos activos para copiar.</div>';
    document.getElementById('carry-summary').textContent = '';
    return;
  }
  carryContainer.innerHTML = items.map(g => {
    const activeClass = carrySelection.has(g.id) ? 'bg-accent/10 border-accent' : 'bg-white border-borderc';
    return `<label class="group mb-2 flex cursor-pointer items-center justify-between rounded-lg border px-3 py-3 transition ${activeClass}"><span><strong>${g.desc}</strong> · ${g.cat}<br><span class="text-[12px] text-text3">${MS[g.mes]} ${g.anio} · ${g.tipo}</span></span><input type="checkbox" ${carrySelection.has(g.id) ? 'checked' : ''} onchange="toggleCarryItem(${g.id})"></label>`;
  }).join('');
  updateCarrySummary();
}

function toggleCarryItem(id) {
  if (carrySelection.has(id)) carrySelection.delete(id);
  else carrySelection.add(id);
  refreshCarryList();
}

function updateCarrySummary() {
  const selected = Array.from(carrySelection).map(id => state.gastos.find(g => g.id === id)).filter(Boolean);
  const total = selected.reduce((sum, g) => sum + g.monto, 0);
  const months = selected.length ? selected.map(g => `${MS[g.mes]} ${g.anio}`) : [];
  document.getElementById('carry-summary').textContent = selected.length ? `${selected.length} gasto(s) seleccionados · Total ${fmt(total)}` : 'Selecciona gastos para copiar al siguiente mes.';
}

function markCarryByMode(mode) {
  carrySelection = new Set();
  active().forEach(g => {
    if (mode === 'all') carrySelection.add(g.id);
    if (mode === 'recurrente' && g.tipo === 'recurrente') carrySelection.add(g.id);
    if (mode === 'cuotas' && g.tipo === 'cuotas') carrySelection.add(g.id);
  });
  refreshCarryList();
}

function clearCarrySelection() {
  carrySelection = new Set();
  refreshCarryList();
}

async function carrySelectedExpenses() {
  if (!currentUser) { alert('Primero inicia sesión.'); return; }
  const selected = Array.from(carrySelection).map(id => state.gastos.find(g => g.id === id)).filter(Boolean);
  if (!selected.length) { alert('Selecciona al menos un gasto.'); return; }
  const nextM = curM === 11 ? 0 : curM + 1;
  const nextY = curM === 11 ? curY + 1 : curY;
  const payloads = selected.map(g => ({
    user_id: currentUser.id,
    descripcion: g.desc,
    categoria: g.cat,
    dia_pago: g.dia,
    tipo: g.tipo,
    monto: g.monto,
    mes: nextM,
    anio: nextY,
    origen_mes: g.mes,
    origen_anio: g.anio,
    cuota_actual: g.cuotaAct,
    total_cuotas: g.cuotas
  }));
  const { error } = await supabaseClient.from('gastos').insert(payloads);
  if (error) { alert(error.message); return; }
  await loadCloudData();
  updateAll();
  closeCarryModal();
  toast('Gastos copiados al siguiente mes');
}

function toggleQ() {
  const tipo = document.getElementById('ftipo').value;
  document.getElementById('qfields').classList.toggle('hidden', tipo !== 'cuotas');
}

function openNoteModal() {
  editingNoteId = null;
  document.getElementById('note-mh').textContent = 'Agregar anotación';
  document.getElementById('note-desc').value = '';
  document.getElementById('note-monto').value = '';
  document.getElementById('note-cat').value = state.categorias[0] || '';
  document.getElementById('note-dia').value = 15;
  document.getElementById('note-tipo').value = 'unico';
  document.getElementById('note-cuotas').value = '';
  document.getElementById('note-cuotaact').value = 1;
  toggleNoteQ();
  showOverlay('overlay-note');
}

function closeNoteModal() {
  hideOverlay('overlay-note');
  editingNoteId = null;
}

function toggleNoteQ() {
  const tipo = document.getElementById('note-tipo').value;
  document.getElementById('note-qfields').classList.toggle('hidden', tipo !== 'cuotas');
}

function openNoteMoveModal(id) {
  movingNoteId = id;
  const note = state.anotaciones.find(n => n.id === id);
  if (!note) return;
  document.getElementById('note-move-title').textContent = `Enviar "${note.desc}" a un mes`;
  fillMonthOptions('note-move-month');
  document.getElementById('note-move-action').value = 'move';
  showOverlay('overlay-note-move');
}

function closeNoteMoveModal() {
  hideOverlay('overlay-note-move');
  movingNoteId = null;
}

function openBulkMoveNotesModal() {
  noteBulkSelection = new Set();
  fillMonthOptions('bulk-note-month');
  document.getElementById('bulk-note-action').value = 'move';
  renderBulkNoteList();
  showOverlay('overlay-note-bulk');
}

function closeBulkMoveNotesModal() {
  hideOverlay('overlay-note-bulk');
  noteBulkSelection = new Set();
}

function renderBulkNoteList() {
  const list = document.getElementById('bulk-notes-list');
  if (!list) return;
  if (!state.anotaciones.length) {
    list.innerHTML = '<div class="p-4 text-sm text-text2">No hay anotaciones para mover.</div>';
    return;
  }
  list.innerHTML = state.anotaciones.map(note => {
    const checked = noteBulkSelection.has(note.id) ? 'checked' : '';
    return `<label class="mb-2 flex cursor-pointer items-center gap-2 rounded-smapp border border-borderc bg-white px-3 py-2"><input type="checkbox" ${checked} onchange="toggleBulkNote(${note.id})"><span class="text-[13px] text-text1">${note.desc} · ${fmt(note.monto)} · ${MS[note.creadoMes]} ${note.creadoAnio}</span></label>`;
  }).join('');
}

function toggleBulkNote(id) {
  if (noteBulkSelection.has(id)) noteBulkSelection.delete(id);
  else noteBulkSelection.add(id);
  renderBulkNoteList();
}

function markAllNotesBulk(all) {
  noteBulkSelection = new Set();
  if (all) state.anotaciones.forEach(note => noteBulkSelection.add(note.id));
  renderBulkNoteList();
}

async function confirmBulkMoveNotes() {
  if (!currentUser) { alert('Primero inicia sesión.'); return; }
  const selected = Array.from(noteBulkSelection).map(id => state.anotaciones.find(n => n.id === id)).filter(Boolean);
  if (!selected.length) { alert('Selecciona anotaciones.'); return; }
  const targetMonth = parseInt(document.getElementById('bulk-note-month').value, 10);
  const action = document.getElementById('bulk-note-action').value;
  const targetYear = curY;
  const inserts = selected.map(note => ({
    user_id: currentUser.id,
    descripcion: note.desc,
    categoria: note.cat,
    dia_pago: note.dia,
    tipo: note.tipo,
    monto: note.monto,
    mes: targetMonth,
    anio: targetYear,
    origen_mes: note.creadoMes,
    origen_anio: note.creadoAnio,
    cuota_actual: note.cuotaAct,
    total_cuotas: note.cuotas
  }));
  const { error: insertError } = await supabaseClient.from('gastos').insert(inserts);
  if (insertError) { alert(insertError.message); return; }
  if (action === 'move') {
    const ids = selected.map(note => note.id);
    const { error: deleteError } = await supabaseClient.from('anotaciones').delete().in('id', ids);
    if (deleteError) { alert(deleteError.message); return; }
  }
  await loadCloudData();
  updateAll();
  closeBulkMoveNotesModal();
  toast('Anotaciones procesadas');
}

async function confirmMoveNote() {
  if (!currentUser || movingNoteId === null) return;
  const note = state.anotaciones.find(n => n.id === movingNoteId);
  if (!note) return;
  const targetMonth = parseInt(document.getElementById('note-move-month').value, 10);
  const action = document.getElementById('note-move-action').value;
  const payload = {
    user_id: currentUser.id,
    descripcion: note.desc,
    categoria: note.cat,
    dia_pago: note.dia,
    tipo: note.tipo,
    monto: note.monto,
    mes: targetMonth,
    anio: curY,
    origen_mes: note.creadoMes,
    origen_anio: note.creadoAnio,
    cuota_actual: note.cuotaAct,
    total_cuotas: note.cuotas
  };
  const { error: insertError } = await supabaseClient.from('gastos').insert(payload);
  if (insertError) { alert(insertError.message); return; }
  if (action === 'move') {
    const { error: deleteError } = await supabaseClient.from('anotaciones').delete().eq('id', movingNoteId);
    if (deleteError) { alert(deleteError.message); return; }
  }
  await loadCloudData();
  updateAll();
  closeNoteMoveModal();
  toast('Anotación enviada');
}

function openPrestamoModal() {
  editingPrestamoId = null;
  document.getElementById('prestamo-mh').textContent = 'Agregar préstamo';
  document.getElementById('prestamo-tipo').value = 'por_cobrar';
  document.getElementById('prestamo-persona').value = '';
  document.getElementById('prestamo-desc').value = '';
  document.getElementById('prestamo-monto').value = '';
  document.getElementById('prestamo-abonado').value = '0';
  document.getElementById('prestamo-fecha').value = '';
  document.getElementById('prestamo-vencimiento').value = '';
  document.getElementById('prestamo-notas').value = '';
  showOverlay('overlay-prestamo');
}

function closePrestamoModal() {
  hideOverlay('overlay-prestamo');
  editingPrestamoId = null;
}

function openAbonoModal(id) {
  abonoPrestamoId = id;
  editingAbonoRef = null;
  const p = state.prestamos.find(x => x.id === id);
  if (!p) return;
  document.getElementById('abono-title').textContent = `Registrar abono - ${p.persona}`;
  document.getElementById('abono-monto').value = '';
  document.getElementById('abono-month').value = curM;
  fillMonthOptions('abono-month');
  document.getElementById('abono-impacto').value = 'ninguno';
  document.getElementById('abono-nota').value = '';
  showOverlay('overlay-abono');
}

function closeAbonoModal() {
  hideOverlay('overlay-abono');
  abonoPrestamoId = null;
  editingAbonoRef = null;
}

function renderGastos() {
  fillCategorySelectors();
  const filter = document.getElementById('fcat')?.value || '';
  const list = document.getElementById('glist');
  const footerTotal = document.getElementById('gastos-total-footer');
  if (!list) return;
  const items = active().filter(g => !filter || g.cat === filter);
  const itemsTotal = items.reduce((sum, g) => sum + g.monto, 0);
  if (footerTotal) {
    footerTotal.textContent = fmt(itemsTotal);
  }
  if (!items.length) {
    list.innerHTML = '<div class="p-4 text-sm text-text2">No hay gastos para este mes.</div>';
    return;
  }
  list.innerHTML = items.map(g => `
    <div class="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 border-b border-appbg2 px-5 py-3 transition hover:bg-appbg">
      <div class="min-w-0 flex items-center gap-2">
        <div class="truncate text-[14px] font-semibold text-text1">${g.desc}<span class="ml-1.5 rounded-full bg-appbg px-2 py-0.5 text-[10px] font-bold text-text2">${g.tipo}</span></div>
        <span class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none" style="background:${cs(g.cat).bg};color:${cs(g.cat).tx}"><span class="h-1.5 w-1.5 rounded-full" style="background:${cs(g.cat).bar}"></span>${g.cat}</span>
      </div>
      <div class="whitespace-nowrap text-[12px] text-text3">día ${g.dia}</div>
      <div class="whitespace-nowrap font-heading text-[15px] font-bold text-red1">${fmt(g.monto)}</div>
      <button class="rounded-md border-0 bg-transparent px-1.5 py-0.5 text-[16px] leading-none text-text3 transition hover:bg-bluebg hover:text-accent" onclick="editG(${g.id})">✎</button>
      <button class="rounded-md border-0 bg-transparent px-1.5 py-0.5 text-[20px] leading-none text-text3 transition hover:bg-redbg hover:text-red1" onclick="delG(${g.id})">×</button>
    </div>
  `).join('');
}

async function saveG() {
  if (!currentUser) { alert('Primero inicia sesión.'); return; }
  const desc = document.getElementById('fdesc').value.trim();
  const monto = parseFloat(document.getElementById('fmonto').value);
  const cat = document.getElementById('fcatModal').value;
  const dia = parseInt(document.getElementById('fdia').value, 10) || 15;
  const tipo = document.getElementById('ftipo').value;
  const cuotas = tipo === 'cuotas' ? (parseInt(document.getElementById('fcuotas').value, 10) || 0) : 0;
  const cuotaAct = tipo === 'cuotas' ? (parseInt(document.getElementById('fcuotaact').value, 10) || 1) : 1;
  if (!desc || !monto || monto <= 0) { alert('Datos inválidos'); return; }
  if (tipo === 'cuotas' && cuotas < 1) { alert('Ingresa total de cuotas'); return; }
  const existing = editId !== null ? state.gastos.find(g => g.id === editId) : null;
  const payload = {
    user_id: currentUser.id,
    descripcion: desc,
    categoria: cat,
    dia_pago: dia,
    tipo,
    monto,
    mes: curM,
    anio: curY,
    origen_mes: existing ? existing.origenMes : curM,
    origen_anio: existing ? existing.origenAnio : curY,
    cuota_actual: cuotaAct,
    total_cuotas: cuotas
  };
  let error;
  if (editId !== null) {
    ({ error } = await supabaseClient.from('gastos').update(payload).eq('id', editId));
  } else {
    ({ error } = await supabaseClient.from('gastos').insert(payload));
  }
  if (error) { alert(error.message); return; }
  await loadCloudData();
  updateAll();
  closeModal();
  toast(editId !== null ? 'Gasto actualizado' : 'Gasto agregado');
  editId = null;
}

async function editG(id) {
  const gasto = state.gastos.find(g => g.id === id);
  if (!gasto) return;
  editId = id;
  document.getElementById('mh').textContent = 'Editar gasto';
  document.getElementById('fdesc').value = gasto.desc;
  document.getElementById('fmonto').value = gasto.monto;
  document.getElementById('fcatModal').value = gasto.cat;
  document.getElementById('fdia').value = gasto.dia;
  document.getElementById('ftipo').value = gasto.tipo;
  document.getElementById('fcuotas').value = gasto.cuotas || '';
  document.getElementById('fcuotaact').value = gasto.cuotaAct || 1;
  toggleQ();
  showOverlay('overlay');
}

async function delG(id) {
  if (!currentUser) return;
  if (!confirm('¿Eliminar este gasto?')) return;
  const { error } = await supabaseClient.from('gastos').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  await loadCloudData();
  updateAll();
  toast('Gasto eliminado');
}

async function saveExtra() {
  if (!currentUser) { alert('Primero inicia sesión.'); return; }
  const desc = document.getElementById('extra-desc').value.trim();
  const monto = parseFloat(document.getElementById('extra-monto').value);
  const mes = parseInt(document.getElementById('extra-mes').value, 10);
  if (!desc || !monto || monto <= 0) { alert('Datos inválidos'); return; }
  const { error } = await supabaseClient.from('ingresos_extra').insert({
    user_id: currentUser.id,
    descripcion: desc,
    monto,
    mes,
    anio: curY
  });
  if (error) { alert(error.message); return; }
  await loadCloudData();
  updateAll();
  renderExtraList();
  toast('Ingreso adicional guardado');
}

function drawDonut(sorted, total, income) {
  const canvas = document.getElementById('donut');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 15;
  ctx.clearRect(0, 0, width, height);
  let start = -Math.PI / 2;
  if (!sorted.length || total <= 0) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#f3f4f6';
    ctx.fill();
  } else {
    sorted.forEach(([cat, value]) => {
      const slice = (value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, start, start + slice);
      ctx.closePath();
      ctx.fillStyle = cs(cat).bar;
      ctx.fill();
      start += slice;
    });
  }
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  const legend = document.getElementById('dlegend');
  if (!legend) return;
  const centerTotal = document.getElementById('donut-total');
  if (centerTotal) {
    centerTotal.textContent = fmt(total);
  }
  if (!sorted.length) {
    legend.innerHTML = '<div class="text-[12px] text-text3">Sin gastos registrados todavía.</div>';
    return;
  }
  legend.innerHTML = sorted.map(([cat, value]) => `
    <div class="grid gap-2 rounded-[14px] border border-borderc bg-appbg px-3 py-2 text-[12px] text-text2">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 rounded-full" style="background:${cs(cat).bar}"></span>
          <span class="font-semibold text-text1">${cat}</span>
        </div>
        <span class="font-semibold text-text1">${fmt(value)}</span>
      </div>
      <div class="text-xs text-text3">${Math.round((value / total) * 100)}%</div>
    </div>
  `).join('');
}

function renderNotes() {
  fillCategorySelectors();
  const filter = document.getElementById('note-cat-filter')?.value || '';
  const container = document.getElementById('notes-list');
  if (!container) return;
  const items = state.anotaciones.filter(n => !filter || n.cat === filter);
  if (!items.length) {
    container.innerHTML = '<div class="p-4 text-sm text-text2">No hay anotaciones para este mes.</div>';
    document.getElementById('notes-total-footer').textContent = fmt(0);
    return;
  }
  container.innerHTML = items.map(note => `
    <div class="border-b border-borderc px-5 py-4 last:border-none">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="font-semibold text-text1">${note.desc}</div>
          <div class="mt-1 text-[12px] text-text3">${note.cat} · Día ${note.dia} · ${note.tipo}</div>
        </div>
        <div class="text-right">
          <div class="font-heading text-lg font-bold text-accent">${fmt(note.monto)}</div>
          <div class="mt-2 flex gap-2 text-[12px]">
            <button class="text-accent" onclick="editNote(${note.id})">Editar</button>
            <button class="text-blue1" onclick="openNoteMoveModal(${note.id})">Enviar</button>
            <button class="text-red1" onclick="delNote(${note.id})">Eliminar</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
  document.getElementById('notes-total-footer').textContent = fmt(items.reduce((sum, n) => sum + n.monto, 0));
}

function editNote(id) {
  const note = state.anotaciones.find(n => n.id === id);
  if (!note) return;
  editingNoteId = id;
  document.getElementById('note-mh').textContent = 'Editar anotación';
  document.getElementById('note-desc').value = note.desc;
  document.getElementById('note-monto').value = note.monto;
  document.getElementById('note-cat').value = note.cat;
  document.getElementById('note-dia').value = note.dia;
  document.getElementById('note-tipo').value = note.tipo;
  document.getElementById('note-cuotas').value = note.cuotas || '';
  document.getElementById('note-cuotaact').value = note.cuotaAct || 1;
  toggleNoteQ();
  showOverlay('overlay-note');
}

function renderPrestamos() {
  const cuotasLista = document.getElementById('qlist');
  if (cuotasLista) {
    const items = active().filter(g => g.tipo === 'cuotas');
    cuotasLista.innerHTML = items.length ? items.map(g => `
      <div class="mb-3 rounded-[16px] border border-borderc bg-white p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="font-semibold text-text1">${g.desc}</div>
            <div class="text-[12px] text-text3">${g.cat} · Cuota ${g.cuotaAct}/${g.cuotas}</div>
          </div>
          <div class="font-heading text-lg font-bold text-red1">${fmt(g.monto)}</div>
        </div>
      </div>
    `).join('') : '<div class="p-4 text-sm text-text2">No hay cuotas activas.</div>';
  }
  const cobrar = document.getElementById('prestamos-lista-cobrar');
  const pagar = document.getElementById('prestamos-lista-pagar');
  if (cobrar) {
    const items = state.prestamos.filter(p => p.tipo === 'por_cobrar');
    cobrar.innerHTML = items.length ? items.map(p => `
      <div class="mb-3 rounded-[16px] border border-borderc bg-white p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="font-semibold text-text1">${p.persona}</div>
            <div class="text-[12px] text-text3">${p.desc}</div>
          </div>
          <div class="text-right">
            <div class="font-heading text-lg font-bold text-bluetx">${fmt(prestamoSaldo(p))}</div>
            <button class="mt-2 text-[12px] text-accent" onclick="openAbonoModal(${p.id})">Registrar abono</button>
          </div>
        </div>
      </div>
    `).join('') : '<div class="p-4 text-sm text-text2">No hay préstamos por cobrar.</div>';
  }
  if (pagar) {
    const items = state.prestamos.filter(p => p.tipo === 'por_pagar');
    pagar.innerHTML = items.length ? items.map(p => `
      <div class="mb-3 rounded-[16px] border border-borderc bg-white p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="font-semibold text-text1">${p.persona}</div>
            <div class="text-[12px] text-text3">${p.desc}</div>
          </div>
          <div class="text-right">
            <div class="font-heading text-lg font-bold text-[#b7791f]">${fmt(prestamoSaldo(p))}</div>
            <button class="mt-2 text-[12px] text-accent" onclick="openAbonoModal(${p.id})">Registrar abono</button>
          </div>
        </div>
      </div>
    `).join('') : '<div class="p-4 text-sm text-text2">No hay préstamos por pagar.</div>';
  }
}

function renderCompromisosResumen() {
  const cuotaTotal = active().filter(g => g.tipo === 'cuotas').reduce((sum,g)=>sum+g.monto,0);
  const cobrarTotal = state.prestamos.filter(p => p.tipo === 'por_cobrar').reduce((sum,p)=>sum + prestamoSaldo(p), 0);
  const pagarTotal = state.prestamos.filter(p => p.tipo === 'por_pagar').reduce((sum,p)=>sum + prestamoSaldo(p), 0);
  document.getElementById('compromisos-cuotas-total').textContent = fmt(cuotaTotal);
  document.getElementById('prestamos-cobrar').textContent = fmt(cobrarTotal);
  document.getElementById('prestamos-pagar').textContent = fmt(pagarTotal);
}

function renderCuotas() {
  renderPrestamos();
}

function renderCats() {
  const grid = document.getElementById('catgrid');
  if (!grid) return;
  if (!state.categorias.length) {
    grid.innerHTML = '<div class="p-4 text-sm text-text2">No tienes categorías definidas.</div>';
    return;
  }
  grid.innerHTML = state.categorias.map(cat => {
    const count = state.gastos.filter(g => g.cat === cat).length;
    return `<div class="rounded-[18px] border border-borderc bg-white p-4 shadow-soft">
      <div class="font-semibold text-text1">${cat}</div>
      <div class="mt-2 text-[12px] text-text3">${count} gasto(s)</div>
    </div>`;
  }).join('');
}

function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(60px)';
  }, 2500);
}

async function addCat() {
  if (!currentUser) { alert('Primero inicia sesión.'); return; }
  const name = prompt('Nombre de nueva categoría');
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) { alert('Nombre inválido'); return; }
  if (state.categorias.includes(trimmed)) { alert('La categoría ya existe.'); return; }
  const { error } = await supabaseClient.from('categorias').insert({ user_id: currentUser.id, nombre: trimmed });
  if (error) { alert(error.message); return; }
  await loadCloudData();
  updateAll();
  toast('Categoría agregada');
}

function triggerExcelImport() {
  document.getElementById('excel-import').click();
}

async function handleExcelImport(event) {
  if (!currentUser) { alert('Primero inicia sesión.'); return; }
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    const data = e.target.result;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data);
    const sheet = workbook.worksheets[0];
    const headers = sheet.getRow(1).values.map(v => String(v || '').trim().toLowerCase());
    const rows = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = row.values;
      const item = {
        descripcion: values[headers.indexOf('descripcion') + 1] || '',
        categoria: values[headers.indexOf('categoria') + 1] || '',
        dia_pago: parseInt(values[headers.indexOf('dia_pago') + 1], 10) || 15,
        tipo: values[headers.indexOf('tipo') + 1] || 'unico',
        monto: parseFloat(values[headers.indexOf('monto') + 1]) || 0,
        mes: parseInt(values[headers.indexOf('mes') + 1], 10) || curM,
        anio: parseInt(values[headers.indexOf('anio') + 1], 10) || curY,
        total_cuotas: parseInt(values[headers.indexOf('total_cuotas') + 1], 10) || 0,
        cuota_actual: parseInt(values[headers.indexOf('cuota_actual') + 1], 10) || 1
      };
      if (item.descripcion && item.monto > 0) rows.push(item);
    });
    if (!rows.length) { alert('No se encontraron datos válidos en el archivo.'); return; }
    const payloads = rows.map(item => ({
      user_id: currentUser?.id || null,
      descripcion: item.descripcion,
      categoria: item.categoria,
      dia_pago: item.dia_pago,
      tipo: item.tipo,
      monto: item.monto,
      mes: item.mes,
      anio: item.anio,
      origen_mes: item.mes,
      origen_anio: item.anio,
      cuota_actual: item.cuota_actual,
      total_cuotas: item.total_cuotas
    }));
    const { error } = await supabaseClient.from('gastos').insert(payloads);
    if (error) { alert(error.message); return; }
    await loadCloudData();
    updateAll();
    toast('Excel importado');
  };
  reader.readAsArrayBuffer(file);
}

async function exportExcel() {
  const workbook = new ExcelJS.Workbook();
  const gastosSheet = workbook.addWorksheet('Gastos');
  gastosSheet.addRow(['descripcion', 'categoria', 'dia_pago', 'tipo', 'monto', 'mes', 'anio', 'total_cuotas', 'cuota_actual']);
  state.gastos.forEach(g => {
    gastosSheet.addRow([g.desc, g.cat, g.dia, g.tipo, g.monto, g.mes, g.anio, g.cuotas, g.cuotaAct]);
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `finanzas-${curY}-${curM+1}.xlsx`);
}

// ==================== FUNCIONES PARA ANOTACIONES ====================
async function saveNote() {
  if (!currentUser) { alert('Primero inicia sesión.'); return; }
  const desc = document.getElementById('note-desc').value.trim();
  const monto = parseFloat(document.getElementById('note-monto').value);
  const cat = document.getElementById('note-cat').value;
  const dia = parseInt(document.getElementById('note-dia').value)||15;
  const tipo = document.getElementById('note-tipo').value;
  const cuotas = tipo==='cuotas' ? (parseInt(document.getElementById('note-cuotas').value)||0) : 0;
  const cuotaAct = tipo==='cuotas' ? (parseInt(document.getElementById('note-cuotaact').value)||1) : 1;
  if(!desc || !monto || monto<=0){ alert('Datos inválidos'); return; }
  if(tipo==='cuotas' && cuotas<1){ alert('Ingresa total de cuotas'); return; }

  const payload = {
    user_id: currentUser.id,
    descripcion: desc,
    categoria: cat,
    dia_pago: dia,
    tipo,
    monto,
    mes: curM,
    anio: curY,
    creado_mes: curM,
    creado_anio: curY,
    cuota_actual: cuotaAct,
    total_cuotas: cuotas
  };

  let error;
  if (editingNoteId !== null) {
    ({ error } = await supabaseClient.from('anotaciones').update(payload).eq('id', editingNoteId));
  } else {
    ({ error } = await supabaseClient.from('anotaciones').insert(payload));
  }
  if (error) { alert(error.message); return; }

  await loadCloudData();
  updateAll();
  closeNoteModal();
  toast(editingNoteId ? 'Anotación actualizada' : 'Anotación agregada');
  editingNoteId = null;
}

async function delNote(id) {
  if (!currentUser) return;
  if (!confirm('¿Eliminar esta anotación?')) return;
  const { error } = await supabaseClient.from('anotaciones').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  await loadCloudData();
  updateAll();
  toast('Anotación eliminada');
}

// ==================== FUNCIONES PARA PRÉSTAMOS ====================
function prestamoSaldo(p){ return Math.max((p.montoTotal||0) - (p.montoPagado||0), 0); }

async function savePrestamo() {
  if (!currentUser) { alert('Primero inicia sesión.'); return; }
  const tipo = document.getElementById('prestamo-tipo').value;
  const persona = document.getElementById('prestamo-persona').value.trim();
  const desc = document.getElementById('prestamo-desc').value.trim();
  const montoTotal = parseFloat(document.getElementById('prestamo-monto').value);
  const montoPagado = parseFloat(document.getElementById('prestamo-abonado').value)||0;
  const fecha = document.getElementById('prestamo-fecha').value;
  const vencimiento = document.getElementById('prestamo-vencimiento').value;
  const notas = document.getElementById('prestamo-notas').value.trim();
  if(!persona || !desc || !montoTotal || montoTotal<=0){ alert('Datos inválidos'); return; }
  if(montoPagado<0 || montoPagado>montoTotal){ alert('Abonado inicial no válido'); return; }

  const payload = {
    user_id: currentUser.id,
    tipo,
    persona,
    descripcion: desc,
    monto_total: montoTotal,
    monto_pagado: montoPagado,
    fecha: fecha || null,
    vencimiento: vencimiento || null,
    notas: notas || null
  };

  let error;
  if (editingPrestamoId !== null) {
    ({ error } = await supabaseClient.from('prestamos').update(payload).eq('id', editingPrestamoId));
  } else {
    ({ error } = await supabaseClient.from('prestamos').insert(payload));
  }
  if (error) { alert(error.message); return; }

  await loadCloudData();
  updateAll();
  closePrestamoModal();
  toast(editingPrestamoId ? 'Préstamo actualizado' : 'Préstamo agregado');
  editingPrestamoId = null;
}

async function delPrestamo(id) {
  if (!currentUser) return;
  if (!confirm('¿Eliminar este préstamo y todos sus abonos?')) return;
  const { error } = await supabaseClient.from('prestamos').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  await loadCloudData();
  updateAll();
  toast('Préstamo eliminado');
}

// ==================== ABONOS DE PRÉSTAMOS ====================
async function saveAbono() {
  if (!currentUser) { alert('Primero inicia sesión.'); return; }
  if (editingAbonoRef) { await saveAbonoEdit(); return; }

  const p = state.prestamos.find(x => x.id === abonoPrestamoId);
  if (!p) return;
  const monto = parseFloat(document.getElementById('abono-monto').value);
  const mes = parseInt(document.getElementById('abono-month').value,10);
  const impacto = document.getElementById('abono-impacto').value;
  const nota = document.getElementById('abono-nota').value.trim();
  const saldo = prestamoSaldo(p);
  if(!monto || monto<=0 || monto>saldo){ alert('Monto inválido'); return; }

  // Insertar abono
  const { data: abonoData, error: abonoError } = await supabaseClient
    .from('abonos_prestamos')
    .insert({
      user_id: currentUser.id,
      prestamo_id: p.id,
      fecha: new Date().toISOString().slice(0,10),
      mes,
      monto,
      impacto,
      nota,
      linked_type: null,
      linked_id: null
    })
    .select('id')
    .single();
  if (abonoError) { alert(abonoError.message); return; }
  const abonoId = abonoData.id;

  // Actualizar monto pagado del préstamo
  const nuevoPagado = (p.montoPagado||0) + monto;
  const { error: updateError } = await supabaseClient
    .from('prestamos')
    .update({ monto_pagado: nuevoPagado })
    .eq('id', p.id);
  if (updateError) { alert(updateError.message); return; }

  // Crear registro vinculado si impacto = 'mes'
  if (impacto === 'mes') {
    if (p.tipo === 'por_pagar') {
      const { data: gastoData, error: gastoError } = await supabaseClient
        .from('gastos')
        .insert({
          user_id: currentUser.id,
          descripcion: `Abono préstamo - ${p.persona}`,
          categoria: 'Personal',
          dia_pago: 15,
          tipo: 'unico',
          monto,
          mes,
          anio: curY,
          origen_mes: mes,
          origen_anio: curY,
          cuota_actual: 1,
          total_cuotas: 0
        })
        .select('id')
        .single();
      if (!gastoError && gastoData) {
        await supabaseClient.from('abonos_prestamos').update({ linked_type: 'gasto', linked_id: gastoData.id }).eq('id', abonoId);
      }
    } else {
      const { data: ingresoData, error: ingresoError } = await supabaseClient
        .from('ingresos_extra')
        .insert({
          user_id: currentUser.id,
          descripcion: `Devolución préstamo - ${p.persona}`,
          monto,
          mes,
          anio: curY
        })
        .select('id')
        .single();
      if (!ingresoError && ingresoData) {
        await supabaseClient.from('abonos_prestamos').update({ linked_type: 'ingreso', linked_id: ingresoData.id }).eq('id', abonoId);
      }
    }
  }

  await loadCloudData();
  updateAll();
  closeAbonoModal();
  toast('Abono registrado');
}

async function saveAbonoEdit() {
  if (!editingAbonoRef) return;
  const p = state.prestamos.find(x => x.id === editingAbonoRef.prestamoId);
  const hist = p?.historial.find(h => h.id === editingAbonoRef.historialId);
  if (!p || !hist) return;

  const monto = parseFloat(document.getElementById('abono-monto').value);
  const mes = parseInt(document.getElementById('abono-month').value,10);
  const impacto = document.getElementById('abono-impacto').value;
  const nota = document.getElementById('abono-nota').value.trim();
  const saldoSinEste = Math.max((p.montoTotal||0) - ((p.montoPagado||0) - (hist.monto||0)), 0);
  if(!monto || monto<=0 || monto>saldoSinEste){ alert('Monto inválido'); return; }

  // Eliminar registros vinculados antiguos
  if (hist.linkedType === 'gasto' && hist.linkedId) {
    await supabaseClient.from('gastos').delete().eq('id', hist.linkedId);
  } else if (hist.linkedType === 'ingreso' && hist.linkedId) {
    await supabaseClient.from('ingresos_extra').delete().eq('id', hist.linkedId);
  }

  // Actualizar abono
  const { error: abonoError } = await supabaseClient
    .from('abonos_prestamos')
    .update({
      monto,
      mes,
      impacto,
      nota,
      linked_type: null,
      linked_id: null
    })
    .eq('id', hist.id);
  if (abonoError) { alert(abonoError.message); return; }

  // Recalcular monto pagado del préstamo
  const nuevoPagado = (p.montoPagado||0) - (hist.monto||0) + monto;
  await supabaseClient.from('prestamos').update({ monto_pagado: nuevoPagado }).eq('id', p.id);

  // Crear nuevo vínculo si impacto = 'mes'
  if (impacto === 'mes') {
    if (p.tipo === 'por_pagar') {
      const { data: gastoData, error: gastoError } = await supabaseClient
        .from('gastos')
        .insert({
          user_id: currentUser.id,
          descripcion: `Abono préstamo - ${p.persona}`,
          categoria: 'Personal',
          dia_pago: 15,
          tipo: 'unico',
          monto,
          mes,
          anio: curY,
          origen_mes: mes,
          origen_anio: curY,
          cuota_actual: 1,
          total_cuotas: 0
        })
        .select('id')
        .single();
      if (!gastoError && gastoData) {
        await supabaseClient.from('abonos_prestamos').update({ linked_type: 'gasto', linked_id: gastoData.id }).eq('id', hist.id);
      }
    } else {
      const { data: ingresoData, error: ingresoError } = await supabaseClient
        .from('ingresos_extra')
        .insert({
          user_id: currentUser.id,
          descripcion: `Devolución préstamo - ${p.persona}`,
          monto,
          mes,
          anio: curY
        })
        .select('id')
        .single();
      if (!ingresoError && ingresoData) {
        await supabaseClient.from('abonos_prestamos').update({ linked_type: 'ingreso', linked_id: ingresoData.id }).eq('id', hist.id);
      }
    }
  }

  await loadCloudData();
  updateAll();
  closeAbonoModal();
  toast('Abono actualizado');
}

async function removeAbono(prestamoId, historialId) {
  if (!currentUser) return;
  const p = state.prestamos.find(x => x.id === prestamoId);
  const hist = p?.historial.find(h => h.id === historialId);
  if (!p || !hist) return;
  if (!confirm('¿Eliminar este abono?')) return;

  if (hist.linkedType === 'gasto' && hist.linkedId) {
    await supabaseClient.from('gastos').delete().eq('id', hist.linkedId);
  } else if (hist.linkedType === 'ingreso' && hist.linkedId) {
    await supabaseClient.from('ingresos_extra').delete().eq('id', hist.linkedId);
  }

  await supabaseClient.from('abonos_prestamos').delete().eq('id', historialId);
  const nuevoPagado = Math.max((p.montoPagado||0) - (hist.monto||0), 0);
  await supabaseClient.from('prestamos').update({ monto_pagado: nuevoPagado }).eq('id', prestamoId);

  await loadCloudData();
  updateAll();
  toast('Abono eliminado');
}

// Inicializar
initAuth();
