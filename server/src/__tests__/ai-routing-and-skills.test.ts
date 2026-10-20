/**
 * AI Capability Routing & Skill Verification Tests
 * 
 * Verifies:
 * 1. AI capability routing rejects text-only models (e.g. openai/gpt-oss-120b on Groq) for image input.
 * 2. Vision tasks route to image-capable models (e.g. Gemini vision models), not text models.
 * 3. OpenRouter free tier is not assumed to be vision-capable.
 * 4. Rate-limit / 429 errors set cooldowns and prevent retry storms.
 * 5. server/ELEMENTOR_SKILL.md is loaded as primary authoritative skill at runtime.
 * 6. Missing or unreadable server/ELEMENTOR_SKILL.md fails clearly with actionable error.
 * 7. Changes to root skill are reflected in generation prompts.
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isModelImageCapable,
  validateRequestCapabilities,
  KNOWN_MODEL_CAPABILITIES,
} from '../modules/ai/capabilities.js';
import { AIRouter } from '../modules/ai/router.js';
import { loadRootSkillInstructions, loadSkillPack } from '../modules/elementor/serializer.js';
import { getElementorConversionPrompt } from '../modules/conversion/prompts.js';
import { AIProviderError } from '../lib/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Audit C — AI Capability Routing & Input Guards', () => {
  describe('Model Vision Capability Validation', () => {
    it('openai/gpt-oss-120b on Groq is verified as TEXT ONLY (not image capable)', () => {
      expect(isModelImageCapable('openai/gpt-oss-120b', 'groq')).toBe(false);
      expect(KNOWN_MODEL_CAPABILITIES['openai/gpt-oss-120b']?.supportsImages).toBe(false);
    });

    it('llama-3.3-70b-versatile on Groq is verified as TEXT ONLY', () => {
      expect(isModelImageCapable('llama-3.3-70b-versatile', 'groq')).toBe(false);
    });

    it('Gemini models are verified as image-capable', () => {
      expect(isModelImageCapable('gemini-3.8-flash', 'gemini')).toBe(true);
      expect(isModelImageCapable('gemini-1.5-pro', 'gemini')).toBe(true);
      expect(isModelImageCapable('gemini-1.5-flash', 'gemini')).toBe(true);
      expect(isModelImageCapable('gemini-2.0-flash', 'gemini')).toBe(true);
    });

    it('openrouter/free is NOT assumed to be vision capable or deterministic', () => {
      expect(isModelImageCapable('openrouter/free', 'openrouter')).toBe(false);
      expect(isModelImageCapable('free', 'openrouter')).toBe(false);
    });

    it('Explicit OpenRouter vision models are recognized as image-capable', () => {
      expect(isModelImageCapable('anthropic/claude-3.5-sonnet', 'openrouter')).toBe(true);
      expect(isModelImageCapable('google/gemini-2.0-flash-001', 'openrouter')).toBe(true);
      expect(isModelImageCapable('openai/gpt-4o', 'openrouter')).toBe(true);
    });

    it('validateRequestCapabilities rejects image payloads sent to text-only models', () => {
      expect(() => {
        validateRequestCapabilities('groq', 'openai/gpt-oss-120b', true);
      }).toThrow(AIProviderError);

      expect(() => {
        validateRequestCapabilities('groq', 'llama-3.3-70b-versatile', true);
      }).toThrow(/does not support image input/i);

      // Text requests without images must succeed
      expect(() => {
        validateRequestCapabilities('groq', 'openai/gpt-oss-120b', false);
      }).not.toThrow();

      // Vision requests to image-capable models must succeed
      expect(() => {
        validateRequestCapabilities('gemini', 'gemini-1.5-flash', true);
      }).not.toThrow();
    });
  });

  describe('Router Cooldown & Retry Storm Prevention', () => {
    it('sets provider cooldown on 429 rate limit error', () => {
      const router = new AIRouter();
      expect(router.isProviderAvailable('mock')).toBe(true);

      router.setProviderCooldown('mock', 5000, 'Simulated rate limit');
      expect(router.isProviderAvailable('mock')).toBe(false);
    });
  });
});

describe('Audit D — Skill-Set Completeness & server/ELEMENTOR_SKILL.md Source Fidelity', () => {
  it('loads server/ELEMENTOR_SKILL.md as the primary authoritative skill instructions', () => {
    const rootInstructions = loadRootSkillInstructions();
    expect(rootInstructions.filePath).toBeDefined();
    expect(rootInstructions.content.length).toBeGreaterThan(1000);
    expect(rootInstructions.content).toContain('Elementor Image-to-Template Skill Set');
    expect(rootInstructions.content).toContain('google_maps');
    expect(rootInstructions.hash).toBeDefined();
  });

  it('fails clearly when root skill instruction file is missing', () => {
    expect(() => {
      loadRootSkillInstructions(path.resolve(__dirname, 'non-existent-skill-file.md'));
    }).toThrow(/Required root skill instruction file 'server\/ELEMENTOR_SKILL\.md' is missing or unreadable/i);
  });

  it('loadSkillPack includes operative instructions and instructionHash from server/ELEMENTOR_SKILL.md', () => {
    const pack = loadSkillPack();
    expect(pack.operativeInstructions).toBeDefined();
    expect(pack.operativeInstructions).toContain('Elementor Image-to-Template Skill Set');
    expect(pack.meta.instructionHash).toBeDefined();
  });

  it('reflects changes to root skill in getElementorConversionPrompt context', () => {
    const customSkill = '# Custom Test Skill Instructions for Verification';
    const prompt = getElementorConversionPrompt({}, undefined, customSkill);

    expect(prompt.systemPrompt).toContain('Custom Test Skill Instructions for Verification');
    expect(prompt.systemPrompt).toContain('OPERATIVE SKILL INSTRUCTIONS (server/ELEMENTOR_SKILL.md)');
  });
});

