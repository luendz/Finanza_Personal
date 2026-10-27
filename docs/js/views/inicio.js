import {
  active,
  app,
  cs,
  fillMonthOptions,
  fmt,
  gastoCuotaLabel,
  gastoPaymentStatus,
  hideOverlay,
  MS,
  requireCurrentUser,
  runtime,
  runWithLoading,
  showOverlay,
  state,
  toast,
} from '../core.js';
import { getEmailReminderSettings, getSueldoForPeriod, saveEmailReminderSettings, saveSueldo } from '../data.js';

function extrasDelMes() {
  return (state.ingresosExtra || []).filter(item => Number(item.mes) === runtime.curM && Number(item.anio || runtime.curY) === runtime.curY);
}

function periodoRelativo(offset = 0) {
  const baseDate = new Date(runtime.curY, runtime.curM + offset, 1);
  return { month: baseDate.getMonth(), year: baseDate.getFullYear() };
}

function extrasDelPeriodo(month, year) {
  return (state.ingresosExtra || []).reduce((sum, item) => {
    const itemMonth = Number(item.mes);
    const itemYear = Number(item.anio ?? year);
    return itemMonth === month && itemYear === year ? sum + Number(item.monto || 0) : sum;
  }, 0);
}

function gastosActivosDelPeriodo(month, year) {
  return (state.gastos || []).filter(gasto => {
    const gastoMonth = Number(gasto.mes);
    const gastoYear = typeof gasto.anio === 'number' ? gasto.anio : year;
    if (gasto.tipo === 'cuotas') {
      return gasto.cuotaAct <= gasto.cuotas && (gastoYear < year || (gastoYear === year && gastoMonth <= month));
    }
    return gastoYear === year && gastoMonth === month;
  });
}

function resumenDelPeriodo(month, year) {
  const sueldoBase = getSueldoForPeriod(month, year);
  const extras = extrasDelPeriodo(month, year);
  const gastos = gastosActivosDelPeriodo(month, year).reduce((sum, gasto) => sum + Number(gasto.monto || 0), 0);
  const ingresos = sueldoBase + extras;
  return {
    sueldoBase,
    extras,
    gastos,
    ingresos,
    saldo: ingresos - gastos,
  };
}

function sortPreviewItems(items) {
  const priority = { vencido: 0, pendiente: 1, pagado: 2 };
  return items.slice().sort((left, right) => {
    const leftStatus = gastoPaymentStatus(left);
    const rightStatus = gastoPaymentStatus(right);
    if (priority[leftStatus.key] !== priority[rightStatus.key]) {
      return priority[leftStatus.key] - priority[rightStatus.key];
    }
    if (left.dia !== right.dia) {
      return Number(left.dia || 0) - Number(right.dia || 0);
    }
    return Number(right.monto || 0) - Number(left.monto || 0);
  });
}

