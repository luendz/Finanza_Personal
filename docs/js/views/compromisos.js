import {
  active,
  app,
  cs,
  fillCategorySelectors,
  fillMonthOptions,
  fmt,
  gastoCuotaLabel,
  gastoPaidInView,
  gastoPaymentStatus,
  hideOverlay,
  MS,
  paymentDateForView,
  prestamoEstado,
  prestamoSaldo,
  requireCurrentUser,
  runtime,
  runWithLoading,
  showOverlay,
  state,
  toast,
  uiState,
} from '../core.js';

const GASTOS_SORT_KEYS = new Set(['desc', 'tipo', 'dia', 'cat', 'status', 'monto']);
const GASTOS_STATUS_ORDER = {
  vencido: 0,
  pendiente: 1,
  pagado: 2,
};

function ensureGastosSortState() {
  if (!uiState.gastosSort || typeof uiState.gastosSort !== 'object') {
    uiState.gastosSort = { key: null, direction: 'asc' };
  }

  if (!('key' in uiState.gastosSort)) {
    uiState.gastosSort.key = null;
  }

  if (!['asc', 'desc'].includes(uiState.gastosSort.direction)) {
    uiState.gastosSort.direction = 'asc';
  }

  return uiState.gastosSort;
}

function compareText(left, right, direction = 'asc') {
  const factor = direction === 'desc' ? -1 : 1;
  return String(left || '').localeCompare(String(right || ''), 'es', {
    sensitivity: 'base',
    numeric: true,
  }) * factor;
}

function compareNumber(left, right, direction = 'asc') {
  const factor = direction === 'desc' ? -1 : 1;
  return ((Number(left) || 0) - (Number(right) || 0)) * factor;
}

function compareGastos(left, right, key, direction) {
  let result = 0;

  switch (key) {
    case 'desc':
      result = compareText(left.desc, right.desc, direction);
      break;
    case 'tipo':
      result = compareText(left.tipo, right.tipo, direction);
      break;
    case 'dia':
      result = compareNumber(left.dia, right.dia, direction);
      break;
    case 'cat':
      result = compareText(left.cat, right.cat, direction);
      break;
    case 'status':
      result = compareNumber(
        GASTOS_STATUS_ORDER[gastoPaymentStatus(left).key] ?? 99,
        GASTOS_STATUS_ORDER[gastoPaymentStatus(right).key] ?? 99,
        direction,
      );
      break;
    case 'monto':
      result = compareNumber(left.monto, right.monto, direction);
      break;
    default:
      break;
  }

  if (result !== 0) {
    return result;
  }

  const byDay = compareNumber(left.dia, right.dia, 'asc');
  if (byDay !== 0) {
    return byDay;
  }

  return compareNumber(left.id, right.id, 'asc');
}

function sortGastosItems(items) {
  const sortState = ensureGastosSortState();
  if (!sortState.key) {
    return items.slice();
  }

  return items.slice().sort((left, right) => compareGastos(left, right, sortState.key, sortState.direction));
}

