# Sofia - checklist de producao

## Supabase Auth

- Crie os usuarios autorizados no Auth do projeto Sofia.
- Mantenha `/chat`, `/sobre` e `/politica` publicos.
- Use login obrigatorio para `/analytics` e `/health`.

## Edge Functions

Configure os mesmos valores em todas as functions que precisam deles:

- `SOFIA_INTERNAL_FUNCTION_SECRET`: segredo compartilhado entre `chat-agent`, `send-lead-notification` e `health-monitor`.
- `SOFIA_PUBLIC_ANON_KEY`: anon key usada pelo `chat-agent` ao chamar outra Edge Function.
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Configure tambem:

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `NOTIFICATION_EMAIL_TO`
- `NOTIFICATION_EMAIL_FROM`

## GitHub Actions

Adicione estes secrets no repositorio da Sofia:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`

O workflow `Sofia quality and Supabase deploy` valida lint, testes e build. Em push na branch `main`, ele aplica migrations e publica as Edge Functions.

## Cron do health monitor

O agendamento precisa chamar `health-monitor` por `POST` e enviar o header `x-sofia-internal-secret` com o mesmo valor de `SOFIA_INTERNAL_FUNCTION_SECRET`.

## Validacao local

Antes de publicar:

```bash
npm run quality
deno check supabase/functions/chat-agent/index.ts supabase/functions/send-lead-notification/index.ts supabase/functions/health-monitor/index.ts
```

Para publicar functions manualmente, depois de autenticar e vincular o projeto:

```bash
supabase db push
supabase functions deploy
```
