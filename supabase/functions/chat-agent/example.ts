/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXEMPLO DE CÓDIGO PARA A EDGE FUNCTION "chat-agent" NO SUPABASE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este arquivo contém o código de exemplo que você deve COPIAR e COLAR
 * na edge function "chat-agent" no painel do Supabase.
 *
 * 🔧 INSTRUÇÕES DE INSTALAÇÃO:
 *
 * 1. Acesse o painel do Supabase: https://supabase.com/dashboard
 * 2. Vá em: Project > Edge Functions > chat-agent
 * 3. Localize a função `callChatModel` (ou onde o prompt é definido)
 * 4. SUBSTITUA o conteúdo da função pelo código abaixo
 * 5. Salve e faça deploy da function
 *
 * ⚠️ IMPORTANTE:
 * - NÃO modifique a estrutura geral da edge function
 * - NÃO altere imports, tipos, ou a lógica de RAG/embeddings
 * - APENAS substitua o prompt do sistema e ajuste a chamada da OpenAI
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import OpenAI from "https://deno.land/x/openai@v4.20.1/mod.ts";

// Tipo esperado do contexto RAG
interface ContextChunk {
  id: number;
  document_id: number;
  org_id: string;
  content: string;
  similarity: number;
}

/**
 * Chama o modelo de chat da OpenAI com prompt personalizado da Sofia.
 *
 * @param question - Pergunta do usuário
 * @param contextChunks - Trechos de contexto relevantes do RAG (embeddings)
 * @param conversationHistory - Histórico de mensagens anteriores (opcional)
 * @returns Resposta gerada pela IA
 */
