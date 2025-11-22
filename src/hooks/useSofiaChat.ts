import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { SOFIA_ORG_ID, CONVERSATION_STORAGE_KEY, TYPING_CONFIG } from "@/lib/constants";
import { splitIntoChunks, calculateFirstMessageDelay, calculateSubsequentMessageDelay } from "./chatUtils";

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
        id: crypto.randomUUID(),
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

        logger.debug("Enviando mensagem para chat-agent", {
          org_id: requestBody.org_id,
          question_length: question.length,
          has_conversation_id: !!conversationId,
        });

        // 4. Chama a edge function do Supabase
        const { data, error } = await supabase.functions.invoke<ChatResponse>("chat-agent", {
          body: requestBody,
        });

        // Calcula quanto tempo a chamada de rede levou
        const networkElapsedMs = Date.now() - networkStartTime;

        // 5. Tratamento de erro detalhado
        if (error) {
          logger.error("Erro ao chamar chat-agent", {
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

        logger.debug("Resposta recebida", {
          has_data: !!data,
          has_answer: !!responseData?.answer,
          has_conversation_id: !!responseData?.conversation_id,
          network_elapsed_ms: networkElapsedMs,
        });

        if (!responseData || typeof responseData.answer !== "string") {
          logger.error("Resposta inesperada de chat-agent", data);
          throw new Error("Resposta inesperada da função de chat.");
        }

        const { answer, conversation_id: newConversationId } = responseData;

        // 7. Atualiza conversation_id se veio um novo
        if (newConversationId) {
          logger.debug("Atualizando conversation_id", { conversation_id: newConversationId });
          setConversationId(newConversationId);
        }

        // 8. Divide a resposta em chunks para simular múltiplas mensagens
        const chunks = splitIntoChunks(answer, TYPING_CONFIG.chunkSize.max);

        logger.debug("Resposta dividida em chunks", {
          total_chunks: chunks.length,
          chunk_sizes: chunks.map((c) => c.length),
        });

        // 9. Envia cada chunk com delays humanizados
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const isFirstChunk = i === 0;

          // Calcula o delay apropriado
          let delay: number;
          if (isFirstChunk) {
            // Para o primeiro chunk, considera o tempo já gasto na rede
            delay = calculateFirstMessageDelay(chunk, networkElapsedMs, TYPING_CONFIG.firstMessage);
          } else {
            // Para chunks subsequentes, usa delays menores
            delay = calculateSubsequentMessageDelay(chunk, TYPING_CONFIG.subsequentMessages);
          }

          // Aguarda o delay (simulando digitação)
          await new Promise((resolve) => setTimeout(resolve, delay));

          // Adiciona a mensagem da Sofia
          const sofiaMessage: Message = {
            id: crypto.randomUUID(),
            actor: "sofia",
            content: chunk,
            createdAt: new Date(),
          };

          setMessages((prev) => [...prev, sofiaMessage]);
        }

        // 10. Desativa indicador de digitação após enviar todos os chunks
        setIsTyping(false);
      } catch (err) {
        logger.error("Erro inesperado ao enviar mensagem", err);

        // Envia mensagem de erro humanizada para o usuário
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          actor: "sofia",
          content: "Opa, tive um probleminha técnico aqui... Pode tentar me perguntar de novo, por favor?",
          createdAt: new Date(),
        };

        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        // Garante que sempre desativa loading e typing, mesmo em caso de erro
        setIsTyping(false);
        setLoading(false);
      }
    },
    [loading, conversationId],
  );

  /**
   * Limpa toda a conversa e reseta o conversation_id.
   */
  const clearConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    localStorage.removeItem(CONVERSATION_STORAGE_KEY);
    logger.debug("Conversa limpa");
  }, []);

  return {
    messages,
    loading,
    isTyping,
    sendMessage,
    clearConversation,
  };
}
