# 📊 Guia de Implementação e Teste - Sistema de Leads

Este guia mostra como implementar e testar a funcionalidade de captura de leads no chat da Sofia.

---

## ✨ STATUS ATUAL: ABORDAGEM 1 IMPLEMENTADA E ATIVA

🎉 **A detecção automática de leads já está funcionando!**

A **Abordagem 1 (JSON escondido)** foi implementada e está ativa no código. Isso significa que:

- ✅ A Sofia já está instruída a incluir metadados de lead quando detectar interesse concreto
- ✅ A função `extractLeadMetadata` extrai os metadados automaticamente
- ✅ Leads são criados automaticamente quando a Sofia identifica interesse
- ✅ Os metadados são removidos antes de enviar a resposta ao usuário

**O que você precisa fazer:**

1. ✅ Criar a tabela `leads` no Supabase (PASSO 1 abaixo)
2. ✅ Fazer deploy da edge function atualizada (PASSO 2 abaixo)
3. ✅ Testar com mensagens que demonstrem interesse (PASSO 4 abaixo)

**Como funciona:**

Quando o usuário demonstra interesse concreto (ex: "quero falar com um advogado", "como faço para contratar"), a Sofia:
1. Responde normalmente, de forma empática e humana
2. Inclui no final da resposta um bloco JSON invisível com dados do lead
3. A edge function extrai esse JSON, cria o lead no banco, e remove o bloco antes de enviar ao usuário
4. O usuário vê apenas a resposta normal, sem saber que um lead foi criado

---

## 📋 Pré-requisitos

Antes de começar, certifique-se de que:

1. ✅ A tabela `leads` foi criada no Supabase
2. ✅ A edge function `chat-agent` foi atualizada com o código novo
3. ✅ As variáveis de ambiente estão configuradas (OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

---

## 🗄️ PASSO 1: Criar a tabela `leads` no Supabase

### Via SQL Editor

1. Acesse o painel do Supabase: https://supabase.com/dashboard
2. Vá em **SQL Editor**
3. Clique em **New Query**
4. Copie e cole o conteúdo do arquivo `supabase/migrations/create_leads_table.sql`
5. Execute a query (botão Run ou Ctrl+Enter)

### Verificar criação

Execute no SQL Editor:

```sql
-- Verificar se a tabela foi criada
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'leads'
ORDER BY ordinal_position;

-- Verificar tipos ENUM
SELECT typname, enumlabel
FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
WHERE typname IN ('lead_temperatura', 'lead_status')
ORDER BY typname, enumsortorder;
```

**Resultado esperado:**
- Tabela `leads` com 13 colunas
- Tipos ENUM `lead_temperatura` e `lead_status` criados

---

## 🔧 PASSO 2: Atualizar a Edge Function

### Via Supabase Dashboard

1. Acesse **Edge Functions** no painel do Supabase
2. Abra a função `chat-agent`
3. Substitua **TODO** o código pelo conteúdo de `supabase/functions/chat-agent/index.ts`
4. Salve e faça deploy

### Verificar deploy

Após o deploy, verifique os logs:
1. Vá em **Edge Functions > chat-agent > Logs**
2. Envie uma mensagem qualquer pelo frontend
3. Verifique se não há erros relacionados à tabela `leads`

---

## 🧪 PASSO 3: Testar detecção automática de leads

🎉 **A detecção automática JÁ ESTÁ ATIVA!** Você pode testar enviando mensagens que demonstrem interesse.

### Teste 1: Mensagem com interesse explícito

1. **Envie pelo frontend:**
```
Oi Sofia, eu preciso de ajuda. Meu benefício do INSS foi negado e quero falar com um advogado. Meu nome é João Silva e meu telefone é 11 99887-7665. Pode me ajudar?
```

2. **Verifique nos logs da edge function:**
```
[chat-agent] Metadados de lead encontrados, parseando JSON...
[chat-agent] Metadados de lead extraídos com sucesso: { has_nome: true, has_whatsapp: true, has_tipo_caso: true, temperatura: 'quente' }
[chat-agent] Criando lead: { nome: 'João Silva', tipo_caso: '...', temperatura: 'quente', ... }
[chat-agent] Lead criado com sucesso: { lead_id: 'uuid-aqui', nome: 'João Silva', temperatura: 'quente' }
[chat-agent] ✨ Lead capturado automaticamente: { lead_id: 'uuid-aqui', ... }
```

3. **Verifique no banco:**
```sql
SELECT * FROM leads ORDER BY created_at DESC LIMIT 1;
```

**Resultado esperado:**
- ✅ Lead criado com nome "João Silva", whatsapp "11 99887-7665", temperatura "quente"
- ✅ Resposta da Sofia NO FRONTEND não contém o bloco JSON (foi removido)
- ✅ Resposta salva na tabela `messages` também NÃO contém o bloco JSON

### Teste 2: Mensagem sem interesse (não deve criar lead)

1. **Envie pelo frontend:**
```
Oi Sofia, só queria saber o que é aposentadoria por idade. Curiosidade mesmo.
```

2. **Verifique nos logs:**
```
[chat-agent] Resposta gerada com sucesso (length: ...)
[chat-agent] Resposta da Sofia salva com sucesso
(SEM logs de lead)
```

3. **Verifique no banco:**
```sql
SELECT * FROM leads WHERE created_at > NOW() - INTERVAL '1 minute';
```

**Resultado esperado:**
- ✅ Nenhum lead criado (Sofia não incluiu metadados)
- ✅ Resposta normal foi enviada

### Teste 3: Interesse com dados parciais

1. **Envie pelo frontend:**
```
Oi Sofia, quero saber como faço para contratar o escritório de vocês. Meu benefício foi cortado e estou desesperado.
```

**Resultado esperado:**
- ⚠️ Sofia pode criar lead com temperatura "morno" ou "quente"
- ⚠️ Nome e whatsapp podem estar como "Não informado" (Sofia pode pedir esses dados em seguida)
- ✅ Se dados essenciais estiverem faltando, a edge function ignora (validação)

---

## 📚 REFERÊNCIA: Detalhes da Abordagem 1 (Implementada)

A **Abordagem 1 (JSON escondido)** já está ativa no código. Veja como funciona:

### ✅ O que foi implementado:

1. **systemPrompt atualizado** (linhas ~490-526 do index.ts):
   - Adicionado bloco "CAPTURA DE LEADS (INTERESSE CONCRETO)"
   - Instruções claras sobre quando incluir metadados
   - Formato exato do JSON: `---LEAD_DATA_START--- {...} ---LEAD_DATA_END---`
   - Critérios de temperatura (quente/morno/frio)

2. **Função extractLeadMetadata** (linhas ~194-258 do index.ts):
   - Regex robusta para capturar bloco JSON
   - Parsing com try/catch (fail-safe)
   - Remove metadados da resposta (usuário não vê)
   - Logs estruturados para debug

3. **Integração no handler** (linhas ~760-826 do index.ts):
   - **Passo 8:** Extrai metadados de `answer`
   - **Passo 9:** Salva `cleanAnswer` no banco (sem metadados)
   - **Passo 10:** Cria lead se metadados válidos
   - **Passo 11:** Retorna `cleanAnswer` ao frontend

### 🔍 Como o código funciona:

```typescript
// PASSO 7: Sofia responde (com possíveis metadados)
const answer = await callChatModel(...);

// PASSO 8: Extrai metadados
const { cleanAnswer, leadData } = extractLeadMetadata(answer);

// PASSO 9: Salva resposta SEM metadados
await supabase.from("messages").insert({ content: cleanAnswer, ... });

// PASSO 10: Cria lead se dados válidos
if (leadData && leadData.nome !== "Não informado" && ...) {
  const leadId = await createLead(supabase, fullLead);
  console.log("[chat-agent] ✨ Lead capturado automaticamente:", leadId);
}

// PASSO 11: Retorna resposta SEM metadados
return jsonResponse({ answer: cleanAnswer, ... });
```

### 🎯 Validações implementadas:

- ✅ Metadados devem ter `nome`, `whatsapp` e `tipo_caso`
- ✅ Valores não podem ser "Não informado" (filtro de placeholders)
- ✅ Erro no parsing → lead não criado, resposta continua normalmente
- ✅ Erro ao salvar lead → logado mas não quebra o chat
- ✅ Usuário NUNCA vê o bloco JSON (sempre removido)

---

## 📊 Monitoramento de Leads

**Como implementar:**

```typescript
// Adicione essa função após createLead
async function analyzeForLead(
  openai: OpenAI,
  chatHistory: ChatHistoryMessage[],
  question: string,
  answer: string
): Promise<{ is_lead: boolean; lead_data: Partial<Lead> | null }> {
  const analysisPrompt = `Analise a conversa abaixo e determine se a pessoa demonstrou INTERESSE CONCRETO em contratar serviços jurídicos previdenciários.

HISTÓRICO DA CONVERSA:
${chatHistory.map((m) => `${m.role === 'user' ? 'Usuário' : 'Sofia'}: ${m.content}`).join('\n\n')}

ÚLTIMA MENSAGEM:
Usuário: ${question}
Sofia: ${answer}

INDICADORES DE INTERESSE CONCRETO:
- Perguntou valores/orçamento
- Perguntou como contratar
- Pediu contato de advogado
- Forneceu dados pessoais (nome, telefone)
- Disse explicitamente que quer ajuda jurídica

Responda APENAS com um JSON no seguinte formato:
{
  "is_lead": true/false,
  "nome": "nome se informado ou 'Não informado'",
  "whatsapp": "telefone se informado ou 'Não informado'",
  "tipo_caso": "tipo de caso identificado",
  "situacao_atual": "resumo da situação",
  "descricao_resumida": "breve descrição",
  "temperatura": "quente" | "morno" | "frio"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use mini para economizar
      messages: [{ role: "user", content: analysisPrompt }],
      temperature: 0.3, // Mais determinístico
      max_tokens: 300,
    });

    const result = JSON.parse(response.choices[0]?.message?.content || "{}");
    return {
      is_lead: result.is_lead || false,
      lead_data: result.is_lead ? result : null,
    };
  } catch (error) {
    console.error("[chat-agent] Erro ao analisar lead:", error);
    return { is_lead: false, lead_data: null };
  }
}
```

**Usar no handler:**

```typescript
// No passo 8.5:
const leadAnalysis = await analyzeForLead(openai, chatHistory, question, answer);
if (leadAnalysis.is_lead && leadAnalysis.lead_data) {
  const leadData: Lead = {
    org_id,
    conversation_id: convId,
    client_id: client_id || undefined,
    nome: leadAnalysis.lead_data.nome!,
    whatsapp: leadAnalysis.lead_data.whatsapp!,
    tipo_caso: leadAnalysis.lead_data.tipo_caso!,
    situacao_atual: leadAnalysis.lead_data.situacao_atual,
    descricao_resumida: leadAnalysis.lead_data.descricao_resumida,
    temperatura: (leadAnalysis.lead_data.temperatura as LeadTemperatura) || "morno",
    status: "novo",
  };
  await createLead(supabase, leadData);
}
```

### Abordagem 3: Palavras-chave simples

**Vantagens:**
- Muito simples
- Sem custo adicional
- Rápido

**Desvantagens:**
- Menos preciso
- Pode gerar falsos positivos

**Como implementar:**

```typescript
// No passo 8.5:
const interestKeywords = [
  "quero contratar",
  "quanto custa",
  "valores",
  "orçamento",
  "como faço para contratar",
  "preciso de um advogado",
  "quero ajuda jurídica",
  "meu telefone é",
  "meu whatsapp",
];