function syncGastosSortHeader() {
  const sortState = ensureGastosSortState();
  document.querySelectorAll('[data-gastos-sort]').forEach(button => {
    const key = button.getAttribute('data-gastos-sort');
    const label = button.getAttribute('data-gastos-sort-label') || key || 'columna';
    const isActive = sortState.key === key;
    const indicator = button.querySelector('[data-gastos-sort-indicator]');
    const directionLabel = isActive ? (sortState.direction === 'asc' ? 'ascendente' : 'descendente') : 'sin orden activo';

    button.classList.toggle('text-accent', isActive);
    button.classList.toggle('text-text3', !isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.setAttribute('title', `Ordenar ${isActive ? directionLabel : 'por'} ${label}`);

    if (indicator) {
      indicator.textContent = isActive
        ? (sortState.direction === 'asc' ? '↑' : '↓')
        : '↕';
      indicator.textContent = isActive ? (sortState.direction === 'asc' ? '^' : 'v') : '--';
      indicator.classList.toggle('text-accent', isActive);
      indicator.classList.toggle('text-text3', !isActive);
    }
  });
}

function renderGastosPaymentSummary(items) {
  const summary = document.getElementById('gastos-payment-summary');
  if (!summary) return;

  const totals = items.reduce((acc, gasto) => {
    acc[gastoPaymentStatus(gasto).key] += Number(gasto.monto || 0);
    return acc;
  }, { pagado: 0, pendiente: 0, vencido: 0 });
  const totalGastos = totals.pagado + totals.pendiente + totals.vencido;

  summary.innerHTML = `
    <div class="rounded-[14px] border border-borderc bg-white px-4 py-3">
      <div class="text-[11px] font-bold uppercase tracking-[0.06em] text-text3">Pagado</div>
      <div class="mt-1 font-heading text-[20px] font-bold text-bluetx">${fmt(totals.pagado)}</div>
    </div>
    <div class="rounded-[14px] border border-borderc bg-white px-4 py-3">
      <div class="text-[11px] font-bold uppercase tracking-[0.06em] text-text3">Pendiente</div>
      <div class="mt-1 font-heading text-[20px] font-bold text-[#b7791f]">${fmt(totals.pendiente)}</div>
    </div>
    <div class="rounded-[14px] border border-borderc bg-white px-4 py-3">
      <div class="text-[11px] font-bold uppercase tracking-[0.06em] text-text3">Vencido</div>
      <div class="mt-1 font-heading text-[20px] font-bold text-[#8a4a10]">${fmt(totals.vencido)}</div>
    </div>
    <div class="rounded-[14px] border border-[#f1d3d3] bg-[#fff5f5] px-4 py-3">
      <div class="text-[11px] font-bold uppercase tracking-[0.06em] text-text3">Total gastos</div>
      <div class="mt-1 font-heading text-[20px] font-bold text-red1">${fmt(totalGastos)}</div>
    </div>
  `;
}

function openModal() {
  runtime.editId = null;
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
  runtime.editId = null;
}

function toggleQ() {
  const tipo = document.getElementById('ftipo').value;
  document.getElementById('qfields').classList.toggle('hidden', tipo !== 'cuotas');
}

function renderGastos() {
  fillCategorySelectors();
  const filter = document.getElementById('fcat')?.value || '';
  const list = document.getElementById('glist');
  const footerTotal = document.getElementById('gastos-total-footer');
  if (!list) return;

  const items = sortGastosItems(active().filter(gasto => !filter || gasto.cat === filter));
  const itemsTotal = items.reduce((sum, gasto) => sum + gasto.monto, 0);
  renderGastosPaymentSummary(items);
  syncGastosSortHeader();
  if (footerTotal) footerTotal.textContent = fmt(itemsTotal);

  if (!items.length) {
    list.innerHTML = '<div class="p-4 text-sm text-text2">No hay gastos para este mes.</div>';
    return;
  }

  list.innerHTML = items.map(gasto => {
    const style = cs(gasto.cat);
    const status = gastoPaymentStatus(gasto);
    const isPaid = status.key === 'pagado';
    const statusClass = status.key === 'pagado'
      ? 'border-[#d8ead8] bg-[#f5fbf5] text-green1'
      : status.key === 'vencido'
        ? 'border-[#f1d3d3] bg-[#fff5f5] text-red1'
        : 'border-[#eadfca] bg-[#fffaf1] text-[#b7791f]';
    const amountClass = isPaid ? 'text-green1' : status.key === 'vencido' ? 'text-red1' : 'text-[#b7791f]';
    const toggleLabel = gasto.tipo === 'cuotas'
      ? (isPaid ? 'Deshacer cuota' : 'Registrar cuota')
      : (isPaid ? 'Deshacer pago' : 'Marcar pagado');
    const toggleHandler = gasto.tipo === 'cuotas'
      ? (isPaid ? `undoCuota(${gasto.id})` : `registerCuota(${gasto.id})`)
      : `toggleGastoPago(${gasto.id})`;
    const typeLabel = gasto.tipo === 'cuotas' ? 'Cuotas' : 'Unico';
    const dayLabel = `Dia ${gasto.dia}`;
    const statusDetail = gasto.tipo === 'cuotas' ? gastoCuotaLabel(gasto) : status.detail;
    const toggleBtnClass = isPaid
      ? 'text-green1 hover:bg-greenbg hover:text-green1'
      : 'text-text3 hover:bg-greenbg hover:text-green1';
    const mobileCategoryChip = `<span class="inline-flex h-6 max-w-[126px] shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-bold leading-none whitespace-nowrap" style="background:${style.bg};color:${style.tx}" title="${gasto.cat}"><span class="h-1.5 w-1.5 shrink-0 rounded-full" style="background:${style.bar}"></span><span class="truncate">${gasto.cat}</span></span>`;
    const mobileTypeChip = `<span class="inline-flex h-6 shrink-0 items-center rounded-full bg-appbg px-2 text-[10px] font-bold leading-none whitespace-nowrap text-text2" title="${statusDetail}">${typeLabel}</span>`;
    const mobileDayChip = `<span class="inline-flex h-6 shrink-0 items-center rounded-full border border-borderc bg-white px-2 text-[10px] font-bold leading-none whitespace-nowrap text-text3">${dayLabel}</span>`;
    const mobileStatusChip = `<span class="inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-[10px] font-bold leading-none whitespace-nowrap ${statusClass}" title="${statusDetail}">${status.label}</span>`;
    const mobileActionBtnBase = 'inline-flex h-8 w-8 items-center justify-center rounded-full border border-borderc bg-white text-[14px] leading-none transition';
    const mobileToggleBtnClass = isPaid
      ? `${mobileActionBtnBase} text-green1 hover:border-green1 hover:bg-greenbg hover:text-green1`
      : `${mobileActionBtnBase} text-text3 hover:border-green1 hover:bg-greenbg hover:text-green1`;

    return `
      <div class="border-b border-appbg2 px-4 py-3.5 transition hover:bg-appbg md:px-5 md:py-3">
        <div class="md:hidden">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="truncate text-[15px] font-semibold ${isPaid ? 'text-text2 line-through' : 'text-text1'}" title="${gasto.desc}">${gasto.desc}</div>
              <div class="mobile-gasto-meta mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 pr-1">
                <div class="flex min-w-max items-center gap-1.5">
                  ${mobileTypeChip}
                  ${mobileDayChip}
                  ${mobileCategoryChip}
                  ${mobileStatusChip}
                </div>
              </div>
            </div>
            <div class="shrink-0 text-right">
              <div class="whitespace-nowrap font-heading text-[16px] font-bold ${amountClass}">${fmt(gasto.monto)}</div>
            </div>
          </div>
          <div class="mt-2.5 flex items-center justify-end gap-1.5">
            <button class="${mobileToggleBtnClass}" onclick="${toggleHandler}" title="${toggleLabel}" aria-label="${toggleLabel}">&#10003;</button>
            <button class="${mobileActionBtnBase} text-text3 hover:border-accent hover:bg-bluebg hover:text-accent" onclick="editG(${gasto.id})" title="Editar gasto" aria-label="Editar gasto">&#9998;</button>
            <button class="${mobileActionBtnBase} text-text3 hover:border-red1 hover:bg-redbg hover:text-red1" onclick="delG(${gasto.id})" title="Eliminar gasto" aria-label="Eliminar gasto">&times;</button>
          </div>
        </div>
        <div class="hidden gap-2 md:grid md:grid-cols-[minmax(0,1.45fr)_64px_68px_110px_110px_96px_92px] md:items-center">
          <div class="min-w-0">
            <div class="truncate text-[14px] font-semibold ${isPaid ? 'text-text2 line-through' : 'text-text1'}" title="${gasto.desc}">${gasto.desc}</div>
          </div>
          <div>
            <span class="inline-flex h-5 items-center rounded-full bg-appbg px-2 text-[10px] font-bold leading-none text-text2" title="${statusDetail}">${typeLabel}</span>
          </div>
          <div class="min-w-0">
            <span class="inline-flex h-5 items-center rounded-full border border-borderc bg-white px-2 text-[10px] font-bold leading-none text-text3">${dayLabel}</span>
          </div>
          <div class="min-w-0">
            <span class="inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] font-bold leading-none" style="background:${style.bg};color:${style.tx}" title="${gasto.cat}"><span class="h-1.5 w-1.5 shrink-0 rounded-full" style="background:${style.bar}"></span><span class="truncate">${gasto.cat}</span></span>
          </div>
          <div class="min-w-0">
            <span class="inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold leading-none ${statusClass}" title="${statusDetail}">${status.label}</span>
          </div>
          <div class="whitespace-nowrap font-heading text-[15px] font-bold md:text-right ${amountClass}">${fmt(gasto.monto)}</div>
          <div class="flex shrink-0 items-center gap-1 md:justify-end">
            <button class="inline-flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent text-[16px] leading-none transition ${toggleBtnClass}" onclick="${toggleHandler}" title="${toggleLabel}" aria-label="${toggleLabel}">&#10003;</button>
            <button class="inline-flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent text-[16px] leading-none text-text3 transition hover:bg-bluebg hover:text-accent" onclick="editG(${gasto.id})" title="Editar gasto" aria-label="Editar gasto">&#9998;</button>
            <button class="inline-flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent text-[20px] leading-none text-text3 transition hover:bg-redbg hover:text-red1" onclick="delG(${gasto.id})" title="Eliminar gasto" aria-label="Eliminar gasto">&times;</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function setGastosSort(key) {
  if (!GASTOS_SORT_KEYS.has(key)) return;

  const sortState = ensureGastosSortState();
  if (sortState.key === key) {
    sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    sortState.key = key;
    sortState.direction = key === 'monto' ? 'desc' : 'asc';
  }

  renderGastos();
}

async function saveG() {
  const currentUser = requireCurrentUser();
  if (!currentUser) return;

  const desc = document.getElementById('fdesc').value.trim();
  const monto = parseFloat(document.getElementById('fmonto').value);
  const cat = document.getElementById('fcatModal').value;
  const dia = parseInt(document.getElementById('fdia').value, 10) || 15;
  const tipo = document.getElementById('ftipo').value;
  const cuotas = tipo === 'cuotas' ? (parseInt(document.getElementById('fcuotas').value, 10) || 0) : 0;
  const cuotaAct = tipo === 'cuotas' ? (parseInt(document.getElementById('fcuotaact').value, 10) || 1) : 1;
  if (!desc || !monto || monto <= 0) {
    alert('Datos invalidos');
    return;
  }
  if (tipo === 'cuotas' && cuotas < 1) {
    alert('Ingresa total de cuotas');
    return;
  }

  const existing = runtime.editId !== null ? state.gastos.find(gasto => gasto.id === runtime.editId) : null;
  const payload = {
    user_id: currentUser.id,
    descripcion: desc,
    categoria: cat,
    dia_pago: dia,
    tipo,
    monto,
    mes: runtime.curM,
    anio: runtime.curY,
    origen_mes: existing ? existing.origenMes : runtime.curM,
    origen_anio: existing ? existing.origenAnio : runtime.curY,
    cuota_actual: cuotaAct,
    total_cuotas: cuotas,
  };

  let error;
  const isEditing = runtime.editId !== null;
  await runWithLoading(isEditing ? 'Actualizando gasto...' : 'Guardando gasto...', async () => {
    if (isEditing) {
      ({ error } = await app.supabaseClient.from('gastos').update(payload).eq('id', runtime.editId));
    } else {
      ({ error } = await app.supabaseClient.from('gastos').insert(payload));
    }
    if (error) {
      alert(error.message);
      return;
    }

    await app.actions.refreshAppData?.();
  });

  if (error) {
    return;
  }
  closeModal();
  toast(runtime.editId !== null ? 'Gasto actualizado' : 'Gasto agregado');
  runtime.editId = null;
}

function editG(id) {
  const gasto = state.gastos.find(item => item.id === id);
  if (!gasto) return;
  runtime.editId = id;
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
  if (!runtime.currentUser) return;
  if (!confirm('¿Eliminar este gasto?')) return;
  let error;
  await runWithLoading('Eliminando gasto...', async () => {
    ({ error } = await app.supabaseClient.from('gastos').delete().eq('id', id));
    if (error) {
      alert(error.message);
      return;
    }

    await app.actions.refreshAppData?.();
  });

  if (error) {
    return;
  }
  toast('Gasto eliminado');
}

async function toggleGastoPago(id) {
  if (!runtime.currentUser) return;
  const gasto = state.gastos.find(item => item.id === id);
  if (!gasto) return;

  if (gasto.tipo === 'cuotas') {
    if (gastoPaidInView(gasto)) {
      await undoCuota(id);
    } else {
      await registerCuota(id);
    }
    return;
  }

  const nextPaid = !gastoPaidInView(gasto);
  const payload = nextPaid
    ? { pagado: true, fecha_pagado: paymentDateForView() }
    : { pagado: false, fecha_pagado: null };

  let error;
  await runWithLoading('Actualizando pago...', async () => {
    ({ error } = await app.supabaseClient.from('gastos').update(payload).eq('id', id));
    if (error) {
      alert(error.message);
      return;
    }

    await app.actions.refreshAppData?.();
  });

  if (error) {
    return;
  }
  toast(nextPaid ? 'Gasto marcado como pagado' : 'Pago deshecho');
}

async function registerCuota(id) {
  if (!runtime.currentUser) return;
  const gasto = state.gastos.find(item => item.id === id && item.tipo === 'cuotas');
  if (!gasto) return;

  const nextCuota = Math.min(gasto.cuotaAct + 1, gasto.cuotas + 1);
  if (nextCuota === gasto.cuotaAct) return;

  let error;
  await runWithLoading('Registrando cuota...', async () => {
    ({ error } = await app.supabaseClient.from('gastos').update({
      cuota_actual: nextCuota,
      pagado: true,
      fecha_pagado: paymentDateForView(),
    }).eq('id', id));

    if (error) {
      alert(error.message);
      return;
    }

    await app.actions.refreshAppData?.();
  });

  if (error) {
    return;
  }
  toast(nextCuota > gasto.cuotas ? 'Ultima cuota registrada' : 'Cuota registrada');
}

async function undoCuota(id) {
  if (!runtime.currentUser) return;
  const gasto = state.gastos.find(item => item.id === id && item.tipo === 'cuotas');
  if (!gasto) return;
  if (gasto.cuotaAct <= 1) {
    toast('No hay cuotas para deshacer');
    return;
  }

  const prevCuota = gasto.cuotaAct - 1;
  let error;
  await runWithLoading('Deshaciendo cuota...', async () => {
    ({ error } = await app.supabaseClient.from('gastos').update({
      cuota_actual: prevCuota,
      pagado: false,
      fecha_pagado: null,
    }).eq('id', id));

    if (error) {
      alert(error.message);
      return;
    }

    await app.actions.refreshAppData?.();
  });

  if (error) {
    return;
  }
  toast('Cuota deshecha');
}

function getDefaultCarryTarget() {
  return runtime.curM === 11
    ? { month: 0, year: runtime.curY + 1 }
    : { month: runtime.curM + 1, year: runtime.curY };
}

function getCarryTarget() {
  const monthEl = document.getElementById('carry-target-month');
  const yearEl = document.getElementById('carry-target-year');
  const fallback = getDefaultCarryTarget();
  const month = monthEl ? Math.max(0, Math.min(11, parseInt(monthEl.value, 10) || fallback.month)) : fallback.month;
  const year = yearEl ? Math.max(2000, Math.min(2100, parseInt(yearEl.value, 10) || fallback.year)) : fallback.year;
  return { month, year };
}

function openCarryModal() {
  uiState.carrySelection = new Set();
  const target = getDefaultCarryTarget();
  fillMonthOptions('carry-target-month');
  document.getElementById('carry-target-month').value = target.month;
  document.getElementById('carry-target-year').value = target.year;
  refreshCarryList();
  updateCarrySummary();
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
    updateCarrySummary();
    return;
  }

  carryContainer.innerHTML = items.map(gasto => {
    const activeClass = uiState.carrySelection.has(gasto.id) ? 'bg-accent/10 border-accent' : 'bg-white border-borderc';
    return `<label class="group mb-2 flex cursor-pointer items-center justify-between rounded-lg border px-3 py-3 transition ${activeClass}"><span><strong>${gasto.desc}</strong> · ${gasto.cat}<br><span class="text-[12px] text-text3">${MS[gasto.mes]} ${gasto.anio} · ${gasto.tipo}</span></span><input type="checkbox" ${uiState.carrySelection.has(gasto.id) ? 'checked' : ''} onchange="toggleCarryItem(${gasto.id})"></label>`;
  }).join('');
  updateCarrySummary();
}

function toggleCarryItem(id) {
  if (uiState.carrySelection.has(id)) uiState.carrySelection.delete(id);
  else uiState.carrySelection.add(id);
  refreshCarryList();
}

function updateCarrySummary() {
  const target = getCarryTarget();
  const destination = `${MS[target.month]} ${target.year}`;
  const selected = Array.from(uiState.carrySelection).map(id => state.gastos.find(gasto => gasto.id === id)).filter(Boolean);
  const total = selected.reduce((sum, gasto) => sum + gasto.monto, 0);
  document.getElementById('carry-summary').textContent = selected.length
    ? `${selected.length} gasto(s) seleccionados · Total ${fmt(total)} · Destino ${destination}`
    : `Selecciona gastos para copiar a ${destination}.`;
}

function markCarryByMode(mode) {
  uiState.carrySelection = new Set();
  active().forEach(gasto => {
    if (mode === 'all') uiState.carrySelection.add(gasto.id);
    if (mode === 'recurrente' && gasto.tipo === 'recurrente') uiState.carrySelection.add(gasto.id);
    if (mode === 'cuotas' && gasto.tipo === 'cuotas') uiState.carrySelection.add(gasto.id);
  });
  refreshCarryList();
}

function clearCarrySelection() {
  uiState.carrySelection = new Set();
  refreshCarryList();
}

async function carrySelectedExpenses() {
  const currentUser = requireCurrentUser();
  if (!currentUser) return;

  const selected = Array.from(uiState.carrySelection).map(id => state.gastos.find(gasto => gasto.id === id)).filter(Boolean);
  if (!selected.length) {
    alert('Selecciona al menos un gasto.');
    return;
  }

  const target = getCarryTarget();
  if (target.month === runtime.curM && target.year === runtime.curY) {
    alert('Elige un mes o año distinto al que estas viendo.');
    return;
  }

  const payloads = selected.map(gasto => ({
    user_id: currentUser.id,
    descripcion: gasto.desc,
    categoria: gasto.cat,
    dia_pago: gasto.dia,
    tipo: gasto.tipo,
    monto: gasto.monto,
    mes: target.month,
    anio: target.year,
    origen_mes: gasto.mes,
    origen_anio: gasto.anio,
    cuota_actual: gasto.cuotaAct,
    total_cuotas: gasto.cuotas,
  }));

  let error;
  await runWithLoading('Copiando gastos al siguiente mes...', async () => {
    ({ error } = await app.supabaseClient.from('gastos').insert(payloads));
    if (error) {
      alert(error.message);
      return;
    }

    await app.actions.refreshAppData?.();
  });

  if (error) {
    return;
  }

  closeCarryModal();
  toast(`Gastos copiados a ${MS[target.month]} ${target.year}`);
}

function openPrestamoModal() {
  runtime.editingPrestamoId = null;
  document.getElementById('prestamo-mh').textContent = 'Agregar prestamo';
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

function editPrestamo(id) {
  const prestamo = state.prestamos.find(item => item.id === id);
  if (!prestamo) return;
  runtime.editingPrestamoId = id;
  document.getElementById('prestamo-mh').textContent = 'Editar prestamo';
  document.getElementById('prestamo-tipo').value = prestamo.tipo;
  document.getElementById('prestamo-persona').value = prestamo.persona || '';
  document.getElementById('prestamo-desc').value = prestamo.desc || '';
  document.getElementById('prestamo-monto').value = prestamo.montoTotal || '';
  document.getElementById('prestamo-abonado').value = prestamo.montoPagado || 0;
  document.getElementById('prestamo-fecha').value = prestamo.fecha || '';
  document.getElementById('prestamo-vencimiento').value = prestamo.vencimiento || '';
  document.getElementById('prestamo-notas').value = prestamo.notas || '';
  showOverlay('overlay-prestamo');
}

function closePrestamoModal() {
  hideOverlay('overlay-prestamo');
  runtime.editingPrestamoId = null;
}

function openAbonoModal(id) {
  runtime.abonoPrestamoId = id;
  runtime.editingAbonoRef = null;
  const prestamo = state.prestamos.find(item => item.id === id);
  if (!prestamo) return;

  document.getElementById('abono-mh').textContent = 'Registrar abono';
  document.getElementById('abono-save-btn').textContent = 'Registrar ✓';
  document.getElementById('abono-title').textContent = `Registrar abono - ${prestamo.persona}`;
  document.getElementById('abono-monto').value = '';
  fillMonthOptions('abono-month');
  document.getElementById('abono-month').value = runtime.curM;
  document.getElementById('abono-impacto').value = 'ninguno';
  document.getElementById('abono-nota').value = '';
  showOverlay('overlay-abono');
}

function openEditAbono(prestamoId, historialId) {
  const prestamo = state.prestamos.find(item => item.id === prestamoId);
  const historial = prestamo?.historial.find(item => item.id === historialId);
  if (!prestamo || !historial) return;

  runtime.abonoPrestamoId = prestamoId;
  runtime.editingAbonoRef = { prestamoId, historialId };
  document.getElementById('abono-mh').textContent = 'Editar abono';
  document.getElementById('abono-save-btn').textContent = 'Actualizar ✓';
  document.getElementById('abono-title').textContent = `Editar abono - ${prestamo.persona}`;
  document.getElementById('abono-monto').value = historial.monto || '';
  fillMonthOptions('abono-month');
  document.getElementById('abono-month').value = historial.mes;
  document.getElementById('abono-impacto').value = historial.impacto || 'ninguno';
  document.getElementById('abono-nota').value = historial.nota || '';
  showOverlay('overlay-abono');
}

function closeAbonoModal() {
  hideOverlay('overlay-abono');
  runtime.abonoPrestamoId = null;
  runtime.editingAbonoRef = null;
  document.getElementById('abono-mh').textContent = 'Registrar abono';
  document.getElementById('abono-save-btn').textContent = 'Registrar ✓';
}

function renderPrestamos() {
  const cuotasLista = document.getElementById('qlist');
  if (cuotasLista) {
    const items = active().filter(gasto => gasto.tipo === 'cuotas');
    cuotasLista.innerHTML = items.length ? items.map(gasto => {
      const style = cs(gasto.cat);
      const done = Math.max(Math.min(gasto.cuotaAct - 1, gasto.cuotas), 0);
      const pct = gasto.cuotas > 0 ? ((done / gasto.cuotas) * 100).toFixed(0) : 0;
      const faltan = Math.max(gasto.cuotas - gasto.cuotaAct + 1, 0);
      return `
        <div class="group mb-3 overflow-hidden rounded-[16px] border border-[#eadfca] bg-gradient-to-br from-white to-[#fefcfa] px-5 py-4 shadow-soft transition hover:shadow-md hover:-translate-y-0.5">
          <div class="mb-2 flex items-start justify-between gap-3">
            <div class="flex items-center gap-2">
              <svg class="h-4 w-4 text-[#b7791f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
              </svg>
              <div>
                <div class="font-heading text-[14px] font-bold text-text1">${gasto.desc}</div>
                <div class="mt-1">
                  <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style="background:${style.bg};color:${style.tx}">
                    <span class="h-1 w-1 rounded-full" style="background:${style.bar}"></span>${gasto.cat}
                  </span>
                </div>
              </div>
            </div>
            <div class="shrink-0 text-right">
              <div class="font-heading text-[16px] font-bold text-[#b7791f]">${fmt(gasto.monto)}<span class="text-xs font-normal text-text3">/mes</span></div>
              <div class="text-[10px] text-text3">Cuota ${gasto.cuotaAct} de ${gasto.cuotas}</div>
            </div>
          </div>
          <div class="my-1.5 h-2 overflow-hidden rounded-full bg-appbg2">
            <div class="h-full rounded-full transition-all duration-500" style="width:${pct}%;background:${style.bar}"></div>
          </div>
          <div class="mb-2 flex justify-between text-[10px] text-text3">
            <span>Pagado: ${fmt(gasto.monto * done)}</span>
            <span>${pct}% completado</span>
            <span>Falta: ${fmt(gasto.monto * Math.max(gasto.cuotas - done, 0))}</span>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-xs text-text2">Faltan <strong class="text-text1">${faltan} cuotas</strong> · Dia <strong class="text-text1">${gasto.dia}</strong></div>
            <div class="flex items-center gap-1.5">
              <button class="rounded-[6px] border border-accent bg-accent px-2 py-0.5 text-[10px] font-heading font-bold text-white transition hover:-translate-y-0.5 hover:brightness-95" onclick="registerCuota(${gasto.id})">Registrar</button>
              <button class="rounded-[7px] border border-borderc bg-white px-2.5 py-1 text-[11px] font-heading font-bold transition ${gasto.cuotaAct > 1 ? 'text-text2 hover:border-red1 hover:text-red1' : 'cursor-not-allowed text-text3 opacity-60'}" onclick="undoCuota(${gasto.id})" ${gasto.cuotaAct > 1 ? '' : 'disabled'}>Deshacer</button>
            </div>
          </div>
        </div>
      `;
    }).join('') : '<div class="p-4 text-center text-text3"><div class="text-sm">No hay cuotas activas.</div><div class="mt-2 text-xs text-text3">Agrega una cuota para empezar a financiar tus compras.</div></div>';
  }

  function renderPrestamoList(items, targetId, emptyText) {
    const container = document.getElementById(targetId);
    if (!container) return;

    if (!items.length) {
      container.innerHTML = `<div class="px-6 py-8 text-center text-text3"><div class="text-sm font-medium">${emptyText}</div><div class="mt-1 text-xs text-text3">Agrega un prestamo para empezar a controlar tus finanzas.</div></div>`;
      return;
    }

    container.innerHTML = items.map(prestamo => {
      const saldo = prestamoSaldo(prestamo);
      const abonado = prestamo.montoPagado || 0;
      const pct = prestamo.montoTotal > 0 ? Math.min((abonado / prestamo.montoTotal) * 100, 100).toFixed(0) : 0;
      const estado = prestamoEstado(prestamo);
      const amountColor = prestamo.tipo === 'por_cobrar' ? 'text-bluetx' : 'text-[#b7791f]';
      const progressColor = prestamo.tipo === 'por_cobrar' ? '#3f6fd8' : '#d29a2f';
      const badgeClass = estado === 'pagado' ? 'bg-greenbg text-greentx' : estado === 'parcial' ? 'bg-bluebg text-bluetx' : 'bg-appbg text-text2';
      const cardBorder = prestamo.tipo === 'por_cobrar' ? 'border-[#dbe5f3] shadow-[0_8px_20px_rgba(63,111,216,0.12)]' : 'border-[#eadfca] shadow-[0_8px_20px_rgba(210,154,47,0.12)]';
      const cardAccent = prestamo.tipo === 'por_cobrar' ? 'bg-[linear-gradient(180deg,#3f6fd8_0%,#7ea0ea_100%)]' : 'bg-[linear-gradient(180deg,#d29a2f_0%,#e8be67_100%)]';
      const remainingPct = 100 - pct;
      const remainingColor = prestamo.tipo === 'por_cobrar' ? '#dbeafe' : '#fef3c7';
      const progressBarHtml = `<div class="mb-2 h-2.5 overflow-hidden rounded-full bg-appbg2 relative"><div class="absolute inset-0 rounded-full opacity-30" style="background: repeating-linear-gradient(45deg, transparent, transparent 3px, ${remainingColor} 3px, ${remainingColor} 6px)"></div><div class="relative h-full rounded-full transition-all duration-500" style="width:${pct}%;background:${progressColor}"></div></div>`;
      const historial = (prestamo.historial || []).slice().reverse().slice(0, 5);
      const historialHtml = historial.length
        ? `<div class="mt-3 rounded-[12px] border border-borderc bg-appbg/70 p-2.5"><div class="mb-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-text3">Ultimos abonos</div><div class="space-y-1.5">${historial.map(item => `<div class="rounded-[10px] bg-white px-2.5 py-1.5"><div class="flex items-start justify-between gap-2 text-[11px]"><div class="min-w-0 flex-1"><div class="font-semibold text-text1">${new Date(item.fecha).toLocaleDateString('es-PE')}</div><div class="text-text3">${MS[item.mes] || '-'} · ${item.impacto === 'mes' ? 'impacta mes' : 'solo control'}${item.nota ? ` · ${item.nota}` : ''}</div></div><div class="flex items-center gap-1.5"><div class="whitespace-nowrap font-heading font-bold ${prestamo.tipo === 'por_cobrar' ? 'text-greentx' : 'text-red1'}">${fmt(item.monto)}</div><button class="rounded-md border-0 bg-transparent px-1 py-0.5 text-[12px] leading-none text-text3 transition hover:bg-bluebg hover:text-accent" onclick="openEditAbono(${prestamo.id},${item.id})">&#9998;</button><button class="rounded-md border-0 bg-transparent px-1 py-0.5 text-[14px] leading-none text-text3 transition hover:bg-redbg hover:text-red1" onclick="removeAbono(${prestamo.id},${item.id})">&#10005;</button></div></div></div>`).join('')}</div></div>`
        : '<div class="mt-3 rounded-[12px] border border-dashed border-borderc bg-appbg/40 px-2.5 py-1.5 text-[11px] text-text3">Aun no hay abonos registrados.</div>';

      return `<div class="group mb-3 overflow-hidden rounded-[16px] border bg-white ${cardBorder} transition hover:shadow-lg hover:-translate-y-0.5"><div class="flex"><div class="w-1.5 shrink-0 ${cardAccent}"></div><div class="flex-1 px-4 py-3"><div class="mb-2.5 flex items-start justify-between gap-3"><div class="min-w-0"><div class="truncate font-heading text-[14px] font-bold text-text1">${prestamo.persona}</div><div class="text-[12px] text-text2">${prestamo.desc}</div></div><div class="shrink-0 text-right"><div class="font-heading text-[14px] font-bold ${amountColor}">${fmt(saldo)}</div><div class="mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-bold ${badgeClass}">${estado}</div></div></div><div class="rounded-[12px] border border-borderc bg-appbg/45 px-2.5 py-2">${progressBarHtml}<div class="mb-2 flex justify-between text-[10px] text-text3"><span>Total: ${fmt(prestamo.montoTotal)}</span><span>${pct}% abonado</span><span class="text-text2">Falta: ${fmt(prestamo.montoTotal - abonado)} (${remainingPct}%)</span></div><div class="grid grid-cols-2 gap-1.5 text-[11px] text-text2"><div>Fecha: <strong class="text-text1">${prestamo.fecha || '-'}</strong></div><div>Vence: <strong class="text-text1">${prestamo.vencimiento || '-'}</strong></div></div></div><div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-appbg2 pt-2.5"><div class="max-w-[55%] text-[11px] text-text3">${prestamo.notas || 'Sin notas'}</div><div class="flex flex-wrap items-center gap-1.5"><button class="rounded-[6px] border border-borderc bg-white px-2 py-0.5 text-[10px] font-heading font-bold text-text2 transition hover:border-accent hover:text-accent" onclick="openAbonoModal(${prestamo.id})">Abono</button><button class="rounded-[6px] border border-borderc bg-white px-2 py-0.5 text-[10px] font-heading font-bold text-text2 transition hover:border-accent hover:text-accent" onclick="editPrestamo(${prestamo.id})">Editar</button><button class="rounded-[6px] border border-borderc bg-white px-2 py-0.5 text-[10px] font-heading font-bold text-text2 transition hover:border-red1 hover:text-red1" onclick="delPrestamo(${prestamo.id})">Eliminar</button></div></div>${historialHtml}</div></div></div>`;
    }).join('');
  }

  renderPrestamoList(state.prestamos.filter(item => item.tipo === 'por_cobrar'), 'prestamos-lista-cobrar', 'No tienes prestamos por cobrar.');
  renderPrestamoList(state.prestamos.filter(item => item.tipo === 'por_pagar'), 'prestamos-lista-pagar', 'No tienes prestamos por pagar.');
}

