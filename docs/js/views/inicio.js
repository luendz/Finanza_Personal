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
  const details = document.getElementById('inicio-gastos-detalle');
  if (!details) return;
  details.open = true;
  details.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const sliceLabels = [];
  if (!sorted.length || total <= 0) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#f3f4f6';
    ctx.fill();
  } else {
    sorted.forEach(([cat, value]) => {
      const slice = (value / total) * Math.PI * 2;
      const midAngle = start + slice / 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, start, start + slice);
      ctx.closePath();
      ctx.fillStyle = cs(cat).bar;
      ctx.fill();
      sliceLabels.push({
        angle: midAngle,
        percent: `${Math.round((value / total) * 100)}%`,
      });
      start += slice;
    });
  }

  ctx.beginPath();
  ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  if (sliceLabels.length) {
    const labelRadius = (radius + innerRadius) / 2;
    ctx.font = '700 11px "Nunito Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(24, 32, 51, 0.25)';
    ctx.fillStyle = '#ffffff';
    sliceLabels.forEach(label => {
      const x = centerX + Math.cos(label.angle) * labelRadius;
      const y = centerY + Math.sin(label.angle) * labelRadius;
      ctx.strokeText(label.percent, x, y);
      ctx.fillText(label.percent, x, y);
    });
  }

  const centerTotal = document.getElementById('donut-total');
  if (centerTotal) centerTotal.textContent = fmt(total);

  const legend = document.getElementById('dlegend');
  if (!legend) return;
  if (!sorted.length) {
    legend.innerHTML = `
      <div class="rounded-[18px] border border-dashed border-borderc bg-appbg px-4 py-5 text-center">
        <div class="font-heading text-[15px] font-bold text-text1">Sin categorias por mostrar</div>
        <div class="mt-2 text-[12px] leading-6 text-text2">Cuando registres gastos, aqui veras la participacion de cada categoria.</div>
      </div>
    `;
    return;
  }

  legend.innerHTML = sorted.map(([cat, value]) => {
    const palette = cs(cat);
    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

    return `
      <div class="flex items-center justify-between gap-3 rounded-[14px] border border-borderc bg-white px-3 py-2 text-[12px] shadow-soft">
        <div class="flex min-w-0 items-center gap-2">
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:${palette.bar}"></span>
          <span class="truncate font-semibold text-text1">${cat}</span>
        </div>
        <div class="flex shrink-0 items-center gap-3">
          <span class="text-[11px] font-bold uppercase tracking-[0.06em] text-text3">${percentage}%</span>
          <span class="font-semibold text-text1">${fmt(value)}</span>
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
  const summary = document.getElementById('email-reminder-summary');
  const chip = document.getElementById('email-reminder-chip');
  if (!summary || !chip) return;

  if (!runtime.currentUser) {
    summary.textContent = 'Inicia sesión para activar un correo diario con tus gastos vencidos y próximos pagos.';
    chip.className = 'inline-flex items-center rounded-full border border-borderc bg-white px-3 py-1 text-[11px] font-bold text-text2';
    chip.textContent = 'Sin sesión';
    return;
  }

  const settings = getEmailReminderSettings();
  const daysCopy = settings.diasAdelanto > 0
    ? `vencidos y próximos ${settings.diasAdelanto} día(s)`
    : 'vencidos del día';

  if (settings.activo) {
    summary.textContent = `${settings.emailDestino || runtime.currentUser.email} · ${daysCopy} · todos los días a las ${formatReminderHour(settings.horaEnvio)} (${settings.timezone}).`;
    chip.className = 'inline-flex items-center rounded-full border border-[#d8ead8] bg-[#f5fbf5] px-3 py-1 text-[11px] font-bold text-green1';
    chip.textContent = 'Activo';
    return;
  }

  summary.textContent = 'Desactivadas por ahora. Cuando las actives, enviaremos un solo correo al día para no gastar de más.';
  chip.className = 'inline-flex items-center rounded-full border border-borderc bg-white px-3 py-1 text-[11px] font-bold text-text2';
  chip.textContent = 'Inactivo';
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
  const periodoAnterior = periodoRelativo(-1);
  const arrastreAnterior = resumenDelPeriodo(periodoAnterior.month, periodoAnterior.year);

  const inicioSub = document.getElementById('inicio-sub');
  if (!inicioSub) return;

  inicioSub.textContent = `Tu resumen de ${MS[runtime.curM]} ${runtime.curY}`;
  const sueldoCardSub = document.getElementById('sueldo-card-sub');
  if (sueldoCardSub) sueldoCardSub.textContent = `Monto fijo de ${MS[runtime.curM]} ${runtime.curY}`;
  const sueldoDisplay = document.getElementById('sueldo-display');
  if (sueldoDisplay) sueldoDisplay.textContent = fmt(sueldoBase);
  document.getElementById('cextra').textContent = fmt(extras);
  document.getElementById('cextrasub').textContent = `${extrasDelMes().length} ingreso(s) extra este mes`;
  document.getElementById('cing').textContent = fmt(ingresos);
  document.getElementById('cg').textContent = fmt(gastos);
  document.getElementById('cgsub').textContent = `${items.length} gastos activos`;
  document.getElementById('cr').textContent = fmt(Math.abs(resta));

  const rcard = document.getElementById('rcard');
  const crValue = document.getElementById('cr');
  if (resta >= 0) {
    crValue.className = 'font-heading text-[34px] font-bold leading-none text-bluetx';
    document.getElementById('ricon-wrap').textContent = 'Disponible';
    document.getElementById('crsub').textContent = 'disponible';
    rcard.className = 'mb-6 rounded-[22px] border border-[#d8e4fb] bg-gradient-to-br from-bluebg via-white to-white px-6 py-5 shadow-soft ring-1 ring-[#dde8fb]';
  } else {
    crValue.className = 'font-heading text-[34px] font-bold leading-none text-red1';
    document.getElementById('ricon-wrap').textContent = 'Alerta';
    document.getElementById('crsub').textContent = 'te pasaste';
    rcard.className = 'mb-6 rounded-[22px] border border-[#f4d6d6] bg-gradient-to-br from-redbg via-white to-white px-6 py-5 shadow-soft ring-1 ring-[#f8e1e1]';
  }

  const progressFill = document.getElementById('pfill');
  progressFill.style.width = `${Math.min(pct, 100).toFixed(1)}%`;
  progressFill.className = `h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-red1' : pct >= 80 ? 'bg-[#e8b84b]' : 'bg-green1'}`;

  document.getElementById('ppct').textContent = `${pct.toFixed(0)}%`;
  document.getElementById('pleft').innerHTML = `<span class="text-text2">Gastado</span> <span class="font-semibold text-red1">${fmt(gastos)}</span>`;
  document.getElementById('pright').innerHTML = resta >= 0
    ? `<span class="text-bluetx">Disponible</span> <span class="font-semibold text-bluetx">${fmt(resta)}</span>`
    : `<span class="text-red1">Exceso</span> <span class="font-semibold text-red1">${fmt(Math.abs(resta))}</span>`;

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
    carryPrevAmount.className = `font-heading text-[20px] font-bold ${saldoAnteriorPositivo ? 'text-bluetx' : 'text-red1'}`;
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
      focusCopy.textContent = 'Tu mes se ve estable. Usa el detalle solo cuando necesites editar o revisar todo.';
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

function openEmailRemindersModal() {
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
  document.getElementById('excel-import').click();
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
      const sheet = workbook.worksheets[0];
      const headers = sheet.getRow(1).values.map(value => String(value || '').trim().toLowerCase());
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
          mes: parseInt(values[headers.indexOf('mes') + 1], 10) || runtime.curM,
          anio: parseInt(values[headers.indexOf('anio') + 1], 10) || runtime.curY,
          total_cuotas: parseInt(values[headers.indexOf('total_cuotas') + 1], 10) || 0,
          cuota_actual: parseInt(values[headers.indexOf('cuota_actual') + 1], 10) || 1,
        };
        if (item.descripcion && item.monto > 0) rows.push(item);
      });

      if (!rows.length) {
        alert('No se encontraron datos validos en el archivo.');
        return;
      }

      const payloads = rows.map(item => ({
        user_id: currentUser.id,
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
        total_cuotas: item.total_cuotas,
      }));

      const { error } = await app.supabaseClient.from('gastos').insert(payloads);
      if (error) {
        alert(error.message);
        return;
      }

      await app.actions.refreshAppData?.();
      toast('Excel importado');
    });
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
  return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
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

