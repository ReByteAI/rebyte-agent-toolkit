import type OpenAI from 'openai';

/** Request controls forwarded to the official client's transport. */
export type RequestOptions = Omit<OpenAI.RequestOptions, 'headers'> & {
  headers?: Headers | Record<string, string | null | undefined>;
};

/** Merge extension headers while preserving explicit header removal. */
export function buildHeaders(parts: Array<RequestOptions['headers']>): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const part of parts) {
    if (part === undefined) continue;
    const entries = part instanceof Headers ? part.entries() : Object.entries(part);
    for (const [name, value] of entries) {
      if (value !== undefined) result[name.toLowerCase()] = value;
    }
  }
  return result;
}

/** Encode one resource ID per interpolation; reject URL dot-segment normalization. */
export function path(strings: TemplateStringsArray, ...values: Array<string | number>): string {
  return strings.reduce((result, literal, index) => {
    if (index === values.length) return result + literal;
    const value = values[index];
    if (value === undefined || value === '' || value === '.' || value === '..') throw new Error('Invalid resource path parameter');
    return result + literal + encodeURIComponent(String(value));
  }, '');
}