function renderCompromisosResumen() {
  const cuotaTotal = active().filter(gasto => gasto.tipo === 'cuotas').reduce((sum, gasto) => sum + gasto.monto, 0);
  const cobrarTotal = state.prestamos.filter(prestamo => prestamo.tipo === 'por_cobrar').reduce((sum, prestamo) => sum + prestamoSaldo(prestamo), 0);
  const pagarTotal = state.prestamos.filter(prestamo => prestamo.tipo === 'por_pagar').reduce((sum, prestamo) => sum + prestamoSaldo(prestamo), 0);

  const cuotasEl = document.getElementById('compromisos-cuotas-total');
  const cobrarEl = document.getElementById('prestamos-cobrar');
  const pagarEl = document.getElementById('prestamos-pagar');
  if (cuotasEl) cuotasEl.textContent = fmt(cuotaTotal);
  if (cobrarEl) cobrarEl.textContent = fmt(cobrarTotal);
  if (pagarEl) pagarEl.textContent = fmt(pagarTotal);
}

async function savePrestamo() {
  const currentUser = requireCurrentUser();
  if (!currentUser) return;

  const tipo = document.getElementById('prestamo-tipo').value;
  const persona = document.getElementById('prestamo-persona').value.trim();
  const desc = document.getElementById('prestamo-desc').value.trim();
  const montoTotal = parseFloat(document.getElementById('prestamo-monto').value);
  const montoPagado = parseFloat(document.getElementById('prestamo-abonado').value) || 0;
  const fecha = document.getElementById('prestamo-fecha').value;
  const vencimiento = document.getElementById('prestamo-vencimiento').value;
  const notas = document.getElementById('prestamo-notas').value.trim();

  if (!persona || !desc || !montoTotal || montoTotal <= 0) {
    alert('Datos invalidos');
    return;
  }
  if (montoPagado < 0 || montoPagado > montoTotal) {
    alert('Abonado inicial no valido');
    return;
  }

  const payload = {
    user_id: currentUser.id,
    tipo,
    persona,
    descripcion: desc,
    monto_total: montoTotal,
    monto_pagado: montoPagado,
    fecha: fecha || null,
    vencimiento: vencimiento || null,
    notas: notas || null,
  };

  let error;
  const isEditing = runtime.editingPrestamoId !== null;
  await runWithLoading(isEditing ? 'Actualizando prestamo...' : 'Guardando prestamo...', async () => {
    if (isEditing) {
      ({ error } = await app.supabaseClient.from('prestamos').update(payload).eq('id', runtime.editingPrestamoId));
    } else {
      ({ error } = await app.supabaseClient.from('prestamos').insert(payload));
    }
    if (error) {
      alert(error.message);
      return;
    }

    await app.actions.refreshAppData?.();
  });

  if (error) {
    return;
  }

  closePrestamoModal();
  toast(runtime.editingPrestamoId ? 'Prestamo actualizado' : 'Prestamo agregado');
  runtime.editingPrestamoId = null;
}