const questionLower = question.toLowerCase();
const hasInterest = interestKeywords.some((kw) => questionLower.includes(kw));

if (hasInterest) {
  // Criar lead com dados parciais
  const leadData: Lead = {
    org_id,
    conversation_id: convId,
    client_id: client_id || undefined,
    nome: "Lead automático - Nome a confirmar",
    whatsapp: "Não informado",
    tipo_caso: "Interesse demonstrado",
    situacao_atual: `Pergunta: ${question.substring(0, 100)}...`,
    descricao_resumida: "Lead identificado por palavras-chave de interesse",
    temperatura: "morno",
    status: "novo",
  };

  await createLead(supabase, leadData);
  console.log("[chat-agent] Lead identificado por palavra-chave");
}
```

---

## ✅ Checklist de Validação

### Infraestrutura
- [ ] Tabela `leads` criada no Supabase
- [ ] Tipos ENUM `lead_temperatura` e `lead_status` criados
- [ ] Índices criados (verificar com `\d leads` no SQL)
- [ ] RLS habilitado e políticas criadas
- [ ] Trigger de `updated_at` funcionando

### Edge Function
- [ ] Interfaces `Lead`, `LeadTemperatura`, `LeadStatus` adicionadas
- [ ] Função `createLead` implementada
- [ ] Comentários de detecção de leads adicionados
- [ ] Edge function deployada sem erros

### Teste Manual
- [ ] Lead criado via SQL funciona
- [ ] Lead criado via código temporário funciona
- [ ] Logs aparecem corretamente: `[chat-agent] Lead criado com sucesso`
- [ ] Campo `updated_at` é atualizado em UPDATE

### Detecção Automática (após implementar)
- [ ] Abordagem escolhida implementada
- [ ] Teste: enviar mensagem com interesse → lead é criado
- [ ] Teste: enviar mensagem sem interesse → lead NÃO é criado
- [ ] Metadados removidos da resposta (se Abordagem 1)

---

## 📊 Queries úteis para monitoramento

### Ver todos os leads

```sql
SELECT
  id,
  nome,
  whatsapp,
  tipo_caso,
  temperatura,
  status,
  created_at