function renderInicioPreview(items) {
  const list = document.getElementById('inicio-preview-list');
  const caption = document.getElementById('inicio-preview-caption');
  if (!list || !caption) return;

  if (!items.length) {
    caption.textContent = 'Todavia no tienes gastos activos este mes.';
    list.innerHTML = `
      <div class="rounded-[18px] border border-dashed border-borderc bg-appbg px-4 py-5 text-center">
        <div class="font-heading text-[16px] font-bold text-text1">Mes en blanco</div>
        <div class="mt-2 text-[13px] leading-6 text-text2">Empieza agregando tus gastos fijos para que el resumen tenga una base clara.</div>
      </div>
    `;
    return;
  }

  const orderedItems = sortPreviewItems(items);
  const visibleItems = orderedItems.slice(0, 5);
  const pendingCount = orderedItems.filter(item => gastoPaymentStatus(item).key !== 'pagado').length;
  caption.textContent = `${pendingCount} por revisar · ${items.length} gasto(s) activos`;

  list.innerHTML = visibleItems.map(item => {
    const status = gastoPaymentStatus(item);
    const badgeClass = status.key === 'pagado'
      ? 'border-[#d8ead8] bg-[#f5fbf5] text-green1'
      : status.key === 'vencido'
        ? 'border-[#f1d3d3] bg-[#fff5f5] text-red1'
        : 'border-[#eadfca] bg-[#fffaf1] text-[#b7791f]';
    const detail = item.tipo === 'cuotas' ? gastoCuotaLabel(item) : `Pago dia ${item.dia}`;

    return `
      <div class="rounded-[18px] border border-borderc bg-appbg/45 px-4 py-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate font-semibold text-text1">${item.desc}</div>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text3">
              <span>${item.cat}</span>
              <span>${detail}</span>
            </div>
          </div>
          <div class="text-right">
            <div class="font-heading text-[18px] font-bold text-text1">${fmt(item.monto)}</div>
            <div class="mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass}">${status.label}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openInicioGastosDetalle() {
  const mainList = document.getElementById('inicio-gastos-principal') || document.getElementById('glist');
  if (!mainList) return;
  mainList.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function drawDonut(sorted, total) {
  const canvas = document.getElementById('donut');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 15;
  const innerRadius = radius * 0.55;

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
  ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  const centerTotal = document.getElementById('donut-total');
  if (centerTotal) centerTotal.textContent = fmt(total);

  const legend = document.getElementById('dlegend');
  if (!legend) return;
  if (!sorted.length) {
    legend.innerHTML = `
      <div class="rounded-[12px] border border-dashed border-borderc bg-appbg px-3 py-3 text-center">
        <div class="font-heading text-[12px] font-bold text-text1">Sin categorías por mostrar</div>
        <div class="mt-1 text-[10px] leading-4 text-text2">Registra un gasto para ver su distribución.</div>
      </div>
    `;
    return;
  }

  legend.innerHTML = sorted.map(([cat, value]) => {
    const palette = cs(cat);
    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

    return `
      <div class="min-w-0 rounded-[9px] border border-borderc bg-[#f8fbff] px-2 py-1.5">
        <div class="flex min-w-0 items-center gap-1.5 text-[10px]">
          <span class="h-2 w-2 shrink-0 rounded-full" style="background:${palette.bar}"></span>
          <span class="truncate font-semibold text-text1" title="${cat}">${cat}</span>
        </div>
        <div class="mt-0.5 flex items-center justify-between gap-1.5 text-[9px] leading-none">
          <span class="font-bold text-text3">${percentage}%</span>
          <span class="truncate font-semibold text-text1">${fmt(value)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Lima';
  } catch (error) {
    return 'America/Lima';
  }
}

function formatReminderHour(hour) {
  return `${String(Math.min(23, Math.max(0, Number(hour) || 0))).padStart(2, '0')}:00`;
}

function formatReminderLastSent(dateStr) {
  if (!dateStr) return 'Aún no se ha enviado ningún correo.';
  const [year, month, day] = String(dateStr).split('-').map(Number);
  if (!year || !month || !day) return `Último envío: ${dateStr}`;
  return `Último envío: ${new Date(year, month - 1, day).toLocaleDateString('es-PE')}`;
}

function ensureReminderHourOptions(selectedHour = 7) {
  const hourSelect = document.getElementById('email-reminder-send-hour');
  if (!hourSelect) return;
  hourSelect.innerHTML = Array.from({ length: 24 }, (_, hour) => (
    `<option value="${hour}" ${hour === selectedHour ? 'selected' : ''}>${formatReminderHour(hour)}</option>`
  )).join('');
}

function validateReminderEmail(email) {
  if (!email) return 'Ingresa un correo de destino.';
  if (!/^\S+@\S+\.\S+$/.test(email)) return 'Ingresa un correo válido para las alertas.';
  return null;
}

function getReminderFormValues() {
  const fallbackEmail = runtime.currentUser?.email || '';
  const timezone = document.getElementById('email-reminder-timezone')?.textContent?.trim() || getBrowserTimeZone();
  return {
    activo: document.getElementById('email-reminder-enabled')?.checked || false,
    emailDestino: (document.getElementById('email-reminder-email')?.value || fallbackEmail).trim(),
    diasAdelanto: parseInt(document.getElementById('email-reminder-days-ahead')?.value || '2', 10) || 0,
    horaEnvio: parseInt(document.getElementById('email-reminder-send-hour')?.value || '7', 10) || 7,
    timezone,
  };
}

function renderEmailReminderSummary() {
  const chip = document.getElementById('email-reminder-chip');
  const trigger = document.getElementById('email-reminder-trigger');
  if (!chip) return;

  if (!runtime.currentUser) {
    chip.className = 'inline-flex items-center rounded-full border border-borderc bg-appbg px-2 py-0.5 text-[10px] font-bold text-text3';
    chip.textContent = 'Sin sesión';
    if (trigger) {
      trigger.title = 'Inicia sesión para configurar las alertas por correo';
      trigger.setAttribute('aria-label', trigger.title);
    }
    return;
  }

  const settings = getEmailReminderSettings();
  const daysCopy = settings.diasAdelanto > 0
    ? `vencidos y próximos ${settings.diasAdelanto} día(s)`
    : 'vencidos del día';

  if (settings.activo) {
    chip.className = 'inline-flex items-center rounded-full border border-[#d8ead8] bg-[#f5fbf5] px-2 py-0.5 text-[10px] font-bold text-green1';
    chip.textContent = 'Activo';
    if (trigger) {
      trigger.title = `${settings.emailDestino || runtime.currentUser.email} · ${daysCopy} · ${formatReminderHour(settings.horaEnvio)} (${settings.timezone})`;
      trigger.setAttribute('aria-label', `Alertas activas. ${trigger.title}. Abrir configuración`);
    }
    return;
  }

  chip.className = 'inline-flex items-center rounded-full border border-borderc bg-appbg px-2 py-0.5 text-[10px] font-bold text-text3';
  chip.textContent = 'Inactivo';
  if (trigger) {
    trigger.title = 'Alertas desactivadas. Abrir configuración';
    trigger.setAttribute('aria-label', trigger.title);
  }
}

function renderEmailReminderModalStatus(settings) {
  const status = document.getElementById('email-reminder-modal-status');
  const timezoneEl = document.getElementById('email-reminder-timezone');
  const lastSent = document.getElementById('email-reminder-last-sent');
  const lastError = document.getElementById('email-reminder-last-error');
  if (status) {
    status.textContent = settings.activo
      ? `Activo: 1 correo diario a las ${formatReminderHour(settings.horaEnvio)} para ${settings.emailDestino || runtime.currentUser?.email || 'tu correo'}.`
      : 'Configuración desactivada.';
  }
  if (timezoneEl) timezoneEl.textContent = settings.timezone || getBrowserTimeZone();
  if (lastSent) lastSent.textContent = formatReminderLastSent(settings.ultimoEnvioFecha);
  if (lastError) {
    if (settings.ultimoError) {
      lastError.textContent = `Último error: ${settings.ultimoError}`;
      lastError.classList.remove('hidden');
    } else {
      lastError.textContent = '';
      lastError.classList.add('hidden');
    }
  }
}

function syncEmailReminderModalFromState() {
  const settings = getEmailReminderSettings();
  const emailInput = document.getElementById('email-reminder-email');
  const enabledInput = document.getElementById('email-reminder-enabled');
  const daysAheadSelect = document.getElementById('email-reminder-days-ahead');
  if (enabledInput) enabledInput.checked = settings.activo;
  if (emailInput) emailInput.value = settings.emailDestino || runtime.currentUser?.email || '';
  if (daysAheadSelect) daysAheadSelect.value = String(settings.diasAdelanto);
  ensureReminderHourOptions(settings.horaEnvio);
  renderEmailReminderModalStatus(settings);
}

function syncEmailReminderDraftState() {
  const baseSettings = getEmailReminderSettings();
  renderEmailReminderModalStatus({
    ...baseSettings,
    ...getReminderFormValues(),
  });
}

function updateInicio() {
  const resumenActual = resumenDelPeriodo(runtime.curM, runtime.curY);
  const sueldoBase = resumenActual.sueldoBase;
  const extras = resumenActual.extras;
  const ingresos = resumenActual.ingresos;
  const gastos = resumenActual.gastos;
  const resta = resumenActual.saldo;
  const pct = ingresos > 0 ? (gastos / ingresos) * 100 : 0;
  const items = active();
  const overdueItems = items.filter(gasto => gastoPaymentStatus(gasto).key === 'vencido');
  const overdueTotal = overdueItems.reduce((sum, gasto) => sum + Number(gasto.monto || 0), 0);
  const remainingPct = ingresos > 0 ? Math.max((resta / ingresos) * 100, 0) : 0;
  const periodoAnterior = periodoRelativo(-1);
  const arrastreAnterior = resumenDelPeriodo(periodoAnterior.month, periodoAnterior.year);

  const inicioSub = document.getElementById('inicio-sub');
  if (!inicioSub) return;

  inicioSub.textContent = `– ${MS[runtime.curM]} ${runtime.curY}`;
  const sueldoCardSub = document.getElementById('sueldo-card-sub');
  if (sueldoCardSub) sueldoCardSub.textContent = `Monto fijo de ${MS[runtime.curM]} ${runtime.curY}`;
  const sueldoDisplay = document.getElementById('sueldo-display');
  if (sueldoDisplay) sueldoDisplay.textContent = fmt(sueldoBase);
  document.getElementById('cextra').textContent = fmt(extras);
  document.getElementById('cextrasub').textContent = `${extrasDelMes().length} ingreso(s) extra este mes`;
  document.getElementById('cing').textContent = fmt(ingresos);
  document.getElementById('month-expenses-total').textContent = fmt(gastos);
  document.getElementById('month-expenses-count').textContent = `${items.length} gasto${items.length === 1 ? '' : 's'}`;
  document.getElementById('month-expenses-overdue').textContent = fmt(overdueTotal);
  document.getElementById('month-expenses-overdue').title = `${overdueItems.length} gasto${overdueItems.length === 1 ? '' : 's'} vencido${overdueItems.length === 1 ? '' : 's'}`;
  document.getElementById('remaining-percent').textContent = resta >= 0
    ? `${remainingPct.toFixed(0)}% de tus ingresos`
    : 'Superaste tus ingresos';
  document.getElementById('cr').textContent = fmt(Math.abs(resta));

  const rcard = document.getElementById('rcard');
  const crValue = document.getElementById('cr');
  if (resta >= 0) {
    crValue.className = 'whitespace-nowrap font-heading text-[25px] font-bold leading-none text-bluetx';
    document.getElementById('ricon-wrap').textContent = 'Te queda este mes';
    document.getElementById('crsub').textContent = 'disponible';
    rcard.className = 'h-full rounded-app border border-[#d8e4fb] bg-gradient-to-br from-bluebg via-white to-white px-4 py-3 shadow-soft ring-1 ring-[#dde8fb]';
  } else {
    crValue.className = 'whitespace-nowrap font-heading text-[25px] font-bold leading-none text-red1';
    document.getElementById('ricon-wrap').textContent = 'Exceso este mes';
    document.getElementById('crsub').textContent = 'te pasaste';
    rcard.className = 'h-full rounded-app border border-[#f4d6d6] bg-gradient-to-br from-redbg via-white to-white px-4 py-3 shadow-soft ring-1 ring-[#f8e1e1]';
  }

  const progressFill = document.getElementById('pfill');
  progressFill.style.width = `${Math.min(pct, 100).toFixed(1)}%`;
  progressFill.className = `h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-red1' : pct >= 80 ? 'bg-[#e8b84b]' : 'bg-green1'}`;

  document.getElementById('ppct').textContent = `${pct.toFixed(0)}%`;

  const carryPrevLabel = document.getElementById('carry-prev-label');
  const carryPrevSub = document.getElementById('carry-prev-sub');
  const carryPrevAmount = document.getElementById('carry-prev-amount');
  if (carryPrevLabel && carryPrevSub && carryPrevAmount) {
    const saldoAnterior = arrastreAnterior.saldo;
    const saldoAnteriorPositivo = saldoAnterior >= 0;
    carryPrevLabel.textContent = saldoAnteriorPositivo
      ? `Arrastre de ${MS[periodoAnterior.month]}`
      : `Saldo pendiente de ${MS[periodoAnterior.month]}`;
    carryPrevSub.textContent = saldoAnteriorPositivo
      ? `${periodoAnterior.year} ${MS[periodoAnterior.month]} - saldo final del mes pasado`
      : `${periodoAnterior.year} ${MS[periodoAnterior.month]} - cierre en negativo del mes pasado`;
    carryPrevAmount.className = `shrink-0 whitespace-nowrap font-heading text-[17px] font-bold ${saldoAnteriorPositivo ? 'text-bluetx' : 'text-red1'}`;
    carryPrevAmount.textContent = fmt(saldoAnterior);
  }

  const byCategory = {};
  items.forEach(gasto => {
    byCategory[gasto.cat] = (byCategory[gasto.cat] || 0) + gasto.monto;
  });
  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const focusCopy = document.getElementById('inicio-focus-copy');
  if (focusCopy) {
    if (!items.length) {
      focusCopy.textContent = 'Empieza registrando tus pagos mas fijos para que el mes quede claro desde arriba.';
    } else if (resta < 0) {
      focusCopy.textContent = `Ahora mismo te pasaste por ${fmt(Math.abs(resta))}. Empieza revisando los gastos vencidos o los montos mas altos.`;
    } else if (sorted.length) {
      const [topCategory, topAmount] = sorted[0];
      const topShare = gastos > 0 ? Math.round((topAmount / gastos) * 100) : 0;
      focusCopy.textContent = `${topCategory} concentra ${topShare}% de tus gastos del mes. Si ajustas esa categoria, recuperas margen mas rapido.`;
    } else {
      focusCopy.textContent = 'Tu mes se ve estable. Si quieres ajustar algo, hazlo directo desde la lista principal.';
    }
  }

  renderInicioPreview(items);
  drawDonut(sorted, gastos);
  renderEmailReminderSummary();
}

function renderExtraList() {
  const list = document.getElementById('extra-list');
  if (!list) return;
  const extras = state.ingresosExtra.filter(item => Number(item.mes) === runtime.curM && Number(item.anio) === runtime.curY);
  if (!extras.length) {
    list.innerHTML = '<div class="text-xs text-text2">No hay ingresos adicionales para este mes.</div>';
    return;
  }

  list.innerHTML = extras.map(item => `
    <div class="mb-2 rounded-smapp border border-borderc bg-white p-3 text-[13px] text-text1">
      <div class="flex items-center justify-between gap-2">
        <span>${item.desc}</span>
        <div class="flex items-center gap-2">
          <span class="font-bold">${fmt(item.monto)}</span>
          <button class="rounded-md border-0 bg-transparent px-1.5 py-0.5 text-[16px] leading-none text-text3 transition hover:bg-bluebg hover:text-accent" onclick="editExtra(${item.id})">&#9998;</button>
          <button class="rounded-md border-0 bg-transparent px-1.5 py-0.5 text-[20px] leading-none text-text3 transition hover:bg-redbg hover:text-red1" onclick="delExtra(${item.id})">&times;</button>
        </div>
      </div>
      <div class="mt-1 text-[11px] text-text3">${MS[item.mes]} ${item.anio}</div>
    </div>
  `).join('');
}

function resetExtraForm() {
  document.getElementById('extra-desc').value = '';
  document.getElementById('extra-monto').value = '';
  fillMonthOptions('extra-mes');
  document.getElementById('extra-mh').textContent = 'Agregar ingreso adicional';
  document.getElementById('extra-save-btn').textContent = 'Guardar ✓';
  runtime.editingExtraId = null;
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

function openSueldoModal() {
  const currentSueldo = getSueldoForPeriod(runtime.curM, runtime.curY);
  document.getElementById('sueldo-modal-input').value = currentSueldo;
  const periodLabel = `${MS[runtime.curM]} ${runtime.curY}`;
  const modalTitle = document.getElementById('sueldo-modal-title');
  const modalSub = document.getElementById('sueldo-modal-sub');
  const modalLabel = document.getElementById('sueldo-modal-label');
  if (modalTitle) modalTitle.textContent = `Editar sueldo de ${periodLabel}`;
  if (modalSub) modalSub.textContent = 'Este valor aplica solo al mes que estas viendo.';
  if (modalLabel) modalLabel.textContent = `Monto para ${periodLabel} (S/)`;
  showOverlay('overlay-sueldo');
}

function closeSueldoModal() {
  hideOverlay('overlay-sueldo');
}

function closeExcelActionsMenu() {
  document.getElementById('excel-actions-menu')?.removeAttribute('open');
}

function openEmailRemindersModal() {
  closeExcelActionsMenu();
  const currentUser = requireCurrentUser();
  if (!currentUser) {
    window.openAuthModal?.('login');
    return;
  }
  syncEmailReminderModalFromState();
  showOverlay('overlay-email-reminders');
}

function closeEmailRemindersModal() {
  hideOverlay('overlay-email-reminders');
}

function getSelectedExportScope() {
  return document.querySelector('input[name="export-scope"]:checked')?.value || 'month';
}

function syncExportModalCopy() {
  const monthCopy = document.getElementById('export-scope-month-copy');
  const yearCopy = document.getElementById('export-scope-year-copy');
  if (monthCopy) {
    monthCopy.textContent = `Exporta ${MS[runtime.curM]} ${runtime.curY} con el resumen y el detalle que estás viendo.`;
  }
  if (yearCopy) {
    yearCopy.textContent = `Incluye el resumen mensual y los registros del ${runtime.curY}.`;
  }
}

function openExportModal() {
  closeExcelActionsMenu();
  syncExportModalCopy();
  showOverlay('overlay-export');
}

function closeExportModal() {
  hideOverlay('overlay-export');
}

async function saveSueldoFromModal() {
  const newSueldo = parseFloat(document.getElementById('sueldo-modal-input').value) || 0;
  document.getElementById('sueldo').value = newSueldo;
  await runWithLoading(`Guardando sueldo de ${MS[runtime.curM]} ${runtime.curY}...`, async () => {
    await saveSueldo(runtime.curM, runtime.curY);
    app.actions.updateAll?.();
  });
  closeSueldoModal();
  toast(`Sueldo de ${MS[runtime.curM]} ${runtime.curY} actualizado`);
}

const REMINDER_TEST_FUNCTION_NAME = 'resend-email';

function serializeReminderDebugError(error) {
  if (!error) return null;

  const base = {
    type: error?.constructor?.name || typeof error,
    name: error?.name || null,
    message: error?.message || String(error),
  };

  ['code', 'context', 'details', 'hint', 'status'].forEach(key => {
    if (error?.[key] !== undefined) {
      base[key] = error[key];
    }
  });

  const extra = Object.getOwnPropertyNames(error || {}).reduce((acc, key) => {
    if (!(key in base)) {
      acc[key] = error[key];
    }
    return acc;
  }, {});

  if (Object.keys(extra).length) {
    base.extra = extra;
  }

  if (error?.stack) {
    base.stack = error.stack;
  }

  return base;
}

async function readReminderFunctionError(error) {
  if (!error) return null;

  const context = error?.context;
  if (!context) {
    return error?.message || null;
  }

  try {
    if (typeof context.json === 'function') {
      const payload = await context.json();
      if (payload?.error) return payload.error;
      return JSON.stringify(payload);
    }

    if (typeof context.text === 'function') {
      const text = await context.text();
      if (text) return text;
    }
  } catch (contextError) {
    console.warn('No se pudo leer el body del error de la Edge Function', serializeReminderDebugError(contextError));
  }

  return error?.message || null;
}

function getReminderDebugSnapshot(currentUser, settings, session) {
  return {
    timestamp: new Date().toISOString(),
    functionName: REMINDER_TEST_FUNCTION_NAME,
    location: {
      origin: window.location.origin,
      pathname: window.location.pathname,
      href: window.location.href,
    },
    currentUser: currentUser
      ? {
          id: currentUser.id,
          email: currentUser.email || null,
        }
      : null,
    session: session
      ? {
          hasAccessToken: Boolean(session.access_token),
          userId: session.user?.id || null,
          email: session.user?.email || null,
          expiresAt: session.expires_at || null,
        }
      : null,
    payload: {
      mode: 'test',
      settings,
    },
  };
}

async function saveEmailReminders() {
  const currentUser = requireCurrentUser();
  if (!currentUser) return;

  const values = getReminderFormValues();
  const emailError = validateReminderEmail(values.emailDestino);
  if (emailError) {
    alert(emailError);
    return;
  }

  let saveError;
  await runWithLoading('Guardando alertas por correo...', async () => {
    const { error } = await saveEmailReminderSettings(values);
    saveError = error;
  });

  if (saveError) {
    alert(saveError.message || 'No se pudo guardar la configuración de alertas.');
    return;
  }

  syncEmailReminderModalFromState();
  app.actions.updateAll?.();
  closeEmailRemindersModal();
  toast(values.activo ? 'Alertas por correo activadas' : 'Alertas por correo actualizadas');
}

async function sendEmailReminderTest() {
  const currentUser = requireCurrentUser();
  if (!currentUser) return;

  const settings = getReminderFormValues();
  const emailError = validateReminderEmail(settings.emailDestino);
  if (emailError) {
    alert(emailError);
    return;
  }

  const debugLabel = '[Alertas correo] Enviar prueba';
  console.groupCollapsed(debugLabel);
  console.info('Iniciando prueba de alertas por correo');

  try {
    const { data: sessionData, error: sessionError } = await app.supabaseClient.auth.getSession();
    if (sessionError) {
      console.warn('No se pudo leer la sesión actual antes de invocar la función', serializeReminderDebugError(sessionError));
    }

    console.info('Snapshot previo al invoke', getReminderDebugSnapshot(currentUser, settings, sessionData?.session || null));

    await runWithLoading('Enviando correo de prueba...', async () => {
      const invokeBody = {
        mode: 'test',
        settings,
      };

      console.info('Invocando Edge Function', {
        functionName: REMINDER_TEST_FUNCTION_NAME,
        body: invokeBody,
      });

      const { data, error } = await app.supabaseClient.functions.invoke(REMINDER_TEST_FUNCTION_NAME, {
        body: invokeBody,
      });

      console.info('Respuesta cruda de supabase.functions.invoke', {
        data,
        error: serializeReminderDebugError(error),
      });

      if (error) {
        const functionErrorMessage = await readReminderFunctionError(error);
        if (functionErrorMessage) {
          error.message = functionErrorMessage;
        }
        throw error;
      }
    });

    console.info('La prueba terminó sin errores en el cliente');
    toast('Correo de prueba enviado');
  } catch (error) {
    console.error('Falló la prueba de alertas por correo', serializeReminderDebugError(error));
    alert(error.message || 'No se pudo enviar el correo de prueba.');
  } finally {
    console.groupEnd();
  }
}

async function saveExtra() {
  const currentUser = requireCurrentUser();
  if (!currentUser) return;

  const desc = document.getElementById('extra-desc').value.trim();
  const monto = parseFloat(document.getElementById('extra-monto').value);
  const mes = parseInt(document.getElementById('extra-mes').value, 10);
  if (!desc || !monto || monto <= 0) {
    alert('Datos invalidos');
    return;
  }

  const payload = {
    user_id: currentUser.id,
    descripcion: desc,
    monto,
    mes,
    anio: runtime.curY,
  };

  let error;
  const isEditing = runtime.editingExtraId !== null;
  await runWithLoading(isEditing ? 'Actualizando ingreso extra...' : 'Guardando ingreso extra...', async () => {
    if (isEditing) {
      ({ error } = await app.supabaseClient.from('ingresos_extra').update(payload).eq('id', runtime.editingExtraId));
    } else {
      ({ error } = await app.supabaseClient.from('ingresos_extra').insert(payload));
    }
    if (error) {
      alert(error.message);
      return;
    }

    await app.actions.refreshAppData?.();
    renderExtraList();
  });

  if (error) {
    return;
  }

  toast(runtime.editingExtraId !== null ? 'Ingreso adicional actualizado' : 'Ingreso adicional guardado');
  resetExtraForm();
}

function editExtra(id) {
  const extra = state.ingresosExtra.find(item => item.id === id);
  if (!extra) return;
  runtime.editingExtraId = id;
  document.getElementById('extra-mh').textContent = 'Editar ingreso adicional';
  document.getElementById('extra-save-btn').textContent = 'Actualizar ✓';
  document.getElementById('extra-desc').value = extra.desc;
  document.getElementById('extra-monto').value = extra.monto;
  fillMonthOptions('extra-mes');
  document.getElementById('extra-mes').value = extra.mes;
  showOverlay('overlay-extra');
}

async function delExtra(id) {
  if (!runtime.currentUser) return;
  if (!confirm('¿Eliminar este ingreso adicional?')) return;
  let error;
  await runWithLoading('Eliminando ingreso extra...', async () => {
    ({ error } = await app.supabaseClient.from('ingresos_extra').delete().eq('id', id));
    if (error) {
      alert(error.message);
      return;
    }

    if (runtime.editingExtraId === id) {
      resetExtraForm();
    }
    await app.actions.refreshAppData?.();
    renderExtraList();
  });

  if (error) {
    return;
  }

  toast('Ingreso adicional eliminado');
}

function triggerExcelImport() {
  closeExcelActionsMenu();
  document.getElementById('excel-import').click();
}

function normalizeExcelHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '');
}

function getExcelCellValue(cell) {
  const value = cell?.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;
  if (value.result !== undefined && value.result !== null) return value.result;
  if (value.text !== undefined) return value.text;
  if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
  return String(value);
}

function parseExcelNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value || '').trim().replace(/\s/g, '').replace(/S\/?/gi, '');
  if (!normalized) return 0;

  const commaIndex = normalized.lastIndexOf(',');
  const dotIndex = normalized.lastIndexOf('.');
  let numericText = normalized;
  if (commaIndex > dotIndex) {
    numericText = normalized.replace(/\./g, '').replace(',', '.');
  } else {
    numericText = normalized.replace(/,/g, '');
  }

  const parsed = Number(numericText.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseExcelPeriod(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { month: value.getMonth(), year: value.getFullYear() };
  }

  const text = String(value || '').trim();
  if (!text) return null;
  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})/);
  if (isoMatch) {
    return { month: Math.min(11, Math.max(0, Number(isoMatch[2]) - 1)), year: Number(isoMatch[1]) };
  }

  const numericMatch = text.match(/^(\d{1,2})[-/](\d{4})$/);
  if (numericMatch) {
    return { month: Math.min(11, Math.max(0, Number(numericMatch[1]) - 1)), year: Number(numericMatch[2]) };
  }

  const normalized = normalizeExcelHeader(text);
  const monthIndex = MS.findIndex(month => normalized.includes(normalizeExcelHeader(month)));
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  if (monthIndex >= 0 && yearMatch) {
    return { month: monthIndex, year: Number(yearMatch[0]) };
  }
  return null;
}

function parseExcelBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['si', 'sí', 'true', '1', 'pagado'].includes(String(value || '').trim().toLowerCase());
}

function getDateKeyFromExcelValue(value) {
  const parts = parseDateParts(value);
  if (!parts) return null;
  return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

const IMPORT_HEADER_ALIASES = {
  descripcion: ['descripcion', 'detalle', 'concepto'],
  categoria: ['categoria'],
  diaPago: ['dia_pago', 'dia_de_pago', 'dia'],
  tipo: ['tipo'],
  monto: ['monto', 'importe', 'valor'],
  mes: ['mes'],
  anio: ['anio', 'ano'],
  periodo: ['periodo', 'mes_periodo'],
  totalCuotas: ['total_cuotas', 'cuotas'],
  cuotaActual: ['cuota_actual'],
  cuota: ['cuota'],
  pagado: ['pagado'],
  fechaPagado: ['fecha_pagado', 'fecha_de_pago'],
  origenMes: ['origen_mes'],
  origenAnio: ['origen_anio', 'origen_ano'],
};

function findExcelImportSource(workbook) {
  const preferredNames = ['carga de gastos', 'carga gastos', 'gastos'];
  const orderedSheets = workbook.worksheets.slice().sort((left, right) => {
    const leftIndex = preferredNames.indexOf(normalizeExcelHeader(left.name).replace(/_/g, ' '));
    const rightIndex = preferredNames.indexOf(normalizeExcelHeader(right.name).replace(/_/g, ' '));
    const leftScore = leftIndex < 0 ? 99 : leftIndex;
    const rightScore = rightIndex < 0 ? 99 : rightIndex;
    return leftScore - rightScore;
  });

  for (const sheet of orderedSheets) {
    const maxHeaderRow = Math.min(sheet.rowCount || 1, 20);
    for (let rowNumber = 1; rowNumber <= maxHeaderRow; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const headers = {};
      row.eachCell((cell, columnNumber) => {
        const normalized = normalizeExcelHeader(getExcelCellValue(cell));
        if (normalized) headers[normalized] = columnNumber;
      });

      const hasDescription = IMPORT_HEADER_ALIASES.descripcion.some(alias => headers[alias]);
      const hasAmount = IMPORT_HEADER_ALIASES.monto.some(alias => headers[alias]);
      if (hasDescription && hasAmount) {
        return { sheet, headerRowNumber: rowNumber, headers };
      }
    }
  }
  return null;
}

function getImportColumn(headers, aliases) {
  const matchedAlias = aliases.find(alias => headers[alias]);
  return matchedAlias ? headers[matchedAlias] : 0;
}

function readImportValue(row, headers, aliases) {
  const columnNumber = getImportColumn(headers, aliases);
  return columnNumber ? getExcelCellValue(row.getCell(columnNumber)) : '';
}

function importExpenseKey(item) {
  return [
    String(item.descripcion || '').trim().toLowerCase(),
    String(item.categoria || '').trim().toLowerCase(),
    Number(item.dia_pago || 0),
    Number(item.monto || 0).toFixed(2),
    Number(item.mes),
    Number(item.anio),
    String(item.tipo || 'unico'),
  ].join('|');
}

async function handleExcelImport(event) {
  const currentUser = requireCurrentUser();
  if (!currentUser) return;

  const file = event.target.files?.[0];
  if (!file) return;

  try {
    await runWithLoading('Importando Excel...', async () => {
      const workbook = new window.ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const source = findExcelImportSource(workbook);
      if (!source) {
        alert('No encontramos una hoja de gastos válida. Usa un Excel exportado desde la aplicación o incluye las columnas Descripcion y Monto.');
        return;
      }

      const { sheet, headerRowNumber, headers } = source;
      const rows = [];
      let invalidRows = 0;
      const rawMonthValues = [];

      for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const rawMonth = readImportValue(row, headers, IMPORT_HEADER_ALIASES.mes);
        if (rawMonth !== '' && Number.isFinite(Number(rawMonth))) rawMonthValues.push(Number(rawMonth));
      }
      const usesLegacyZeroBasedMonths = rawMonthValues.some(value => value === 0);

      for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const description = String(readImportValue(row, headers, IMPORT_HEADER_ALIASES.descripcion) || '').trim();
        const amount = parseExcelNumber(readImportValue(row, headers, IMPORT_HEADER_ALIASES.monto));
        if (!description && !amount) continue;

        const rawMonth = readImportValue(row, headers, IMPORT_HEADER_ALIASES.mes);
        const rawYear = readImportValue(row, headers, IMPORT_HEADER_ALIASES.anio);
        const period = parseExcelPeriod(readImportValue(row, headers, IMPORT_HEADER_ALIASES.periodo));
        const numericMonth = Number(rawMonth);
        const month = Number.isFinite(numericMonth) && rawMonth !== ''
          ? (usesLegacyZeroBasedMonths ? numericMonth : numericMonth - 1)
          : (period?.month ?? runtime.curM);
        const year = parseInt(rawYear, 10) || period?.year || runtime.curY;
        const rawQuota = String(readImportValue(row, headers, IMPORT_HEADER_ALIASES.cuota) || '');
        const quotaMatch = rawQuota.match(/(\d+)\s*(?:de|\/|-)\s*(\d+)/i);
        const rawType = String(readImportValue(row, headers, IMPORT_HEADER_ALIASES.tipo) || 'unico').trim().toLowerCase();
        const type = rawType.includes('cuota') ? 'cuotas' : 'unico';
        const totalInstallments = parseInt(readImportValue(row, headers, IMPORT_HEADER_ALIASES.totalCuotas), 10)
          || Number(quotaMatch?.[2] || 0);
        const currentInstallment = parseInt(readImportValue(row, headers, IMPORT_HEADER_ALIASES.cuotaActual), 10)
          || Number(quotaMatch?.[1] || 1);
        const rawOriginMonth = readImportValue(row, headers, IMPORT_HEADER_ALIASES.origenMes);
        const originMonthNumber = Number(rawOriginMonth);
        const originMonth = Number.isFinite(originMonthNumber) && rawOriginMonth !== ''
          ? (usesLegacyZeroBasedMonths ? originMonthNumber : originMonthNumber - 1)
          : month;

        const item = {
          descripcion: description,
          categoria: String(readImportValue(row, headers, IMPORT_HEADER_ALIASES.categoria) || 'Sin categoría').trim() || 'Sin categoría',
          dia_pago: Math.min(31, Math.max(1, parseInt(readImportValue(row, headers, IMPORT_HEADER_ALIASES.diaPago), 10) || 15)),
          tipo: type,
          monto: amount,
          mes: Math.min(11, Math.max(0, month)),
          anio: year,
          origen_mes: Math.min(11, Math.max(0, originMonth)),
          origen_anio: parseInt(readImportValue(row, headers, IMPORT_HEADER_ALIASES.origenAnio), 10) || year,
          total_cuotas: type === 'cuotas' ? Math.max(1, totalInstallments) : 0,
          cuota_actual: type === 'cuotas' ? Math.max(1, currentInstallment) : 1,
          pagado: parseExcelBoolean(readImportValue(row, headers, IMPORT_HEADER_ALIASES.pagado)),
          fecha_pagado: getDateKeyFromExcelValue(readImportValue(row, headers, IMPORT_HEADER_ALIASES.fechaPagado)),
        };
        if (!item.descripcion || item.monto <= 0 || !Number.isInteger(item.anio) || item.anio < 2000 || item.anio > 2100) {
          invalidRows += 1;
          continue;
        }
        rows.push(item);
      }

      if (!rows.length) {
        alert('No se encontraron datos validos en el archivo.');
        return;
      }

      const existingKeys = new Set(state.gastos.map(gasto => importExpenseKey({
        descripcion: gasto.desc,
        categoria: gasto.cat,
        dia_pago: gasto.dia,
        monto: gasto.monto,
        mes: gasto.mes,
        anio: gasto.anio,
        tipo: gasto.tipo,
      })));
      const acceptedKeys = new Set();
      const uniqueRows = rows.filter(item => {
        const key = importExpenseKey(item);
        if (existingKeys.has(key) || acceptedKeys.has(key)) return false;
        acceptedKeys.add(key);
        return true;
      });
      const duplicateRows = rows.length - uniqueRows.length;

      if (!uniqueRows.length) {
        alert(`No hay gastos nuevos para cargar. Se omitieron ${duplicateRows} duplicado(s).`);
        return;
      }

      const importMessage = [
        `Se cargarán ${uniqueRows.length} gasto(s) desde la hoja “${sheet.name}”.`,
        duplicateRows ? `${duplicateRows} duplicado(s) serán omitidos.` : '',
        invalidRows ? `${invalidRows} fila(s) inválida(s) serán omitidas.` : '',
        '¿Deseas continuar?',
      ].filter(Boolean).join('\n');
      if (!confirm(importMessage)) return;

      const payloads = uniqueRows.map(item => ({
        user_id: currentUser.id,
        ...item,
      }));

      const { error } = await app.supabaseClient.from('gastos').insert(payloads);
      if (error) {
        alert(error.message);
        return;
      }

      await app.actions.refreshAppData?.();
      toast(`${uniqueRows.length} gasto(s) importado(s)${duplicateRows ? ` · ${duplicateRows} duplicado(s) omitido(s)` : ''}`);
    });
  } catch (error) {
    console.error(error);
    alert(error.message || 'No se pudo importar el Excel.');
  } finally {
    event.target.value = '';
  }
}

