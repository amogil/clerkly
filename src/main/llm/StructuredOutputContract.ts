// Requirements: llm-integration.11, llm-integration.12
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Canonical structured output contract (Pydantic-style).
 * Single source of truth for:
 * - runtime validation/parsing,
 * - JSON schema generation for providers,
 * - semantic prompt instructions.
 */
export const LLMStructuredOutputSchema = z
  .object({
    action: z
      .object({
        type: z
          .literal('text')
          .describe(
            'Action discriminator. Must be "text". User-visible response text is stored in action.content.'
          ),
        content: z.string().describe('User-visible assistant response text.'),
      })
      .strict()
      .describe('Primary assistant action payload shown to the user.'),
  })
  .strict()
  .describe('Structured response payload returned by the assistant.');

export type StructuredOutput = z.infer<typeof LLMStructuredOutputSchema>;

/**
 * Returns a cloned JSON schema object to prevent accidental mutation by callers.
 */
export function getStructuredOutputJsonSchema(): Record<string, unknown> {
  const contractSchema: unknown = LLMStructuredOutputSchema;
  const toJsonSchema = zodToJsonSchema as unknown as (
    schema: unknown,
    options: { $refStrategy: 'none'; target: 'jsonSchema7' }
  ) => Record<string, unknown>;
  const raw = toJsonSchema(contractSchema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  });
  const cloned = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  // OpenAI accepts plain schema object; keep payload minimal.
  delete cloned['$schema'];
  return cloned;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function transformOpenAISchema(value: unknown, path: string[] = []): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => transformOpenAISchema(item, [...path, String(index)]));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  const transformed: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (key === 'format' && typeof entry === 'string') {
      if (entry === 'uri') {
        // OpenAI strict schema rejects "uri" format.
        continue;
      }
      throw new Error(
        `Unsupported JSON Schema format for OpenAI strict adapter at ${[...path, key].join('.')}: ${entry}`
      );
    }
    transformed[key] = transformOpenAISchema(entry, [...path, key]);
  }

  // OpenAI strict requires required[] to include every key from properties.
  if (transformed['type'] === 'object') {
    const properties = asObject(transformed['properties']);
    if (properties) {
      transformed['required'] = Object.keys(properties);
    }
  }

  return transformed;
}

/**
 * OpenAI-compatible schema variant.
 * Keeps canonical contract semantics while removing unsupported JSON Schema formats.
 */
export function getOpenAIStructuredOutputJsonSchema(): Record<string, unknown> {
  return transformOpenAISchema(getStructuredOutputJsonSchema()) as Record<string, unknown>;
}

/**
 * Build shared model instruction with schema + semantic descriptions.
 * Requirements: llm-integration.11.1, llm-integration.11.2, llm-integration.11.3
 */
export function buildStructuredOutputInstruction(): string {
  const schema = JSON.stringify(getStructuredOutputJsonSchema());
  return [
    'Respond ONLY with valid JSON structured output.',
    `Schema: ${schema}.`,
    'Field semantics and formats:',
    '- action.type: always "text"; defines the action kind.',
    '- action.content: user-visible assistant text. Do not include images in the response.',
  ].join(' ');
}

/**
 * Parse and validate structured output payload with the canonical schema.
 * Requirements: llm-integration.12.1
 */
export function safeParseStructuredOutput(value: unknown) {
  return LLMStructuredOutputSchema.safeParse(value);
}