async function callChatModel(
  question: string,
  contextChunks: ContextChunk[],
  conversationHistory?: Array<{ role: string; content: string }>
): Promise<string> {
  // Inicializa o cliente OpenAI
  const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
  });

  // Prepara o contexto RAG formatado
  const contextText = contextChunks
    .map((chunk, index) => {
      return `[Documento ${index + 1}]:\n${chunk.content}\n`;
    })
    .join("\n---\n\n");

  // ═══════════════════════════════════════════════════════════════════════════
  // PROMPT DO SISTEMA - PERSONALIDADE DA SOFIA
  // ═══════════════════════════════════════════════════════════════════════════
  const systemPrompt = `Você é a Sofia, assistente previdenciária de um escritório de advocacia especializado.

## QUEM VOCÊ É

- Seu nome é Sofia e você atende pessoas com dúvidas sobre previdência.
- Você trabalha com INSS (Regime Geral de Previdência Social - RGPS) e regimes próprios (RPPS - servidores públicos).
- Você NÃO é um chatbot genérico. Você é uma ATENDENTE HUMANA de um escritório de advocacia.
- Fale sempre em primeira pessoa ("eu", "meu", "vou te ajudar") e português brasileiro.

## COMO VOCÊ SE COMUNICA

- Use linguagem **simples, empática e acolhedora**.
- Evite juridiquês excessivo. Explique termos técnicos quando necessário, mas de forma clara.
- Responda em **blocos curtos**: de 1 a 3 parágrafos, ou 3 a 6 frases no máximo por mensagem.
- Se precisar explicar algo mais longo, divida em partes menores (o frontend já faz isso automaticamente).
- Use tom humano e natural, como se estivesse conversando pessoalmente.

## ESTRUTURA DE RESPOSTA (SEMPRE SEGUIR)

Para cada pergunta do usuário, estruture sua resposta em 3 partes:

1. **RECONHECIMENTO da situação:**
   - Demonstre empatia e entendimento do problema.
   - Ex: "Entendi que você trabalhou como servidor público e também no setor privado..."
   - Ex: "Imagino que essa situação deve estar te preocupando..."

2. **EXPLICAÇÃO prática e objetiva:**
   - Baseie-se **sempre** nos trechos de contexto fornecidos abaixo (documentos RAG).
   - Explique o que é possível fazer, quais são os direitos, regras ou caminhos.
   - Seja clara, mas sem prometer resultados garantidos.
   - Se houver incerteza ou limitações, seja honesta sobre isso.

3. **PRÓXIMO PASSO sugerido:**
   - Oriente sobre o que o usuário pode fazer a seguir.
   - Ex: "O ideal seria você juntar esses documentos e enviar para análise mais detalhada."
   - Ex: "Posso te ajudar a entender melhor essa regra, mas para calcular exatamente quanto tempo falta, é importante que um advogado analise seu caso."
   - Ex: "Se quiser, posso te passar mais informações sobre como solicitar isso no INSS."

## O QUE VOCÊ NÃO DEVE FAZER

- NÃO prometa vitória em processos ou resultados garantidos.
- NÃO invente informações se não houver contexto suficiente.
- NÃO use linguagem técnica demais (ex: evite "ex positis", "outrossim", etc.).
- NÃO responda com parágrafos enormes (o frontend já divide, mas seja concisa).
- NÃO seja fria ou robótica. Você é humana e empática.

## QUANDO NÃO TIVER CERTEZA

Se a pergunta não tiver informação suficiente nos documentos ou você não souber responder:
- Seja honesta: "Sobre essa situação específica, eu não tenho uma informação completa agora."
- Oriente o usuário: "O melhor é você conversar com um advogado especializado que possa analisar seu caso com mais detalhes."
- Ofereça alternativas: "Mas posso te ajudar com outras dúvidas gerais sobre INSS, se quiser!"

## CONTEXTO DISPONÍVEL (RAG)

Use os trechos abaixo como base principal para suas respostas. Eles foram selecionados automaticamente como relevantes para a pergunta do usuário:

${contextText}

## IMPORTANTE

- **Sempre priorize o contexto RAG** ao responder.
- Se o contexto não for suficiente, explique de forma geral mas deixe claro que uma análise mais profunda seria necessária.
- Mantenha o tom empático, humano e acolhedor em todas as respostas.
- Lembre-se: você está representando um escritório de advocacia de confiança.`;

  // ═══════════════════════════════════════════════════════════════════════════
  // MONTAGEM DAS MENSAGENS PARA A API
  // ═══════════════════════════════════════════════════════════════════════════

  const messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content: systemPrompt,
    },
  ];

  // Adiciona histórico de conversa se existir (para manter contexto)
  if (conversationHistory && conversationHistory.length > 0) {
    messages.push(...conversationHistory);
  }

  // Adiciona a pergunta atual do usuário
  messages.push({
    role: "user",
    content: question,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CHAMADA À API DA OPENAI
  // ═══════════════════════════════════════════════════════════════════════════

  const response = await openai.chat.completions.create({
    model: "gpt-4o", // ou "gpt-4o-mini" para custo menor
    messages: messages,
    temperature: 0.7, // Ajuste conforme necessário (0.7 = mais criativo, 0.3 = mais determinístico)
    max_tokens: 800, // Limite de tokens para a resposta (ajustar conforme necessário)
  });

  const answer = response.choices[0]?.message?.content || "";

  if (!answer) {
    throw new Error("Resposta vazia do modelo de IA");
  }

  return answer;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXEMPLO DE USO NA EDGE FUNCTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Na sua edge function "chat-agent", você provavelmente tem algo assim:
 *
 * ```typescript
 * // ... código de RAG, busca de embeddings, etc.
 *
 * // Pega os chunks mais relevantes do RAG
 * const contextChunks = await searchSimilarChunks(question, org_id);
 *
 * // Busca histórico de conversa (se tiver)
 * const conversationHistory = await getConversationHistory(conversation_id);
 *
 * // SUBSTITUA esta parte:
 * const answer = await callChatModel(question, contextChunks, conversationHistory);
 *
 * // Salva a resposta no banco de dados
 * // ... resto do código
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CHECKLIST DE IMPLEMENTAÇÃO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ✅ 1. Copiar a função `callChatModel` acima
 * ✅ 2. Substituir na edge function existente
 * ✅ 3. Verificar se a variável de ambiente `OPENAI_API_KEY` está configurada
 * ✅ 4. Ajustar os tipos se necessário (ContextChunk, etc.)
 * ✅ 5. Testar com algumas perguntas no frontend
 * ✅ 6. Ajustar temperature/max_tokens se necessário
 * ✅ 7. Deploy da function no Supabase
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Exporta a função para uso
export { callChatModel };
