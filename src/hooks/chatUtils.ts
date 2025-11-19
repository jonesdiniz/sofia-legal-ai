/**
 * Utilit Utilit em chunks menores para simular múltiplas mensagens curtas,
 * como um atendente humano faria.
 *
 * Estratégia:
 * 1. Divide por parágrafos (quebras duplas \n\n)
 * 2. Dentro de cada parágrafo, divide por frases (pontos finais)
 * 3. Agrupa frases em chunks de até maxChunkSize caracteres
 * 4. Se não conseguir dividir bem, retorna o texto original
 *
 * @param text - Texto a ser dividido
 * @param maxChunkSize - Tamanho máximo de cada chunk (padrão: 200)
 * @returns Array de chunks de texto
 */
export function splitIntoChunks(text: string, maxChunkSize: number = 200): string[] {
  const chunks: string[] = [];

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
 *
 * Simula tempo de "pensamento + digitação" de um atendente humano.
 *
 * @param chunkText - Texto do chunk
 * @param networkElapsedMs - Tempo já gasto na chamada de rede (ms)
 * @param config - Configurações de delay
 * @returns Delay em milissegundos
 */
export function calculateFirstMessageDelay(
  chunkText: string,
  networkElapsedMs: number,
  config: {
    minTotalDelay: number;
    maxTotalDelay: number;
    msPerChar: number;
    jitterRange: number;
  }
): number {
  const { minTotalDelay, maxTotalDelay, msPerChar, jitterRange } = config;

  // Calcula delay base proporcional ao tamanho do texto
  const baseTypingTime = chunkText.length * msPerChar;

  // Adiciona variação aleatória (jitter) para simular variação humana
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;

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
 *
 * Simula o tempo entre mensagens curtas em sequência.
 *
 * @param chunkText - Texto do chunk
 * @param config - Configurações de delay
 * @returns Delay em milissegundos
 */
export function calculateSubsequentMessageDelay(
  chunkText: string,
  config: {
    baseDelay: number;
    minDelay: number;
    maxDelay: number;
    msPerChar: number;
    jitterRange: number;
  }
): number {
  const { baseDelay, minDelay, maxDelay, msPerChar, jitterRange } = config;

  // Calcula delay proporcional ao tamanho
  const sizeBasedDelay = chunkText.length * msPerChar;

  // Adiciona variação aleatória para naturalidade
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;

  // Combina delay base + proporcional + jitter
  const totalDelay = baseDelay + sizeBasedDelay + jitter;

  // Garante que esteja dentro dos limites
  return Math.max(minDelay, Math.min(maxDelay, totalDelay));
}
