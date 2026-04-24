import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-reminder-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const REMINDER_FROM_EMAIL = Deno.env.get('REMINDER_FROM_EMAIL') || '';
const REMINDER_CRON_SECRET = Deno.env.get('REMINDER_CRON_SECRET') || '';

type ReminderSettings = {
  activo: boolean;
  emailDestino: string;
  diasAdelanto: number;
  horaEnvio: number;
  timezone: string;
  ultimoEnvioFecha: string | null;
  ultimoError: string | null;
};

type GastoRow = {
  id: number;
  descripcion: string;
  categoria: string;
  dia_pago: number;
  tipo: string;
  monto: number;
  mes: number;
  anio: number;
  pagado: boolean;
  fecha_pagado: string | null;
  cuota_actual: number;
  total_cuotas: number;
};

type ReminderItem = {
  id: number;
  desc: string;
  cat: string;
  monto: number;
  day: number;
  monthIndex: number;
  year: number;
  type: 'vencido' | 'proximo';
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

let adminClient: ReturnType<typeof createClient> | null = null;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

async function readJsonBody(req: Request) {
  const contentType = (req.headers.get('content-type') || '').toLowerCase();
  const contentLength = req.headers.get('content-length');

  if (!contentType.includes('application/json')) {
    return {};
  }

  if (contentLength === '0') {
    return {};
  }

  const rawBody = await req.text();
  if (!rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON invalido.';
    throw new Error(`No se pudo leer el body JSON: ${message}`);
  }
}

function ensureServerEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan variables de entorno de Supabase.');
  }
  if (!RESEND_API_KEY || !REMINDER_FROM_EMAIL) {
    throw new Error('Faltan RESEND_API_KEY o REMINDER_FROM_EMAIL.');
  }
}

