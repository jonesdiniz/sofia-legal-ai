# 💬 Sistema de Chat - Sofia Legal AI

Documentação técnica do sistema de chat da Sofia, assistente previdenciária.

## 📋 Índice

- [Arquitetura](#arquitetura)
- [Hook useSofiaChat](#hook-usesofiāchat)
- [Componentes](#componentes)
- [Comportamento Humanizado](#comportamento-humanizado)
- [Acessibilidade](#acessibilidade)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Testes](#testes)
- [Troubleshooting](#troubleshooting)

---

## 🏗️ Arquitetura

```
src/
├── hooks/
│   ├── useSofiaChat.ts      # Hook principal do chat
│   └── chatUtils.ts          # Funções utilitárias (chunking, delays)
├── components/
│   ├── ChatInput.tsx         # Campo de input
│   ├── ChatMessage.tsx       # Balão de mensagem
│   └── TypingIndicator.tsx   # Indicador "digitando..."
├── pages/
│   └── Chat.tsx              # Página principal do chat
├── lib/
│   ├── logger.ts             # Sistema de logging
│   └── constants.ts          # Constantes centralizadas
└── integrations/
    └── supabase/
        └── client.ts         # Cliente Supabase
```

### Fluxo de Dados

```
User Input → ChatInput → useSofiaChat.sendMessage()
                              ↓
                    Supabase Edge Function (chat-agent)
                              ↓
                    Response with answer + conversation_id
                              ↓
                    Split into chunks + humanized delays
                              ↓
                    Render ChatMessage components
```

---

## 🪝 Hook useSofiaChat

O hook `useSofiaChat` gerencia todo o estado e lógica do chat.

### API Externa

```typescript
const {
  messages,         // Array<Message> - histórico de mensagens
  loading,          // boolean - enviando mensagem
  isTyping,         // boolean - Sofia está digitando
  sendMessage,      // (question: string) => Promise<void>
  clearConversation // () => void - limpa conversa
} = useSofiaChat();
```

### Interface Message

```typescript
interface Message {
  id: string;              // UUID único
  actor: "user" | "sofia"; // Quem enviou
  content: string;         // Texto da mensagem
  createdAt: Date;         // Timestamp
}
```

### Fluxo Interno (sendMessage)

1. **Validação**: Verifica se a mensagem não está vazia e se não está em loading
2. **Adiciona mensagem do usuário**: Imediatamente ao estado
3. **Ativa loading e isTyping**: Feedback visual
4. **Chama Edge Function**: `chat-agent` no Supabase
5. **Processa resposta**: Divide em chunks e adiciona delays humanizados
6. **Atualiza conversation_id**: Persiste no localStorage
7. **Renderiza mensagens da Sofia**: Com delays entre chunks
8. **Desativa isTyping e loading**: Libera para nova mensagem

### Tratamento de Erros

- **Erro de rede/API**: Log completo + mensagem humanizada para usuário
- **Resposta inválida**: Validação de tipo + mensagem de erro
- **Finally block**: Garante que `isTyping` e `loading` sempre voltam a `false`

---

## 🧩 Componentes

### ChatInput

Campo de input para enviar mensagens.

**Props:**
```typescript
{
  onSend: (message: string) => void;
  disabled?: boolean;
}
```

**Funcionalidades:**
- Enter envia mensagem (Shift+Enter quebra linha)
- Trim automático (não envia mensagens vazias)
- Botão desabilitado quando loading ou mensagem vazia
- Aria-labels para acessibilidade

### ChatMessage

Balão de mensagem do usuário ou da Sofia.

**Props:**
```typescript
{
  message: Message;
}
```

**Características:**
- Alinhamento diferenciado (user à direita, Sofia à esquerda)
- Avatar com ícone
- Timestamp formatado (HH:mm)
- Animação de entrada suave

### TypingIndicator

Indicador visual de "Sofia está digitando".

**Características:**
- Bolinhas animadas com delays escalonados
- Aria-live para leitores de tela
- Só aparece quando `isTyping === true`

---

## ⏱️ Comportamento Humanizado

### Chunking de Mensagens

A resposta da Sofia é dividida em múltiplos chunks para simular mensagens curtas:

**Estratégia:**
1. Divide por parágrafos (`\n\n`)
2. Dentro de cada parágrafo, divide por frases (`.`)
3. Agrupa frases até atingir `~200 caracteres`
4. Cada chunk vira uma mensagem separada

**Exemplo:**
```
Resposta da IA: "Olá! Entendi sua situação.\n\nVocê pode solicitar a revisão no portal do INSS. É importante ter todos os documentos em mãos."

Chunks resultantes:
1. "Olá! Entendi sua situação."
2. "Você pode solicitar a revisão no portal do INSS."
3. "É importante ter todos os documentos em mãos."
```

### Delays de Digitação

#### Primeira Mensagem
```typescript
{
  minTotalDelay: 900ms,    // Mínimo de "pensando + digitando"
  maxTotalDelay: 4500ms,   // Máximo
  msPerChar: 18ms,         // ~18ms por caractere
  jitterRange: ±200ms      // Variação aleatória
}
```

**Cálculo:**
```
delay = min(max(caracteres × 18ms + jitter - tempoDeRede, 900ms), 4500ms)
```

#### Mensagens Subsequentes
```typescript
{
  baseDelay: 300ms,
  minDelay: 500ms,
  maxDelay: 3000ms,
  msPerChar: 12ms,
  jitterRange: ±150ms
}
```

**Resultado:** Sofia parece estar "digitando" em tempo real, com velocidade variável e humanizada.

---

## ♿ Acessibilidade

### ARIA Attributes

**ChatInput:**
- `aria-label="Digite sua dúvida sobre previdência"`
- `aria-describedby="chat-disclaimer"` (texto de disclaimer)

**Área de Mensagens:**
- `role="log"` (região de log de mensagens)
- `aria-live="polite"` (anuncia novas mensagens)
- `aria-atomic="false"` (anuncia apenas adições)
- `aria-relevant="additions"` (ignora remoções)

**TypingIndicator:**
- `role="status"`
- `aria-live="polite"`
- `aria-label="Sofia está digitando"`

**Botões de Sugestão:**
- `aria-label` descritivo (ex: "Perguntar: Quais os tipos de aposentadoria do INSS?")
- `focus:ring-2 focus:ring-primary` (anel de foco visível)

### Navegação por Teclado

- ✅ Tab para navegar entre elementos
- ✅ Enter para enviar mensagem
- ✅ Shift+Enter para quebra de linha
- ✅ Botões e inputs focáveis
- ✅ Indicador visual de foco (anel)

---

## 🔐 Variáveis de Ambiente

Arquivo `.env` necessário:

```bash
VITE_SUPABASE_URL="https://seu-projeto.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGc..." # Token JWT (SEM prefixo "Bearer")
```

**IMPORTANTE:**
- A variável `VITE_SUPABASE_ANON_KEY` deve conter APENAS o token JWT
- NÃO adicionar prefixo "Bearer "
- Se as variáveis não estiverem definidas, o cliente Supabase lançará erro em runtime

---

## 🧪 Testes

### Executar Testes

```bash
# Modo watch (desenvolvimento)
npm test

# Executar uma vez
npm run test:run

# Com interface visual
npm run test:ui
```

### Cobertura Atual

**Arquivo:** `src/hooks/chatUtils.test.ts`

- ✅ **splitIntoChunks**: 5 testes
  - Dividir múltiplos parágrafos
  - Texto sem pontos
  - Texto longo
  - Respeitar limite de caracteres
  - Manter frases inteiras

- ✅ **calculateFirstMessageDelay**: 4 testes
  - Delay mínimo
  - Delay máximo
  - Considerar tempo de rede
  - Limites configurados

- ✅ **calculateSubsequentMessageDelay**: 5 testes
  - Delay mínimo
  - Delay máximo
  - Proporcional ao tamanho
  - Delay base
  - Variação (jitter)

**Total:** 14/14 testes passando ✅

### Executar Testes Específicos

```bash
# Apenas testes de chunking
npm test -- splitIntoChunks

# Apenas testes de delays
npm test -- delay
```

---

## 🐛 Troubleshooting

### Sofia não responde

**Sintoma:** Mensagem enviada, mas nenhuma resposta da Sofia.

**Checklist:**
1. ✅ Variáveis de ambiente configuradas corretamente?
2. ✅ Edge function `chat-agent` deployada no Supabase?
3. ✅ Abrir console do navegador e verificar logs `[Sofia]`
4. ✅ Verificar network tab: chamada para `/chat-agent` retorna 200?
5. ✅ Verificar logs da Edge Function no painel do Supabase

**Logs Importantes:**
```
[Sofia] Enviando mensagem para chat-agent
[Sofia] Resposta recebida
[Sofia] Atualizando conversation_id
[Sofia] Resposta dividida em chunks
```

### Erro "Missing Supabase environment variables"

**Causa:** Variáveis `VITE_SUPABASE_URL` ou `VITE_SUPABASE_ANON_KEY` não definidas.

**Solução:**
1. Criar arquivo `.env` na raiz do projeto
2. Adicionar as variáveis (ver seção [Variáveis de Ambiente](#variáveis-de-ambiente))
3. Restart do servidor de desenvolvimento (`npm run dev`)

### Sofia "digita" muito rápido/lento

**Solução:** Ajustar configurações em `src/lib/constants.ts`:

```typescript
export const TYPING_CONFIG = {
  firstMessage: {
    minTotalDelay: 900,    // ← Aumentar para mais lento
    maxTotalDelay: 4500,   // ← Aumentar para mais lento
    msPerChar: 18,         // ← Aumentar para mais lento
  },
  // ...
}
```

### Mensagens muito longas

**Solução:** Reduzir `chunkSize.max` em `src/lib/constants.ts`:

```typescript
chunkSize: {
  max: 150,  // ← Reduzir de 200 para 150
}
```

### Scroll não vai até o final

**Causa:** DOM não atualizou antes do scroll.

**Solução:** Já implementado com `requestAnimationFrame()` em `Chat.tsx:19-22`.

Se ainda ocorrer, aumentar delay:

```typescript
useEffect(() => {
  setTimeout(() => {
    scrollToBottom();
  }, 100); // Adicionar delay
}, [messages, isTyping]);
```

---

## 📊 Métricas e Monitoramento

### Logs em Desenvolvimento

```typescript
// src/lib/logger.ts
logger.debug("Mensagem de debug"); // Apenas em DEV
logger.error("Erro crítico");      // Sempre ativo
```

### Logs em Produção

- `logger.debug()` → **silenciado**
- `logger.error()` → **ativo** (console.error)

**Recomendação:** Integrar com serviço de erro (Sentry, LogRocket, etc.) para capturar erros em produção.

---

## 🚀 Próximos Passos Recomendados

1. **Monitoramento**: Integrar Sentry ou similar
2. **Analytics**: Rastrear métricas de uso (tempo de resposta, msgs por sessão)
3. **Rate Limiting**: Limitar envios rápidos consecutivos
4. **Feedback Positivo/Negativo**: Botões "útil" / "não útil" nas respostas
5. **Histórico de Conversas**: Persistir no backend e permitir recuperar
6. **Testes E2E**: Playwright ou Cypress para testar fluxo completo

---

**Última atualização:** 2025-01-19
**Versão do Chat:** 2.0 (Production Ready)
