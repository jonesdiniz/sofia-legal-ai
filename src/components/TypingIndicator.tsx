import { Bot } from "lucide-react";

/**
 * Indicador de digitação da Sofia.
 * Mostra uma animação de "digitando" enquanto a Sofia está processando a resposta.
 * Só deve ser exibido quando isTyping === true.
 */
export function TypingIndicator() {
  return (
    <div className="flex gap-3 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Avatar da Sofia */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sofia-bubble flex items-center justify-center">
        <Bot className="h-5 w-5 text-primary" />
      </div>

      {/* Balão com indicador de digitação */}
      <div className="bg-sofia-bubble text-sofia-bubble-foreground rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">Sofia está digitando</span>

          {/* Bolinhas animadas */}
          <div className="flex gap-1 ml-2">
            <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
          </div>
        </div>
      </div>
    </div>
  );
}