function getAdminClient() {
  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

function normalizeSettings(rawValue: Record<string, unknown> | null | undefined, fallbackEmail = ''): ReminderSettings {
  const source = rawValue || {};
  return {
    activo: Boolean(source.activo ?? false),
    emailDestino: String(source.email_destino ?? source.emailDestino ?? fallbackEmail ?? '').trim(),
    diasAdelanto: Math.min(7, Math.max(0, parseInt(String(source.dias_adelanto ?? source.diasAdelanto ?? 2), 10) || 0)),
    horaEnvio: Math.min(23, Math.max(0, parseInt(String(source.hora_envio ?? source.horaEnvio ?? 7), 10) || 0)),
    timezone: String(source.timezone ?? 'America/Lima').trim() || 'America/Lima',
    ultimoEnvioFecha: source.ultimo_envio_fecha ? String(source.ultimo_envio_fecha) : null,
    ultimoError: source.ultimo_error ? String(source.ultimo_error) : null,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function currency(value: number) {
  return `S/ ${Math.abs(Number(value) || 0).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatHour(hour: number) {
  return `${String(Math.min(23, Math.max(0, Number(hour) || 0))).padStart(2, '0')}:00`;
}

function getZonedParts(timeZone: string, date = new Date()): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
  };
}

function shiftZonedParts(base: ZonedParts, timeZone: string, dayOffset: number) {
  const pivot = new Date(Date.UTC(base.year, base.month - 1, base.day + dayOffset, 12, 0, 0));
  return getZonedParts(timeZone, pivot);
}

function getDateKey(parts: Pick<ZonedParts, 'year' | 'month' | 'day'>) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function parseDateParts(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  const clean = String(dateStr).split(/[T ]/)[0];
  const [year, month, day] = clean.split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function isSameMonthYear(dateStr: string | null | undefined, monthIndex: number, year: number) {
  const parts = parseDateParts(dateStr);
  return Boolean(parts && parts.year === year && parts.month === monthIndex + 1);
}

function isPaidInCurrentPeriod(gasto: GastoRow, monthIndex: number, year: number) {
  if (!gasto.pagado) return false;
  return !gasto.fecha_pagado || isSameMonthYear(gasto.fecha_pagado, monthIndex, year);
}

function isCuotaActive(gasto: GastoRow, monthIndex: number, year: number) {
  if (gasto.tipo !== 'cuotas') return false;
  const totalCuotas = Number(gasto.total_cuotas || 0);
  const cuotaActual = Number(gasto.cuota_actual || 1);
  if (totalCuotas < 1 || cuotaActual > totalCuotas) return false;
  return gasto.anio < year || (gasto.anio === year && gasto.mes <= monthIndex);
}

function sortReminderItems(items: ReminderItem[]) {
  return items.sort((left, right) => {
    if (left.year !== right.year) return left.year - right.year;
    if (left.monthIndex !== right.monthIndex) return left.monthIndex - right.monthIndex;
    if (left.day !== right.day) return left.day - right.day;
    return left.desc.localeCompare(right.desc, 'es');
  });
}

function buildReminderItems(gastos: GastoRow[], settings: ReminderSettings) {
  const now = getZonedParts(settings.timezone);
  const cutoff = shiftZonedParts(now, settings.timezone, settings.diasAdelanto);
  const currentMonthIndex = now.month - 1;
  const cutoffMonthIndex = cutoff.month - 1;
  const crossesMonth = currentMonthIndex !== cutoffMonthIndex || now.year !== cutoff.year;
  const overdue: ReminderItem[] = [];
  const upcoming: ReminderItem[] = [];

  for (const gasto of gastos) {
    const day = Math.min(31, Math.max(1, Number(gasto.dia_pago || 1)));
    const baseItem = {
      id: Number(gasto.id),
      desc: String(gasto.descripcion || '').trim(),
      cat: String(gasto.categoria || '').trim(),
      monto: Number(gasto.monto || 0),
    };

    if (gasto.tipo === 'cuotas') {
      if (!isCuotaActive(gasto, currentMonthIndex, now.year) || isPaidInCurrentPeriod(gasto, currentMonthIndex, now.year)) {
        continue;
      }

      if (day < now.day) {
        overdue.push({ ...baseItem, day, monthIndex: currentMonthIndex, year: now.year, type: 'vencido' });
      } else if ((crossesMonth && day >= now.day) || (!crossesMonth && day >= now.day && day <= cutoff.day)) {
        upcoming.push({ ...baseItem, day, monthIndex: currentMonthIndex, year: now.year, type: 'proximo' });
      } else if (settings.diasAdelanto === 0 && day === now.day) {
        upcoming.push({ ...baseItem, day, monthIndex: currentMonthIndex, year: now.year, type: 'proximo' });
      }

      continue;
    }

    if (gasto.anio === now.year && gasto.mes === currentMonthIndex) {
      if (isPaidInCurrentPeriod(gasto, currentMonthIndex, now.year)) continue;

      if (day < now.day) {
        overdue.push({ ...baseItem, day, monthIndex: currentMonthIndex, year: now.year, type: 'vencido' });
      } else if (settings.diasAdelanto === 0 ? day === now.day : ((crossesMonth && day >= now.day) || (!crossesMonth && day >= now.day && day <= cutoff.day))) {
        upcoming.push({ ...baseItem, day, monthIndex: currentMonthIndex, year: now.year, type: 'proximo' });
      }
      continue;
    }

    if (settings.diasAdelanto > 0 && crossesMonth && gasto.anio === cutoff.year && gasto.mes === cutoffMonthIndex && day <= cutoff.day) {
      upcoming.push({ ...baseItem, day, monthIndex: cutoffMonthIndex, year: cutoff.year, type: 'proximo' });
    }
  }

  return {
    now,
    overdue: sortReminderItems(overdue),
    upcoming: sortReminderItems(upcoming),
  };
}

function renderItemsHtml(items: ReminderItem[], emptyCopy: string) {
  if (!items.length) {
    return `<p style="margin:0;color:#5f6b85;font-size:13px;line-height:1.6;">${escapeHtml(emptyCopy)}</p>`;
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      ${items.map(item => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eef2f7;">
            <div style="font-weight:700;color:#182033;font-size:14px;">${escapeHtml(item.desc)}</div>
            <div style="margin-top:4px;color:#5f6b85;font-size:12px;line-height:1.5;">
              ${escapeHtml(item.cat || 'Sin categoría')} · ${MONTHS[item.monthIndex]} ${item.year} · Día ${item.day}
            </div>
          </td>
          <td style="padding:10px 0 10px 12px;border-bottom:1px solid #eef2f7;text-align:right;font-weight:700;color:#182033;font-size:14px;white-space:nowrap;">
            ${escapeHtml(currency(item.monto))}
          </td>
        </tr>
      `).join('')}
    </table>
  `;
}

function renderItemsText(items: ReminderItem[], emptyCopy: string) {
  if (!items.length) return emptyCopy;
  return items.map(item => `- ${item.desc} | ${item.cat || 'Sin categoría'} | Día ${item.day} | ${MONTHS[item.monthIndex]} ${item.year} | ${currency(item.monto)}`).join('\n');
}

function buildSubject(overdue: ReminderItem[], upcoming: ReminderItem[], isTest = false) {
  if (!overdue.length && !upcoming.length) {
    return isTest ? 'Mis Finanzas: prueba de alertas' : 'Mis Finanzas: sin pendientes';
  }

  const parts: string[] = [];
  if (overdue.length) parts.push(`${overdue.length} vencido(s)`);
  if (upcoming.length) parts.push(`${upcoming.length} próximo(s)`);
  return `Mis Finanzas: ${parts.join(' y ')}`;
}

function buildEmailBody(settings: ReminderSettings, overdue: ReminderItem[], upcoming: ReminderItem[], isTest = false) {
  const overdueTotal = overdue.reduce((sum, item) => sum + Number(item.monto || 0), 0);
  const upcomingTotal = upcoming.reduce((sum, item) => sum + Number(item.monto || 0), 0);
  const rangeCopy = settings.diasAdelanto > 0
    ? `próximos ${settings.diasAdelanto} día(s)`
    : 'hoy';
  const intro = overdue.length || upcoming.length
    ? 'Aquí tienes el resumen agrupado para que no se te pase ningún pago.'
    : 'Todo está en orden por ahora. Este correo sirve para confirmar que tus alertas están funcionando.';

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f7fbff;padding:24px;color:#182033;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe5f3;border-radius:20px;padding:28px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5f6b85;">Mis Finanzas</div>
        <h1 style="margin:10px 0 8px;font-size:24px;line-height:1.2;">Recordatorio de pagos</h1>
        <p style="margin:0 0 18px;color:#5f6b85;font-size:14px;line-height:1.7;">${escapeHtml(intro)}</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin:0 0 20px;">
          <div style="flex:1 1 180px;border:1px solid #f1d3d3;background:#fff5f5;border-radius:16px;padding:14px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a4a10;">Vencidos</div>
            <div style="margin-top:6px;font-size:22px;font-weight:700;color:#cf4a45;">${overdue.length}</div>
            <div style="margin-top:4px;font-size:13px;color:#5f6b85;">Total ${escapeHtml(currency(overdueTotal))}</div>
          </div>
          <div style="flex:1 1 180px;border:1px solid #d8e4fb;background:#f7fbff;border-radius:16px;padding:14px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5f6b85;">${escapeHtml(rangeCopy)}</div>
            <div style="margin-top:6px;font-size:22px;font-weight:700;color:#2551b3;">${upcoming.length}</div>
            <div style="margin-top:4px;font-size:13px;color:#5f6b85;">Total ${escapeHtml(currency(upcomingTotal))}</div>
          </div>
        </div>

        <div style="margin-bottom:20px;">
          <h2 style="margin:0 0 10px;font-size:16px;">Gastos vencidos</h2>
          ${renderItemsHtml(overdue, 'No tienes gastos vencidos hoy.')}
        </div>

        <div style="margin-bottom:20px;">
          <h2 style="margin:0 0 10px;font-size:16px;">Próximos pagos</h2>
          ${renderItemsHtml(upcoming, settings.diasAdelanto > 0 ? `No tienes pagos dentro de los próximos ${settings.diasAdelanto} día(s).` : 'No tienes pagos programados para hoy.')}
        </div>

        <p style="margin:0;color:#5f6b85;font-size:12px;line-height:1.7;">
          ${isTest ? 'Correo de prueba enviado manualmente desde la app.' : 'Correo generado automáticamente por tu configuración de alertas.'}
          Zona horaria: ${escapeHtml(settings.timezone)} · Hora configurada: ${escapeHtml(formatHour(settings.horaEnvio))}
        </p>
      </div>
    </div>
  `;

  const text = [
    'Mis Finanzas - Recordatorio de pagos',
    '',
    intro,
    '',
    `Vencidos: ${overdue.length} | Total ${currency(overdueTotal)}`,
    renderItemsText(overdue, 'No tienes gastos vencidos hoy.'),
    '',
    `Proximos pagos (${rangeCopy}): ${upcoming.length} | Total ${currency(upcomingTotal)}`,
    renderItemsText(upcoming, settings.diasAdelanto > 0 ? `No tienes pagos dentro de los proximos ${settings.diasAdelanto} dia(s).` : 'No tienes pagos programados para hoy.'),
    '',
    `${isTest ? 'Correo de prueba enviado manualmente.' : 'Correo generado automaticamente.'} Zona horaria: ${settings.timezone} | Hora configurada: ${formatHour(settings.horaEnvio)}`,
  ].join('\n');

  return { html, text };
}

async function sendEmail(to: string, subject: string, html: string, text: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: REMINDER_FROM_EMAIL,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend respondió ${response.status}: ${body}`);
  }

  return await response.json();
}

async function fetchUserGastos(userId: string) {
  const { data, error } = await getAdminClient()
    .from('gastos')
    .select('id, descripcion, categoria, dia_pago, tipo, monto, mes, anio, pagado, fecha_pagado, cuota_actual, total_cuotas')
    .eq('user_id', userId)
    .order('anio', { ascending: true })
    .order('mes', { ascending: true })
    .order('dia_pago', { ascending: true });

  if (error) throw error;
  return (data || []) as GastoRow[];
}

async function updateReminderResult(userId: string, payload: Record<string, unknown>) {
  const { error } = await getAdminClient()
    .from('recordatorios_correo')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('No se pudo actualizar recordatorios_correo:', error.message);
  }
}

async function getAuthenticatedUser(authorization: string | null) {
  if (!authorization) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error) throw error;
  return data.user;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido.' }, 405);
  }

  try {
    ensureServerEnv();
    const body = await readJsonBody(req);
    const headerSecret = req.headers.get('x-reminder-secret');
    const isCron = Boolean(REMINDER_CRON_SECRET) && headerSecret === REMINDER_CRON_SECRET;

    if (isCron) {
      const { data: rows, error } = await getAdminClient()
        .from('recordatorios_correo')
        .select('*')
        .eq('activo', true);

      if (error) throw error;

      let processed = 0;
      let sent = 0;
      for (const row of rows || []) {
        const settings = normalizeSettings(row as Record<string, unknown>);
        const zonedNow = getZonedParts(settings.timezone);
        if (settings.horaEnvio !== zonedNow.hour) continue;
        if (settings.ultimoEnvioFecha === getDateKey(zonedNow)) continue;

        processed += 1;

        try {
          const gastos = await fetchUserGastos(String(row.user_id));
          const { overdue, upcoming } = buildReminderItems(gastos, settings);
          if (!overdue.length && !upcoming.length) continue;

          const subject = buildSubject(overdue, upcoming);
          const bodyContent = buildEmailBody(settings, overdue, upcoming);
          await sendEmail(settings.emailDestino, subject, bodyContent.html, bodyContent.text);

          await updateReminderResult(String(row.user_id), {
            ultimo_envio_fecha: getDateKey(zonedNow),
            ultimo_error: null,
          });
          sent += 1;
        } catch (error) {
          await updateReminderResult(String(row.user_id), {
            ultimo_error: error instanceof Error ? error.message : 'Error desconocido al enviar recordatorio.',
          });
        }
      }

      return json({ ok: true, processed, sent });
    }

    const user = await getAuthenticatedUser(req.headers.get('Authorization'));
    if (!user) {
      return json({ error: 'No autenticado.' }, 401);
    }

    const incomingSettings = normalizeSettings(body?.settings, user.email || '');
    const { data: savedRow } = await getAdminClient()
      .from('recordatorios_correo')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const settings = normalizeSettings((savedRow as Record<string, unknown> | null) ?? incomingSettings, user.email || '');
    const effectiveSettings = {
      ...settings,
      ...incomingSettings,
      emailDestino: incomingSettings.emailDestino || settings.emailDestino || user.email || '',
      timezone: incomingSettings.timezone || settings.timezone || 'America/Lima',
    };

    if (!effectiveSettings.emailDestino) {
      return json({ error: 'No hay correo de destino configurado.' }, 400);
    }

    const gastos = await fetchUserGastos(user.id);
    const { overdue, upcoming } = buildReminderItems(gastos, effectiveSettings);
    const subject = buildSubject(overdue, upcoming, true);
    const bodyContent = buildEmailBody(effectiveSettings, overdue, upcoming, true);
    await sendEmail(effectiveSettings.emailDestino, subject, bodyContent.html, bodyContent.text);

    return json({
      ok: true,
      sent: true,
      overdueCount: overdue.length,
      upcomingCount: upcoming.length,
      email: effectiveSettings.emailDestino,
    });
  } catch (error) {
    console.error(error);
    return json({
      error: error instanceof Error ? error.message : 'Error inesperado.',
    }, 500);
  }
});
