import { useEffect, useRef } from "react";
import { ChatHeader } from "@/components/ChatHeader";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { TypingIndicator } from "@/components/TypingIndicator";
import { useSofiaChat } from "@/hooks/useSofiaChat";
import { Bot } from "lucide-react";

export default function Chat() {
  const { messages, conversationId, loading, isTyping, sendMessage } = useSofiaChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Scroll para o final sempre que mensagens mudarem
  useEffect(() => {
    // Usa requestAnimationFrame para garantir que o DOM foi atualizado
    requestAnimationFrame(() => {
      scrollToBottom();
    });
  }, [messages, isTyping]);

  return (
    <div className="flex flex-col h-screen bg-background">
      <ChatHeader />

      <main className="flex-1 overflow-y-auto" role="main" aria-label="Conversa com Sofia">
        <div
          className="container max-w-4xl mx-auto px-4 py-8"
          role="log"
          aria-live="polite"
          aria-atomic="false"
          aria-relevant="additions"
        >
          {messages.length === 0 && !isTyping && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6" aria-hidden="true">
                <Bot className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold mb-3">
                Olá, eu sou a Sofia!
              </h2>
              <p className="text-muted-foreground max-w-md mb-8">
                Me conte sua dúvida sobre INSS (RGPS) ou regime próprio de previdência (RPPS).
                Estou aqui para te ajudar a entender seus direitos previdenciários.
              </p>
              <div className="grid gap-3 w-full max-w-md" role="group" aria-label="Sugestões de perguntas">
                <button
                  onClick={() => sendMessage("Quais os tipos de aposentadoria do INSS?")}
                  className="text-left p-4 rounded-lg bg-card hover:bg-card/80 border border-border transition-colors focus:ring-2 focus:ring-primary focus:outline-none"
                  disabled={loading}
                  aria-label="Perguntar: Quais os tipos de aposentadoria do INSS?"
                >
                  <p className="text-sm font-medium">Tipos de aposentadoria</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Quais os tipos de aposentadoria do INSS?
                  </p>
                </button>
                <button
                  onClick={() => sendMessage("Como funciona a revisão de benefício?")}
                  className="text-left p-4 rounded-lg bg-card hover:bg-card/80 border border-border transition-colors focus:ring-2 focus:ring-primary focus:outline-none"
                  disabled={loading}
                  aria-label="Perguntar: Como funciona a revisão de benefício?"
                >
                  <p className="text-sm font-medium">Revisão de benefício</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Como funciona a revisão de benefício?
                  </p>
                </button>
                <button
                  onClick={() => sendMessage("Tenho tempo de contribuição como servidor público e no INSS, como calcular?")}
                  className="text-left p-4 rounded-lg bg-card hover:bg-card/80 border border-border transition-colors focus:ring-2 focus:ring-primary focus:outline-none"
                  disabled={loading}
                  aria-label="Perguntar: Como unificar tempo de servidor público e INSS?"
                >
                  <p className="text-sm font-medium">RPPS e RGPS</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Como unificar tempo de servidor e INSS?
                  </p>
                </button>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} conversationId={conversationId || undefined} />
          ))}

          {isTyping && <TypingIndicator />}

          <div ref={messagesEndRef} aria-hidden="true" />
        </div>
      </main>

      <ChatInput onSend={sendMessage} disabled={loading} />
    </div>
  );
}
