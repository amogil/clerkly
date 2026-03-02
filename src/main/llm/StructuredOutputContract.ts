// Requirements: llm-integration.11, llm-integration.12
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('http://') || value.startsWith('https://'), {
    message: 'URL must use http or https protocol',
  })
  .describe('Direct HTTP/HTTPS URL to download image content.');

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
        content: z
          .string()
          .describe('User-visible response text. Can include image placeholders like [[image:1]].'),
      })
      .strict()
      .describe('Primary assistant action payload shown to the user.'),
    images: z
      .array(
        z
          .object({
            id: z
              .number()
              .int()
              .positive()
              .describe(
                'Natural number image identifier that must match placeholder id in action.content.'
              ),
            url: HttpUrlSchema,
            alt: z
              .string()
              .optional()
              .describe('Optional human-readable alternative text for accessibility.'),
            link: HttpUrlSchema.optional().describe(
              'Optional clickable target URL associated with the rendered image in chat.'
            ),
          })
          .strict()
      )
      .optional()
      .describe(
        'Optional image descriptors referenced by placeholders in action.content. Descriptors without placeholders may still be returned for background download.'
      ),
  })
  .strict()
  .describe('Structured response payload returned by the assistant.');

export type StructuredOutput = z.infer<typeof LLMStructuredOutputSchema>;

const IMAGE_PLACEHOLDER_RULES =
  'When you include images, DO NOT use Markdown image syntax. Instead, insert placeholders in the text: [[image:<id>]], [[image:<id>|link:<url>]], [[image:<id>|size:<width>x<height>]], or [[image:<id>|link:<url>|size:<width>x<height>]]. Provide image descriptors in "images". Supported image formats: png, jpeg, webp, gif, svg. Image id must be a natural number (1, 2, 3...).';

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
    '- action.content: user-visible assistant text; may include image placeholders.',
    '- images: optional list of image descriptors tied to placeholders in action.content.',
    '- images[].id: natural number identifier matching placeholder id.',
    '- images[].url: image URL for download/rendering.',
    '- images[].alt: optional accessibility text for rendered image.',
    '- images[].link: optional clickable URL opened when image is clicked.',
    IMAGE_PLACEHOLDER_RULES,
  ].join(' ');
}

/**
 * Parse and validate structured output payload with the canonical schema.
 * Requirements: llm-integration.12.1
 */
export function safeParseStructuredOutput(value: unknown) {
  return LLMStructuredOutputSchema.safeParse(value);
}
