import { app, resetState, runtime, state, supabaseClient } from './core.js';

const LEGACY_SALARY_STORAGE_KEY = 'mf3_sueldo';
const MONTHLY_SALARY_STORAGE_KEY = 'mf3_sueldos_mensuales';
const DEFAULT_EMAIL_REMINDER_SETTINGS = Object.freeze({
  activo: false,
  emailDestino: '',
  diasAdelanto: 2,
  horaEnvio: 7,
  timezone: 'America/Lima',
  ultimoEnvioFecha: null,
  ultimoError: null,
});

function sueldoPeriodKey(month, year) {
  return `${year}-${String(Number(month) + 1).padStart(2, '0')}`;
}

function normalizeMonthlySalaries(rawValue) {
  if (!rawValue || typeof rawValue !== 'object') return {};
  return Object.entries(rawValue).reduce((acc, [key, value]) => {
    const amount = Number(value);
    if (!Number.isNaN(amount) && amount >= 0) {
      acc[key] = amount;
    }
    return acc;
  }, {});
}

function readMonthlySalaries() {
  const rawValue = localStorage.getItem(MONTHLY_SALARY_STORAGE_KEY);
  if (!rawValue) return {};
  try {
    return normalizeMonthlySalaries(JSON.parse(rawValue));
  } catch (error) {
    console.warn('No se pudo leer sueldos por mes:', error);
    return {};
  }
}

function writeMonthlySalaries(value) {
  localStorage.setItem(MONTHLY_SALARY_STORAGE_KEY, JSON.stringify(normalizeMonthlySalaries(value)));
}

function mapMonthlySalaryRows(rows) {
  return normalizeMonthlySalaries((rows || []).reduce((acc, row) => {
    const month = Number(row?.mes);
    const year = Number(row?.anio);
    if (!Number.isNaN(month) && !Number.isNaN(year)) {
      acc[sueldoPeriodKey(month, year)] = Number(row?.sueldo || 0);
    }
    return acc;
  }, {}));
}

function monthlySalaryRowsFromMap(userId, monthlySalaries) {
  return Object.entries(normalizeMonthlySalaries(monthlySalaries)).map(([periodKey, sueldo]) => {
    const [yearValue, monthValue] = String(periodKey).split('-');
    return {
      user_id: userId,
      anio: Number(yearValue),
      mes: Math.max(0, Number(monthValue) - 1),
      sueldo: Number(sueldo) || 0,
    };
  });
}

function monthlySalaryMapsMatch(left, right) {
  const leftMap = normalizeMonthlySalaries(left);
  const rightMap = normalizeMonthlySalaries(right);
  const leftKeys = Object.keys(leftMap).sort();
  const rightKeys = Object.keys(rightMap).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && Number(leftMap[key]) === Number(rightMap[key]));
}

function normalizeEmailReminderSettings(rawValue, fallbackEmail = '') {
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {};
  const emailDestino = String(source.email_destino ?? source.emailDestino ?? fallbackEmail ?? '').trim();
  const diasAdelanto = Math.min(7, Math.max(0, parseInt(source.dias_adelanto ?? source.diasAdelanto ?? DEFAULT_EMAIL_REMINDER_SETTINGS.diasAdelanto, 10) || 0));
  const horaEnvio = Math.min(23, Math.max(0, parseInt(source.hora_envio ?? source.horaEnvio ?? DEFAULT_EMAIL_REMINDER_SETTINGS.horaEnvio, 10) || 0));
  const timezone = String(source.timezone || DEFAULT_EMAIL_REMINDER_SETTINGS.timezone).trim() || DEFAULT_EMAIL_REMINDER_SETTINGS.timezone;

  return {
    activo: Boolean(source.activo ?? DEFAULT_EMAIL_REMINDER_SETTINGS.activo),
    emailDestino,
    diasAdelanto,
    horaEnvio,
    timezone,
    ultimoEnvioFecha: source.ultimo_envio_fecha ?? source.ultimoEnvioFecha ?? null,
    ultimoError: source.ultimo_error ?? source.ultimoError ?? null,
  };
}

