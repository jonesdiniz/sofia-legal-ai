import { Message } from "@/hooks/useSofiaChat";
import { User, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: Message;
}

/**
 * Componente de mensagem do chat.
 * Renderiza mensagens do usuário e da Sofia com estilos e alinhamento apropriados.
 */
export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.actor === "user";

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
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-3 shadow-sm",
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
    </div>
  );
}
