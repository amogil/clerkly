// Requirements: settings.3, llm-integration.3.1

import type { LLMProvider } from '../../types';
import type { ChatOptions } from './ILLMProvider';

// ─── Provider connection config ───────────────────────────────────────────────

/**
 * Per-provider settings for testConnection() and API routing.
 * Requirements: settings.2.5, settings.2.6
 */
export interface LLMProviderConfig {
  id: LLMProvider;
  name: string;
  /** Base API endpoint URL (overridable via env) */
  apiUrl: string;
  /** Cheap/fast model used only for testConnection() */
  testModel: string;
  /** Max tokens for testConnection() request */
  testMaxTokens: number;
  /** Timeout for testConnection() in ms */
  testTimeoutMs: number;
}

export const LLM_PROVIDERS: Record<LLMProvider, LLMProviderConfig> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    apiUrl: process.env.CLERKLY_OPENAI_API_URL || 'https://api.openai.com/v1/responses',
    testModel: 'gpt-5-nano',
    testMaxTokens: 16,
    testTimeoutMs: 10_000,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    apiUrl: process.env.CLERKLY_ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages',
    testModel: 'claude-haiku-4-6',
    testMaxTokens: 5,
    testTimeoutMs: 10_000,
  },
  google: {
    id: 'google',
    name: 'Google',
    apiUrl:
      process.env.CLERKLY_GOOGLE_LLM_API_URL ||
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
    testModel: 'gemini-3-flash-preview',
    testMaxTokens: 5,
    testTimeoutMs: 10_000,
  },
};

export const PROVIDER_TYPES: LLMProvider[] = Object.keys(LLM_PROVIDERS) as LLMProvider[];

// ─── Chat model config ────────────────────────────────────────────────────────

/**
 * Chat options per environment for a single provider.
 * Requirements: llm-integration.3.1, llm-integration.5.8
 */
export interface LLMChatEnvConfig {
  /** Used in production */
  prod: ChatOptions;
  /** Used in functional tests (cheaper/faster) */
  test: ChatOptions;
}

/**
 * Per-provider, per-environment chat model configuration.
 *
 * Usage:
 *   LLM_CHAT_MODELS[provider].prod  — production
 *   LLM_CHAT_MODELS[provider].test  — functional tests
 *
 * Requirements: llm-integration.3.1, llm-integration.5.8
 */
export const LLM_CHAT_MODELS: Record<LLMProvider, LLMChatEnvConfig> = {
  openai: {
    prod: { model: 'gpt-5.2', reasoningEffort: 'medium' },
    test: { model: 'gpt-5-nano', reasoningEffort: 'low' },
  },
  anthropic: {
    prod: { model: 'claude-opus-4-6', reasoningEffort: 'medium' },
    test: { model: 'claude-opus-4-6', reasoningEffort: 'low' },
  },
  google: {
    prod: { model: 'gemini-3.1-pro-preview', reasoningEffort: 'medium' },
    test: { model: 'gemini-3-flash-preview', reasoningEffort: 'low' },
  },
};

// ─── Chat timeout ─────────────────────────────────────────────────────────────

/** Timeout per individual LLM API request (from send to full response), in ms. Requirements: llm-integration.3.6 */
export const CHAT_TIMEOUT_MS = 60_000;

// ─── Error messages ───────────────────────────────────────────────────────────

/**
 * User-facing error messages by HTTP status code.
 * Requirements: settings.2.8
 */
export const ERROR_MESSAGES = {
  401: 'Invalid API key. Please check your key and try again.',
  403: 'Access forbidden. Please check your API key permissions.',
  429: 'Rate limit exceeded. Please try again later.',
  500: 'Provider service unavailable. Please try again later.',
  502: 'Provider service unavailable. Please try again later.',
  503: 'Provider service unavailable. Please try again later.',
  timeout: 'Model response timeout. The provider took too long to respond. Please try again later.',
  network: 'Network error. Please check your internet connection.',
  unknown: 'Unknown error',
} as const;
