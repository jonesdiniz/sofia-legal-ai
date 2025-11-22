# 📊 Guia de Implementação e Teste - Sistema de Leads

Este guia mostra como implementar e testar a funcionalidade de captura de leads no chat da Sofia.

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

## 🧪 PASSO 3: Testar criação de leads MANUALMENTE

Como a detecção automática ainda não está implementada (está comentada), você pode testar a função `createLead` diretamente.

### Opção A: Via SQL (mais simples)

Execute no SQL Editor:

```sql
-- Inserir lead de teste manualmente
INSERT INTO leads (
  org_id,
  conversation_id,
  client_id,
  nome,
  whatsapp,
  tipo_caso,
  situacao_atual,
  descricao_resumida,
  temperatura,
  status
) VALUES (
  'b4c42a5e-ee6c-449c-965f-1139a1d8ce77', -- seu org_id
  (SELECT id FROM conversations ORDER BY created_at DESC LIMIT 1), -- última conversa
  'test-client-123',
  'João da Silva',
  '11999887766',
  'Aposentadoria por Idade',
  'Trabalhou 30 anos como CLT, quer se aposentar',
  'Cliente tem 62 anos, tempo suficiente, quer orientação',
  'quente',
  'novo'
) RETURNING *;
```

**Resultado esperado:**
- Lead criado com sucesso
- `id`, `created_at` e `updated_at` preenchidos automaticamente

### Opção B: Via código temporário na edge function

Adicione este código temporariamente **no final do handler**, logo antes do `return jsonResponse`:

```typescript
// === TESTE TEMPORÁRIO - REMOVER DEPOIS ===
if (question.toLowerCase().includes("criar lead teste")) {
  const testLead: Lead = {
    org_id,
    conversation_id: convId,
    client_id: client_id || "test-client",
    nome: "Maria de Teste",
    whatsapp: "11987654321",
    tipo_caso: "Revisão de Benefício",
    situacao_atual: "Recebe aposentadoria há 5 anos, quer revisar",
    descricao_resumida: "Cliente acredita que cálculo está errado",
    temperatura: "morno",
    status: "novo",
  };

  const leadId = await createLead(supabase, testLead);
  console.log("[chat-agent] TESTE: Lead criado com ID:", leadId);
}
// === FIM TESTE ===
```

**Como testar:**
1. Envie pelo frontend: "criar lead teste"
2. Verifique os logs da edge function
3. Verifique no SQL Editor:

```sql
SELECT * FROM leads ORDER BY created_at DESC LIMIT 1;
```

**Resultado esperado:**
- Log: `[chat-agent] TESTE: Lead criado com ID: uuid-aqui`
- Lead aparece na tabela `leads`

---

## 🚀 PASSO 4: Implementar detecção automática de leads

Agora que a infraestrutura está funcionando, você pode implementar a detecção. Há 3 abordagens principais:

### Abordagem 1: JSON escondido na resposta (RECOMENDADA)

**Vantagens:**
- Uma única chamada à OpenAI (econômico)
- Preciso e controlado
- Dados estruturados

**Como implementar:**

1. **Modificar o systemPrompt** (adicionar ao final):

```typescript
// Adicione isso ao final do systemPrompt em callChatModel
`
====================
CAPTURA DE LEADS
====================
Se durante a conversa você identificar que a pessoa tem INTERESSE CONCRETO em contratar os serviços do escritório, inclua no FINAL da sua resposta (após o texto normal) um bloco de metadados no seguinte formato:

INDICADORES DE INTERESSE CONCRETO:
- Pessoa pede valores/orçamento
- Pessoa pergunta "como faço para contratar"
- Pessoa pede contato de advogado
- Pessoa diz explicitamente que quer ajuda jurídica
- Pessoa fornece dados pessoais (nome, telefone) voluntariamente

FORMATO DOS METADADOS (coloque APÓS sua resposta normal):

---LEAD_DATA_START---
{
  "nome": "Nome da pessoa (ou 'Não informado')",
  "whatsapp": "Telefone informado (ou 'Não informado')",
  "tipo_caso": "Tipo de caso previdenciário",
  "situacao_atual": "Resumo da situação",
  "descricao_resumida": "Breve descrição do interesse",
  "temperatura": "quente" | "morno" | "frio"
}
---LEAD_DATA_END---

ATENÇÃO:
- APENAS inclua esses metadados se houver interesse CONCRETO (não em toda mensagem)
- O bloco de metadados NÃO será exibido ao usuário (será removido automaticamente)
- Continue respondendo normalmente ANTES dos metadados
`
```

2. **Criar função para extrair metadados:**

```typescript
// Adicione essa função após createLead
function extractLeadMetadata(answer: string): {
  cleanAnswer: string;
  leadData: Partial<Lead> | null;
} {
  const leadDataRegex = /---LEAD_DATA_START---([\s\S]*?)---LEAD_DATA_END---/;
  const match = answer.match(leadDataRegex);

  if (!match) {
    return { cleanAnswer: answer, leadData: null };
  }

  try {
    const jsonStr = match[1].trim();
    const leadData = JSON.parse(jsonStr);

    // Remove o bloco de metadados da resposta
    const cleanAnswer = answer.replace(leadDataRegex, '').trim();

    console.log("[chat-agent] Metadados de lead extraídos:", leadData);

    return { cleanAnswer, leadData };
  } catch (error) {
    console.error("[chat-agent] Erro ao parsear metadados de lead:", error);
    return { cleanAnswer: answer, leadData: null };
  }
}
```

3. **Descomentar e adaptar o código no handler:**

```typescript
// No passo 8.5, substitua o TODO por:
const { cleanAnswer, leadData } = extractLeadMetadata(answer);

if (leadData && leadData.nome && leadData.whatsapp && leadData.tipo_caso) {
  const fullLeadData: Lead = {
    org_id,
    conversation_id: convId,
    client_id: client_id || undefined,
    nome: leadData.nome,
    whatsapp: leadData.whatsapp,
    tipo_caso: leadData.tipo_caso,
    situacao_atual: leadData.situacao_atual || null,
    descricao_resumida: leadData.descricao_resumida || null,
    temperatura: (leadData.temperatura as LeadTemperatura) || "morno",
    status: "novo",
  };

  const leadId = await createLead(supabase, fullLeadData);
  if (leadId) {
    console.log("[chat-agent] Lead capturado automaticamente:", leadId);
  }
}

// Use cleanAnswer ao invés de answer no retorno
return jsonResponse({
  answer: cleanAnswer, // <-- resposta sem metadados
  conversation_id: convId,
  context_used: contextChunks.map((c) => ({
    content: c.content,
    similarity: c.similarity,
  })),
});
```

### Abordagem 2: Segunda chamada à OpenAI

**Vantagens:**
- Não altera o prompt da Sofia
- Análise mais sofisticada possível

**Desvantagens:**
- Dobra o custo (2 chamadas à API)
- Latência adicional

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
