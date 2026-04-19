export async function humanDelay(min = 500, max = 1500) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise((r) => setTimeout(r, delay));
}