function slugifyExportPart(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function fmtSigned(value) {
  return Number(value || 0) < 0 ? `- ${fmt(value)}` : fmt(value);
}

function getExportScopeLabel(scope) {
  if (scope === 'month') return `${MS[runtime.curM]} ${runtime.curY}`;
  if (scope === 'year') return `Año ${runtime.curY}`;
  return 'Todos los datos';
}

function getExportFileName(scope) {
  if (scope === 'month') {
    const monthNumber = String(runtime.curM + 1).padStart(2, '0');
    return `finanzas-${runtime.curY}-${monthNumber}-${slugifyExportPart(MS[runtime.curM])}.xlsx`;
  }
  if (scope === 'year') {
    return `finanzas-${runtime.curY}-anual.xlsx`;
  }
  const today = new Date();
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return `finanzas-todo-${stamp}.xlsx`;
}

function parseDateParts(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date && !Number.isNaN(dateStr.getTime())) {
    return { year: dateStr.getFullYear(), month: dateStr.getMonth(), day: dateStr.getDate() };
  }
  const normalized = String(dateStr).trim().split('T')[0].split(' ')[0];
  const [year, month, day] = normalized.split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month: month - 1, day };
}

function matchesScopeByMonthYear(month, year, scope) {
  const normalizedMonth = Number(month);
  const normalizedYear = Number(year);
  if (scope === 'all') return true;
  if (scope === 'year') return normalizedYear === runtime.curY;
  return normalizedYear === runtime.curY && normalizedMonth === runtime.curM;
}

