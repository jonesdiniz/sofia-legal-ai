import { describe, it, expect } from "vitest";
import {
  splitIntoChunks,
  calculateFirstMessageDelay,
  calculateSubsequentMessageDelay,
} from "./chatUtils";

describe("splitIntoChunks", () => {
  it("deve dividir texto com múltiplos parágrafos", () => {
    const text = `Primeiro parágrafo com algumas frases. Aqui está outra frase.

Segundo parágrafo também tem frases. E mais uma aqui.

Terceiro parágrafo curto.`;

    const chunks = splitIntoChunks(text, 200);

    // Deve ter pelo menos 1 chunk
    expect(chunks.length).toBeGreaterThan(0);

    // Todos os chunks devem ter conteúdo
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeGreaterThan(0);
    });

    // Nenhum chunk deve exceder o limite (exceto se uma frase sozinha for maior)
    const oversizedChunks = chunks.filter((chunk) => chunk.length > 200);
    // Se houver chunks grandes, eles devem ser frases únicas que não podem ser divididas
    oversizedChunks.forEach((chunk) => {
      expect(chunk.includes(". ")).toBe(false); // Não deve ter múltiplas frases
    });
  });

  it("deve retornar texto original se não conseguir dividir", () => {
    const text = "Texto curto sem pontos";

    const chunks = splitIntoChunks(text, 200);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("deve lidar com texto longo sem pontos", () => {
    const longText = "a".repeat(300);

    const chunks = splitIntoChunks(longText, 200);

    // Deve retornar o texto como está (não pode dividir sem pontos)
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(longText);
  });

  it("deve dividir corretamente texto com parágrafos e frases", () => {
    const text = "Frase curta aqui. Outra frase curta aqui também. E mais uma frase bem longa para garantir que ultrapasse o limite.";

    const chunks = splitIntoChunks(text, 50);

    // Deve dividir em múltiplos chunks
    expect(chunks.length).toBeGreaterThan(1);

    // Todos os chunks devem estar dentro do limite (ou ser frases únicas grandes)
    chunks.forEach((chunk) => {
      if (chunk.length > 50) {
        // Se for maior que o limite, deve ser uma frase única
        expect(chunk.includes(". ")).toBe(false);
      }
    });
  });

  it("deve manter frases inteiras quando possível", () => {
    const text = "Primeira frase. Segunda frase. Terceira frase.";

    const chunks = splitIntoChunks(text, 100);

    // Cada chunk deve terminar com ponto (exceto se for o último e não terminar com ponto)
    chunks.forEach((chunk, index) => {
      if (index < chunks.length - 1 || text.endsWith(".")) {
        expect(chunk.trim().endsWith(".")).toBe(true);
      }
    });
  });
});

describe("calculateFirstMessageDelay", () => {
  const config = {
    minTotalDelay: 900,
    maxTotalDelay: 4500,
    msPerChar: 18,
    jitterRange: 200,
  };

  it("deve respeitar delay mínimo total", () => {
    const chunkText = "a"; // 1 caractere = 18ms base
    const networkElapsedMs = 5000; // Muito tempo de rede

    const delay = calculateFirstMessageDelay(chunkText, networkElapsedMs, config);

    // Mesmo com muito tempo de rede, deve garantir pelo menos 100ms
    expect(delay).toBeGreaterThanOrEqual(100);
  });

  it("deve respeitar delay máximo total", () => {
    const chunkText = "a".repeat(1000); // 1000 caracteres = 18000ms base
    const networkElapsedMs = 0; // Sem tempo de rede

    const delay = calculateFirstMessageDelay(chunkText, networkElapsedMs, config);

    // Não deve exceder o máximo (considerando jitter)
    expect(delay).toBeLessThanOrEqual(config.maxTotalDelay + config.jitterRange);
  });

  it("deve considerar tempo de rede", () => {
    const chunkText = "a".repeat(100); // 100 caracteres = 1800ms base
    const networkElapsedMs = 1000;

    const delay = calculateFirstMessageDelay(chunkText, networkElapsedMs, config);

    // Deve subtrair o tempo de rede do delay total
    expect(delay).toBeLessThan(1800 + config.jitterRange);
  });

  it("deve estar dentro dos limites configurados", () => {
    const chunkText = "Texto de tamanho médio com algumas palavras.";
    const networkElapsedMs = 500;

    const delay = calculateFirstMessageDelay(chunkText, networkElapsedMs, config);

    // Deve estar entre o mínimo absoluto (100ms) e máximo configurado
    expect(delay).toBeGreaterThanOrEqual(100);
    expect(delay).toBeLessThanOrEqual(config.maxTotalDelay);
  });
});

describe("calculateSubsequentMessageDelay", () => {
  const config = {
    baseDelay: 300,
    minDelay: 500,
    maxDelay: 3000,
    msPerChar: 12,
    jitterRange: 150,
  };

  it("deve respeitar delay mínimo", () => {
    const chunkText = "a"; // 1 caractere

    const delay = calculateSubsequentMessageDelay(chunkText, config);

    expect(delay).toBeGreaterThanOrEqual(config.minDelay);
  });

  it("deve respeitar delay máximo", () => {
    const chunkText = "a".repeat(500); // Muitos caracteres

    const delay = calculateSubsequentMessageDelay(chunkText, config);

    expect(delay).toBeLessThanOrEqual(config.maxDelay);
  });

  it("deve ser proporcional ao tamanho do texto", () => {
    const shortText = "abc"; // 3 caracteres
    const longText = "a".repeat(100); // 100 caracteres

    const shortDelay = calculateSubsequentMessageDelay(shortText, config);
    const longDelay = calculateSubsequentMessageDelay(longText, config);

    // Texto mais longo deve ter delay maior (considerando limites)
    if (longDelay < config.maxDelay) {
      expect(longDelay).toBeGreaterThan(shortDelay);
    }
  });

  it("deve incluir delay base", () => {
    const chunkText = ""; // Texto vazio

    const delay = calculateSubsequentMessageDelay(chunkText, config);

    // Mesmo com texto vazio, deve ter pelo menos o mínimo configurado
    expect(delay).toBeGreaterThanOrEqual(config.minDelay);
  });

  it("deve ter alguma variação (jitter)", () => {
    const chunkText = "Texto de teste";

    // Executa múltiplas vezes para verificar variação
    const delays = Array.from({ length: 10 }, () =>
      calculateSubsequentMessageDelay(chunkText, config)
    );

    // Deve haver pelo menos 2 valores diferentes (devido ao jitter aleatório)
    const uniqueDelays = new Set(delays);
    expect(uniqueDelays.size).toBeGreaterThan(1);
  });
});
