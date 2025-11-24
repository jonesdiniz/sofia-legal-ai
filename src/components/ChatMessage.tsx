import { Message } from "@/hooks/useSofiaChat";
import { User, Bot, ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SOFIA_ORG_ID } from "@/lib/constants";

interface ChatMessageProps {
  message: Message;
  conversationId?: string;
}

/**
 * Componente de mensagem do chat.
 * Renderiza mensagens do usuário e da Sofia com estilos e alinhamento apropriados.
 * Para mensagens da Sofia, inclui botões de feedback (thumbs up/down).
 */
export function ChatMessage({ message, conversationId }: ChatMessageProps) {
  const isUser = message.actor === "user";
  const [feedbackGiven, setFeedbackGiven] = useState<"positive" | "negative" | null>(null);
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);

  /**
   * Envia feedback sobre a mensagem para o Supabase
   */
  const handleFeedback = async (feedbackType: "positive" | "negative") => {
    if (isSendingFeedback || feedbackGiven) return; // Evita duplo clique ou feedback duplicado

    setIsSendingFeedback(true);

    try {
      // Insere feedback no banco de dados
      const { error } = await supabase.from("message_feedback").insert({
        message_id: message.id, // Assumindo que Message tem um id
        conversation_id: conversationId || "unknown",
        org_id: SOFIA_ORG_ID,
        feedback_type: feedbackType,
        message_content: message.content,
        message_metadata: {
          timestamp: message.createdAt.toISOString(),
          actor: message.actor,
        },
      });

      if (error) {
        console.error("[ChatMessage] Erro ao enviar feedback:", error);
        // Fail silently - não queremos quebrar a UX por causa de erro de feedback
      } else {
        setFeedbackGiven(feedbackType);
        console.log(`[ChatMessage] Feedback ${feedbackType} enviado com sucesso`);
      }
    } catch (error) {
      console.error("[ChatMessage] Erro ao enviar feedback:", error);
    } finally {
      setIsSendingFeedback(false);
    }
  };

  return (
    <div
      className={cn(
        "flex gap-3 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser ? "bg-user-bubble" : "bg-sofia-bubble"
        )}
      >
        {isUser ? (
          <User className="h-5 w-5 text-user-bubble-foreground" />
        ) : (
          <Bot className="h-5 w-5 text-primary" />
        )}
      </div>

      {/* Balão de mensagem */}
      <div className={cn("max-w-[75%] flex flex-col gap-1")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 shadow-sm",
            isUser
              ? "bg-user-bubble text-user-bubble-foreground rounded-tr-sm"
              : "bg-sofia-bubble text-sofia-bubble-foreground rounded-tl-sm"
          )}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>
          <time className="text-xs opacity-60 mt-1 block">
            {message.createdAt.toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>

        {/* Botões de feedback (apenas para mensagens da Sofia) */}
        {!isUser && (
          <div className="flex items-center gap-2 px-1">
            <button
              onClick={() => handleFeedback("positive")}
              disabled={isSendingFeedback || feedbackGiven !== null}
              className={cn(
                "p-1.5 rounded-md transition-all hover:bg-muted/50",
                feedbackGiven === "positive" && "bg-green-100 text-green-700",
                feedbackGiven === "negative" && "opacity-30 cursor-not-allowed",
                isSendingFeedback && "opacity-50 cursor-wait"
              )}
              aria-label="Resposta útil"
              title="Esta resposta foi útil"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleFeedback("negative")}
              disabled={isSendingFeedback || feedbackGiven !== null}
              className={cn(
                "p-1.5 rounded-md transition-all hover:bg-muted/50",
                feedbackGiven === "negative" && "bg-red-100 text-red-700",
                feedbackGiven === "positive" && "opacity-30 cursor-not-allowed",
                isSendingFeedback && "opacity-50 cursor-wait"
              )}
              aria-label="Resposta não útil"
              title="Esta resposta não foi útil"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
            {feedbackGiven && (
              <span className="text-xs text-muted-foreground ml-1">
                Obrigada pelo feedback!
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
