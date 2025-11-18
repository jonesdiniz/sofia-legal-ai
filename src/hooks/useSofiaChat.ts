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

export function useSofiaChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY);
  });
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (conversationId) {
      localStorage.setItem(STORAGE_KEY, conversationId);
    }
  }, [conversationId]);

  const splitIntoChunks = (text: string): string[] => {
    const chunks: string[] = [];
    const paragraphs = text.split("\n\n");
    
    for (const para of paragraphs) {
      if (para.trim()) {
        const sentences = para.split(/(?<=\.)\s+/);
        let currentChunk = "";
        
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length < 150) {
            currentChunk += (currentChunk ? " " : "") + sentence;
          } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = sentence;
          }
        }
        
        if (currentChunk) chunks.push(currentChunk);
      }
    }
    
    return chunks.length > 0 ? chunks : [text];
  };

  const sendMessage = useCallback(
    async (question: string) => {
      if (!question.trim() || loading) return;

      setLoading(true);
      
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        actor: "user",
        content: question,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);

      try {
        setIsTyping(true);
        
        const minTypingTime = 800 + Math.random() * 400;
        const startTime = Date.now();

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

        if (error) throw error;
        if (!data?.answer) throw new Error("Resposta vazia da Sofia");

        const elapsed = Date.now() - startTime;
        const remainingTypingTime = Math.max(0, minTypingTime - elapsed);
        
        await new Promise((resolve) => setTimeout(resolve, remainingTypingTime));

        if (data.conversation_id) {
          setConversationId(data.conversation_id);
        }

        const chunks = splitIntoChunks(data.answer);
        
        setIsTyping(false);
        
        for (let i = 0; i < chunks.length; i++) {
          const sofiaMessage: Message = {
            id: `sofia-${Date.now()}-${i}`,
            actor: "sofia",
            content: chunks[i],
            createdAt: new Date(),
          };

          setMessages((prev) => [...prev, sofiaMessage]);

          if (i < chunks.length - 1) {
            await new Promise((resolve) =>
              setTimeout(resolve, 400 + Math.random() * 400)
            );
          }
        }
      } catch (error) {
        console.error("Erro ao enviar mensagem:", error);
        
        setIsTyping(false);
        
        const errorMessage: Message = {
          id: `sofia-error-${Date.now()}`,
          actor: "sofia",
          content:
            "Desculpe, tive um problema ao processar sua mensagem. Por favor, tente novamente.",
          createdAt: new Date(),
        };
        
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setLoading(false);
      }
    },
    [loading, conversationId]
  );

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
