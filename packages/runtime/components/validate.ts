import type { z } from 'zod'

/**
 * The list-shaped components are authored as markdown children; the
 * remark-plan-blocks plugin parses those children into a JSON string passed on
 * the component's data prop. Decode it back into the array the zod schema
 * expects. A value passed directly (e.g. in tests) is returned unchanged.
 */
export function decodeJson(raw: unknown): unknown {
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

/**
 * Parse component props against a zod schema, throwing a readable,
 * component-named error when they are invalid. The error surfaces in the
 * rendered page (and during `check`) so the author can self-correct.
 */
export function validateProps<T extends z.ZodType>(
  component: string,
  schema: T,
  props: unknown,
): z.infer<T> {
  const result = schema.safeParse(props)
  if (!result.success) {
    const detail = result.error.issues
      .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new Error(`<${component}> received invalid props — ${detail}`)
  }
  return result.data
}
