# 🤖 Sofia - Edge Function com Memória de Conversa

Este diretório contém o código completo da **edge function `chat-agent`** que deve ser implementada no Supabase.

## 📋 O que você vai encontrar aqui

- **`index.ts`** - ✨ **NOVO:** Código completo da edge function com memória de conversa (curto prazo)
- **`example.ts`** - Código legado (apenas função `callChatModel` isolada)

## ✨ Novidade: Memória de Conversa (Curto Prazo)

A edge function agora implementa **memória de conversa**, permitindo que a Sofia:
- 🧠 Lembre-se de mensagens anteriores da mesma conversa
- 🔄 Mantenha contexto entre perguntas
- 🚫 Evite repetir apresentações em cada resposta
- 💬 Converse de forma mais natural e fluida

**Como funciona:**
1. Busca as últimas 20 mensagens da conversa (`conversation_id`)
2. Remove a última mensagem do usuário (evita duplicação)
3. Passa o histórico formatado para a OpenAI junto com a pergunta atual
4. A Sofia adapta o tom baseado em ter ou não histórico prévio

## 🚀 Como implementar no Supabase

### Passo 1: Acesse a Edge Function no Supabase

1. Vá para o painel do Supabase: https://supabase.com/dashboard
2. Selecione seu projeto (`sofia-legal-ai`)
3. No menu lateral, clique em **Edge Functions**
4. Abra a função **`chat-agent`** (ela já deve existir)

### Passo 2: Substitua TODO o código

1. Abra o arquivo **`index.ts`** deste diretório
2. Copie **TODO** o conteúdo (incluindo imports, funções e handler)
3. Substitua **completamente** o código da edge function no Supabase
4. **IMPORTANTE:** Use `index.ts` (completo), NÃO `example.ts` (parcial)

### Passo 4: Verifique as variáveis de ambiente

Certifique-se de que a variável `OPENAI_API_KEY` está configurada:

1. No painel do Supabase, vá em **Settings > Edge Functions**
2. Verifique se `OPENAI_API_KEY` está presente
3. Se não estiver, adicione sua chave da OpenAI

### Passo 5: Deploy

1. Salve as alterações
2. Faça o deploy da function
3. Teste enviando uma mensagem no frontend

## 🎯 O que mudou no prompt?

### Antes (prompt genérico):
```
"Você é um assistente de IA que responde perguntas sobre previdência..."
```

### Depois (Sofia humanizada):

1. **Identidade clara:**
   - Nome: Sofia
   - Papel: atendente humana de escritório de advocacia
   - Área: INSS (RGPS) e regimes próprios (RPPS)

2. **Tom de comunicação:**
   - Primeira pessoa ("eu", "meu")
   - Linguagem simples e empática
   - Sem juridiquês excessivo
   - Respostas curtas (1-3 parágrafos)

3. **Estrutura de resposta:**
   - **Reconhecimento:** demonstra empatia
   - **Explicação:** baseada no contexto RAG
   - **Próximo passo:** orienta o usuário

4. **Limitações claras:**
   - Não promete resultados garantidos
   - É honesta quando não tem informação suficiente
   - Sempre sugere consulta com advogado quando necessário

## 🧪 Como testar a memória de conversa

### Teste 1: Primeira mensagem (sem histórico)

Envie via frontend ou API:
```json
{
  "org_id": "b4c42a5e-ee6c-449c-965f-1139a1d8ce77",
  "question": "Oi, tudo bem?",
  "client_id": "test-user-123"
}
```

**Comportamento esperado:**
- Sofia se apresenta de forma completa
- Usa frases como "Oi! Eu sou a Sofia..."
- Pergunta "Como posso te ajudar?"

**Resposta retorna:**
```json
{
  "answer": "Oi! Eu sou a Sofia... Como posso te ajudar?",
  "conversation_id": "uuid-aqui",
  "context_used": [...]
}
```

### Teste 2: Segunda mensagem (com histórico)

Usando o `conversation_id` retornado acima:
```json
{
  "org_id": "b4c42a5e-ee6c-449c-965f-1139a1d8ce77",
  "question": "Com quem estou falando mesmo?",
  "conversation_id": "uuid-aqui"
}
```

**Comportamento esperado:**
- Sofia NÃO repete a apresentação completa
- Faz referência à conversa em andamento
- Responde de forma contextual (ex: "Como mencionei antes, sou a Sofia...")