function matchesScopeByDate(dateStr, scope) {
  if (scope === 'all') return true;
  const parts = parseDateParts(dateStr);
  if (!parts) return false;
  if (scope === 'year') return parts.year === runtime.curY;
  return parts.year === runtime.curY && parts.month === runtime.curM;
}

function sortByPeriod(left, right, monthKey = 'mes', yearKey = 'anio', dayKey = 'dia') {
  const leftYear = Number(left?.[yearKey] ?? runtime.curY);
  const rightYear = Number(right?.[yearKey] ?? runtime.curY);
  if (leftYear !== rightYear) return leftYear - rightYear;

  const leftMonth = Number(left?.[monthKey] ?? 0);
  const rightMonth = Number(right?.[monthKey] ?? 0);
  if (leftMonth !== rightMonth) return leftMonth - rightMonth;

  const leftDay = Number(left?.[dayKey] ?? 0);
  const rightDay = Number(right?.[dayKey] ?? 0);
  if (leftDay !== rightDay) return leftDay - rightDay;

  return String(left?.desc || left?.descripcion || '').localeCompare(String(right?.desc || right?.descripcion || ''), 'es');
}

function getScopedGastos(scope) {
  if (scope === 'month') {
    return sortPreviewItems(gastosActivosDelPeriodo(runtime.curM, runtime.curY));
  }

  const items = scope === 'year'
    ? state.gastos.filter(gasto => Number(gasto.anio ?? runtime.curY) === runtime.curY)
    : state.gastos.slice();

  return items.slice().sort((left, right) => sortByPeriod(left, right, 'mes', 'anio', 'dia'));
}

function getScopedIngresos(scope) {
  const items = state.ingresosExtra.filter(item => matchesScopeByMonthYear(item.mes, item.anio ?? runtime.curY, scope));
  return items.slice().sort((left, right) => sortByPeriod(left, right, 'mes', 'anio'));
}

function getScopedAnotaciones(scope) {
  const items = state.anotaciones.filter(note => matchesScopeByMonthYear(note.creadoMes, note.creadoAnio, scope));
  return items.slice().sort((left, right) => sortByPeriod(
    { mes: left.creadoMes, anio: left.creadoAnio, dia: left.dia, desc: left.desc },
    { mes: right.creadoMes, anio: right.creadoAnio, dia: right.dia, desc: right.desc },
  ));
}

function getScopedPrestamos(scope) {
  if (scope === 'all') {
    return state.prestamos.slice().sort((left, right) => String(left.persona || '').localeCompare(String(right.persona || ''), 'es'));
  }

  return state.prestamos
    .filter(prestamo => (
      matchesScopeByDate(prestamo.createdAt, scope)
      || matchesScopeByDate(prestamo.fecha, scope)
      || matchesScopeByDate(prestamo.vencimiento, scope)
      || (prestamo.historial || []).some(item => matchesScopeByDate(item.fecha, scope))
    ))
    .sort((left, right) => String(left.persona || '').localeCompare(String(right.persona || ''), 'es'));
}

function getScopedAbonos(scope) {
  return state.prestamos
    .flatMap(prestamo => (prestamo.historial || []).map(item => ({
      ...item,
      prestamoPersona: prestamo.persona,
      prestamoTipo: prestamo.tipo,
    })))
    .filter(item => matchesScopeByDate(item.fecha, scope))
    .sort((left, right) => String(left.fecha || '').localeCompare(String(right.fecha || '')));
}

