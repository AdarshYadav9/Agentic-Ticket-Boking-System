import { test } from '@playwright/test';
import { extractAndSaveTrainData } from '../utils/trainExtractor.js';

const runExtract = process.env.RUN_EXTRACT === '1' || process.env.RUN_EXTRACT === 'true';

const t = runExtract ? test : test.skip;

t('Extract train data after refresh (fixed)', async ({ page }) => {

  await page.goto('https://www.irctc.co.in/nget/train-search');

  // 🔴 Do manual search
  // await await humanDelay();

  await extractAndSaveTrainData(page, { outputFile: 'train_data.txt' });
});