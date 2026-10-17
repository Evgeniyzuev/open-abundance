// Pure check shared by the "wish steps" challenge and the "Wish found its path" artifact (no imports).

/** True when a wish description holds at least three clear steps: three lines, or numbered steps 1-3. */
export function hasThreeSteps(value: string | null | undefined): boolean {
  const text = (value ?? "").trim();
  if (!text) return false;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3);

  if (lines.length >= 3) return true;

  const numbered = text.match(/(?:^|\s)(?:[1-3][.)]|шаг\s*[1-3]|step\s*[1-3])/gi) ?? [];
  return new Set(numbered.map((item) => item.replace(/\s+/g, "").toLowerCase())).size >= 3;
}
