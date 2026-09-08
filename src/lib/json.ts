export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Round-trips a value through JSON so it is guaranteed serializable across the server boundary. */
export function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
}
