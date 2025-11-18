# 🤖 Sofia - Prompt do Backend (Edge Function)

Este diretório contém o código de exemplo para a **edge function `chat-agent`** que deve ser implementada no Supabase.

## 📋 O que você vai encontrar aqui

- **`example.ts`** - Código completo da função `callChatModel` com o prompt da Sofia

## 🚀 Como implementar no Supabase

### Passo 1: Acesse a Edge Function no Supabase

1. Vá para o painel do Supabase: https://supabase.com/dashboard
2. Selecione seu projeto (`sofia-legal-ai`)
3. No menu lateral, clique em **Edge Functions**
4. Abra a função **`chat-agent`** (ela já deve existir)

### Passo 2: Localize a função de chamada do modelo

Na edge function existente, procure por algo similar a:

```typescript
// Chama o modelo de IA
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    { role: "system", content: "Você é um assistente..." },
    { role: "user", content: question }
  ]
});
```

### Passo 3: Substitua pelo código do `example.ts`

1. Abra o arquivo **`example.ts`** deste diretório
2. Copie **TODO** o conteúdo da função `callChatModel`
3. Cole no lugar da função equivalente na edge function do Supabase
4. Ajuste os imports se necessário

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

## 📊 Ajustes finos (opcionais)

No arquivo `example.ts`, você pode ajustar:

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

## ✅ Checklist de implementação

- [ ] Copiei o código do `example.ts`
- [ ] Colei na edge function `chat-agent` no Supabase
- [ ] Verifiquei que `OPENAI_API_KEY` está configurada
- [ ] Ajustei os tipos/imports se necessário
- [ ] Fiz deploy da function
- [ ] Testei no frontend enviando perguntas
- [ ] Sofia responde com tom humano e empático
- [ ] As respostas aparecem em blocos curtos (chunking funciona)

## 🐛 Troubleshooting

### "Resposta vazia da Sofia"
- Verifique se `OPENAI_API_KEY` está correta
- Verifique se o modelo (`gpt-4o` ou `gpt-4o-mini`) está acessível na sua conta OpenAI

### "Erro ao processar contexto"
- Verifique se os `contextChunks` estão sendo passados corretamente
- Verifique se a busca de embeddings/RAG está funcionando

### "Sofia responde de forma robótica"
- Revise o prompt do sistema no `example.ts`
- Aumente a `temperature` para 0.8 ou 0.9 (mais criativo)
- Adicione mais exemplos de linguagem natural no prompt

### "Respostas muito longas"
- Reduza `max_tokens` para 500-600
- Adicione no prompt: "Seja ainda mais concisa, máximo 2-3 frases por vez"

## 📞 Suporte

Se tiver dúvidas sobre a implementação:
1. Revise o código em `example.ts` - está todo comentado
2. Verifique os logs da edge function no painel do Supabase
3. Teste com perguntas simples primeiro (ex: "O que é INSS?")

---

**Importante:** Este código é apenas um exemplo para ser **copiado** para o Supabase. Não tente executá-lo localmente neste repositório.