function getExportDateCell(dateStr) {
  const parts = parseDateParts(dateStr);
  if (!parts) return '';
  return new Date(parts.year, parts.month, parts.day);
}

function getAllSummaryYears() {
  const years = new Set([runtime.curY]);
  state.gastos.forEach(gasto => years.add(Number(gasto.anio ?? runtime.curY)));
  state.ingresosExtra.forEach(item => years.add(Number(item.anio ?? runtime.curY)));
  state.anotaciones.forEach(note => years.add(Number(note.creadoAnio ?? runtime.curY)));
  Object.keys(state.userSettings?.sueldosMensuales || {}).forEach(periodKey => {
    years.add(Number(String(periodKey).split('-')[0]));
  });

  return Array.from(years)
    .filter(year => Number.isFinite(year))
    .sort((left, right) => left - right);
}

const EXCEL_COLORS = Object.freeze({
  navy: 'FF263A5B',
  blue: 'FF2F6FED',
  blueSoft: 'FFEAF1FF',
  green: 'FF178A62',
  greenSoft: 'FFE8F6F0',
  red: 'FFD94F5C',
  redSoft: 'FFFFECEE',
  amber: 'FFB97812',
  amberSoft: 'FFFFF4D9',
  border: 'FFD9E3F0',
  muted: 'FF64748B',
  white: 'FFFFFFFF',
  text: 'FF1F2F46',
});

const EXCEL_CURRENCY_FORMAT = '"S/" #,##0.00;[Red]-"S/" #,##0.00;"-"';

function exportPeriodDate(month, year) {
  return new Date(Number(year), Number(month), 1);
}

function makeExcelTableName(name) {
  const safeName = String(name || 'Datos').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '');
  return `Tabla${safeName || 'Datos'}`;
}

function applyExcelTitle(sheet, title, subtitle, lastColumn) {
  sheet.mergeCells(1, 1, 1, lastColumn);
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = { name: 'Arial', size: 16, bold: true, color: { argb: EXCEL_COLORS.navy } };
  sheet.getCell(1, 1).alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 28;

  sheet.mergeCells(2, 1, 2, lastColumn);
  sheet.getCell(2, 1).value = subtitle;
  sheet.getCell(2, 1).font = { name: 'Arial', size: 10, italic: true, color: { argb: EXCEL_COLORS.muted } };
  sheet.getRow(2).height = 20;
}

function styleExcelHeader(row) {
  row.height = 24;
  row.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: EXCEL_COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.navy } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: EXCEL_COLORS.border } },
      right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    };
  });
}

function addWorksheet(workbook, name, columns, rows, options = {}) {
  const sheet = workbook.addWorksheet(name, { properties: { tabColor: { argb: options.tabColor || EXCEL_COLORS.blue } } });
  const subtitle = options.subtitle || `${getExportScopeLabel(options.scope || getSelectedExportScope())} · Generado el ${new Date().toLocaleDateString('es-PE')}`;
  applyExcelTitle(sheet, options.title || name, subtitle, columns.length);

  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });

  const headerRowNumber = 4;
  const currencyKeys = new Set(options.currencyKeys || []);
  const dateKeys = new Set(options.dateKeys || []);
  const periodKeys = new Set(options.periodKeys || []);
  const statusKey = options.statusKey || 'estado';
  const hasTotals = rows.length > 0 && currencyKeys.size > 0 && options.showTotals !== false;

  if (rows.length) {
    const tableColumns = columns.map((column, index) => {
      const tableColumn = { name: column.header, filterButton: true };
      if (hasTotals && index === 0) tableColumn.totalsRowLabel = 'Total';
      if (hasTotals && currencyKeys.has(column.key)) tableColumn.totalsRowFunction = 'sum';
      return tableColumn;
    });

    sheet.addTable({
      name: options.tableName || makeExcelTableName(name),
      ref: `A${headerRowNumber}`,
      headerRow: true,
      totalsRow: hasTotals,
      style: { theme: 'TableStyleMedium2', showRowStripes: true },
      columns: tableColumns,
      rows: rows.map(row => columns.map(column => row[column.key] ?? '')),
    });
  } else {
    sheet.getRow(headerRowNumber).values = columns.map(column => column.header);
    sheet.getCell(headerRowNumber + 1, 1).value = 'Sin registros para el alcance seleccionado.';
    sheet.mergeCells(headerRowNumber + 1, 1, headerRowNumber + 1, columns.length);
    sheet.getCell(headerRowNumber + 1, 1).font = { name: 'Arial', size: 10, italic: true, color: { argb: EXCEL_COLORS.muted } };
    sheet.getCell(headerRowNumber + 1, 1).alignment = { vertical: 'middle', horizontal: 'left' };
  }

  styleExcelHeader(sheet.getRow(headerRowNumber));
  const lastDataRow = headerRowNumber + rows.length;
  const lastStyledRow = Math.max(headerRowNumber + 1, lastDataRow + (hasTotals ? 1 : 0));

  for (let rowNumber = headerRowNumber + 1; rowNumber <= lastStyledRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = rowNumber === lastStyledRow && hasTotals ? 23 : 21;
    row.font = { name: 'Arial', size: 10, color: { argb: EXCEL_COLORS.text }, bold: rowNumber === lastStyledRow && hasTotals };
    row.alignment = { vertical: 'middle' };
  }

  columns.forEach((column, index) => {
    const excelColumn = sheet.getColumn(index + 1);
    if (currencyKeys.has(column.key)) excelColumn.numFmt = EXCEL_CURRENCY_FORMAT;
    if (dateKeys.has(column.key)) excelColumn.numFmt = 'dd/mm/yyyy';
    if (periodKeys.has(column.key)) excelColumn.numFmt = 'mmm yyyy';
  });

  const statusColumnIndex = columns.findIndex(column => column.key === statusKey) + 1;
  if (statusColumnIndex > 0) {
    for (let rowNumber = headerRowNumber + 1; rowNumber <= lastDataRow; rowNumber += 1) {
      const cell = sheet.getCell(rowNumber, statusColumnIndex);
      const status = String(cell.value || '').toLowerCase();
      if (status === 'pagado') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.greenSoft } };
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: EXCEL_COLORS.green } };
      } else if (status === 'vencido') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.redSoft } };
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: EXCEL_COLORS.red } };
      } else if (status === 'pendiente' || status === 'parcial') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.amberSoft } };
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: EXCEL_COLORS.amber } };
      }
    }
  }

  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber, showGridLines: false }];
  sheet.pageSetup = { orientation: columns.length > 7 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  if (!rows.length) {
    sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: columns.length } };
  }
  return sheet;
}

function setSummaryKpis(sheet, labels, values, colors) {
  labels.forEach((label, index) => {
    const labelCell = sheet.getCell(4, index + 1);
    const valueCell = sheet.getCell(5, index + 1);
    labelCell.value = label;
    labelCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: EXCEL_COLORS.muted } };
    labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
    valueCell.value = values[index];
    valueCell.numFmt = EXCEL_CURRENCY_FORMAT;
    valueCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: colors[index].text } };
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors[index].fill } };
    valueCell.alignment = { horizontal: 'center', vertical: 'middle' };
    valueCell.border = { bottom: { style: 'thin', color: { argb: EXCEL_COLORS.border } } };
  });
  sheet.getRow(4).height = 20;
  sheet.getRow(5).height = 32;
}

function writeSummaryTable(sheet, startRow, startColumn, headers, rows, widths = []) {
  headers.forEach((header, index) => {
    const cell = sheet.getCell(startRow, startColumn + index);
    cell.value = header;
  });
  const headerRow = sheet.getRow(startRow);
  for (let column = startColumn; column < startColumn + headers.length; column += 1) {
    const cell = headerRow.getCell(column);
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: EXCEL_COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.navy } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  headerRow.height = 23;

  rows.forEach((values, rowIndex) => {
    values.forEach((value, columnIndex) => {
      const cell = sheet.getCell(startRow + rowIndex + 1, startColumn + columnIndex);
      cell.value = value;
      cell.font = { name: 'Arial', size: 10, color: { argb: EXCEL_COLORS.text } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowIndex % 2 ? 'FFF7F9FC' : EXCEL_COLORS.white } };
      cell.border = { bottom: { style: 'thin', color: { argb: EXCEL_COLORS.border } } };
      cell.alignment = { vertical: 'middle' };
    });
  });

  widths.forEach((width, index) => {
    sheet.getColumn(startColumn + index).width = Math.max(sheet.getColumn(startColumn + index).width || 0, width);
  });
}

function setExcelRangeNumberFormat(sheet, startRow, endRow, startColumn, endColumn, format) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      sheet.getCell(row, column).numFmt = format;
    }
  }
}

function periodTotals(rows) {
  return rows.reduce((acc, row) => ({
    sueldo: acc.sueldo + row.sueldo,
    extras: acc.extras + row.extras,
    ingresos: acc.ingresos + row.ingresos,
    gastos: acc.gastos + row.gastos,
    saldo: acc.saldo + row.saldo,
  }), { sueldo: 0, extras: 0, ingresos: 0, gastos: 0, saldo: 0 });
}

