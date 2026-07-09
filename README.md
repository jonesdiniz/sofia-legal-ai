# Sofia Legal AI

Sofia Legal AI e o assistente juridico do site Bueno Diniz Advocacia. O projeto combina uma interface React com Edge Functions no Supabase para atendimento inicial, RAG, captura de leads, notificacoes por email, analytics e monitoramento operacional.

## Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase Auth, Database e Edge Functions
- Gemini para chat
- OpenAI para embeddings
- Resend para notificacoes por email

## Estrutura Principal

```text
src/
  components/      Componentes da interface
  hooks/           Hooks do chat
  pages/           Rotas publicas e administrativas
  integrations/    Cliente Supabase do frontend

supabase/
  functions/       Edge Functions da Sofia
  migrations/      Migrations do banco Supabase

docs/
  sofia-production-hardening.md
```

## Rotas

- `/chat`: chat publico da Sofia.
- `/sobre`: informacoes institucionais da Sofia.
- `/politica`: politica de privacidade.
- `/analytics`: painel administrativo protegido por Supabase Auth.
- `/health`: painel de saude operacional protegido por Supabase Auth.

## Desenvolvimento Local

Requisitos:

- Node.js
- npm
- Deno, para checar Edge Functions
- Supabase CLI, para operacoes de banco/functions

Instalacao:

```bash
npm ci
```

Servidor local:

```bash
npm run dev
```

Validacao completa:

```bash
npm run quality
deno check supabase/functions/chat-agent/index.ts supabase/functions/send-lead-notification/index.ts supabase/functions/health-monitor/index.ts
```

## Variaveis De Ambiente

Use `.env.example` como referencia. As variaveis do frontend usam prefixo `VITE_`. As Edge Functions usam secrets do Supabase.

Secrets principais das Edge Functions:

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `SOFIA_PUBLIC_ANON_KEY`
- `SOFIA_INTERNAL_FUNCTION_SECRET`
- `PROJECT_REF`
- `NOTIFICATION_EMAIL_TO`
- `NOTIFICATION_EMAIL_FROM`

Os defaults do Supabase tambem ficam disponiveis nas Edge Functions, incluindo `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

## Deploy

O deploy de producao e feito pelo GitHub Actions em push na branch `main`.

O workflow:

1. Instala dependencias.
2. Roda lint, testes e build.
3. Checa Edge Functions com Deno.
4. Aplica migrations no Supabase.
5. Publica as Edge Functions.

Secrets necessarios no GitHub Actions:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`

## Edge Functions

- `chat-agent`: endpoint principal do chat, RAG, memoria de conversa, captura de leads e tracking.
- `send-lead-notification`: envio interno de email quando um lead e criado.
- `health-monitor`: rotina interna de monitoramento e alertas.

As chamadas internas usam `SOFIA_INTERNAL_FUNCTION_SECRET`.

## Observacoes De Producao

- O chat publico deve continuar acessivel sem login.
- Os paineis administrativos dependem de usuarios criados no Supabase Auth.
- Alteracoes de migrations devem ser revisadas com cuidado, pois sao aplicadas automaticamente na `main`.
- Mais detalhes estao em `docs/sofia-production-hardening.md`.
