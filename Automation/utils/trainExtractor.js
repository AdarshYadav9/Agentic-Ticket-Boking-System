import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { rankTopTrains, formatAvailabilitySummary, splitTrainTextIntoBlocks } from './Aiseatavailable.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Agentic/Automation/utils -> Agentic
const agenticRootDir = path.resolve(__dirname, '..', '..');

function getMaxRefreshPerTrain() {
  const n = Number.parseInt(process.env.IRCTC_MAX_REFRESH ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : 8;
}

export async function extractAndSaveTrainData(
  page,
  { outputFile = path.join(agenticRootDir, 'Webdata', 'extractedtraindata', 'train_data.txt') } = {}
) {
  await page.waitForSelector('.tbis-div', { timeout: 60000 });

  const skipRefresh =
    process.env.SKIP_TRAIN_REFRESH === '1' || process.env.SKIP_TRAIN_REFRESH === 'true';
  const maxRefresh = getMaxRefreshPerTrain();

  const trains = page.locator('.tbis-div');
  const count = await trains.count();

  console.log("🚆 Total trains:", count);

  const allText = [];

  for (let i = 0; i < count; i++) {
    // Re-resolve the row after each refresh — IRCTC re-renders the list and stale locators break.
    const trainRow = () => page.locator('.tbis-div').nth(i);

    if (!skipRefresh && maxRefresh > 0) {
      const row = trainRow();
      await row.scrollIntoViewIfNeeded().catch(() => {});

      const refreshBtns = row.getByText('Refresh', { exact: true });
      const refreshCount = Math.min(await refreshBtns.count(), maxRefresh);

      for (let j = 0; j < refreshCount; j++) {
        const btn = refreshBtns.nth(j);
        try {
          if (await btn.isVisible({ timeout: 1500 })) {
            await btn.scrollIntoViewIfNeeded();
            await btn.click({ timeout: 8000 });
            await page.waitForTimeout(700);
            await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
          }
        } catch {
          // ignore single refresh failures
        }
      }
    }

    const train = trainRow();
    await train.waitFor({ state: 'visible', timeout: 20000 });

    // Optional: wait for any availability text to appear in this train card
    await train
      .locator('text=/AVAILABLE|WL|RAC|REGRET/i')
      .first()
      .waitFor({ timeout: 8000 })
      .catch(() => {});

    const text = await train.innerText({ timeout: 20000 });
    console.log(`\n===== TRAIN ${i + 1} =====\n`);
    console.log(text);
    allText.push(text);
  }

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, allText.join('\n\n'), 'utf8');
  console.log(`✅ Data saved to ${outputFile}`);

  const rawText = allText.join('\n\n');
  const trainBlocks = splitTrainTextIntoBlocks(rawText);
  const topTrains = rankTopTrains(trainBlocks);
  const traintobook = topTrains[0];
  if (topTrains.length > 0) {
    console.log('\n📊 Top 3 trains by availability:');
    topTrains.forEach((item, index) => {
      console.log(`\n--- Rank ${index + 1} ---`);
      console.log(`Train: ${item.title}`);
      console.log(`Score: ${item.score}`);
      console.log(`Availability: ${formatAvailabilitySummary(item.entries)}`);
      console.log('---');
    });
  } else {
    console.log('No train availability blocks found to rank.');
  }

  return allText;
}
