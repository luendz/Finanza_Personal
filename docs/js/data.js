import { app, resetState, runtime, state, supabaseClient } from './core.js';

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
  ] = await Promise.all([
    supabaseClient.from('categorias').select('*').eq('user_id', runtime.currentUser.id).order('nombre'),
    supabaseClient.from('gastos').select('*').eq('user_id', runtime.currentUser.id).order('id'),
    supabaseClient.from('ingresos_extra').select('*').eq('user_id', runtime.currentUser.id).order('id'),
    supabaseClient.from('anotaciones').select('*').eq('user_id', runtime.currentUser.id).order('id'),
    supabaseClient.from('prestamos').select('*').eq('user_id', runtime.currentUser.id).order('id'),
    supabaseClient.from('abonos_prestamos').select('*').eq('user_id', runtime.currentUser.id).order('id'),
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
      fecha: prestamo.fecha,
      vencimiento: prestamo.vencimiento,
      notas: prestamo.notas,
      historial,
    };
  });

  state.userSettings = { sueldo: null };
  const settingsRes = await supabaseClient
    .from('user_settings')
    .select('sueldo')
    .eq('user_id', runtime.currentUser.id)
    .single();

  if (!settingsRes.error && settingsRes.data) {
    state.userSettings.sueldo = Number(settingsRes.data.sueldo || 0);
    return;
  }

  const storedSalary = localStorage.getItem('mf3_sueldo');
  if (storedSalary !== null) {
    state.userSettings.sueldo = Number(storedSalary);
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
  const storedValue = typeof state.userSettings?.sueldo === 'number' && !Number.isNaN(state.userSettings.sueldo)
    ? state.userSettings.sueldo
    : (localStorage.getItem('mf3_sueldo') !== null ? Number(localStorage.getItem('mf3_sueldo')) : null);

  if (storedValue !== null && String(storedValue) !== currentValue) {
    sueldoInput.value = storedValue;
  }
}

export async function saveSueldo() {
  const sueldoInput = document.getElementById('sueldo');
  if (!sueldoInput) return;
  const sueldoBase = parseFloat(sueldoInput.value) || 0;
  localStorage.setItem('mf3_sueldo', sueldoBase);
  state.userSettings = { ...state.userSettings, sueldo: sueldoBase };

  if (!runtime.currentUser) return;

  const { error } = await supabaseClient
    .from('user_settings')
    .upsert({ user_id: runtime.currentUser.id, sueldo: sueldoBase }, { onConflict: 'user_id' });

  if (error) {
    console.warn('No se pudo guardar el sueldo en BD:', error.message);
  }
}

app.actions.loadCloudData = loadCloudData;
app.actions.syncSueldoInput = syncSueldoInput;