function addWorksheet(workbook, name, columns, rows, options = {}) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map(({ header, key, width }) => ({ header, key, width }));

  const safeRows = rows.length
    ? rows
    : [columns.reduce((acc, column, index) => {
      acc[column.key] = index === 0 ? 'Sin registros para el alcance seleccionado.' : '';
      return acc;
    }, {})];

  safeRows.forEach(row => sheet.addRow(row));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FF2B3C58' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF5FF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 22;

  headerRow.eachCell(cell => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD8E4F3' } },
      bottom: { style: 'thin', color: { argb: 'FFD8E4F3' } },
    };
  });

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  if (columns.length > 1) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
  }

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: 'middle' };
    row.eachCell(cell => {
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFF0F3F8' } },
      };
    });
  });

  (options.currencyKeys || []).forEach(key => {
    sheet.getColumn(key).numFmt = '"S/" #,##0.00';
  });

  return sheet;
}

function addSummaryWorksheet(workbook, scope) {
  if (scope === 'month') {
    const current = resumenDelPeriodo(runtime.curM, runtime.curY);
    const previous = periodoRelativo(-1);
    const previousSummary = resumenDelPeriodo(previous.month, previous.year);
    const gastos = gastosActivosDelPeriodo(runtime.curM, runtime.curY);
    const byCategory = {};

    gastos.forEach(gasto => {
      byCategory[gasto.cat] = (byCategory[gasto.cat] || 0) + Number(gasto.monto || 0);
    });

    const topCategory = Object.entries(byCategory).sort((left, right) => right[1] - left[1])[0];
    const rows = [
      { indicador: 'Alcance', valor: 'Mes actual del panel' },
      { indicador: 'Periodo', valor: `${MS[runtime.curM]} ${runtime.curY}` },
      { indicador: 'Sueldo base', valor: fmt(current.sueldoBase) },
      { indicador: 'Ingresos extra', valor: fmt(current.extras) },
      { indicador: 'Ingresos del periodo', valor: fmt(current.ingresos) },
      { indicador: 'Gastos activos del periodo', valor: fmt(current.gastos) },
      { indicador: 'Disponible estimado', valor: fmtSigned(current.saldo) },
      { indicador: 'Arrastre del mes pasado', valor: fmtSigned(previousSummary.saldo) },
      { indicador: 'Gastos visibles', valor: `${gastos.length}` },
      { indicador: 'Categoria principal', valor: topCategory ? `${topCategory[0]} · ${fmt(topCategory[1])}` : 'Sin gastos registrados' },
    ];

    addWorksheet(workbook, 'Resumen', [
      { header: 'Indicador', key: 'indicador', width: 28 },
      { header: 'Valor', key: 'valor', width: 34 },
    ], rows);
    return;
  }

  if (scope === 'year') {
    const rows = MS.map((monthName, index) => {
      const summary = resumenDelPeriodo(index, runtime.curY);
      return {
        periodo: `${monthName} ${runtime.curY}`,
        sueldo: summary.sueldoBase,
        extras: summary.extras,
        ingresos: summary.ingresos,
        gastos: summary.gastos,
        saldo: summary.saldo,
      };
    });

    const totals = rows.reduce((acc, row) => ({
      sueldo: acc.sueldo + row.sueldo,
      extras: acc.extras + row.extras,
      ingresos: acc.ingresos + row.ingresos,
      gastos: acc.gastos + row.gastos,
      saldo: acc.saldo + row.saldo,
    }), { sueldo: 0, extras: 0, ingresos: 0, gastos: 0, saldo: 0 });

    rows.push({
      periodo: `Total ${runtime.curY}`,
      ...totals,
    });

    addWorksheet(workbook, 'Resumen', [
      { header: 'Periodo', key: 'periodo', width: 20 },
      { header: 'Sueldo', key: 'sueldo', width: 14 },
      { header: 'Extras', key: 'extras', width: 14 },
      { header: 'Ingresos', key: 'ingresos', width: 16 },
      { header: 'Gastos', key: 'gastos', width: 16 },
      { header: 'Saldo', key: 'saldo', width: 16 },
    ], rows, {
      currencyKeys: ['sueldo', 'extras', 'ingresos', 'gastos', 'saldo'],
    });
    return;
  }

  const rows = getAllSummaryYears().map(year => {
    const totals = Array.from({ length: 12 }, (_, month) => resumenDelPeriodo(month, year)).reduce((acc, summary) => ({
      sueldo: acc.sueldo + summary.sueldoBase,
      extras: acc.extras + summary.extras,
      ingresos: acc.ingresos + summary.ingresos,
      gastos: acc.gastos + summary.gastos,
      saldo: acc.saldo + summary.saldo,
    }), { sueldo: 0, extras: 0, ingresos: 0, gastos: 0, saldo: 0 });

    return {
      periodo: String(year),
      ...totals,
    };
  });

  const grandTotals = rows.reduce((acc, row) => ({
    sueldo: acc.sueldo + row.sueldo,
    extras: acc.extras + row.extras,
    ingresos: acc.ingresos + row.ingresos,
    gastos: acc.gastos + row.gastos,
    saldo: acc.saldo + row.saldo,
  }), { sueldo: 0, extras: 0, ingresos: 0, gastos: 0, saldo: 0 });

  rows.push({
    periodo: 'Total general',
    ...grandTotals,
  });

  addWorksheet(workbook, 'Resumen', [
    { header: 'Año', key: 'periodo', width: 16 },
    { header: 'Sueldo', key: 'sueldo', width: 14 },
    { header: 'Extras', key: 'extras', width: 14 },
    { header: 'Ingresos', key: 'ingresos', width: 16 },
    { header: 'Gastos', key: 'gastos', width: 16 },
    { header: 'Saldo', key: 'saldo', width: 16 },
  ], rows, {
    currencyKeys: ['sueldo', 'extras', 'ingresos', 'gastos', 'saldo'],
  });
}

