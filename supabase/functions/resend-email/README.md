# Resend Email

Esta Edge Function envía un solo correo diario por usuario con:

- gastos vencidos del mes actual
- pagos próximos dentro del rango configurado

## Secrets necesarios

Configura estos secrets en Supabase antes de desplegar:

- `RESEND_API_KEY`
- `REMINDER_FROM_EMAIL`
- `REMINDER_CRON_SECRET`

`REMINDER_FROM_EMAIL` debe ser un remitente válido en Resend, por ejemplo:

`Mis Finanzas <alertas@tu-dominio.com>`

## Despliegue

Puedes cargar los secrets con el CLI de Supabase:

```bash
supabase secrets set \
  RESEND_API_KEY="<tu api key de Resend>" \
  REMINDER_FROM_EMAIL="Mis Finanzas <alertas@tu-dominio.com>" \
  REMINDER_CRON_SECRET="<tu secreto interno>"
```

Luego despliega la función:

```bash
supabase functions deploy resend-email
```

## Programación recomendada

Para mantenerte en free tier, programa la function **una vez por hora**. La function ya filtra:

- solo usuarios con alertas activas
- solo la hora local configurada por usuario
- solo un envío por día

En Supabase Dashboard puedes crear un scheduled invocation hacia:

`https://yrufxaubdztblkdfkpvw.supabase.co/functions/v1/resend-email`

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
