/**
 * Logger utility for Sofia Legal AI
 *
 * Provides environment-aware logging:
 * - Development: logs everything (debug + error)
 * - Production: only logs errors
 *
 * Usage:
 * ```ts
 * import { logger } from "@/lib/logger";
 *
 * logger.debug("User sent message", { length: 42 });
 * logger.error("Failed to send message", error);
 * ```
 */

const IS_DEV = import.meta.env.DEV;

/**
 * Logger com níveis de log baseados no ambiente.
 */
export const logger = {
  /**
   * Loga mensagens de debug/info.
   * Apenas em ambiente de desenvolvimento.
   *
   * @param message - Mensagem principal
   * @param data - Dados adicionais opcionais
   */
  debug: (message: string, data?: unknown): void => {
    if (IS_DEV) {
      if (data !== undefined) {
        console.log(`[Sofia] ${message}`, data);
      } else {
        console.log(`[Sofia] ${message}`);
      }
    }
  },

  /**
   * Loga erros.
   * Sempre ativo, tanto em desenvolvimento quanto em produção.
   *
   * @param message - Mensagem de erro
   * @param error - Objeto de erro ou dados adicionais
   */
  error: (message: string, error?: unknown): void => {
    if (error !== undefined) {
      console.error(`[Sofia] ERROR: ${message}`, error);
    } else {
      console.error(`[Sofia] ERROR: ${message}`);
    }
  },

  /**
   * Loga avisos.
   * Sempre ativo, tanto em desenvolvimento quanto em produção.
   *
   * @param message - Mensagem de aviso
   * @param data - Dados adicionais opcionais
   */
  warn: (message: string, data?: unknown): void => {
    if (data !== undefined) {
      console.warn(`[Sofia] WARN: ${message}`, data);
    } else {
      console.warn(`[Sofia] WARN: ${message}`);
    }
  },
};
