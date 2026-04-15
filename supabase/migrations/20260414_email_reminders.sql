create table if not exists public.recordatorios_correo (
  user_id uuid primary key references auth.users(id) on delete cascade,
  activo boolean not null default false,
  email_destino text not null,
  dias_adelanto integer not null default 2 check (dias_adelanto between 0 and 7),
  hora_envio integer not null default 7 check (hora_envio between 0 and 23),
  timezone text not null default 'America/Lima',
  ultimo_envio_fecha date,
  ultimo_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recordatorios_correo_activo_hora_idx
on public.recordatorios_correo (activo, hora_envio);

alter table public.recordatorios_correo enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recordatorios_correo'
      and policyname = 'recordatorios_correo_select_own'
  ) then
    create policy recordatorios_correo_select_own
      on public.recordatorios_correo
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recordatorios_correo'
      and policyname = 'recordatorios_correo_insert_own'
  ) then
    create policy recordatorios_correo_insert_own
      on public.recordatorios_correo
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recordatorios_correo'
      and policyname = 'recordatorios_correo_update_own'
  ) then
    create policy recordatorios_correo_update_own
      on public.recordatorios_correo
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recordatorios_correo'
      and policyname = 'recordatorios_correo_delete_own'
  ) then
    create policy recordatorios_correo_delete_own
      on public.recordatorios_correo
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;
