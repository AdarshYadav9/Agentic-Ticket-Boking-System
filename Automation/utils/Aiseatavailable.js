import fs from 'fs';
import OpenAI from 'openai';
import 'dotenv/config';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function normalizeClassLabel(label) {
  return String(label ?? '').trim().toUpperCase();
}

/**
 * Extracts availability tokens from a blob of IRCTC results text.
 * Returns entries like: { status: 'AVAILABLE'|'WL'|'RAC'|'REGRET', count?: number }
 */
export function parseAvailability(text) {
  const t = String(text ?? '');
  const results = [];

  // AVAILABLE-0035
  for (const m of t.matchAll(/\bAVAILABLE[-\s]?(\d{1,4})\b/gi)) {
    results.push({ status: 'AVAILABLE', count: Number(m[1]) });
  }

  // WL11 / WL 11
  for (const m of t.matchAll(/\bWL\s*[-:]?\s*(\d{1,4})\b/gi)) {
    results.push({ status: 'WL', count: Number(m[1]) });
  }

  // RAC12 / RAC 12
  for (const m of t.matchAll(/\bRAC\s*[-:]?\s*(\d{1,4})\b/gi)) {
    results.push({ status: 'RAC', count: Number(m[1]) });
  }

  // REGRET
  if (/\bREGRET\b/i.test(t)) results.push({ status: 'REGRET' });

  return results;
}

/**
 * Extract availability for a specific date from train block
 * Date format: "29 Apr" or "29 April" or "Wed, 29 Apr"
 * Returns: { status, count } for that date or null if not found
 */
export function getAvailabilityForDate(trainBlock, dateStr) {
  const block = String(trainBlock ?? '');
  const date = String(dateStr ?? '').trim();
  
  if (!date) return null;

  const dayAndDate = `(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\\s+${date.replace(/\s+/g, '\\s+')}`;
 const dateRegex = new RegExp(dayAndDate, 'gi');
  let matches = [];
  let match;
  while ((match = dateRegex.exec(block)) !== null) {
    matches.push(match.index);
  }
  
  if (matches.length === 0) return null;

  const lastMatchIdx = matches[matches.length - 1];
  const afterDate = block.substring(lastMatchIdx);
  
  const nextDateMatch = afterDate.match(/\n(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+\d{1,2}\s+[A-Za-z]+/i);
  const textUntilNextDate = nextDateMatch ? afterDate.substring(0, nextDateMatch.index) : afterDate.substring(0, 500);

  const entries = parseAvailability(textUntilNextDate);
  if (entries.length === 0) return null;

  return entries[0];
}

function scoreAvailability(entries) {
  let bestAvailable = -Infinity;
  let bestRac = Infinity;
  let bestWl = Infinity;
  let hasRegret = false;

  for (const e of entries) {
    if (e.status === 'AVAILABLE') {
      bestAvailable = Math.max(bestAvailable, e.count ?? 0);
    } else if (e.status === 'RAC') {
      bestRac = Math.min(bestRac, e.count ?? 9999);
    } else if (e.status === 'WL') {
      bestWl = Math.min(bestWl, e.count ?? 9999);
    } else if (e.status === 'REGRET') {
      hasRegret = true;
    }
  }

  if (bestAvailable >= 0) return 100000 + bestAvailable;
  if (bestRac < Infinity) return 1000 - bestRac;
  if (bestWl < Infinity) return 500 - bestWl;
  if (hasRegret) return -10000;
  return -Infinity;
}

function getTrainTitle(block) {
  return String(block ?? '').split(/\r?\n/)[0].trim();
}

export function splitTrainTextIntoBlocks(rawText) {
  const text = String(rawText ?? '').replace(/\r/g, '');
  const blocks = text
    .split(/\n(?=[A-Z][A-Z0-9 &'\-\.\/]+\(\d{5}\)\nRuns On:)/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => /\(\d{5}\)/.test(block.split(/\r?\n/)[0]));
  return blocks;
}

/**
 * Local (non-AI) chooser: picks the train block with best availability score.
 * @param {string[]} trainBlocks - array of innerText() for each `.tbis-div` train card
 * @param {{ preferredClass?: string }} opts
 */
export function chooseBestTrainLocal(trainBlocks, opts = {}) {
  const preferredClass = normalizeClassLabel(opts.preferredClass);

  let bestIdx = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < trainBlocks.length; i++) {
    const block = String(trainBlocks[i] ?? '');

    // If preferred class is specified, only score lines after that class label appears.
    const scopedText =
      preferredClass && block.toUpperCase().includes(preferredClass)
        ? block
        : block;

    const entries = parseAvailability(scopedText);
    const s = scoreAvailability(entries);

    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }

  return {
    bestIndex: bestIdx,
    bestText: bestIdx >= 0 ? trainBlocks[bestIdx] : '',
    score: bestScore,
  };
}

export function rankTopTrains(trainBlocks, opts = {}) {
  const preferredClass = normalizeClassLabel(opts.preferredClass);
  const targetDate = opts.targetDate ? String(opts.targetDate).toLowerCase().trim() : '';

  const ranked = trainBlocks
    .map((block, index) => {
      let entries = [];
      let score = -Infinity;

      if (targetDate) {
        const dateEntry = getAvailabilityForDate(block, targetDate);
        entries = dateEntry ? [dateEntry] : [];
        score = scoreAvailability(entries);
      } else {
        entries = parseAvailability(String(block ?? ''));
        score = scoreAvailability(entries);
      }

      return {
        index,
        title: getTrainTitle(block),
        block: String(block ?? ''),
        entries,
        score,
        dateAvailability: targetDate ? getAvailabilityForDate(block, targetDate) : null,
      };
    })
    .filter((item) => item.block.trim().length > 0)
    .map((item) => {
      if (!preferredClass || item.block.toUpperCase().includes(preferredClass)) return item;
      return { ...item, score: item.score - 10000 };
    })
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, 3);
}

export function formatAvailabilitySummary(entries) {
  if (!entries || entries.length === 0) return 'No availability data';
  return entries
    .map((entry) => {
      if (entry.status === 'REGRET') return 'REGRET';
      return `${entry.status}${entry.count !== undefined ? String(entry.count).padStart(2, '0') : ''}`;
    })
    .join(', ');
}

/**
 * AI-assisted chooser. Falls back to local if OpenAI fails (quota/rate limit/etc).
 * @param {string[]} trainBlocks
 * @param {{ preferredClass?: string }} opts
 */
export async function chooseBestTrainAI(trainBlocks, opts = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return chooseBestTrainLocal(trainBlocks, opts);

  const preferredClass = normalizeClassLabel(opts.preferredClass);

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: [
            'You are selecting the best IRCTC train to book based on seat availability.',
            'Prefer highest AVAILABLE-xxxx.',
            'If no AVAILABLE, prefer lowest RACxx, then lowest WLxx.',
            'Avoid REGRET.',
            preferredClass ? `Prefer class: ${preferredClass}` : 'No class preference.',
            'Return ONLY valid JSON with this schema:',
            '{ "bestIndex": number, "reason": string }',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify(
            trainBlocks.map((t, i) => ({ index: i, text: t })),
            null,
            2
          ),
        },
      ],
    });

    const raw = (response.choices?.[0]?.message?.content ?? '').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);

    if (typeof parsed?.bestIndex !== 'number') throw new Error('AI response missing bestIndex');

    return {
      bestIndex: parsed.bestIndex,
      bestText: trainBlocks[parsed.bestIndex] ?? '',
      reason: String(parsed.reason ?? ''),
      source: 'openai',
    };
  } catch (err) {
    const status = err?.status ?? err?.code ?? '';
    const msg = err?.message ? String(err.message) : '';
    console.warn(`[Aiseatavailable] OpenAI failed${status ? ` (${status})` : ''}, using local chooser. ${msg}`);
    const local = chooseBestTrainLocal(trainBlocks, opts);
    return { ...local, source: 'local' };
  }
}

