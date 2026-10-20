/**
 * Mock AI Provider Adapter
 * Returns deterministic fixture responses for unit/integration testing
 * and local offline development when real provider credentials are absent.
 * Supports configurable latency and synthetic error simulation.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AICapability,
  AIHealthCheckResult,
  AIProvider,
  AIProviderAdapter,
  AIRequest,
  AIResponse,
  AIRole,
} from './types.js';
import { AIProviderError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type SimulatedErrorType =
  | 'timeout'
  | 'rate_limit'
  | 'auth_failure'
  | 'network_error'
  | null;

export interface MockAdapterOptions {
  fixturesDir?: string;
  defaultLatencyMs?: number;
  simulatedError?: SimulatedErrorType;
  errorOccurrences?: number; // How many calls to fail before clearing
}

export class MockAIAdapter implements AIProviderAdapter {
  readonly name: AIProvider = AIProvider.MOCK;
  private readonly fixturesDir: string;
  private latencyMs: number;
  private simulatedError: SimulatedErrorType = null;
  private errorOccurrences = 0;
  private customFixtures: Map<AIRole, string> = new Map();

  constructor(options: MockAdapterOptions = {}) {
    this.fixturesDir =
      options.fixturesDir || path.resolve(__dirname, './fixtures');
    this.latencyMs = options.defaultLatencyMs ?? 10;
    this.simulatedError = options.simulatedError ?? null;
    this.errorOccurrences = options.errorOccurrences ?? 0;
  }

  getCapabilities(): AICapability[] {
    return [
      AICapability.IMAGE_INPUT,
      AICapability.JSON_OUTPUT,
      AICapability.TEXT_GENERATION,
    ];
  }

  validateModel(modelId: string): boolean {
    return Boolean(modelId && typeof modelId === 'string' && modelId.trim().length > 0);
  }

  /**
   * Set or update simulated latency in milliseconds
   */
  setLatency(ms: number): void {
    this.latencyMs = Math.max(0, ms);
  }

  /**
   * Configure simulated failure for testing resilience and circuit breaker
   */
  setSimulateError(errorType: SimulatedErrorType, occurrences = 1): void {
    this.simulatedError = errorType;
    this.errorOccurrences = errorType ? occurrences : 0;
  }

  /**
   * Override fixture response for a specific role
   */
  setCustomFixture(role: AIRole, response: string | Record<string, unknown>): void {
    const serialized =
      typeof response === 'string' ? response : JSON.stringify(response, null, 2);
    this.customFixtures.set(role, serialized);
  }

  /**
   * Clear all fixture overrides
   */
  clearCustomFixtures(): void {
    this.customFixtures.clear();
  }

  /**
   * Health check implementation
   */
  async checkHealth(): Promise<AIHealthCheckResult> {
    if (this.simulatedError === 'auth_failure') {
      return {
        ok: false,
        message: 'Mock health check failed: simulated authentication error',
        latencyMs: this.latencyMs,
      };
    }

    if (this.simulatedError === 'network_error') {
      return {
        ok: false,
        message: 'Mock health check failed: simulated connection failure',
        latencyMs: this.latencyMs,
      };
    }

    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    return {
      ok: true,
      message: 'Mock AI provider is healthy and ready for testing',
      latencyMs: this.latencyMs,
    };
  }

  /**
   * Loads fixture JSON content based on the request role
   */
  private loadFixtureForRole(role: AIRole): string {
    if (this.customFixtures.has(role)) {
      return this.customFixtures.get(role)!;
    }

    let fixtureFileName: string;
    switch (role) {
      case AIRole.VISION:
        fixtureFileName = 'vision.json';
        break;
      case AIRole.STRUCTURE:
        fixtureFileName = 'dir.json';
        break;
      case AIRole.REVIEW:
        fixtureFileName = 'review.json';
        break;
      default:
        fixtureFileName = 'vision.json';
    }

    const fixturePath = path.join(this.fixturesDir, fixtureFileName);

    try {
      if (fs.existsSync(fixturePath)) {
        return fs.readFileSync(fixturePath, 'utf-8');
      }
    } catch (err) {
      logger.warn(
        { err, fixturePath },
        'Failed to read mock fixture from filesystem; using inline fallback'
      );
    }

    // Fallback inline responses if disk read fails
    if (role === AIRole.STRUCTURE) {
      return JSON.stringify({
        version: '1.0.0',
        meta: {
          sourceImageHash: 'mock-hash',
          sourceWidth: 1440,
          sourceHeight: 900,
          analysisProvider: 'mock',
          analysisModel: 'mock-model',
          analysisTimestamp: new Date().toISOString(),
          confidenceScore: 0.95,
          schemaVersion: '1.0.0',
          promptVersion: '1.0.0',
        },
        breakpoints: { desktop: { min: 1024 } },
        globals: {
          colors: { background: '#ffffff', text: '#000000' },
          typography: { fontFamilies: ['Inter'] },
        },
        assets: [],
        pages: [
          {
            id: 'page_1',
            name: 'Home',
            sections: [
              {
                id: 'sec_1',
                role: 'hero',
                confidence: 0.95,
                styles: {},
                children: [
                  {
                    id: 'node_1',
                    kind: 'heading',
                    confidence: 0.95,
                    text: 'Mock Heading',
                    level: 1,
                    styles: {},
                  },
                ],
              },
            ],
          },
        ],
      });
    }

    if (role === AIRole.REVIEW) {
      return JSON.stringify({
        review: {
          score: 0.95,
          qualityGrade: 'A',
          passedValidation: true,
          structuralIntegrity: { hierarchyValid: true, nestedContainersValid: true },
          visualFidelity: { colorAlignmentScore: 0.95 },
          issues: [],
          recommendations: [],
        },
      });
    }

    return JSON.stringify({
      status: 'success',
      mock: true,
      role,
      message: 'Default mock response',
    });
  }

  /**
   * Main request handler
   */
  async sendRequest(req: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    // Check for simulated errors
    if (this.simulatedError) {
      const currentError = this.simulatedError;
      if (this.errorOccurrences > 0) {
        this.errorOccurrences -= 1;
        if (this.errorOccurrences === 0) {
          this.simulatedError = null;
        }
      }

      switch (currentError) {
        case 'timeout':
          throw new AIProviderError(
            `Mock request simulated timeout after ${req.timeout || this.latencyMs}ms`,
            this.name,
            true,
            { simulated: true, isTimeout: true }
          );

        case 'rate_limit':
          throw new AIProviderError(
            'Mock request simulated rate limit (429 Too Many Requests)',
            this.name,
            true,
            { simulated: true, statusCode: 429, retryAfter: 2 }
          );

        case 'auth_failure':
          throw new AIProviderError(
            'Mock request simulated authentication error (401 Unauthorized)',
            this.name,
            false,
            { simulated: true, statusCode: 401 }
          );

        case 'network_error':
          throw new AIProviderError(
            'Mock request simulated network connection failure',
            this.name,
            true,
            { simulated: true, networkError: true }
          );
      }
    }

    // Simulate latency
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    const content = this.loadFixtureForRole(req.role);
    const latencyMs = Date.now() - startTime;
    const model = req.modelId || 'mock-model-v1';

    // Approximate token counts
    const inputChars = req.messages.reduce(
      (acc, m) =>
        acc + (typeof m.content === 'string' ? m.content.length : 100),
      0
    );
    const inputTokens = Math.max(1, Math.round(inputChars / 4));
    const outputTokens = Math.max(1, Math.round(content.length / 4));

    return {
      content,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      model,
      provider: this.name,
      requestId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      latencyMs,
      cached: false,
      finishReason: 'stop',
      raw: { mock: true },
    };
  }
}