export function getEmailReminderSettings() {
  return normalizeEmailReminderSettings(state.userSettings?.emailReminders, runtime.currentUser?.email || '');
}

export function getSueldoForPeriod(month = runtime.curM, year = runtime.curY) {
  const key = sueldoPeriodKey(month, year);
  const monthlySalaries = normalizeMonthlySalaries(state.userSettings?.sueldosMensuales);
  if (Object.prototype.hasOwnProperty.call(monthlySalaries, key)) {
    return Number(monthlySalaries[key]) || 0;
  }

  const storedMonthlySalaries = readMonthlySalaries();
  if (Object.prototype.hasOwnProperty.call(storedMonthlySalaries, key)) {
    return Number(storedMonthlySalaries[key]) || 0;
  }

  if (typeof state.userSettings?.sueldo === 'number' && !Number.isNaN(state.userSettings.sueldo)) {
    return state.userSettings.sueldo;
  }

  const legacySalary = localStorage.getItem(LEGACY_SALARY_STORAGE_KEY);
  return legacySalary !== null ? Number(legacySalary) || 0 : 0;
}

export async function loadCloudData() {
  if (!runtime.currentUser) {
    resetState();
    return;
  }

  const [
    categoriasRes,
    gastosRes,
    ingresosRes,
    anotacionesRes,
    prestamosRes,
    abonosRes,
    sueldosMensualesRes,
    recordatoriosRes,
    settingsRes,
  ] = await Promise.all([
    supabaseClient.from('categorias').select('*').eq('user_id', runtime.currentUser.id).order('nombre'),
    supabaseClient.from('gastos').select('*').eq('user_id', runtime.currentUser.id).order('id'),
    supabaseClient.from('ingresos_extra').select('*').eq('user_id', runtime.currentUser.id).order('id'),
    supabaseClient.from('anotaciones').select('*').eq('user_id', runtime.currentUser.id).order('id'),
    supabaseClient.from('prestamos').select('*').eq('user_id', runtime.currentUser.id).order('id'),
    supabaseClient.from('abonos_prestamos').select('*').eq('user_id', runtime.currentUser.id).order('id'),
    supabaseClient.from('sueldos_mensuales').select('mes, anio, sueldo').eq('user_id', runtime.currentUser.id),
    supabaseClient.from('recordatorios_correo').select('*').eq('user_id', runtime.currentUser.id).maybeSingle(),
    supabaseClient.from('user_settings').select('sueldo').eq('user_id', runtime.currentUser.id).single(),
  ]);

  if (categoriasRes.error) throw categoriasRes.error;
  if (gastosRes.error) throw gastosRes.error;
  if (ingresosRes.error) throw ingresosRes.error;
  if (anotacionesRes.error) throw anotacionesRes.error;
  if (prestamosRes.error) throw prestamosRes.error;
  if (abonosRes.error) throw abonosRes.error;

  state.categorias = (categoriasRes.data || []).map(item => String(item.nombre || '').trim());

  state.gastos = (gastosRes.data || []).map(gasto => ({
    id: Number(gasto.id),
    desc: String(gasto.descripcion || '').trim(),
    cat: String(gasto.categoria || '').trim(),
    dia: Number(gasto.dia_pago || 1),
    tipo: String(gasto.tipo || 'unico').trim(),
    monto: Number(gasto.monto || 0),
    mes: Number(gasto.mes),
    anio: Number(gasto.anio),
    origenMes: gasto.origen_mes ?? gasto.mes,
    origenAnio: gasto.origen_anio ?? gasto.anio,
    pagado: Boolean(gasto.pagado),
    fechaPagado: gasto.fecha_pagado || null,
    cuotaAct: Number(gasto.cuota_actual || 1),
    cuotas: Number(gasto.total_cuotas || 0),
  }));

  state.ingresosExtra = (ingresosRes.data || []).map(item => ({
    id: Number(item.id),
    desc: String(item.descripcion || '').trim(),
    monto: Number(item.monto || 0),
    mes: Number(item.mes),
    anio: Number(item.anio),
  }));

  state.anotaciones = (anotacionesRes.data || []).map(item => ({
    id: Number(item.id),
    desc: String(item.descripcion || '').trim(),
    cat: String(item.categoria || '').trim(),
    dia: Number(item.dia_pago || 1),
    tipo: String(item.tipo || 'unico').trim(),
    monto: Number(item.monto || 0),
    creadoMes: Number(item.creado_mes),
    creadoAnio: Number(item.creado_anio),
    cuotaAct: Number(item.cuota_actual || 1),
    cuotas: Number(item.total_cuotas || 0),
  }));

  const prestamosData = prestamosRes.data || [];
  const abonosData = abonosRes.data || [];
  state.prestamos = prestamosData.map(prestamo => {
    const historial = abonosData
      .filter(abono => abono.prestamo_id === prestamo.id)
      .map(abono => ({
        id: Number(abono.id),
        fecha: abono.fecha || new Date().toISOString(),
        mes: Number(abono.mes),
        monto: Number(abono.monto),
        impacto: abono.impacto || 'ninguno',
        nota: abono.nota || '',
        linkedType: abono.linked_type,
        linkedId: abono.linked_id ? Number(abono.linked_id) : null,
      }))
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    return {
      id: Number(prestamo.id),
      tipo: prestamo.tipo,
      persona: prestamo.persona,
      desc: prestamo.descripcion,
      montoTotal: Number(prestamo.monto_total),
      montoPagado: Number(prestamo.monto_pagado),
      createdAt: prestamo.created_at || null,
      fecha: prestamo.fecha,
      vencimiento: prestamo.vencimiento,
      notas: prestamo.notas,
      historial,
    };
  });

  const localMonthlySalaries = readMonthlySalaries();
  const cloudMonthlySalaries = sueldosMensualesRes.error ? {} : mapMonthlySalaryRows(sueldosMensualesRes.data);
  state.userSettings = {
    sueldo: null,
    sueldosMensuales: { ...localMonthlySalaries, ...cloudMonthlySalaries },
    emailReminders: normalizeEmailReminderSettings(recordatoriosRes.data, runtime.currentUser.email || ''),
  };

  if (Object.keys(state.userSettings.sueldosMensuales).length) {
    writeMonthlySalaries(state.userSettings.sueldosMensuales);
  }

  if (!sueldosMensualesRes.error && !monthlySalaryMapsMatch(localMonthlySalaries, cloudMonthlySalaries) && Object.keys(localMonthlySalaries).length) {
    const mergedMonthlySalaryRows = monthlySalaryRowsFromMap(runtime.currentUser.id, state.userSettings.sueldosMensuales);
    const { error: syncMonthlySalaryError } = await supabaseClient
      .from('sueldos_mensuales')
      .upsert(mergedMonthlySalaryRows, { onConflict: 'user_id,anio,mes' });

    if (syncMonthlySalaryError) {
      console.warn('No se pudo sincronizar sueldos mensuales locales con BD:', syncMonthlySalaryError.message);
    }
  }

  if (!settingsRes.error && settingsRes.data) {
    state.userSettings.sueldo = Number(settingsRes.data.sueldo || 0);
  }

  const storedSalary = localStorage.getItem(LEGACY_SALARY_STORAGE_KEY);
  if (storedSalary !== null && (state.userSettings.sueldo === null || Number.isNaN(state.userSettings.sueldo))) {
    state.userSettings.sueldo = Number(storedSalary);
  }

  if (sueldosMensualesRes.error) {
    console.warn('No se pudo cargar sueldos mensuales de BD:', sueldosMensualesRes.error.message);
  }

  const reminderErrorMessage = recordatoriosRes.error?.message?.toLowerCase() || '';
  if (recordatoriosRes.error && !reminderErrorMessage.includes('no row') && !reminderErrorMessage.includes('not found') && !reminderErrorMessage.includes('recordatorios_correo')) {
    console.warn('No se pudo cargar recordatorios por correo:', recordatoriosRes.error.message);
  }

  const errorMessage = settingsRes.error?.message?.toLowerCase() || '';
  if (settingsRes.error && !errorMessage.includes('no row') && !errorMessage.includes('not found') && !errorMessage.includes('user_settings')) {
    console.warn('No se pudo cargar sueldo de BD:', settingsRes.error.message);
  }
}

