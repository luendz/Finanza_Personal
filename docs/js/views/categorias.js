import { active, app, runtime, state, toast } from '../core.js';

function renderCats() {
  const grid = document.getElementById('catgrid');
  if (!grid) return;

  if (!state.categorias.length) {
    grid.innerHTML = '<div class="p-4 text-sm text-text2">No tienes categorias definidas.</div>';
    return;
  }

  grid.innerHTML = state.categorias.map(cat => {
    const count = active().filter(gasto => gasto.cat === cat).length;
    return `
      <div class="group overflow-hidden rounded-[18px] border border-borderc bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-accent">
        <div class="mb-4 flex items-start justify-between gap-3">
          <div>
            <div class="font-semibold text-text1">${cat}</div>
            <div class="mt-2 text-[12px] text-text3">${count} gasto(s)</div>
          </div>
          <div class="flex items-center gap-2 opacity-80 transition group-hover:opacity-100">
            <button class="rounded-full border border-borderc bg-appbg px-2.5 py-1 text-[12px] font-bold text-text2 transition hover:border-accent hover:text-accent" onclick="editCat('${encodeURIComponent(cat)}')" title="Editar categoria">&#9998;</button>
            <button class="rounded-full border border-redbg bg-redbg/10 px-2.5 py-1 text-[12px] font-bold text-red1 transition hover:bg-redbg/20" onclick="deleteCat('${encodeURIComponent(cat)}')" title="Eliminar categoria">&#128465;</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function addCat() {
  if (!runtime.currentUser) {
    alert('Primero inicia sesion.');
    return;
  }

  const name = prompt('Nombre de nueva categoria');
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) {
    alert('Nombre invalido');
    return;
  }
  if (state.categorias.includes(trimmed)) {
    alert('La categoria ya existe.');
    return;
  }

  const { error } = await app.supabaseClient.from('categorias').insert({ user_id: runtime.currentUser.id, nombre: trimmed });
  if (error) {
    alert(error.message);
    return;
  }

  await app.actions.loadCloudData?.();
  app.actions.updateAll?.();
  toast('Categoria agregada');
}

async function editCat(encodedName) {
  const name = decodeURIComponent(encodedName);
  if (!runtime.currentUser) {
    alert('Primero inicia sesion.');
    return;
  }

  const newName = prompt('Renombrar categoria', name);
  if (!newName) return;

  const trimmed = newName.trim();
  if (!trimmed) {
    alert('Nombre invalido');
    return;
  }
  if (trimmed === name) return;
  if (state.categorias.includes(trimmed)) {
    alert('Ya existe otra categoria con ese nombre.');
    return;
  }

  const { error: catError } = await app.supabaseClient
    .from('categorias')
    .update({ nombre: trimmed })
    .eq('user_id', runtime.currentUser.id)
    .eq('nombre', name);

  if (catError) {
    alert(catError.message);
    return;
  }

  const results = await Promise.all([
    app.supabaseClient.from('gastos').update({ categoria: trimmed }).eq('user_id', runtime.currentUser.id).eq('categoria', name),
    app.supabaseClient.from('anotaciones').update({ categoria: trimmed }).eq('user_id', runtime.currentUser.id).eq('categoria', name),
  ]);

  const failed = results.find(result => result.error);
  if (failed) {
    alert(failed.error.message);
    return;
  }

  await app.actions.loadCloudData?.();
  app.actions.updateAll?.();
  toast('Categoria renombrada');
}

async function deleteCat(encodedName) {
  const name = decodeURIComponent(encodedName);
  if (!runtime.currentUser) {
    alert('Primero inicia sesion.');
    return;
  }

  const linkedGastos = state.gastos.filter(gasto => gasto.cat === name).length;
  const linkedNotas = state.anotaciones.filter(note => note.cat === name).length;
  if (linkedGastos || linkedNotas) {
    alert(`No se puede eliminar la categoria porque esta en uso por ${linkedGastos} gasto(s) y ${linkedNotas} anotacion(es).`);
    return;
  }
  if (!confirm(`¿Eliminar la categoria "${name}"? Esta accion no se puede deshacer.`)) return;

  const { error } = await app.supabaseClient
    .from('categorias')
    .delete()
    .eq('user_id', runtime.currentUser.id)
    .eq('nombre', name);

  if (error) {
    alert(error.message);
    return;
  }

  await app.actions.loadCloudData?.();
  app.actions.updateAll?.();
  toast('Categoria eliminada');
}

app.actions.renderCats = renderCats;

Object.assign(window, {
  addCat,
  deleteCat,
  editCat,
});
