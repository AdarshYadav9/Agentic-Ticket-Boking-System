export function parseAvailability(text) {
  const t = String(text ?? '');
  const results = [];

  for (const m of t.matchAll(/\bAVAILABLE[-\s]?(\d{1,4})\b/gi)) {
    results.push({ status: 'AVAILABLE', count: Number(m[1]) });
  }

  for (const m of t.matchAll(/\bWL\s*[-:]?\s*(\d{1,4})\b/gi)) {
    results.push({ status: 'WL', count: Number(m[1]) });
  }

  for (const m of t.matchAll(/\bRAC\s*[-:]?\s*(\d{1,4})\b/gi)) {
    results.push({ status: 'RAC', count: Number(m[1]) });
  }

  if (/\bREGRET\b/i.test(t)) {
    results.push({ status: 'REGRET' });
  }

  return results;
}

// ✅ RULE: only AVAILABLE >= 15
function scoreAvailability(entries) {
  let best = -Infinity;

  for (const e of entries) {
    if (e.status === 'AVAILABLE') {
      const seats = e.count ?? 0;

      if (seats >= 15) {
        best = Math.max(best, 100000 + seats);
      } else {
        best = Math.max(best, -50000);
      }
    } else if (e.status === 'RAC') {
      best = Math.max(best, 50000 - (e.count ?? 9999));
    } else if (e.status === 'WL') {
      best = Math.max(best, 10000 - (e.count ?? 9999));
    } else if (e.status === 'REGRET') {
      best = Math.max(best, -100000);
    }
  }

  return best;
}

export function chooseBestTrain(trainBlocks) {
  let bestIndex = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < trainBlocks.length; i++) {
    const entries = parseAvailability(trainBlocks[i]);
    const score = scoreAvailability(entries);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return {
    bestIndex,
    bestText: trainBlocks[bestIndex] || '',
    score: bestScore,
  };
} 

