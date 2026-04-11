import {
  app,
  fillMonthOptions,
  fmt,
  hideOverlay,
  MS,
  requireCurrentUser,
  runtime,
  showOverlay,
  state,
  toast,
  uiState,
} from '../core.js';

function openNoteModal() {
  runtime.editingNoteId = null;
  document.getElementById('note-mh').textContent = 'Agregar anotacion';
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
  runtime.editingNoteId = null;
}

function toggleNoteQ() {
  const tipo = document.getElementById('note-tipo').value;
  document.getElementById('note-qfields').classList.toggle('hidden', tipo !== 'cuotas');
}

function openNoteMoveModal(id) {
  runtime.movingNoteId = id;
  const note = state.anotaciones.find(item => item.id === id);
  if (!note) return;
  document.getElementById('note-move-title').textContent = `Enviar "${note.desc}" a un mes`;
  fillMonthOptions('note-move-month');
  document.getElementById('note-move-action').value = 'move';
  showOverlay('overlay-note-move');
}

function closeNoteMoveModal() {
  hideOverlay('overlay-note-move');
  runtime.movingNoteId = null;
}

function openBulkMoveNotesModal() {
  uiState.noteBulkSelection = new Set();
  fillMonthOptions('bulk-note-month');
  document.getElementById('bulk-note-action').value = 'move';
  renderBulkNoteList();
  showOverlay('overlay-note-bulk');
}

function closeBulkMoveNotesModal() {
  hideOverlay('overlay-note-bulk');
  uiState.noteBulkSelection = new Set();
}

function renderBulkNoteList() {
  const list = document.getElementById('bulk-notes-list');
  if (!list) return;
  if (!state.anotaciones.length) {
    list.innerHTML = '<div class="p-4 text-sm text-text2">No hay anotaciones para mover.</div>';
    return;
  }

  list.innerHTML = state.anotaciones.map(note => {
    const checked = uiState.noteBulkSelection.has(note.id) ? 'checked' : '';
    return `<label class="mb-2 flex cursor-pointer items-center gap-2 rounded-smapp border border-borderc bg-white px-3 py-2"><input type="checkbox" ${checked} onchange="toggleBulkNote(${note.id})"><span class="text-[13px] text-text1">${note.desc} · ${fmt(note.monto)} · ${MS[note.creadoMes]} ${note.creadoAnio}</span></label>`;
  }).join('');
}

function toggleBulkNote(id) {
  if (uiState.noteBulkSelection.has(id)) uiState.noteBulkSelection.delete(id);
  else uiState.noteBulkSelection.add(id);
  renderBulkNoteList();
}

function markAllNotesBulk(selectAll) {
  uiState.noteBulkSelection = new Set();
  if (selectAll) {
    state.anotaciones.forEach(note => uiState.noteBulkSelection.add(note.id));
  }
  renderBulkNoteList();
}

async function confirmBulkMoveNotes() {
  const currentUser = requireCurrentUser();
  if (!currentUser) return;

  const selected = Array.from(uiState.noteBulkSelection)
    .map(id => state.anotaciones.find(note => note.id === id))
    .filter(Boolean);

  if (!selected.length) {
    alert('Selecciona anotaciones.');
    return;
  }

  const targetMonth = parseInt(document.getElementById('bulk-note-month').value, 10);
  const action = document.getElementById('bulk-note-action').value;
  const targetYear = runtime.curY;

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
    total_cuotas: note.cuotas,
  }));

  const { error: insertError } = await app.supabaseClient.from('gastos').insert(inserts);
  if (insertError) {
    alert(insertError.message);
    return;
  }

  if (action === 'move') {
    const ids = selected.map(note => note.id);
    const { error: deleteError } = await app.supabaseClient.from('anotaciones').delete().in('id', ids);
    if (deleteError) {
      alert(deleteError.message);
      return;
    }
  }

  await app.actions.loadCloudData?.();
  app.actions.updateAll?.();
  closeBulkMoveNotesModal();
  toast('Anotaciones procesadas');
}