export function syncSueldoInput() {
  const sueldoInput = document.getElementById('sueldo');
  if (!sueldoInput) return;
  const currentValue = sueldoInput.value;
  const storedValue = getSueldoForPeriod(runtime.curM, runtime.curY);

  if (String(storedValue) !== currentValue) {
    sueldoInput.value = storedValue;
  }
}

export async function saveSueldo(month = runtime.curM, year = runtime.curY) {
  const sueldoInput = document.getElementById('sueldo');
  if (!sueldoInput) return;
  const sueldoBase = parseFloat(sueldoInput.value) || 0;
  const key = sueldoPeriodKey(month, year);
  const monthlySalaries = {
    ...readMonthlySalaries(),
    ...normalizeMonthlySalaries(state.userSettings?.sueldosMensuales),
    [key]: sueldoBase,
  };

  writeMonthlySalaries(monthlySalaries);
  const hasFallbackSalary = typeof state.userSettings?.sueldo === 'number' && !Number.isNaN(state.userSettings.sueldo)
    ? true
    : localStorage.getItem(LEGACY_SALARY_STORAGE_KEY) !== null;

  if (!hasFallbackSalary) {
    localStorage.setItem(LEGACY_SALARY_STORAGE_KEY, sueldoBase);
  }

  state.userSettings = { ...state.userSettings, sueldosMensuales: monthlySalaries };

  if (!runtime.currentUser) return;

  const { error: monthlySalaryError } = await supabaseClient
    .from('sueldos_mensuales')
    .upsert(
      { user_id: runtime.currentUser.id, anio: year, mes: month, sueldo: sueldoBase },
      { onConflict: 'user_id,anio,mes' },
    );

  if (monthlySalaryError) {
    console.warn('No se pudo guardar sueldo mensual en BD:', monthlySalaryError.message);
  }

  if (hasFallbackSalary) return;

  const { error } = await supabaseClient
    .from('user_settings')
    .upsert({ user_id: runtime.currentUser.id, sueldo: sueldoBase }, { onConflict: 'user_id' });

  if (error) {
    console.warn('No se pudo guardar el sueldo en BD:', error.message);
  }
}

export async function saveEmailReminderSettings(nextSettings) {
  const fallbackEmail = runtime.currentUser?.email || '';
  const normalized = normalizeEmailReminderSettings(nextSettings, fallbackEmail);
  const previousSettings = state.userSettings?.emailReminders;

  if (!runtime.currentUser) {
    state.userSettings = {
      ...state.userSettings,
      emailReminders: normalized,
    };
    return { data: normalized, error: null };
  }

  const payload = {
    user_id: runtime.currentUser.id,
    activo: normalized.activo,
    email_destino: normalized.emailDestino || fallbackEmail,
    dias_adelanto: normalized.diasAdelanto,
    hora_envio: normalized.horaEnvio,
    timezone: normalized.timezone,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseClient
    .from('recordatorios_correo')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    state.userSettings = {
      ...state.userSettings,
      emailReminders: previousSettings,
    };
    return { data: null, error };
  }

  const savedSettings = normalizeEmailReminderSettings(data, fallbackEmail);
  state.userSettings = {
    ...state.userSettings,
    emailReminders: savedSettings,
  };

  return { data: savedSettings, error: null };
}

app.actions.loadCloudData = loadCloudData;
app.actions.syncSueldoInput = syncSueldoInput;