**Verificação nos logs do Supabase:**
```
[chat-agent] Histórico carregado: { totalMessages: 2, usedMessages: 2 }
[chat-agent] Última mensagem do usuário removida (evitar duplicação)
[chat-agent] Histórico processado: { finalMessageCount: 1, hasHistory: true }
[chat-agent] Adicionando histórico ao contexto: { historyMessages: 1 }
```

## 📊 Ajustes finos (opcionais)

No arquivo `index.ts`, linha ~429, você pode ajustar:

```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4o",        // ou "gpt-4o-mini" para custo menor
  temperature: 0.7,       // 0.3 = mais determinístico, 0.9 = mais criativo
  max_tokens: 800,        // Limite de tokens na resposta
});
```

### Recomendações:

- **model**: `gpt-4o` para melhor qualidade, `gpt-4o-mini` para economia
- **temperature**: `0.7` (bom equilíbrio entre criatividade e consistência)
- **max_tokens**: `800` (suficiente para 2-3 parágrafos, o frontend já faz chunking)

### Limite de histórico:

No arquivo `index.ts`, linha ~103:
```typescript
const MAX_HISTORY_MESSAGES = 20; // Ajuste se necessário
```

- **20 mensagens** = ~10 turnos de conversa (suficiente para curto prazo)
- Aumente para 40-50 se quiser mais contexto (cuidado com limite de tokens da OpenAI)

## ✅ Checklist de implementação

- [ ] Copiei o código completo do `index.ts`
- [ ] Substitui TODO o código da edge function `chat-agent` no Supabase
- [ ] Verifiquei que `OPENAI_API_KEY` está configurada
- [ ] Verifiquei que `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão configuradas
- [ ] Fiz deploy da function
- [ ] **Teste 1:** Enviei primeira mensagem (Sofia se apresentou completamente) ✅
- [ ] **Teste 2:** Enviei segunda mensagem com `conversation_id` (Sofia não repetiu apresentação) ✅
- [ ] Verifiquei logs no Supabase (histórico sendo carregado corretamente) ✅
- [ ] Sofia responde com tom humano e empático
- [ ] As respostas aparecem em blocos curtos (chunking funciona no frontend)

## 🐛 Troubleshooting

### "Resposta vazia da Sofia"
- Verifique se `OPENAI_API_KEY` está correta
- Verifique se o modelo (`gpt-4o` ou `gpt-4o-mini`) está acessível na sua conta OpenAI

### "Erro ao processar contexto"
- Verifique se os `contextChunks` estão sendo passados corretamente
- Verifique se a busca de embeddings/RAG está funcionando

### "Sofia responde de forma robótica"
- Revise o prompt do sistema no `index.ts` (linha ~276)
- Aumente a `temperature` para 0.8 ou 0.9 (mais criativo)
- Adicione mais exemplos de linguagem natural no prompt

### "Respostas muito longas"
- Reduza `max_tokens` para 500-600
- Adicione no prompt: "Seja ainda mais concisa, máximo 2-3 frases por vez"

### "Sofia continua se apresentando em toda mensagem" 🆕
- Verifique se o `conversation_id` está sendo enviado corretamente pelo frontend
- Verifique nos logs se o histórico está sendo carregado: `[chat-agent] Histórico carregado`
- Verifique se a tabela `messages` tem as mensagens anteriores
- Teste manualmente enviando o mesmo `conversation_id` em requisições sucessivas

### "Erro ao buscar histórico" 🆕
- Verifique se `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão configuradas
- Verifique se a tabela `messages` existe e tem as colunas: `actor, content, created_at, conversation_id`
- Verifique permissões RLS (Row Level Security) - a service role key deve ter acesso total
- Veja os logs detalhados no painel do Supabase

### "Histórico sendo duplicado" 🆕
- Isso NÃO deve acontecer - a função remove automaticamente a última mensagem do usuário
- Verifique nos logs: `[chat-agent] Última mensagem do usuário removida (evitar duplicação)`
- Se persistir, revise a lógica em `getConversationHistory` (linha ~103-126)

## 📞 Suporte

Se tiver dúvidas sobre a implementação:
1. Revise o código em `example.ts` - está todo comentado
2. Verifique os logs da edge function no painel do Supabase
3. Teste com perguntas simples primeiro (ex: "O que é INSS?")

---

**Importante:** Este código é apenas um exemplo para ser **copiado** para o Supabase. Não tente executá-lo localmente neste repositório.