async function confirmMoveNote() {
  if (!runtime.currentUser || runtime.movingNoteId === null) return;
  const note = state.anotaciones.find(item => item.id === runtime.movingNoteId);
  if (!note) return;

  const targetMonth = parseInt(document.getElementById('note-move-month').value, 10);
  const action = document.getElementById('note-move-action').value;
  const payload = {
    user_id: runtime.currentUser.id,
    descripcion: note.desc,
    categoria: note.cat,
    dia_pago: note.dia,
    tipo: note.tipo,
    monto: note.monto,
    mes: targetMonth,
    anio: runtime.curY,
    origen_mes: note.creadoMes,
    origen_anio: note.creadoAnio,
    cuota_actual: note.cuotaAct,
    total_cuotas: note.cuotas,
  };

  const { error: insertError } = await app.supabaseClient.from('gastos').insert(payload);
  if (insertError) {
    alert(insertError.message);
    return;
  }

  if (action === 'move') {
    const { error: deleteError } = await app.supabaseClient.from('anotaciones').delete().eq('id', runtime.movingNoteId);
    if (deleteError) {
      alert(deleteError.message);
      return;
    }
  }

  await app.actions.loadCloudData?.();
  app.actions.updateAll?.();
  closeNoteMoveModal();
  toast('Anotacion enviada');
}

function renderNotes() {
  const filter = document.getElementById('note-cat-filter')?.value || '';
  const container = document.getElementById('notes-list');
  const footer = document.getElementById('notes-total-footer');
  if (!container || !footer) return;

  const items = state.anotaciones.filter(note => !filter || note.cat === filter);
  if (!items.length) {
    container.innerHTML = '<div class="p-4 text-sm text-text2">No hay anotaciones para este mes.</div>';
    footer.textContent = fmt(0);
    return;
  }

  container.innerHTML = items.map(note => `
    <div class="border-b border-borderc px-5 py-4 last:border-none">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="font-semibold text-text1">${note.desc}</div>
          <div class="mt-1 text-[12px] text-text3">${note.cat} · Dia ${note.dia} · ${note.tipo}</div>
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

  footer.textContent = fmt(items.reduce((sum, note) => sum + note.monto, 0));
}

function editNote(id) {
  const note = state.anotaciones.find(item => item.id === id);
  if (!note) return;
  runtime.editingNoteId = id;
  document.getElementById('note-mh').textContent = 'Editar anotacion';
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

async function saveNote() {
  const currentUser = requireCurrentUser();
  if (!currentUser) return;

  const desc = document.getElementById('note-desc').value.trim();
  const monto = parseFloat(document.getElementById('note-monto').value);
  const cat = document.getElementById('note-cat').value;
  const dia = parseInt(document.getElementById('note-dia').value, 10) || 15;
  const tipo = document.getElementById('note-tipo').value;
  const cuotas = tipo === 'cuotas' ? (parseInt(document.getElementById('note-cuotas').value, 10) || 0) : 0;
  const cuotaAct = tipo === 'cuotas' ? (parseInt(document.getElementById('note-cuotaact').value, 10) || 1) : 1;

  if (!desc || !monto || monto <= 0) {
    alert('Datos invalidos');
    return;
  }
  if (tipo === 'cuotas' && cuotas < 1) {
    alert('Ingresa total de cuotas');
    return;
  }

  const payload = {
    user_id: currentUser.id,
    descripcion: desc,
    categoria: cat,
    dia_pago: dia,
    tipo,
    monto,
    mes: runtime.curM,
    anio: runtime.curY,
    creado_mes: runtime.curM,
    creado_anio: runtime.curY,
    cuota_actual: cuotaAct,
    total_cuotas: cuotas,
  };

  let error;
  if (runtime.editingNoteId !== null) {
    ({ error } = await app.supabaseClient.from('anotaciones').update(payload).eq('id', runtime.editingNoteId));
  } else {
    ({ error } = await app.supabaseClient.from('anotaciones').insert(payload));
  }
  if (error) {
    alert(error.message);
    return;
  }

  await app.actions.loadCloudData?.();
  app.actions.updateAll?.();
  closeNoteModal();
  toast(runtime.editingNoteId ? 'Anotacion actualizada' : 'Anotacion agregada');
  runtime.editingNoteId = null;
}

async function delNote(id) {
  if (!runtime.currentUser) return;
  if (!confirm('¿Eliminar esta anotacion?')) return;
  const { error } = await app.supabaseClient.from('anotaciones').delete().eq('id', id);
  if (error) {
    alert(error.message);
    return;
  }

  await app.actions.loadCloudData?.();
  app.actions.updateAll?.();
  toast('Anotacion eliminada');
}

app.actions.renderNotes = renderNotes;

Object.assign(window, {
  closeBulkMoveNotesModal,
  closeNoteModal,
  closeNoteMoveModal,
  confirmBulkMoveNotes,
  confirmMoveNote,
  delNote,
  editNote,
  markAllNotesBulk,
  openBulkMoveNotesModal,
  openNoteModal,
  openNoteMoveModal,
  renderNotes,
  saveNote,
  toggleBulkNote,
  toggleNoteQ,
});
