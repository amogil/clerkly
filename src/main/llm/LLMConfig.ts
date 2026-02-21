// Requirements: settings.3

import type { LLMProvider } from '../../types';

/**
 * Configuration for a single LLM provider
 */
export interface LLMProviderConfig {
  /**
   * Provider identifier
   */
  id: LLMProvider;

  /**
   * Human-readable provider name
   */
  name: string;

  /**
   * API endpoint URL
   */
  apiUrl: string;

  /**
   * Model identifier to use for testing
   */
  testModel: string;

  /**
   * Maximum tokens for test request
   */
  maxTokens: number;

  /**
   * Timeout in milliseconds
   */
  timeout: number;
}

/**
 * Configuration for all LLM providers
 *
 * Requirements: settings.3.5 - Model identifiers and API endpoints
 * Requirements: settings.3.6 - Timeout configuration
 */
export const LLM_PROVIDERS: Record<LLMProvider, LLMProviderConfig> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    apiUrl: process.env.CLERKLY_OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',
    testModel: 'gpt-4o-mini',
    maxTokens: 5,
    timeout: 10000, // 10 seconds
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    apiUrl: process.env.CLERKLY_ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages',
    testModel: 'claude-haiku-4-5',
    maxTokens: 5,
    timeout: 10000, // 10 seconds
  },
  google: {
    id: 'google',
    name: 'Google',
    apiUrl:
      process.env.CLERKLY_GOOGLE_LLM_API_URL ||
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent',
    testModel: 'gemini-3-flash',
    maxTokens: 5,
    timeout: 10000, // 10 seconds
  },
};

/**
 * Get list of all provider types
 */
export const PROVIDER_TYPES: LLMProvider[] = Object.keys(LLM_PROVIDERS) as LLMProvider[];

/**
 * OpenAI chat models
 * Requirements: llm-integration.3.1
 */
export const OPENAI_CHAT_MODELS = {
  /** Fast model for functional tests */
  TEST: 'gpt-4o-mini',
  /** Production model */
  PROD: 'gpt-4o',
} as const;

/**
 * Chat request timeout in milliseconds
 * Requirements: llm-integration.3.1
 */
export const CHAT_TIMEOUT_MS = 60_000;

/**
 * Error messages for different HTTP status codes
 *
 * Requirements: settings.3.8 - User-friendly error messages
 */
export const ERROR_MESSAGES = {
  401: 'Invalid API key. Please check your key and try again.',
  403: 'Access forbidden. Please check your API key permissions.',
  429: 'Rate limit exceeded. Please try again later.',
  500: 'Provider service unavailable. Please try again later.',
  502: 'Provider service unavailable. Please try again later.',
  503: 'Provider service unavailable. Please try again later.',
  timeout: 'Connection timeout. Please check your internet connection.',
  network: 'Network error. Please check your internet connection.',
  unknown: 'Unknown error',
} as const;