async function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data.trim()));
  });
}

async function runCli() {
  const args = process.argv.slice(2);
  let rawText = '';
  let preferredClass;
  let filePath;
  let jsonString;

  for (const arg of args) {
    if (arg.startsWith('--preferredClass=')) {
      preferredClass = arg.split('=')[1];
    } else if (arg.startsWith('--file=')) {
      filePath = arg.split('=')[1];
    } else if (arg.startsWith('--json=')) {
      jsonString = arg.slice('--json='.length);
    } else if (arg.startsWith('--text=')) {
      rawText = arg.slice('--text='.length);
    }
  }

  if (filePath) {
    rawText = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : rawText;
  }

  if (!rawText && jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed)) {
        const top = rankTopTrains(parsed, { preferredClass });
        top.forEach((item, rank) => {
          console.log(`\nTop ${rank + 1}: train index ${item.index}`);
          console.log(`Score: ${item.score}`);
          console.log(`Availability: ${formatAvailabilitySummary(item.entries)}`);
          console.log(`Block:\n${item.block}`);
        });
        process.exit(0);
      }
    } catch {
      // fallback to text parsing
    }
  }

  if (!rawText && !process.stdin.isTTY) {
    rawText = await readStdin();
  }

  if (!rawText) {
    console.error('Usage: node Aiseatavailable.js --text="TRAIN BLOCKS"');
    console.error('       node Aiseatavailable.js --file=blocks.txt');
    console.error('       node Aiseatavailable.js --json="[\"block1\",\"block2\"]"');
    process.exit(1);
  }

  const blocks = splitTrainTextIntoBlocks(rawText);
  if (blocks.length === 0) {
    console.error('No train blocks found in input. Please separate blocks with one or more blank lines or a standard IRCTC train header pattern.');
    process.exit(1);
  }

  const topTrains = rankTopTrains(blocks, { preferredClass });

  console.log(`Found ${blocks.length} blocks. Top ${topTrains.length} trains:`);
  topTrains.forEach((item, rank) => {
    console.log(`\n=== Top ${rank + 1} ===`);
    console.log(`Index: ${item.index}`);
    console.log(`Score: ${item.score}`);
    console.log(`Availability: ${formatAvailabilitySummary(item.entries)}`);
    console.log('Block:\n' + item.block);
  });
}

if (process.argv[1]?.endsWith('Aiseatavailable.js') || process.argv[1]?.endsWith('Aiseatavailable.mjs')) {
  runCli().catch((err) => {
    console.error('CLI failed:', err);
    process.exit(1);
  });
}