FROM leads
WHERE org_id = 'seu-org-id'
ORDER BY created_at DESC
LIMIT 20;
```

### Estatísticas de conversão

```sql
SELECT
  temperatura,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'convertido') as convertidos,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'convertido')::numeric / COUNT(*) * 100,
    2
  ) as taxa_conversao_pct
FROM leads
WHERE org_id = 'seu-org-id'
GROUP BY temperatura;
```

### Leads quentes não convertidos (ação necessária)

```sql
SELECT
  id,
  nome,
  whatsapp,
  tipo_caso,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as horas_desde_criacao
FROM leads
WHERE org_id = 'seu-org-id'
  AND temperatura = 'quente'
  AND status NOT IN ('convertido', 'nao_convertido')
ORDER BY created_at ASC;
```

### Timeline de um lead específico

```sql
-- Ver conversa completa de um lead
SELECT
  m.actor,
  m.content,
  m.created_at
FROM leads l
JOIN messages m ON m.conversation_id = l.conversation_id
WHERE l.id = 'uuid-do-lead'
ORDER BY m.created_at ASC;
```

---

## 🐛 Troubleshooting

### "Tabela leads não existe"
- Execute o SQL de criação novamente
- Verifique se está no schema público: `\dt leads` ou `SELECT * FROM public.leads LIMIT 1;`

### "Erro ao inserir lead: violação de chave estrangeira"
- O `conversation_id` precisa existir na tabela `conversations`
- Crie uma conversa antes ou use NULL se a coluna permitir

### "Tipo lead_temperatura não existe"
- Execute a parte do SQL que cria os ENUMs
- Verifique: `SELECT typname FROM pg_type WHERE typname LIKE 'lead%';`

### "Lead criado mas updated_at não atualiza em UPDATE"
- Verifique se o trigger foi criado: `\df update_leads_updated_at`
- Recrie o trigger se necessário

### "RLS bloqueando inserção"
- Certifique-se de usar `service_role` key na edge function
- Verifique políticas: `SELECT * FROM pg_policies WHERE tablename = 'leads';`

---

## 🚀 Próximos Passos

Após validar a criação de leads:

1. **Implementar detecção automática** (escolher abordagem)
2. **Criar dashboard de leads** no frontend
3. **Adicionar notificações** quando lead quente é criado
4. **Integrar com CRM** (Pipedrive, RD Station, etc.)
5. **Implementar follow-up automático** via WhatsApp
6. **Criar relatórios de conversão** por fonte/temperatura

---

**Última atualização:** 2025-01-19
**Versão:** 1.0 (infraestrutura de leads)