function addSummaryWorksheet(workbook, scope) {
  const sheet = workbook.addWorksheet('Resumen', { properties: { tabColor: { argb: EXCEL_COLORS.navy } } });
  sheet.views = [{ state: 'frozen', ySplit: scope === 'month' ? 8 : 7, showGridLines: false }];
  for (let column = 1; column <= 6; column += 1) sheet.getColumn(column).width = 18;
  applyExcelTitle(sheet, 'Resumen financiero', `${getExportScopeLabel(scope)} · Generado el ${new Date().toLocaleDateString('es-PE')}`, 6);

  if (scope === 'month') {
    const current = resumenDelPeriodo(runtime.curM, runtime.curY);
    const previous = periodoRelativo(-1);
    const previousSummary = resumenDelPeriodo(previous.month, previous.year);
    const gastos = gastosActivosDelPeriodo(runtime.curM, runtime.curY);
    const statusTotals = gastos.reduce((acc, gasto) => {
      const status = gastoPaymentStatus(gasto).key;
      acc[status] += Number(gasto.monto || 0);
      return acc;
    }, { pagado: 0, pendiente: 0, vencido: 0 });

    setSummaryKpis(
      sheet,
      ['Ingresos', 'Gastos', 'Saldo', 'Pagado', 'Por pagar', 'Vencido'],
      [current.ingresos, current.gastos, current.saldo, statusTotals.pagado, statusTotals.pendiente + statusTotals.vencido, statusTotals.vencido],
      [
        { text: EXCEL_COLORS.green, fill: EXCEL_COLORS.greenSoft },
        { text: EXCEL_COLORS.red, fill: EXCEL_COLORS.redSoft },
        { text: current.saldo < 0 ? EXCEL_COLORS.red : EXCEL_COLORS.blue, fill: current.saldo < 0 ? EXCEL_COLORS.redSoft : EXCEL_COLORS.blueSoft },
        { text: EXCEL_COLORS.green, fill: EXCEL_COLORS.greenSoft },
        { text: EXCEL_COLORS.amber, fill: EXCEL_COLORS.amberSoft },
        { text: EXCEL_COLORS.red, fill: EXCEL_COLORS.redSoft },
      ],
    );

    sheet.getCell('A8').value = 'Comparación mensual';
    sheet.getCell('A8').font = { name: 'Arial', size: 12, bold: true, color: { argb: EXCEL_COLORS.navy } };
    writeSummaryTable(sheet, 9, 1, ['Indicador', `${MS[runtime.curM]} ${runtime.curY}`, `${MS[previous.month]} ${previous.year}`, 'Variación'], [
      ['Ingresos', current.ingresos, previousSummary.ingresos, { formula: 'B10-C10' }],
      ['Gastos', current.gastos, previousSummary.gastos, { formula: 'B11-C11' }],
      ['Saldo', current.saldo, previousSummary.saldo, { formula: 'B12-C12' }],
    ], [22, 18, 18, 18]);
    setExcelRangeNumberFormat(sheet, 10, 12, 2, 4, EXCEL_CURRENCY_FORMAT);

    const categories = Object.entries(gastos.reduce((acc, gasto) => {
      const category = gasto.cat || 'Sin categoría';
      acc[category] = (acc[category] || 0) + Number(gasto.monto || 0);
      return acc;
    }, {})).sort((left, right) => right[1] - left[1]);

    sheet.getCell('A15').value = 'Gastos por categoría';
    sheet.getCell('A15').font = { name: 'Arial', size: 12, bold: true, color: { argb: EXCEL_COLORS.navy } };
    const categoryRows = categories.length
      ? categories.slice(0, 10).map(([category, amount]) => [category, amount, current.gastos ? amount / current.gastos : 0])
      : [['Sin gastos registrados', 0, 0]];
    writeSummaryTable(sheet, 16, 1, ['Categoría', 'Monto', '% del total'], categoryRows, [24, 18, 14]);
    setExcelRangeNumberFormat(sheet, 17, 16 + categoryRows.length, 2, 2, EXCEL_CURRENCY_FORMAT);
    setExcelRangeNumberFormat(sheet, 17, 16 + categoryRows.length, 3, 3, '0.0%');

    sheet.getCell('E15').value = 'Estado de los gastos';
    sheet.getCell('E15').font = { name: 'Arial', size: 12, bold: true, color: { argb: EXCEL_COLORS.navy } };
    writeSummaryTable(sheet, 16, 5, ['Estado', 'Monto'], [
      ['Pagado', statusTotals.pagado],
      ['Pendiente', statusTotals.pendiente],
      ['Vencido', statusTotals.vencido],
    ], [18, 18]);
    setExcelRangeNumberFormat(sheet, 17, 19, 6, 6, EXCEL_CURRENCY_FORMAT);
  } else {
    const rows = scope === 'year'
      ? MS.map((monthName, month) => {
        const summary = resumenDelPeriodo(month, runtime.curY);
        return {
          periodo: exportPeriodDate(month, runtime.curY),
          sueldo: summary.sueldoBase,
          extras: summary.extras,
          ingresos: summary.ingresos,
          gastos: summary.gastos,
          saldo: summary.saldo,
        };
      })
      : getAllSummaryYears().map(year => {
        const totals = periodTotals(Array.from({ length: 12 }, (_, month) => {
          const summary = resumenDelPeriodo(month, year);
          return { sueldo: summary.sueldoBase, extras: summary.extras, ingresos: summary.ingresos, gastos: summary.gastos, saldo: summary.saldo };
        }));
        return { periodo: year, ...totals };
      });
    const totals = periodTotals(rows);

    setSummaryKpis(
      sheet,
      ['Ingresos', 'Gastos', 'Saldo', 'Sueldo base', 'Ingresos extra', 'Periodos'],
      [totals.ingresos, totals.gastos, totals.saldo, totals.sueldo, totals.extras, rows.length],
      [
        { text: EXCEL_COLORS.green, fill: EXCEL_COLORS.greenSoft },
        { text: EXCEL_COLORS.red, fill: EXCEL_COLORS.redSoft },
        { text: totals.saldo < 0 ? EXCEL_COLORS.red : EXCEL_COLORS.blue, fill: totals.saldo < 0 ? EXCEL_COLORS.redSoft : EXCEL_COLORS.blueSoft },
        { text: EXCEL_COLORS.blue, fill: EXCEL_COLORS.blueSoft },
        { text: EXCEL_COLORS.green, fill: EXCEL_COLORS.greenSoft },
        { text: EXCEL_COLORS.navy, fill: 'FFF1F5F9' },
      ],
    );
    sheet.getCell('F5').numFmt = '#,##0';

    const tableRows = rows.map(row => [row.periodo, row.sueldo, row.extras, row.ingresos, row.gastos, row.saldo]);
    tableRows.push([scope === 'year' ? `Total ${runtime.curY}` : 'Total general', totals.sueldo, totals.extras, totals.ingresos, totals.gastos, totals.saldo]);
    writeSummaryTable(sheet, 8, 1, [scope === 'year' ? 'Periodo' : 'Año', 'Sueldo', 'Extras', 'Ingresos', 'Gastos', 'Saldo'], tableRows, [18, 16, 16, 16, 16, 16]);
    const lastRow = 8 + tableRows.length;
    setExcelRangeNumberFormat(sheet, 9, lastRow, 2, 6, EXCEL_CURRENCY_FORMAT);
    if (scope === 'year') setExcelRangeNumberFormat(sheet, 9, lastRow - 1, 1, 1, 'mmm yyyy');
    sheet.getRow(lastRow).font = { name: 'Arial', size: 10, bold: true, color: { argb: EXCEL_COLORS.navy } };
  }

  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
  return sheet;
}

