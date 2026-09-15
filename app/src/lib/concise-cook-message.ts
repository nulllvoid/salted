// Older dispatches include full recipes. Keep their meal summary and household
// note when previewing, copying, or opening a manually sent message.
export function conciseCookMessage(payload: string): string {
  if (!payload.includes('\nIngredients:') || !payload.includes('\nMethod:'))
    return payload;
  const noteIndex = payload.lastIndexOf('\nNote:');
  const note = noteIndex >= 0 ? payload.slice(noteIndex + 6).trim() : '';
  let heading = payload.split('\n')[0];
  // Legacy translated payloads placed per-dish servings in Ingredients.
  if (!heading.includes('(for ')) {
    const servings = [...payload.matchAll(/(?:Ingredients: |\. )([^\n]+? \(for \d+\)):/g)]
      .map((match) => match[1]);
    if (servings.length) heading = `${heading.split('):')[0]}): ${servings.join(', ')}`;
  }
  return [heading, ...(note && note !== '—' ? [`Note: ${note}`] : [])].join('\n\n');
}