async function delPrestamo(id) {
  if (!runtime.currentUser) return;
  if (!confirm('¿Eliminar este prestamo y todos sus abonos?')) return;
  let error;
  await runWithLoading('Eliminando prestamo...', async () => {
    ({ error } = await app.supabaseClient.from('prestamos').delete().eq('id', id));
    if (error) {
      alert(error.message);
      return;
    }

    await app.actions.refreshAppData?.();
  });

  if (error) {
    return;
  }

  toast('Prestamo eliminado');
}

async function syncAbonoImpact(prestamo, monto, mes, abonoId) {
  if (prestamo.tipo === 'por_pagar') {
    const { data, error } = await app.supabaseClient.from('gastos').insert({
      user_id: runtime.currentUser.id,
      descripcion: `Abono prestamo - ${prestamo.persona}`,
      categoria: 'Personal',
      dia_pago: 15,
      tipo: 'unico',
      monto,
      mes,
      anio: runtime.curY,
      origen_mes: mes,
      origen_anio: runtime.curY,
      cuota_actual: 1,
      total_cuotas: 0,
    }).select('id').single();

    if (!error && data) {
      await app.supabaseClient.from('abonos_prestamos').update({ linked_type: 'gasto', linked_id: data.id }).eq('id', abonoId);
    }
    return;
  }

  const { data, error } = await app.supabaseClient.from('ingresos_extra').insert({
    user_id: runtime.currentUser.id,
    descripcion: `Devolucion prestamo - ${prestamo.persona}`,
    monto,
    mes,
    anio: runtime.curY,
  }).select('id').single();

  if (!error && data) {
    await app.supabaseClient.from('abonos_prestamos').update({ linked_type: 'ingreso', linked_id: data.id }).eq('id', abonoId);
  }
}

