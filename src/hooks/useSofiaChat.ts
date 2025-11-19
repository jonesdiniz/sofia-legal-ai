import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Message {
  id: string;
  actor: "user" | "sofia";
  content: string;
  createdAt: Date;
}

interface ChatResponse {
  answer: string;
  conversation_id: string;
  context_used?: Array<{
    id: number;
    document_id: number;
    org_id: string;
    content: string;
    similarity: number;
  }>;
}

/**
 * ID da organização usado para filtrar documentos RAG.
 * Este valor identifica o contexto de conhecimento da Sofia.
 */
export const SOFIA_ORG_ID = "b4c42a5e-ee6c-449c-965f-1139a1d8ce77";

/**
 * Chave do localStorage para persistir o ID da conversa.
 */
const CONVERSATION_STORAGE_KEY = "sofia_conversation_id";

/**
 * Configurações para simular comportamento humano de digitação.
 * Ajuste esses valores para controlar a velocidade e naturalidade das respostas.
 */
const TYPING_CONFIG = {
  // Para a primeira mensagem (após receber resposta da IA)
  firstMessage: {
    minTotalDelay: 900,    // Mínimo total de "pensando + digitando" (ms)
    maxTotalDelay: 4500,   // Máximo total de "pensando + digitando" (ms)
    msPerChar: 18,         // Base de tempo por caractere (ms)
    jitterRange: 200,      // Variação aleatória (±ms)
  },
  // Para mensagens subsequentes (chunks seguintes)
  subsequentMessages: {
    baseDelay: 300,        // Delay base mínimo (ms)
    minDelay: 500,         // Delay mínimo total (ms)
    maxDelay: 3000,        // Delay máximo total (ms)
    msPerChar: 12,         // Base de tempo por caractere (ms)
    jitterRange: 150,      // Variação aleatória (±ms)
  },
  // Tamanho ideal dos chunks de texto
  chunkSize: {
    min: 50,               // Tamanho mínimo para considerar quebra
    max: 200,              // Tamanho máximo do chunk
  }
};

/**
 * Divide o texto em chunks menores para simular múltiplas mensagens curtas,
 * como um atendente humano faria.
 *
 * Estratégia:
 * 1. Divide por parágrafos (quebras duplas \n\n)
 * 2. Dentro de cada parágrafo, divide por frases (pontos finais)
 * 3. Agrupa frases em chunks de até ~200 caracteres
 * 4. Se não conseguir dividir bem, retorna o texto original
 */
function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  const maxChunkSize = TYPING_CONFIG.chunkSize.max;

  // Divide por parágrafos
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());

  for (const paragraph of paragraphs) {
    // Divide por frases (ponto seguido de espaço ou fim de linha)
    // Usa lookbehind para manter o ponto na frase
    const sentences = paragraph.split(/(?<=\.)\s+/).filter(s => s.trim());

    let currentChunk = "";

    for (const sentence of sentences) {
      const sentenceTrimmed = sentence.trim();

      // Se a frase sozinha já é maior que o limite, adiciona ela como chunk separado
      if (sentenceTrimmed.length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
        }
        chunks.push(sentenceTrimmed);
        continue;
      }

      // Tenta adicionar a frase ao chunk atual
      const potentialChunk = currentChunk
        ? `${currentChunk} ${sentenceTrimmed}`
        : sentenceTrimmed;

      if (potentialChunk.length <= maxChunkSize) {
        currentChunk = potentialChunk;
      } else {
        // Se ultrapassar o limite, salva o chunk atual e inicia novo
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentenceTrimmed;
      }
    }

    // Adiciona o último chunk do parágrafo
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
  }

  // Se não conseguiu dividir (ex: texto sem pontos/parágrafos), retorna original
  return chunks.length > 0 ? chunks : [text.trim()];
}

/**
 * Calcula o delay de digitação humanizado para a primeira mensagem.
 * Considera o tempo já gasto na chamada de rede e garante um delay total
 * realista baseado no tamanho do texto.
 *
 * Simula tempo de "pensamento + digitação" de um atendente humano.
 */
function calculateFirstMessageDelay(
  chunkText: string,
  networkElapsedMs: number
): number {
  const { minTotalDelay, maxTotalDelay, msPerChar, jitterRange } = TYPING_CONFIG.firstMessage;

  // Calcula delay base proporcional ao tamanho do texto
  const baseTypingTime = chunkText.length * msPerChar;

  // Adiciona variação aleatória (jitter) para simular variação humana
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;

  // Delay idealizado total (tempo de rede + digitação)
  const idealTotalDelay = baseTypingTime + jitter;

  // Garante que esteja dentro dos limites
  const clampedTotalDelay = Math.max(
    minTotalDelay,
    Math.min(maxTotalDelay, idealTotalDelay)
  );

  // Subtrai o tempo já gasto na rede, mas garante pelo menos 100ms
  const remainingDelay = Math.max(100, clampedTotalDelay - networkElapsedMs);

  return remainingDelay;
}

/**
 * Calcula o delay de digitação para mensagens subsequentes (chunks seguintes).
 * Usa delays menores e mais proporcionais ao tamanho do chunk.
 *
 * Simula o tempo entre mensagens curtas em sequência.
 */