async function exportExcel() {
  const scope = getSelectedExportScope();
  const workbook = new window.ExcelJS.Workbook();
  workbook.creator = 'Mis Finanzas';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const gastosRows = getScopedGastos(scope).map(gasto => ({
    descripcion: gasto.desc,
    categoria: gasto.cat,
    tipo: gasto.tipo,
    dia: Number(gasto.dia || 0),
    monto: Number(gasto.monto || 0),
    periodo: exportPeriodDate(gasto.mes, gasto.anio),
    origen: exportPeriodDate(gasto.origenMes ?? gasto.mes, gasto.origenAnio ?? gasto.anio),
    estado: gastoPaymentStatus(gasto).label,
    fechaPagado: getExportDateCell(gasto.fechaPagado),
    cuota: gasto.tipo === 'cuotas' ? `${gasto.cuotaAct || 1} de ${gasto.cuotas || 0}` : '',
  }));

  const ingresosRows = getScopedIngresos(scope).map(item => ({
    descripcion: item.desc,
    monto: Number(item.monto || 0),
    periodo: exportPeriodDate(item.mes, item.anio),
  }));

  const anotacionesRows = getScopedAnotaciones(scope).map(note => ({
    descripcion: note.desc,
    categoria: note.cat,
    tipo: note.tipo,
    dia: Number(note.dia || 0),
    monto: Number(note.monto || 0),
    creado: exportPeriodDate(note.creadoMes, note.creadoAnio),
    cuota: note.tipo === 'cuotas' ? `${note.cuotaAct || 1} de ${note.cuotas || 0}` : '',
  }));

  const prestamosRows = getScopedPrestamos(scope).map(prestamo => {
    const saldo = Math.max((prestamo.montoTotal || 0) - (prestamo.montoPagado || 0), 0);
    const estado = saldo <= 0 ? 'pagado' : (prestamo.montoPagado || 0) > 0 ? 'parcial' : 'pendiente';
    return {
      tipo: prestamo.tipo === 'por_cobrar' ? 'Por cobrar' : 'Por pagar',
      persona: prestamo.persona,
      descripcion: prestamo.desc,
      montoTotal: Number(prestamo.montoTotal || 0),
      abonado: Number(prestamo.montoPagado || 0),
      saldo,
      creado: getExportDateCell(prestamo.createdAt),
      fecha: getExportDateCell(prestamo.fecha),
      vencimiento: getExportDateCell(prestamo.vencimiento),
      estado,
      notas: prestamo.notas || '',
    };
  });

  const abonosRows = getScopedAbonos(scope).map(item => ({
    prestamo: item.prestamoPersona,
    tipoPrestamo: item.prestamoTipo === 'por_cobrar' ? 'Por cobrar' : 'Por pagar',
    fecha: getExportDateCell(item.fecha),
    mesAplicado: exportPeriodDate(item.mes, parseDateParts(item.fecha)?.year || runtime.curY),
    monto: Number(item.monto || 0),
    impacto: item.impacto || 'ninguno',
    nota: item.nota || '',
  }));

  const cargaGastosRows = getScopedGastos(scope).map(gasto => ({
    descripcion: gasto.desc,
    categoria: gasto.cat,
    diaPago: Number(gasto.dia || 1),
    tipo: gasto.tipo,
    monto: Number(gasto.monto || 0),
    mes: Number(gasto.mes) + 1,
    anio: Number(gasto.anio),
    totalCuotas: Number(gasto.cuotas || 0),
    cuotaActual: Number(gasto.cuotaAct || 1),
    pagado: Boolean(gasto.pagado),
    fechaPagado: getExportDateCell(gasto.fechaPagado),
    origenMes: Number(gasto.origenMes ?? gasto.mes) + 1,
    origenAnio: Number(gasto.origenAnio ?? gasto.anio),
  }));

  try {
    await runWithLoading(`Generando Excel de ${getExportScopeLabel(scope)}...`, async () => {
      addSummaryWorksheet(workbook, scope);

      addWorksheet(workbook, 'Gastos', [
        { header: 'Descripcion', key: 'descripcion', width: 28 },
        { header: 'Categoria', key: 'categoria', width: 16 },
        { header: 'Tipo', key: 'tipo', width: 14 },
        { header: 'Dia', key: 'dia', width: 10 },
        { header: 'Monto', key: 'monto', width: 14 },
        { header: 'Periodo', key: 'periodo', width: 16 },
        { header: 'Origen', key: 'origen', width: 16 },
        { header: 'Estado', key: 'estado', width: 14 },
        { header: 'Fecha pagado', key: 'fechaPagado', width: 16 },
        { header: 'Cuota', key: 'cuota', width: 14 },
      ], gastosRows, {
        scope,
        title: 'Detalle de gastos',
        currencyKeys: ['monto'],
        dateKeys: ['fechaPagado'],
        periodKeys: ['periodo', 'origen'],
        statusKey: 'estado',
        tabColor: EXCEL_COLORS.red,
      });

      addWorksheet(workbook, 'Ingresos extra', [
        { header: 'Descripcion', key: 'descripcion', width: 28 },
        { header: 'Monto', key: 'monto', width: 14 },
        { header: 'Periodo', key: 'periodo', width: 16 },
      ], ingresosRows, {
        scope,
        title: 'Ingresos extra',
        currencyKeys: ['monto'],
        periodKeys: ['periodo'],
        tabColor: EXCEL_COLORS.green,
      });

      addWorksheet(workbook, 'Anotaciones', [
        { header: 'Descripcion', key: 'descripcion', width: 28 },
        { header: 'Categoria', key: 'categoria', width: 16 },
        { header: 'Tipo', key: 'tipo', width: 14 },
        { header: 'Dia', key: 'dia', width: 10 },
        { header: 'Monto', key: 'monto', width: 14 },
        { header: 'Creado en', key: 'creado', width: 16 },
        { header: 'Cuota', key: 'cuota', width: 14 },
      ], anotacionesRows, {
        scope,
        title: 'Anotaciones y recordatorios',
        currencyKeys: ['monto'],
        periodKeys: ['creado'],
        tabColor: EXCEL_COLORS.amber,
      });

      addWorksheet(workbook, 'Prestamos', [
        { header: 'Tipo', key: 'tipo', width: 14 },
        { header: 'Persona', key: 'persona', width: 18 },
        { header: 'Descripcion', key: 'descripcion', width: 28 },
        { header: 'Monto total', key: 'montoTotal', width: 14 },
        { header: 'Abonado', key: 'abonado', width: 14 },
        { header: 'Saldo', key: 'saldo', width: 14 },
        { header: 'Creado', key: 'creado', width: 14 },
        { header: 'Fecha', key: 'fecha', width: 14 },
        { header: 'Vencimiento', key: 'vencimiento', width: 14 },
        { header: 'Estado', key: 'estado', width: 12 },
        { header: 'Notas', key: 'notas', width: 26 },
      ], prestamosRows, {
        scope,
        title: 'Préstamos por cobrar y por pagar',
        currencyKeys: ['montoTotal', 'abonado', 'saldo'],
        dateKeys: ['creado', 'fecha', 'vencimiento'],
        statusKey: 'estado',
        tabColor: EXCEL_COLORS.blue,
      });

      addWorksheet(workbook, 'Abonos', [
        { header: 'Prestamo', key: 'prestamo', width: 18 },
        { header: 'Tipo prestamo', key: 'tipoPrestamo', width: 14 },
        { header: 'Fecha', key: 'fecha', width: 14 },
        { header: 'Mes aplicado', key: 'mesAplicado', width: 14 },
        { header: 'Monto', key: 'monto', width: 14 },
        { header: 'Impacto', key: 'impacto', width: 12 },
        { header: 'Nota', key: 'nota', width: 26 },
      ], abonosRows, {
        scope,
        title: 'Historial de abonos',
        currencyKeys: ['monto'],
        dateKeys: ['fecha'],
        periodKeys: ['mesAplicado'],
        showTotals: true,
        tabColor: EXCEL_COLORS.green,
      });

      addWorksheet(workbook, 'Carga de gastos', [
        { header: 'descripcion', key: 'descripcion', width: 28 },
        { header: 'categoria', key: 'categoria', width: 18 },
        { header: 'dia_pago', key: 'diaPago', width: 12 },
        { header: 'tipo', key: 'tipo', width: 12 },
        { header: 'monto', key: 'monto', width: 15 },
        { header: 'mes', key: 'mes', width: 10 },
        { header: 'anio', key: 'anio', width: 10 },
        { header: 'total_cuotas', key: 'totalCuotas', width: 14 },
        { header: 'cuota_actual', key: 'cuotaActual', width: 14 },
        { header: 'pagado', key: 'pagado', width: 11 },
        { header: 'fecha_pagado', key: 'fechaPagado', width: 16 },
        { header: 'origen_mes', key: 'origenMes', width: 12 },
        { header: 'origen_anio', key: 'origenAnio', width: 12 },
      ], cargaGastosRows, {
        scope,
        title: 'Carga de gastos',
        subtitle: 'Hoja compatible con la opción Importar Excel. El mes usa valores del 1 al 12.',
        currencyKeys: ['monto'],
        dateKeys: ['fechaPagado'],
        showTotals: false,
        tabColor: EXCEL_COLORS.muted,
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      window.saveAs(blob, getExportFileName(scope));
    });

    closeExportModal();
    toast(`Excel exportado: ${getExportScopeLabel(scope)}`);
  } catch (error) {
    console.error(error);
    alert('No se pudo generar el Excel.');
  }
}

app.actions.updateInicio = updateInicio;

document.addEventListener('click', (event) => {
  const menu = document.getElementById('excel-actions-menu');
  if (menu?.open && !menu.contains(event.target)) closeExcelActionsMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeExcelActionsMenu();
});

Object.assign(window, {
  closeEmailRemindersModal,
  closeExportModal,
  closeExtraModal,
  closeSueldoModal,
  delExtra,
  editExtra,
  exportExcel,
  handleExcelImport,
  openEmailRemindersModal,
  openExportModal,
  openExtraModal,
  openInicioGastosDetalle,
  openSueldoModal,
  saveEmailReminders,
  saveExtra,
  saveSueldoFromModal,
  sendEmailReminderTest,
  syncEmailReminderDraftState,
  triggerExcelImport,
});
