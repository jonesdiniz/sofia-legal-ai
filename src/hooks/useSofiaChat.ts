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

const ORG_ID = "b4c42a5e-ee6c-449c-965f-1139a1d8ce77";
const STORAGE_KEY = "sofia_conversation_id";

// Configurações para simular comportamento humano de digitação
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
 */
function calculateFirstMessageDelay(
  chunkText: string,
  networkElapsedMs: number
): number {
  const { minTotalDelay, maxTotalDelay, msPerChar, jitterRange } = TYPING_CONFIG.firstMessage;

  // Calcula delay base proporcional ao tamanho do texto
  const baseTypingTime = chunkText.length * msPerChar;

  // Adiciona variação aleatória (jitter)
  const jitter = (Math.random() - 0.5) * 2 * jitterRange; // Entre -jitterRange e +jitterRange

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
 */
function calculateSubsequentMessageDelay(chunkText: string): number {
  const { baseDelay, minDelay, maxDelay, msPerChar, jitterRange } = TYPING_CONFIG.subsequentMessages;

  // Calcula delay proporcional ao tamanho
  const sizeBasedDelay = chunkText.length * msPerChar;

  // Adiciona variação aleatória
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
    return localStorage.getItem(STORAGE_KEY);
  });
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // Persiste conversation_id no localStorage sempre que mudar
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem(STORAGE_KEY, conversationId);
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

        // 3. Chama a edge function do Supabase
        const { data, error } = await supabase.functions.invoke<ChatResponse>(
          "chat-agent",
          {
            body: {
              org_id: ORG_ID,
              question,
              ...(conversationId && { conversation_id: conversationId }),
            },
          }
        );

        // Calcula quanto tempo a chamada de rede levou
        const networkElapsedMs = Date.now() - networkStartTime;

        if (error) throw error;
        if (!data?.answer) throw new Error("Resposta vazia da Sofia");

        // 4. Atualiza conversation_id se veio um novo
        if (data.conversation_id) {
          setConversationId(data.conversation_id);
        }

        // 5. Divide a resposta em chunks para simular múltiplas mensagens
        const chunks = splitIntoChunks(data.answer);

        // 6. Envia cada chunk com delays humanizados
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

        // 7. Desativa indicador de digitação após enviar todos os chunks
        setIsTyping(false);

      } catch (error) {
        console.error("Erro ao enviar mensagem:", error);

        // Desativa indicador de digitação em caso de erro
        setIsTyping(false);

        // Envia mensagem de erro humanizada
        const errorMessage: Message = {
          id: `sofia-error-${Date.now()}`,
          actor: "sofia",
          content:
            "Opa, tive um probleminha técnico aqui... Pode tentar me perguntar de novo, por favor?",
          createdAt: new Date(),
        };

        setMessages((prev) => [...prev, errorMessage]);
      } finally {
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
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    messages,
    loading,
    isTyping,
    sendMessage,
    clearConversation,
  };
}