function calculateSubsequentMessageDelay(chunkText: string): number {
  const { baseDelay, minDelay, maxDelay, msPerChar, jitterRange } = TYPING_CONFIG.subsequentMessages;

  // Calcula delay proporcional ao tamanho
  const sizeBasedDelay = chunkText.length * msPerChar;

  // Adiciona variação aleatória para naturalidade
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;

  // Combina delay base + proporcional + jitter
  const totalDelay = baseDelay + sizeBasedDelay + jitter;

  // Garante que esteja dentro dos limites
  return Math.max(minDelay, Math.min(maxDelay, totalDelay));
}

/**
 * Hook principal para gerenciar o chat com a Sofia.
 * Mantém mensagens, estado de loading/typing, e conversation_id persistente.
 */
export function useSofiaChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(() => {
    // Inicializa do localStorage se existir
    return localStorage.getItem(CONVERSATION_STORAGE_KEY);
  });
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // Persiste conversation_id no localStorage sempre que mudar
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem(CONVERSATION_STORAGE_KEY, conversationId);
    }
  }, [conversationId]);

  /**
   * Envia uma mensagem para a Sofia e processa a resposta em chunks,
   * simulando um atendente humano respondendo em múltiplas mensagens curtas.
   */
  const sendMessage = useCallback(
    async (question: string) => {
      if (!question.trim() || loading) return;

      setLoading(true);

      // 1. Adiciona mensagem do usuário imediatamente
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        actor: "user",
        content: question,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);

      try {
        // 2. Ativa indicador de digitação
        setIsTyping(true);

        // Marca o início da chamada de rede
        const networkStartTime = Date.now();

        // 3. Monta o body exatamente como o backend espera
        const requestBody = {
          org_id: SOFIA_ORG_ID,
          question: question,
          client_id: null, // Por enquanto não identificamos clientes específicos
          conversation_id: conversationId || null,
        };

        console.log("[SofiaChat] Enviando mensagem para chat-agent:", {
          org_id: requestBody.org_id,
          question_length: question.length,
          has_conversation_id: !!conversationId,
        });

        // 4. Chama a edge function do Supabase
        const { data, error } = await supabase.functions.invoke<ChatResponse>(
          "chat-agent",
          {
            body: requestBody,
          }
        );

        // Calcula quanto tempo a chamada de rede levou
        const networkElapsedMs = Date.now() - networkStartTime;

        // 5. Tratamento de erro detalhado
        if (error) {
          console.error("[SofiaChat] Erro ao chamar chat-agent:", {
            error,
            message: error.message,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            status: (error as any).status, // Supabase error pode ter status, mas não está tipado
          });
          throw error;
        }

        // 6. Valida a resposta
        // IMPORTANTE: O Supabase SDK pode retornar data diretamente ou data.data
        // dependendo da versão. Vamos verificar ambos.
        const responseData = data as ChatResponse;

        console.log("[SofiaChat] Resposta recebida:", {
          has_data: !!data,
          has_answer: !!(responseData?.answer),
          has_conversation_id: !!(responseData?.conversation_id),
          network_elapsed_ms: networkElapsedMs,
        });

        if (!responseData || typeof responseData.answer !== "string") {
          console.error("[SofiaChat] Resposta inesperada de chat-agent:", data);
          throw new Error("Resposta inesperada da função de chat.");
        }

        const { answer, conversation_id: newConversationId } = responseData;

        // 7. Atualiza conversation_id se veio um novo
        if (newConversationId) {
          console.log("[SofiaChat] Atualizando conversation_id:", newConversationId);
          setConversationId(newConversationId);
        }

        // 8. Divide a resposta em chunks para simular múltiplas mensagens
        const chunks = splitIntoChunks(answer);

        console.log("[SofiaChat] Resposta dividida em chunks:", {
          total_chunks: chunks.length,
          chunk_sizes: chunks.map(c => c.length),
        });

        // 9. Envia cada chunk com delays humanizados
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const isFirstChunk = i === 0;

          // Calcula o delay apropriado
          let delay: number;
          if (isFirstChunk) {
            // Para o primeiro chunk, considera o tempo já gasto na rede
            delay = calculateFirstMessageDelay(chunk, networkElapsedMs);
          } else {
            // Para chunks subsequentes, usa delays menores
            delay = calculateSubsequentMessageDelay(chunk);
          }

          // Aguarda o delay (simulando digitação)
          await new Promise((resolve) => setTimeout(resolve, delay));

          // Adiciona a mensagem da Sofia
          const sofiaMessage: Message = {
            id: `sofia-${Date.now()}-${i}`,
            actor: "sofia",
            content: chunk,
            createdAt: new Date(),
          };

          setMessages((prev) => [...prev, sofiaMessage]);
        }

        // 10. Desativa indicador de digitação após enviar todos os chunks
        setIsTyping(false);

      } catch (err) {
        console.error("[SofiaChat] Erro inesperado ao enviar mensagem:", err);

        // Envia mensagem de erro humanizada para o usuário
        const errorMessage: Message = {
          id: `sofia-error-${Date.now()}`,
          actor: "sofia",
          content:
            "Opa, tive um probleminha técnico aqui... Pode tentar me perguntar de novo, por favor?",
          createdAt: new Date(),
        };

        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        // Garante que sempre desativa loading e typing, mesmo em caso de erro
        setIsTyping(false);
        setLoading(false);
      }
    },
    [loading, conversationId]
  );

  /**
   * Limpa toda a conversa e reseta o conversation_id.
   */
  const clearConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    localStorage.removeItem(CONVERSATION_STORAGE_KEY);
    console.log("[SofiaChat] Conversa limpa");
  }, []);

  return {
    messages,
    loading,
    isTyping,
    sendMessage,
    clearConversation,
  };
}
