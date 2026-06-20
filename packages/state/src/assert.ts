/** Asserts `value` is not null/undefined, narrowing it to `T`. Throws `message` if it is —
 *  use where a `!` would otherwise silently trust an invariant the type doesn't capture. */
export function assertDefined<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) { throw new Error(message); }
  return value;
}
