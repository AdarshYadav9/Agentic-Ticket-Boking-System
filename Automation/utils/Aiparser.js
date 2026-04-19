import OpenAI from "openai";
import 'dotenv/config';

function localExtractTravelDetails(userInput) {
  const text = String(userInput ?? '').toLowerCase().trim();

  // Handles: "from delhi to mumbai on 25 july" and "from varanasi to lucknow Tilak on 29 july"
  // Key fixes:
  // - Source: one or more words (e.g., Delhi, New Delhi)
  // - Destination: only FIRST word after "to" (e.g., lucknow)
  // - Qualifiers/train names (like Tilak) are skipped via .*?
  const m = text.match(
    /\bfrom\s+([a-z]+(?:\s+[a-z]+)*)\s+to\s+([a-z]+)(?:.*?\s+on\s+(\d{1,2})(?:st|nd|rd|th)?\s*([a-z]+)?)?/i
  );

  const from = m?.[1]?.trim() ?? '';
  const to = m?.[2]?.trim() ?? '';
  const date = m?.[3]?.trim() ?? '';
  const month = m?.[4]?.trim() ?? '';

  return { from, to, date, month };
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function extractTravelDetails(userInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return localExtractTravelDetails(userInput);

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Extract travel details from user input.
from to date and month carefully.
Return ONLY valid JSON. No explanation.

Format:
{
  "from": "",
  "to": "",
  "date": "",
  "month": ""
}
          `
        },
        {
          role: "user",
          content: userInput
        }
      ],
      temperature: 0
    });

    let text = response.choices[0].message.content ?? '';

    // 🛡️ Clean AI response (important)
    text = text.replace(/```json|```/g, '').trim();

    return JSON.parse(text);
  } catch (err) {
    // If quota/rate limit/etc blocks the API, fall back to local parsing
    const status = err?.status ?? err?.code ?? '';
    const msg = err?.message ? String(err.message) : '';
    const details = err?.response?.data || err?.error || '';
    console.error(`[Aiparser] OpenAI failed:`, {
      status,
      message: msg,
      details,
      input: userInput
    });
    console.warn(`[Aiparser] Falling back to local parser.`);
    return localExtractTravelDetails(userInput);
  }
}