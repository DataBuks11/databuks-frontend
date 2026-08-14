export function idempotencyKey(
  scope: string,
  ...parts: (string | number | undefined | null)[]
): string {
  const normalized = parts
    .filter((part) => part !== undefined && part !== null && String(part).trim() !== "")
    .map((part) => String(part));
  return [scope, ...normalized].join(":");
}