async function removeLinkedAbonoImpact(historial) {
  if (historial.linkedType === 'gasto' && historial.linkedId) {
    await app.supabaseClient.from('gastos').delete().eq('id', historial.linkedId);
  } else if (historial.linkedType === 'ingreso' && historial.linkedId) {
    await app.supabaseClient.from('ingresos_extra').delete().eq('id', historial.linkedId);
  }
}

async function saveAbono() {
  if (!runtime.currentUser) {
    alert('Primero inicia sesion.');
    return;
  }
  if (runtime.editingAbonoRef) {
    await saveAbonoEdit();
    return;
  }

  const prestamo = state.prestamos.find(item => item.id === runtime.abonoPrestamoId);
  if (!prestamo) return;

  const monto = parseFloat(document.getElementById('abono-monto').value);
  const mes = parseInt(document.getElementById('abono-month').value, 10);
  const impacto = document.getElementById('abono-impacto').value;
  const nota = document.getElementById('abono-nota').value.trim();
  const saldo = prestamoSaldo(prestamo);
  if (!monto || monto <= 0 || monto > saldo) {
    alert('Monto invalido');
    return;
  }

  let abonoError;
  let updateError;
  await runWithLoading('Registrando abono...', async () => {
    const { data: abonoData, error } = await app.supabaseClient.from('abonos_prestamos').insert({
      user_id: runtime.currentUser.id,
      prestamo_id: prestamo.id,
      fecha: new Date().toISOString().slice(0, 10),
      mes,
      monto,
      impacto,
      nota,
      linked_type: null,
      linked_id: null,
    }).select('id').single();

    abonoError = error;
    if (abonoError) {
      alert(abonoError.message);
      return;
    }

    const nuevoPagado = (prestamo.montoPagado || 0) + monto;
    ({ error: updateError } = await app.supabaseClient.from('prestamos').update({ monto_pagado: nuevoPagado }).eq('id', prestamo.id));
    if (updateError) {
      alert(updateError.message);
      return;
    }

    if (impacto === 'mes') {
      await syncAbonoImpact(prestamo, monto, mes, abonoData.id);
    }

    await app.actions.refreshAppData?.();
  });

  if (abonoError || updateError) {
    return;
  }

  closeAbonoModal();
  toast('Abono registrado');
}

