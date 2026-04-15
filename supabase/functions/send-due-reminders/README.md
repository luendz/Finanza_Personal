# Send Due Reminders

Esta Edge Function envia un solo correo diario por usuario con:

- gastos vencidos del mes actual
- pagos proximos dentro del rango configurado

## Secrets necesarios

Configura estos secrets en Supabase antes de desplegar:

- `RESEND_API_KEY`
- `REMINDER_FROM_EMAIL`
- `REMINDER_CRON_SECRET`

`REMINDER_FROM_EMAIL` debe ser un remitente valido en Resend, por ejemplo `Mis Finanzas <alertas@tu-dominio.com>`.

## Despliegue

```bash
supabase functions deploy send-due-reminders
```

## Programacion recomendada

Para mantenerte en free tier, programa la function **una vez por hora**. La function ya filtra:

- solo usuarios con alertas activas
- solo la hora local configurada por usuario
- solo un envio por dia

En Supabase Dashboard puedes crear un scheduled invocation hacia:

`https://yrufxaubdztblkdfkpvw.supabase.co/functions/v1/send-due-reminders`

Headers:

- `x-reminder-secret: <REMINDER_CRON_SECRET>`
- `Content-Type: application/json`

Body:

```json
{
  "mode": "cron"
}
```

Frecuencia recomendada:

- cada hora, por ejemplo minuto `5`
