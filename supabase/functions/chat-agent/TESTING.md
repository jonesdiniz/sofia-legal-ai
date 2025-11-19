# 🧪 Guia de Teste - Memória de Conversa

Este guia mostra como testar a funcionalidade de memória de conversa da edge function `chat-agent`.

## 🎯 Objetivo dos Testes

Validar que a Sofia:
1. Se apresenta completamente na **primeira mensagem**
2. **NÃO repete** apresentações em mensagens subsequentes
3. Mantém **contexto** da conversa
4. Trata **erros** de forma graceful (fail-safe)

---

## Teste 1: Primeira Interação (Sem Histórico)

### Requisição
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/chat-agent' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "org_id": "b4c42a5e-ee6c-449c-965f-1139a1d8ce77",
    "question": "Oi, tudo bem?",
    "client_id": "test-user-123"
  }'
```

### Resposta Esperada
```json
{
  "answer": "Oi! Tudo ótimo, obrigada por perguntar! 😊\n\nEu sou a Sofia, assistente previdenciária do escritório. Estou aqui para te ajudar com dúvidas sobre INSS, aposentadorias, pensões e direitos previdenciários.\n\nComo posso te ajudar hoje?",
  "conversation_id": "123e4567-e89b-12d3-a456-426614174000",
  "context_used": []
}
```

### ✅ Checklist
- [ ] Sofia se apresentou dizendo o nome ("Eu sou a Sofia")
- [ ] Explicou seu papel (assistente previdenciária)
- [ ] Usou tom acolhedor e empático
- [ ] Perguntou "Como posso te ajudar?"
- [ ] Retornou um `conversation_id` válido (UUID)

### Logs Esperados no Supabase
```
[chat-agent] Request recebido: { org_id: '...', client_id: 'test-user-123', conversation_id: 'null', questionLength: 14 }
[chat-agent] Nova conversa criada: 123e4567-e89b-12d3-a456-426614174000
[chat-agent] Mensagem do usuário salva com sucesso
[chat-agent] Nenhum histórico encontrado para conversation_id: 123e4567-e89b-12d3-a456-426614174000
[chat-agent] Histórico processado: { finalMessageCount: 0, hasHistory: false }
[chat-agent] Sem histórico - primeira mensagem da conversa
[chat-agent] Chamando OpenAI com: { model: 'gpt-4o', totalMessages: 2, hasHistory: false }
[chat-agent] Resposta gerada com sucesso (length: 234)
[chat-agent] Resposta da Sofia salva com sucesso
```

---

## Teste 2: Segunda Interação (Com Histórico)

**IMPORTANTE:** Use o mesmo `conversation_id` retornado no Teste 1.

### Requisição
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/chat-agent' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "org_id": "b4c42a5e-ee6c-449c-965f-1139a1d8ce77",
    "question": "Com quem estou falando mesmo?",
    "conversation_id": "123e4567-e89b-12d3-a456-426614174000"
  }'
```

### Resposta Esperada
```json
{
  "answer": "Como mencionei antes, sou a Sofia! 😊 Assistente previdenciária do escritório, aqui pra te ajudar com questões do INSS e direitos previdenciários.\n\nPrecisa de alguma informação específica sobre aposentadoria, benefícios ou algo assim?",
  "conversation_id": "123e4567-e89b-12d3-a456-426614174000",
  "context_used": []
}
```

### ✅ Checklist
- [ ] Sofia **NÃO repetiu** a apresentação completa
- [ ] Fez referência à conversa anterior ("Como mencionei antes")
- [ ] Tom continuou natural e acolhedor
- [ ] **NÃO** usou frases como "Oi! Eu sou a Sofia, sua assistente..." novamente
- [ ] Retornou o **mesmo** `conversation_id`

### Logs Esperados no Supabase
```
[chat-agent] Request recebido: { org_id: '...', conversation_id: '123e4567...', questionLength: 30 }
[chat-agent] Conversa existente encontrada: 123e4567-e89b-12d3-a456-426614174000
[chat-agent] Mensagem do usuário salva com sucesso
[chat-agent] Histórico carregado: { totalMessages: 3, usedMessages: 3 }
[chat-agent] Última mensagem do usuário removida (evitar duplicação)
[chat-agent] Histórico processado: { finalMessageCount: 2, hasHistory: true }
[chat-agent] Adicionando histórico ao contexto: { historyMessages: 2 }
[chat-agent] Chamando OpenAI com: { model: 'gpt-4o', totalMessages: 5, hasHistory: true }
[chat-agent] Resposta gerada com sucesso (length: 198)
[chat-agent] Resposta da Sofia salva com sucesso
```