async function exportExcel() {
  const scope = getSelectedExportScope();
  const workbook = new window.ExcelJS.Workbook();
  workbook.creator = 'Mis Finanzas';
  workbook.created = new Date();

  const gastosRows = getScopedGastos(scope).map(gasto => ({
    descripcion: gasto.desc,
    categoria: gasto.cat,
    tipo: gasto.tipo,
    dia: Number(gasto.dia || 0),
    monto: Number(gasto.monto || 0),
    periodo: `${MS[gasto.mes]} ${gasto.anio}`,
    origen: `${MS[gasto.origenMes ?? gasto.mes]} ${gasto.origenAnio ?? gasto.anio}`,
    estado: gastoPaymentStatus(gasto).label,
    fechaPagado: gasto.fechaPagado || '',
    cuota: gasto.tipo === 'cuotas' ? `${gasto.cuotaAct || 1} de ${gasto.cuotas || 0}` : '',
  }));

  const ingresosRows = getScopedIngresos(scope).map(item => ({
    descripcion: item.desc,
    monto: Number(item.monto || 0),
    periodo: `${MS[item.mes]} ${item.anio}`,
  }));

  const anotacionesRows = getScopedAnotaciones(scope).map(note => ({
    descripcion: note.desc,
    categoria: note.cat,
    tipo: note.tipo,
    dia: Number(note.dia || 0),
    monto: Number(note.monto || 0),
    creado: `${MS[note.creadoMes]} ${note.creadoAnio}`,
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
      fecha: prestamo.fecha || '',
      vencimiento: prestamo.vencimiento || '',
      estado,
      notas: prestamo.notas || '',
    };
  });

  const abonosRows = getScopedAbonos(scope).map(item => ({
    prestamo: item.prestamoPersona,
    tipoPrestamo: item.prestamoTipo === 'por_cobrar' ? 'Por cobrar' : 'Por pagar',
    fecha: item.fecha || '',
    mesAplicado: MS[item.mes] || '',
    monto: Number(item.monto || 0),
    impacto: item.impacto || 'ninguno',
    nota: item.nota || '',
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
      ], gastosRows, { currencyKeys: ['monto'] });

      addWorksheet(workbook, 'Ingresos extra', [
        { header: 'Descripcion', key: 'descripcion', width: 28 },
        { header: 'Monto', key: 'monto', width: 14 },
        { header: 'Periodo', key: 'periodo', width: 16 },
      ], ingresosRows, { currencyKeys: ['monto'] });

      addWorksheet(workbook, 'Anotaciones', [
        { header: 'Descripcion', key: 'descripcion', width: 28 },
        { header: 'Categoria', key: 'categoria', width: 16 },
        { header: 'Tipo', key: 'tipo', width: 14 },
        { header: 'Dia', key: 'dia', width: 10 },
        { header: 'Monto', key: 'monto', width: 14 },
        { header: 'Creado en', key: 'creado', width: 16 },
        { header: 'Cuota', key: 'cuota', width: 14 },
      ], anotacionesRows, { currencyKeys: ['monto'] });

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
      ], prestamosRows, { currencyKeys: ['montoTotal', 'abonado', 'saldo'] });

      addWorksheet(workbook, 'Abonos', [
        { header: 'Prestamo', key: 'prestamo', width: 18 },
        { header: 'Tipo prestamo', key: 'tipoPrestamo', width: 14 },
        { header: 'Fecha', key: 'fecha', width: 14 },
        { header: 'Mes aplicado', key: 'mesAplicado', width: 14 },
        { header: 'Monto', key: 'monto', width: 14 },
        { header: 'Impacto', key: 'impacto', width: 12 },
        { header: 'Nota', key: 'nota', width: 26 },
      ], abonosRows, { currencyKeys: ['monto'] });

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