async function saveAbonoEdit() {
  if (!runtime.editingAbonoRef) return;

  const prestamo = state.prestamos.find(item => item.id === runtime.editingAbonoRef.prestamoId);
  const historial = prestamo?.historial.find(item => item.id === runtime.editingAbonoRef.historialId);
  if (!prestamo || !historial) return;

  const monto = parseFloat(document.getElementById('abono-monto').value);
  const mes = parseInt(document.getElementById('abono-month').value, 10);
  const impacto = document.getElementById('abono-impacto').value;
  const nota = document.getElementById('abono-nota').value.trim();
  const saldoSinEste = Math.max((prestamo.montoTotal || 0) - ((prestamo.montoPagado || 0) - (historial.monto || 0)), 0);
  if (!monto || monto <= 0 || monto > saldoSinEste) {
    alert('Monto invalido');
    return;
  }

  let abonoError;
  let updateError;
  await runWithLoading('Actualizando abono...', async () => {
    await removeLinkedAbonoImpact(historial);

    ({ error: abonoError } = await app.supabaseClient.from('abonos_prestamos').update({
      monto,
      mes,
      impacto,
      nota,
      linked_type: null,
      linked_id: null,
    }).eq('id', historial.id));

    if (abonoError) {
      alert(abonoError.message);
      return;
    }

    const nuevoPagado = (prestamo.montoPagado || 0) - (historial.monto || 0) + monto;
    ({ error: updateError } = await app.supabaseClient.from('prestamos').update({ monto_pagado: nuevoPagado }).eq('id', prestamo.id));
    if (updateError) {
      alert(updateError.message);
      return;
    }

    if (impacto === 'mes') {
      await syncAbonoImpact(prestamo, monto, mes, historial.id);
    }

    await app.actions.refreshAppData?.();
  });

  if (abonoError || updateError) {
    return;
  }

  closeAbonoModal();
  toast('Abono actualizado');
}

