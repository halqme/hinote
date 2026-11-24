// Narrowing for values from outside the type system: JSON, dynamic imports,
// thrown errors, and the options a deck passes in.
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
