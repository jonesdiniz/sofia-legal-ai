# 🎯 Sistema de Leads - Resumo Rápido

## ✨ STATUS: DETECÇÃO AUTOMÁTICA ATIVA

🎉 **A captura automática de leads já está funcionando!**

Sistema completo de captura e armazenamento de leads durante conversas com a Sofia, com **detecção automática via Abordagem 1 (JSON escondido)**.

---

## 📁 Arquivos criados/modificados

### 1. `supabase/migrations/create_leads_table.sql`
SQL completo para criar:
- Tabela `leads` com 13 campos
- Tipos ENUM: `lead_temperatura`, `lead_status`
- Índices otimizados
- Trigger para `updated_at` automático
- Políticas RLS

### 2. `supabase/functions/chat-agent/index.ts` (modificado)
✨ **ATUALIZADO COM DETECÇÃO AUTOMÁTICA:**
- **Linhas 56-84:** Interfaces e tipos de Lead
- **Linhas 108-162:** Função `createLead` completa
- **Linhas 194-258:** ✨ Função `extractLeadMetadata` (NOVA)
- **Linhas 490-526:** ✨ Bloco CAPTURA DE LEADS no systemPrompt (NOVO)
- **Linhas 760-826:** ✨ Integração: extrai metadados, salva cleanAnswer, cria lead (NOVO)

### 3. `supabase/functions/chat-agent/LEADS_GUIDE.md`
Guia completo com:
- Passo a passo de instalação
- 3 abordagens de detecção (JSON escondido, segunda chamada OpenAI, palavras-chave)
- Código pronto para copiar/colar
- Queries SQL úteis
- Troubleshooting

### 4. `supabase/functions/chat-agent/LEADS_README.md` (este arquivo)
Resumo executivo.

---

## 🚀 Como usar (guia rápido)

### 1. Criar tabela no Supabase
```sql
-- Copiar e colar de: supabase/migrations/create_leads_table.sql
```

### 2. Deploy da edge function
```
-- Copiar index.ts para edge function "chat-agent" no Supabase
```

### 3. ✨ Testar detecção automática (JÁ ESTÁ ATIVA!)

Envie pelo frontend:
```
Oi Sofia, preciso de ajuda. Meu benefício foi negado e quero falar com um advogado.
Meu nome é João Silva, telefone 11 99887-7665.
```

Verifique nos logs:
```
[chat-agent] ✨ Lead capturado automaticamente: { lead_id: '...', nome: 'João Silva', ... }
```

Verifique no banco:
```sql
SELECT * FROM leads ORDER BY created_at DESC LIMIT 1;
```

**Ver guia completo de testes em `LEADS_GUIDE.md`**

---

## 🎯 Função createLead

```typescript
async function createLead(
  supabase: ReturnType<typeof createClient>,
  leadData: Lead
): Promise<string | null>
```

**Parâmetros:**
- `leadData.nome` ✅ Obrigatório
- `leadData.whatsapp` ✅ Obrigatório
- `leadData.tipo_caso` ✅ Obrigatório
- `leadData.situacao_atual` ⚪ Opcional
- `leadData.descricao_resumida` ⚪ Opcional
- `leadData.temperatura` ⚪ Padrão: "morno"
- `leadData.status` ⚪ Padrão: "novo"

**Retorno:**
- `string`: ID do lead criado (UUID)
- `null`: Erro (fail-safe, não quebra o chat)

**Logs:**
```
[chat-agent] Criando lead: { nome, tipo_caso, temperatura, conversation_id }
[chat-agent] Lead criado com sucesso: { lead_id, nome, temperatura }
[chat-agent] Erro ao criar lead: { error details }
```

---

## 📊 Campos da tabela leads

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | UUID | ✅ Auto | Identificador único |
| `org_id` | UUID | ✅ | ID da organização |
| `conversation_id` | UUID | ✅ | ID da conversa (FK) |
| `client_id` | TEXT | ⚪ | ID do cliente (opcional) |
| `nome` | TEXT | ✅ | Nome do lead |
| `whatsapp` | TEXT | ✅ | Telefone/WhatsApp |
| `tipo_caso` | TEXT | ✅ | Tipo de caso previdenciário |
| `situacao_atual` | TEXT | ⚪ | Situação atual do cliente |
| `descricao_resumida` | TEXT | ⚪ | Resumo do caso |
| `temperatura` | ENUM | ✅ | frio, morno, quente |
| `status` | ENUM | ✅ | novo, em_contato, consulta_agendada, convertido, nao_convertido |
| `created_at` | TIMESTAMP | ✅ Auto | Data de criação |
| `updated_at` | TIMESTAMP | ✅ Auto | Data de atualização (trigger) |

---

## 🔍 Como detectar leads?

Existem **3 abordagens** implementadas em `LEADS_GUIDE.md`:

### ⭐ Abordagem 1: JSON escondido (RECOMENDADA)
- Sofia inclui JSON no final da resposta
- Edge function extrai JSON e remove da resposta
- Uma única chamada à OpenAI (econômico)
- Preciso e controlado

### Abordagem 2: Segunda chamada OpenAI
- Após resposta da Sofia, chama OpenAI novamente para analisar
- Mais flexível mas 2x o custo
- Não altera prompt da Sofia

### Abordagem 3: Palavras-chave
- Busca palavras como "quero contratar", "quanto custa"
- Muito simples e rápido
- Menos preciso (pode gerar falsos positivos)

**Ver código completo de cada abordagem em `LEADS_GUIDE.md`**

---

## ⚠️ IMPORTANTE

### O que NÃO foi alterado:
- ✅ Prompt da Sofia permanece intacto
- ✅ Lógica de memória de conversa intacta
- ✅ RAG (embeddings) funcionando normalmente
- ✅ CORS e estrutura do handler preservados

### O que foi adicionado:
- ✅ Interfaces TypeScript para Lead
- ✅ Função `createLead` com tratamento de erro
- ✅ Comentários explicando onde conectar detecção
- ✅ Fail-safe: erro ao criar lead não quebra o chat

---

## 📝 Próximos passos

1. **Executar SQL** para criar tabela `leads`
2. **Deploy** da edge function atualizada
3. **Testar** criação manual de lead
4. **Escolher** abordagem de detecção (recomendo Abordagem 1)
5. **Implementar** código de detecção
6. **Testar** com conversa real
7. **Monitorar** logs e criar dashboard

---

## 📚 Documentação completa

Para guia detalhado com código pronto para copiar/colar:
👉 **`LEADS_GUIDE.md`**

Para testar memória de conversa:
👉 **`TESTING.md`**

Para guia geral da edge function:
👉 **`README.md`**

---

**Dúvidas?** Todos os arquivos têm comentários detalhados e exemplos práticos.
