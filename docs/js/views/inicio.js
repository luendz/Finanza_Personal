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
  showOverlay,
  state,
  toast,
} from '../core.js';
import { saveSueldo } from '../data.js';

function extrasDelMes() {
  return (state.ingresosExtra || []).filter(item => Number(item.mes) === runtime.curM && Number(item.anio || runtime.curY) === runtime.curY);
}

function totalExtras() {
  return extrasDelMes().reduce((sum, item) => sum + Number(item.monto || 0), 0);
}

function totalGastos() {
  return active().reduce((sum, gasto) => sum + gasto.monto, 0);
}

function totalIngresos() {
  return (parseFloat(document.getElementById('sueldo')?.value) || 0) + totalExtras();
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

function updateInicio() {
  const sueldoBase = parseFloat(document.getElementById('sueldo')?.value) || 0;
  const extras = totalExtras();
  const ingresos = sueldoBase + extras;
  const gastos = totalGastos();
  const resta = ingresos - gastos;
  const pct = ingresos > 0 ? (gastos / ingresos) * 100 : 0;
  const items = active();

  const inicioSub = document.getElementById('inicio-sub');
  if (!inicioSub) return;

  inicioSub.textContent = `Tu resumen de ${MS[runtime.curM]} ${runtime.curY}`;
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
  const currentSueldo = document.getElementById('sueldo').value;
  document.getElementById('sueldo-modal-input').value = currentSueldo;
  showOverlay('overlay-sueldo');
}

function closeSueldoModal() {
  hideOverlay('overlay-sueldo');
}

async function saveSueldoFromModal() {
  const newSueldo = parseFloat(document.getElementById('sueldo-modal-input').value) || 0;
  document.getElementById('sueldo').value = newSueldo;
  await saveSueldo();
  app.actions.updateAll?.();
  closeSueldoModal();
  toast('Sueldo actualizado');
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
  if (runtime.editingExtraId !== null) {
    ({ error } = await app.supabaseClient.from('ingresos_extra').update(payload).eq('id', runtime.editingExtraId));
  } else {
    ({ error } = await app.supabaseClient.from('ingresos_extra').insert(payload));
  }
  if (error) {
    alert(error.message);
    return;
  }

  await app.actions.loadCloudData?.();
  app.actions.updateAll?.();
  renderExtraList();
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
  const { error } = await app.supabaseClient.from('ingresos_extra').delete().eq('id', id);
  if (error) {
    alert(error.message);
    return;
  }

  if (runtime.editingExtraId === id) {
    resetExtraForm();
  }
  await app.actions.loadCloudData?.();
  app.actions.updateAll?.();
  renderExtraList();
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

  const reader = new FileReader();
  reader.onload = async loadedEvent => {
    const workbook = new window.ExcelJS.Workbook();
    await workbook.xlsx.load(loadedEvent.target.result);
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

    await app.actions.loadCloudData?.();
    app.actions.updateAll?.();
    toast('Excel importado');
    event.target.value = '';
  };

  reader.readAsArrayBuffer(file);
}

async function exportExcel() {
  const workbook = new window.ExcelJS.Workbook();
  const gastosSheet = workbook.addWorksheet('Gastos');
  gastosSheet.addRow(['descripcion', 'categoria', 'dia_pago', 'tipo', 'monto', 'mes', 'anio', 'total_cuotas', 'cuota_actual']);
  state.gastos.forEach(gasto => {
    gastosSheet.addRow([gasto.desc, gasto.cat, gasto.dia, gasto.tipo, gasto.monto, gasto.mes, gasto.anio, gasto.cuotas, gasto.cuotaAct]);
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  window.saveAs(blob, `finanzas-${runtime.curY}-${runtime.curM + 1}.xlsx`);
}

app.actions.updateInicio = updateInicio;

Object.assign(window, {
  closeExtraModal,
  closeSueldoModal,
  delExtra,
  editExtra,
  exportExcel,
  handleExcelImport,
  openExtraModal,
  openInicioGastosDetalle,
  openSueldoModal,
  saveExtra,
  saveSueldoFromModal,
  triggerExcelImport,
});