**Observação:** `totalMessages: 5` = system prompt (1) + histórico (2) + pergunta atual (1) = 4... aguarde, deve ser 5 porque o histórico tem 2 mensagens (user + assistant da primeira interação).

---

## Teste 3: Continuação da Conversa

### Requisição
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/chat-agent' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "org_id": "b4c42a5e-ee6c-449c-965f-1139a1d8ce77",
    "question": "Quero saber sobre aposentadoria por idade",
    "conversation_id": "123e4567-e89b-12d3-a456-426614174000"
  }'
```

### ✅ Checklist
- [ ] Sofia responde diretamente sobre aposentadoria por idade
- [ ] **NÃO** se apresenta novamente
- [ ] Usa informações do RAG (chunks de documentos)
- [ ] Mantém tom empático e natural
- [ ] `context_used` contém chunks relevantes sobre aposentadoria por idade

---

## Teste 4: Nova Conversa (Reset)

Envie **sem** `conversation_id` para criar nova conversa:

### Requisição
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/chat-agent' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "org_id": "b4c42a5e-ee6c-449c-965f-1139a1d8ce77",
    "question": "Olá!",
    "client_id": "test-user-456"
  }'
```

### ✅ Checklist
- [ ] Sofia se apresenta **novamente** (porque é nova conversa)
- [ ] Retorna **novo** `conversation_id` (diferente do anterior)
- [ ] Sem histórico nos logs

---

## 🔍 Validação no Banco de Dados

Após executar os testes, verifique no Supabase:

### Tabela `conversations`
```sql
SELECT id, org_id, client_id, created_at
FROM conversations
WHERE org_id = 'b4c42a5e-ee6c-449c-965f-1139a1d8ce77'
ORDER BY created_at DESC
LIMIT 5;
```

**Esperado:** Você deve ver as conversas criadas nos testes.

### Tabela `messages`
```sql
SELECT actor, content, created_at
FROM messages
WHERE conversation_id = '123e4567-e89b-12d3-a456-426614174000'
ORDER BY created_at ASC;
```

**Esperado:** Você deve ver o histórico completo da conversa:
1. user: "Oi, tudo bem?"
2. sofia: "Oi! Tudo ótimo... Eu sou a Sofia..."
3. user: "Com quem estou falando mesmo?"
4. sofia: "Como mencionei antes, sou a Sofia..."
5. user: "Quero saber sobre aposentadoria por idade"
6. sofia: "Sobre aposentadoria por idade..."

---

## 🚨 Testes de Erro (Fail-Safe)

### Teste 5: conversation_id inválido

```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/chat-agent' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "org_id": "b4c42a5e-ee6c-449c-965f-1139a1d8ce77",
    "question": "Teste",
    "conversation_id": "invalid-uuid-12345"
  }'
```

**Comportamento esperado:**
- Função **cria nova conversa** (fail-safe)
- Retorna novo `conversation_id`
- Não retorna erro 500

### Teste 6: Erro ao buscar histórico (simulação)

Se o banco estiver temporariamente indisponível:
- Função continua funcionando
- Retorna resposta (sem histórico)
- Log: `[chat-agent] Erro ao buscar histórico da conversa`

---

## 📊 Resumo de Validação

| Teste | Cenário | Apresentação Completa? | Histórico Usado? | Status |
|-------|---------|------------------------|------------------|--------|
| 1 | Primeira mensagem | ✅ SIM | ❌ NÃO | ✅ |
| 2 | Segunda mensagem | ❌ NÃO | ✅ SIM (2 msgs) | ✅ |
| 3 | Terceira mensagem | ❌ NÃO | ✅ SIM (4 msgs) | ✅ |
| 4 | Nova conversa | ✅ SIM | ❌ NÃO | ✅ |
| 5 | conversation_id inválido | ✅ SIM | ❌ NÃO | ✅ |

---

## 🎓 Próximos Passos Após Validação

1. **Ajustar limite de histórico** (se necessário)
   - Editar `MAX_HISTORY_MESSAGES` em `index.ts` linha ~103

2. **Monitorar uso de tokens**
   - Histórico consome mais tokens da OpenAI
   - Considerar usar `gpt-4o-mini` se custo for preocupação

3. **Implementar limpeza de conversas antigas** (futuro)
   - Criar job para arquivar conversas > 30 dias
   - Melhorar performance de queries

4. **Adicionar métricas** (futuro)
   - Quantas conversas têm histórico vs primeira mensagem
   - Tamanho médio do histórico
   - Taxa de erro ao buscar histórico

---

**Última atualização:** 2025-01-19
**Versão:** 2.0 (com memória de conversa)
