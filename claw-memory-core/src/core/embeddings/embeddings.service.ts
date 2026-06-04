import OpenAI from 'openai';

import { debugLog } from '../utils/file-utils.js';
import { getTimeoutConfig } from '../config/timeouts.js';
import type { TimeoutConfig } from '../config/timeouts.js';

/**
 * Custom error class for OpenAI configuration issues
 * Provides helpful guidance on how to resolve the issue
 */
export class OpenAIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAIConfigError';
  }
}

/**
 * Custom error class for OpenAI API issues (rate limits, quota, etc.)
 */
export class OpenAIAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'OpenAIAPIError';
  }
}

export const EMBEDDING_BATCH_CONFIG = {
  maxBatchSize: 100, // OpenAI supports up to 2048, but 100 is efficient
  delayBetweenBatchesMs: 500, // Rate limit protection (500ms = ~2 batches/sec)
} as const;

/**
 * iter9 Tier 9.0 M2 — Provider injection options.
 * All fields optional; default OpenAI implementation applies when absent.
 * - `embed`: inject any (text: string) => Promise<number[]> provider (tests, non-OpenAI providers)
 * - `timeoutConfig`: override getTimeoutConfig() for the lazy-init OpenAI client
 * The no-arg form `new EmbeddingsService()` remains valid (existing call sites unaffected).
 * When `embed` is absent, OpenAI client is initialized lazily at first embedText() call
 * (not at construction time), so module load no longer requires OPENAI_API_KEY.
 */
export interface EmbeddingsServiceOptions {
  embed?: (text: string) => Promise<number[]>;
  timeoutConfig?: TimeoutConfig;
}

export class EmbeddingsService {
  /**
   * FIND-11c-02: Default embedding model is `text-embedding-3-large`.
   * The field is intentionally private; behavioral verification is done via
   * asserted OpenAI request arguments in tests (structural call verification).
   */
  private readonly model: string;
  private readonly embedFn: (text: string) => Promise<number[]>;

  constructor({ embed, timeoutConfig }: EmbeddingsServiceOptions = {}, model: string = 'text-embedding-3-large') {
    this.model = model;
    if (embed) {
      // Injected provider — use directly (test mocks, non-OpenAI)
      this.embedFn = embed;
    } else {
      // Default: OpenAI-based provider. Client is lazily initialized at first call
      // so module load no longer requires OPENAI_API_KEY (iter9 Tier 9.0 M2 goal).
      let cachedOpenAI: OpenAI | null = null;
      const resolvedModel = model;
      const resolvedTimeoutConfig = timeoutConfig;
      this.embedFn = async (text: string): Promise<number[]> => {
        if (!cachedOpenAI) {
          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) {
            throw new OpenAIConfigError(
              'OPENAI_API_KEY environment variable is required.\n\n' +
                'To use semantic search features (search_codebase, natural_language_to_cypher), ' +
                'you need an OpenAI API key.\n\n' +
                'Set it in your environment:\n' +
                '  export OPENAI_API_KEY=sk-...\n\n' +
                'Or in .env file:\n' +
                '  OPENAI_API_KEY=sk-...\n\n' +
                'Alternative: Use impact_analysis or traverse_from_node which do not require OpenAI.',
            );
          }
          const tc = resolvedTimeoutConfig ?? getTimeoutConfig();
          cachedOpenAI = new OpenAI({
            apiKey,
            timeout: tc.openai.embeddingTimeoutMs,
            maxRetries: 2,
          });
        }
        const response = await cachedOpenAI.embeddings.create({
          model: resolvedModel,
          input: text,
        });
        return response.data[0].embedding;
      };
    }
  }

  /**
   * Embed a single text string
   */
  async embedText(text: string): Promise<number[]> {
    try {
      return await this.embedFn(text);
    } catch (error: any) {
      // Handle specific error types with helpful messages
      if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
        throw new OpenAIAPIError(
          'OpenAI embedding request timed out. Consider increasing OPENAI_EMBEDDING_TIMEOUT_MS.',
        );
      }

      if (error.status === 429) {
        throw new OpenAIAPIError(
          'OpenAI rate limit exceeded.\n\n' +
            'This usually means:\n' +
            '- You have hit your API rate limit\n' +
            '- You have exceeded your quota\n\n' +
            'Solutions:\n' +
            '- Wait a few minutes and try again\n' +
            '- Check your OpenAI usage at https://platform.openai.com/usage\n' +
            '- Use impact_analysis or traverse_from_node which do not require OpenAI',
          429,
        );
      }

      if (error.status === 401) {
        throw new OpenAIAPIError(
          'OpenAI API key is invalid or expired.\n\n' + 'Please check your OPENAI_API_KEY environment variable.',
          401,
        );
      }

      if (error.status === 402 || error.message?.includes('quota') || error.message?.includes('billing')) {
        throw new OpenAIAPIError(
          'OpenAI quota exceeded or billing issue.\n\n' +
            'Solutions:\n' +
            '- Check your OpenAI billing at https://platform.openai.com/settings/organization/billing\n' +
            '- Add credits to your account\n' +
            '- Use impact_analysis or traverse_from_node which do not require OpenAI',
          402,
        );
      }

      console.error('Error creating embedding:', error);
      throw error;
    }
  }

  /**
   * Embed multiple texts via concurrent embedFn calls.
   * iter9 Tier 9.0 M2 — native OpenAI batch path replaced by concurrent embedFn dispatch;
   * provider-injected implementations can batch internally if needed.
   * embedTextsInBatches() controls concurrency at a higher level.
   */
  async embedTexts(texts: string[]): Promise<(number[] | null)[]> {
    if (texts.length === 0) return [];

    return Promise.all(texts.map((text) => this.embedFn(text)));
  }

  /**
   * Embed texts in batches with rate limiting.
   * Returns array of embeddings in same order as input.
   * @param texts Array of texts to embed
   * @param batchSize Number of texts per API call (default: 100)
   */
  async embedTextsInBatches(
    texts: string[],
    batchSize: number = EMBEDDING_BATCH_CONFIG.maxBatchSize,
  ): Promise<(number[] | null)[]> {
    await debugLog('Batch embedding started', { textCount: texts.length });

    const results: (number[] | null)[] = [];
    const totalBatches = Math.ceil(texts.length / batchSize);

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize) + 1;

      await debugLog('Embedding batch progress', { batchIndex, totalBatches, batchSize: batch.length });

      const batchResults = await this.embedTexts(batch);
      results.push(...batchResults);

      // Rate limit protection between batches
      if (i + batchSize < texts.length) {
        await this.delay(EMBEDDING_BATCH_CONFIG.delayBetweenBatchesMs);
      }
    }

    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
