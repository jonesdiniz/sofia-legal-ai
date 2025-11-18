import { ChatHeader } from "@/components/ChatHeader";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { MessageSquare, Scale, FileText, Users } from "lucide-react";

export default function Sobre() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <ChatHeader />

      <main className="flex-1">
        <div className="container max-w-4xl mx-auto px-4 py-12">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Sobre a Sofia</h1>
            <p className="text-xl text-muted-foreground">
              Assistente previdenciária com IA especializada em INSS e regimes próprios
            </p>
          </div>

          <div className="prose prose-invert max-w-none mb-12">
            <p className="text-lg leading-relaxed text-muted-foreground mb-8">
              A Sofia é uma plataforma SaaS desenvolvida para escritórios de advocacia
              que atuam na área previdenciária. Com inteligência artificial avançada,
              a Sofia auxilia no atendimento inicial de clientes, fornecendo informações
              precisas sobre direitos previdenciários.
            </p>

            <div className="grid md:grid-cols-2 gap-6 mb-12">
              <div className="bg-card border border-border rounded-lg p-6">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Scale className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">RGPS (INSS)</h3>
                <p className="text-sm text-muted-foreground">
                  Aposentadorias, pensões, auxílios, revisões e planejamento
                  previdenciário do Regime Geral de Previdência Social.
                </p>
              </div>

              <div className="bg-card border border-border rounded-lg p-6">
                <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-secondary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">RPPS (Servidores)</h3>
                <p className="text-sm text-muted-foreground">
                  Regimes próprios de previdência de servidores públicos federais,
                  estaduais e municipais.
                </p>
              </div>

              <div className="bg-card border border-border rounded-lg p-6">
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                  <MessageSquare className="h-6 w-6 text-accent" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Triagem Inteligente</h3>
                <p className="text-sm text-muted-foreground">
                  Atendimento inicial automatizado para entender a situação do
                  cliente e direcionar para o melhor caminho.
                </p>
              </div>

              <div className="bg-card border border-border rounded-lg p-6">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Base de Conhecimento</h3>
                <p className="text-sm text-muted-foreground">
                  Respostas baseadas em legislação atualizada, jurisprudência
                  e documentos técnicos do escritório.
                </p>
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-4">Como funciona?</h2>
            <ol className="space-y-4 mb-8">
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                  1
                </span>
                <div>
                  <strong className="block mb-1">Cliente inicia o atendimento</strong>
                  <p className="text-muted-foreground">
                    O cliente descreve sua dúvida ou situação previdenciária através
                    do chat com a Sofia.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                  2
                </span>
                <div>
                  <strong className="block mb-1">Sofia analisa e responde</strong>
                  <p className="text-muted-foreground">
                    A IA busca na base de conhecimento do escritório e fornece
                    orientações iniciais personalizadas.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                  3
                </span>
                <div>
                  <strong className="block mb-1">Encaminhamento qualificado</strong>
                  <p className="text-muted-foreground">
                    Com informações organizadas, o caso é direcionado aos advogados
                    do escritório para atendimento especializado.
                  </p>
                </div>
              </li>
            </ol>
          </div>

          <div className="text-center">
            <Button asChild size="lg" className="gap-2">
              <Link to="/chat">
                <MessageSquare className="h-5 w-5" />
                Iniciar atendimento com a Sofia
              </Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-6 mt-12">
        <div className="container max-w-4xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>
            © 2025 Sofia - Assistente Previdenciária. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
