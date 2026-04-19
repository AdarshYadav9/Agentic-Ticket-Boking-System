export function parseInput(text) {
  const lower = text.toLowerCase();

  const fromMatch = lower.match(/from\s+([a-z\s]+)/);
  const toMatch = lower.match(/to\s+([a-z\s]+)/);
  const dateMatch = lower.match(/(\d{1,2})/);

  return {
    from: fromMatch ? capitalize(fromMatch[1].trim()) : null,
    to: toMatch ? capitalize(toMatch[1].trim()) : null,
    date: dateMatch ? dateMatch[1] : null
  };
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}