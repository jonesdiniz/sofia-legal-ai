import { ChatHeader } from "@/components/ChatHeader";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Politica() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <ChatHeader />

      <main className="flex-1">
        <div className="container max-w-4xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold mb-4">
            Política de Privacidade e Termos de Uso
          </h1>
          <p className="text-muted-foreground mb-8">
            Última atualização: Janeiro de 2025
          </p>

          <Alert className="mb-8">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Aviso Importante</AlertTitle>
            <AlertDescription>
              Este atendimento virtual é de caráter informativo e educacional.
              As informações fornecidas pela Sofia não constituem consultoria
              jurídica individual e não substituem o atendimento personalizado
              com um advogado especializado em direito previdenciário.
            </AlertDescription>
          </Alert>

          <div className="prose prose-invert max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Sobre o Serviço</h2>
              <p className="text-muted-foreground leading-relaxed">
                A Sofia é uma assistente virtual com inteligência artificial
                desenvolvida para auxiliar no esclarecimento inicial de dúvidas
                sobre direito previdenciário, incluindo benefícios do INSS (RGPS)
                e regimes próprios de previdência de servidores públicos (RPPS).
              </p>
              <p className="text-muted-foreground leading-relaxed">
                O serviço é oferecido por escritórios de advocacia parceiros e
                destina-se exclusivamente a fins informativos e educacionais.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. Limitações do Serviço</h2>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>
                  As respostas fornecidas são baseadas em informações gerais e
                  podem não se aplicar integralmente ao seu caso específico.
                </li>
                <li>
                  A Sofia não realiza análise jurídica detalhada, cálculos
                  previdenciários complexos ou estratégias processuais.
                </li>
                <li>
                  Para uma avaliação completa do seu caso, é imprescindível
                  consultar um advogado especializado.
                </li>
                <li>
                  A Sofia não armazena documentos pessoais nem realiza protocolo
                  de processos administrativos ou judiciais.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">
                3. Coleta e Uso de Informações
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Durante o atendimento, podemos coletar:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Informações fornecidas voluntariamente durante as conversas;</li>
                <li>Dados técnicos de navegação e uso da plataforma;</li>
                <li>Histórico de conversas para melhoria contínua do serviço.</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                Estas informações são utilizadas exclusivamente para:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Fornecer respostas mais precisas e contextualizadas;</li>
                <li>Melhorar a qualidade do atendimento;</li>
                <li>
                  Possibilitar o encaminhamento qualificado para atendimento
                  jurídico especializado.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">
                4. Proteção de Dados Pessoais
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Respeitamos sua privacidade e estamos comprometidos com a
                proteção dos seus dados pessoais, em conformidade com a Lei
                Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-4">
                <li>Seus dados não serão compartilhados com terceiros sem sua autorização;</li>
                <li>Implementamos medidas de segurança técnicas e administrativas;</li>
                <li>Você pode solicitar a exclusão dos seus dados a qualquer momento;</li>
                <li>O acesso aos dados é restrito aos profissionais autorizados do escritório.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Responsabilidades</h2>
              <p className="text-muted-foreground leading-relaxed">
                <strong>Do escritório:</strong> Fornecer informações precisas,
                atualizadas e de qualidade através da Sofia, mantendo a
                confidencialidade das conversas.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-4">
                <strong>Do usuário:</strong> Utilizar o serviço de forma ética,
                fornecendo informações verdadeiras e compreendendo as limitações
                do atendimento automatizado.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. Propriedade Intelectual</h2>
              <p className="text-muted-foreground leading-relaxed">
                Todo o conteúdo disponibilizado pela Sofia, incluindo textos,
                imagens, logotipos e tecnologia, é protegido por direitos autorais
                e propriedade intelectual. É vedada a reprodução, distribuição ou
                uso comercial sem autorização prévia.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">
                7. Alterações nesta Política
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Reservamo-nos o direito de atualizar esta política periodicamente.
                As alterações serão publicadas nesta página com a data de
                atualização correspondente. Recomendamos a leitura periódica
                deste documento.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">8. Contato</h2>
              <p className="text-muted-foreground leading-relaxed">
                Para dúvidas sobre esta política, questões sobre privacidade ou
                solicitações relacionadas aos seus dados pessoais, entre em
                contato com o escritório de advocacia responsável pelo seu
                atendimento.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">9. Consentimento</h2>
              <p className="text-muted-foreground leading-relaxed">
                Ao utilizar os serviços da Sofia, você declara ter lido,
                compreendido e concordado com os termos desta Política de
                Privacidade e Termos de Uso.
              </p>
            </section>
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
