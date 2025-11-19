import { useState, FormEvent, KeyboardEvent } from "react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="sticky bottom-0 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 p-4"
      role="search"
      aria-label="Enviar mensagem para Sofia"
    >
      <div className="container max-w-4xl mx-auto">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Descreva sua dúvida sobre INSS ou regimes próprios..."
            className="min-h-[60px] max-h-[200px] resize-none"
            disabled={disabled}
            aria-label="Digite sua dúvida sobre previdência"
            aria-describedby="chat-disclaimer"
          />
          <Button
            type="submit"
            size="icon"
            className="h-[60px] w-[60px] flex-shrink-0"
            disabled={!input.trim() || disabled}
            aria-label="Enviar mensagem"
          >
            <Send className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Enviar</span>
          </Button>
        </div>
        <p id="chat-disclaimer" className="text-xs text-muted-foreground mt-2 text-center">
          Este atendimento virtual é informativo e não substitui consulta jurídica individual
          com advogado.
        </p>
      </div>
    </form>
  );
}