async function removeAbono(prestamoId, historialId) {
  if (!runtime.currentUser) return;
  const prestamo = state.prestamos.find(item => item.id === prestamoId);
  const historial = prestamo?.historial.find(item => item.id === historialId);
  if (!prestamo || !historial) return;
  if (!confirm('¿Eliminar este abono?')) return;

  let deleteError;
  let updateError;
  await runWithLoading('Eliminando abono...', async () => {
    await removeLinkedAbonoImpact(historial);
    ({ error: deleteError } = await app.supabaseClient.from('abonos_prestamos').delete().eq('id', historialId));
    if (deleteError) {
      alert(deleteError.message);
      return;
    }

    const nuevoPagado = Math.max((prestamo.montoPagado || 0) - (historial.monto || 0), 0);
    ({ error: updateError } = await app.supabaseClient.from('prestamos').update({ monto_pagado: nuevoPagado }).eq('id', prestamoId));
    if (updateError) {
      alert(updateError.message);
      return;
    }

    await app.actions.refreshAppData?.();
  });

  if (deleteError || updateError) {
    return;
  }

  toast('Abono eliminado');
}

app.actions.renderCompromisosResumen = renderCompromisosResumen;
app.actions.renderGastos = renderGastos;
app.actions.renderPrestamos = renderPrestamos;

Object.assign(window, {
  carrySelectedExpenses,
  clearCarrySelection,
  closeAbonoModal,
  closeCarryModal,
  closeModal,
  closePrestamoModal,
  delG,
  delPrestamo,
  editG,
  editPrestamo,
  markCarryByMode,
  openAbonoModal,
  openCarryModal,
  openEditAbono,
  openModal,
  openPrestamoModal,
  registerCuota,
  removeAbono,
  renderGastos,
  saveAbono,
  saveG,
  savePrestamo,
  setGastosSort,
  toggleCarryItem,
  toggleGastoPago,
  toggleQ,
  undoCuota,
  updateCarrySummary,
});
