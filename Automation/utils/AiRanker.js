import OpenAI from 'openai';
import 'dotenv/config';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


function splitTrainBlocks(trainBlocks) {
  // If we already have multiple distinct blocks, return as-is
  if (trainBlocks.length > 1) return trainBlocks;

  // Single merged block — split on train header lines
  const raw = String(trainBlocks[0] ?? '');

  // Split at every line that looks like: "TRAIN NAME (12345)"
  // We split BEFORE each such line using a lookahead
  const parts = raw
    .split(/(?=\n[A-Z][A-Z0-9 \-/]+\(\d{4,6}\)\n)/g)
    .map(b => b.trim())
    .filter(b => /\(\d{4,6}\)/.test(b) && b.length > 30);

  if (parts.length > 1) {
    console.log(`[AiRanker] Auto-split ${raw.length} chars → ${parts.length} train blocks`);
    return parts;
  }

  // Still couldn't split — return original
  return trainBlocks;
}

// ─── Local Helpers ───────────────────────────────────────────────────────────

/**
 * Parse "TRAIN NAME (12345)" from the first matching line of a train block.
 */
function parseTrainHeader(text) {
  const lines = String(text).split('\n').map(l => l.trim()).filter(l => l.length > 0);
  for (const line of lines) {
    const m = line.match(/^(.+?)\s*\((\d{4,6})\)\s*$/);
    if (m) return { trainName: m[1].trim(), trainNumber: m[2].trim() };
  }
  return { trainName: lines[0] ?? 'Unknown Train', trainNumber: 'N/A' };
}

/**
 * Find ALL availability strings (AVAILABLE, WL, RAC, REGRET).
 */
function findAllAvailability(text) {
  const lines = String(text).split('\n').map(l => l.trim());
  let lastDate = 'N/A';
  const availabilities = [];

  for (const line of lines) {
    if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+\w+/.test(line)) {
      lastDate = line;
    }
    // Match ANY known IRCTC availability string format
    const m = line.match(/(AVAILABLE[-\s]?\d{1,4}|WL\s*\d{1,4}|RAC\s*\d{1,4}|REGRET)/i);
    if (m) {
      availabilities.push({
        statusText: m[1].toUpperCase(),
        date: lastDate
      });
    }
  }
  return availabilities;
}

/**
 * Detect primary class type from block text.
 */
function guessClass(text) {
  const classMap = [
    ['Sleeper (SL)', 'SL'],
    ['AC 3 Tier',    '3A'],
    ['AC 2 Tier',    '2A'],
    ['AC Chair car', 'CC'],
    ['Second Sitting','2S'],
    ['AC First Class','1A'],
    ['AC 3 Economy', '3E'],
  ];
  for (const [keyword, code] of classMap) {
    if (text.includes(keyword)) return code;
  }
  return 'N/A';
}

// ─── Local Fallback Ranker ───────────────────────────────────────────────────

function rankTopTrainsLocal(trainBlocks) {
  const scored = trainBlocks.map((block, idx) => {
    const { trainName, trainNumber } = parseTrainHeader(block);
    const availabilities = findAllAvailability(block);
    const classType = guessClass(block);
    
    // For Top 3 legacy ranking, find max seats if available
    let bestSeats = 0;
    let bestDate = 'N/A';
    for (const a of availabilities) {
      const match = a.statusText.match(/AVAILABLE[-\s]?(\d+)/i);
      if (match) {
        const s = Number(match[1]);
        if (s > bestSeats) {
          bestSeats = s;
          bestDate = a.date;
        }
      }
    }
    
    return { idx, trainName, trainNumber, seats: bestSeats, date: bestDate, classType };
  });

  // Sort by most available seats first
  scored.sort((a, b) => b.seats - a.seats);

  return scored.slice(0, 3).map((item, i) => ({
    rank: i + 1,
    trainName: item.trainName,
    trainNumber: item.trainNumber,
    date: item.date,
    availableSeats: item.seats,
    classType: item.classType,
    reason:
      item.seats > 0
        ? `Max AVAILABLE-${String(item.seats).padStart(4, '0')} found on ${item.date}`
        : 'No availability data (WL/REGRET only)',
    source: 'local',
  }));
}

// ─── List ALL Available Trains ───────────────────────────────────────────────

/**
 * Returns ALL train blocks and their exact ticket statuses (AVAILABLE, WL, RAC, REGRET),
 * preserving their original website sorting (by departure time).
 *
 * @param {string[]} trainBlocks - Array of innerText from each train card
 */
export function listAllAvailableTrains(trainBlocks) {
  const blocks = splitTrainBlocks(trainBlocks);

  return blocks
    .map(block => {
      const { trainName, trainNumber } = parseTrainHeader(block);
      const availabilities = findAllAvailability(block);
      const classType = guessClass(block);
      return { trainName, trainNumber, availabilities, classType };
    })
    .filter(t => t.availabilities.length > 0);
}


// ─── ChatGPT Ranker ──────────────────────────────────────────────────────────

/**
 * Main export. Sends train blocks to ChatGPT → ranks TOP 3 by max tickets.
 * Auto-splits merged single-block input. Falls back to local if API fails.
 *
 * @param {string[]} trainBlocks - Array of innerText() from .tbis-div cards
 * @returns {Promise<Array<{rank, trainName, trainNumber, date, availableSeats, classType, reason, source}>>}
 */
export async function rankTopTrains(trainBlocks) {
  // ✅ Auto-fix: split if Playwright returned the whole page as one block
  const blocks = splitTrainBlocks(trainBlocks);

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[AiRanker] No OPENAI_API_KEY — using local ranker.');
    return rankTopTrainsLocal(blocks);
  }

  // Trim each block to 600 chars to stay within token budget
  const payload = blocks.map((text, i) => ({
    index: i,
    text: String(text).slice(0, 600),
  }));

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: [
            'You are an IRCTC train ticket analyst.',
            '',
            'Each item in the user JSON has { index, text } where text is a train card scraped from irctc.co.in.',
            'Seat availability patterns:',
            '  AVAILABLE-0046  → 46 seats free',
            '  WL11            → waiting list position 11',
            '  RAC5            → reservation against cancellation',
            '  REGRET          → fully booked',
            '',
            'Task: Find the TOP 3 trains with the HIGHEST AVAILABLE-XXXX seat count (any date).',
            'Extract: train name, train number (in parentheses), date with max seats, seat count, class type.',
            '',
            'Return ONLY valid JSON array — no markdown, no explanation:',
            '[',
            '  { "rank": 1, "trainName": "...", "trainNumber": "12345", "date": "Wed, 25 Mar", "availableSeats": 68, "classType": "SL", "reason": "..." },',
            '  ...',
            ']',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify(payload, null, 2),
        },
      ],
    });

    const raw = (response.choices?.[0]?.message?.content ?? '')
      .replace(/```json|```/g, '')
      .trim();

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('AI returned empty or invalid array');
    }

    return parsed.map(item => ({ ...item, source: 'openai' }));
  } catch (err) {
    const status = err?.status ?? err?.code ?? '';
    const msg = err?.message ? String(err.message) : '';
    console.warn(
      `[AiRanker] OpenAI failed${status ? ` (${status})` : ''} — using local ranker. ${msg}`
    );
    return rankTopTrainsLocal(blocks);
  }
}
