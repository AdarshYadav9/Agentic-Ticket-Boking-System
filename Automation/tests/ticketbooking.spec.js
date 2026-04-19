import 'dotenv/config';
import { test } from '@playwright/test';
import { humanDelay } from '../pages/pause.js';
import { LoginPage } from '../pages/loginpage.js';
import { extractTravelDetails } from '../utils/Aiparser.js';
import { extractAndSaveTrainData } from '../utils/trainExtractor.js';
import { rankTopTrains, splitTrainTextIntoBlocks } from '../utils/Aiseatavailable.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("AI IRCTC Ticket Booking", async ({ page }) => {
  // IRCTC search + per-class refresh can exceed Playwright's default 30s timeout.
  test.setTimeout(180_000);

  // traintobook====
  // 👉 Get user input (Playwright workers don't reliably receive custom CLI args)
  const argvInput =
    process.argv.find((a) => a.startsWith('--input='))?.slice('--input='.length) ??
    process.argv.slice(2).join(' ');
  const inputText = (process.env.INPUT_TEXT ?? argvInput ?? '').trim();

  if (!inputText) {
    throw new Error(`
❌ No input provided!

👉 Recommended:
INPUT_TEXT="from delhi to mumbai on 25 july" npx playwright test tests/ticketbooking.spec.js

👉 Or add this to your .env (Agentic/Automation/.env):
INPUT_TEXT=from delhi to mumbai on 25 july

👉 Alternative (may not work in all setups):
npx playwright test tests/ticketbooking.spec.js -- --input="from delhi to mumbai on 25 july"
`);
  }

  console.log("🧠 User Input:", inputText);

  // 👉 AI extraction
  const userData = await extractTravelDetails(inputText);

  console.log("✅ AI Extracted:", userData);

  // 👉 Validation
  if (!userData.from || !userData.to || !userData.date) {
    throw new Error("❌ AI could not extract required fields");
  }

  const login = new LoginPage(page);

  await login.openWebsite();

  await login.searchTrain(
    userData.from,
    userData.to,
    userData.date,
    userData.month
  );

  // Saves to Agentic/Webdata/extractedtraindata/train_data.txt by default
  const allTrainText = await extractAndSaveTrainData(page);

  // 👉 Get top 3 trains
  const rawText = allTrainText.join('\n\n');
  const trainBlocks = splitTrainTextIntoBlocks(rawText);
  
  // Format date for lookup (e.g., "29 Apr")
  const targetDate = userData.date && userData.month 
    ? `${userData.date} ${userData.month.substring(0, 3)}`
    : `${userData.date}`;
  
  console.log(`📅 Searching for availability on: ${targetDate}`);
  
  const topTrains = rankTopTrains(trainBlocks, { targetDate });

  if (topTrains.length === 0) {
    throw new Error('❌ No trains found in extraction');
  }

  const topTrain = topTrains[0];
  const topTrainTitle = topTrain.title;
  const dateAvailability = topTrain.dateAvailability;

  console.log(`\n🚀 Top Train: ${topTrainTitle}`);
  console.log(`   Availability on ${targetDate}: ${dateAvailability ? `${dateAvailability.status} ${dateAvailability.count || ''}` : 'NOT FOUND'}`);

  if (!dateAvailability || dateAvailability.status === 'REGRET') {
    throw new Error(`❌ No tickets available for ${topTrainTitle} on ${targetDate}. Status: ${dateAvailability?.status || 'NOT FOUND'}`);
  }

  if (dateAvailability.status !== 'AVAILABLE') {
    console.warn(`⚠️  Warning: Only ${dateAvailability.status}${dateAvailability.count || ''} available (not fully available)`);
  }

  console.log(`✅ Proceeding to book ${topTrainTitle}...`);

  // 👉 Click the train title to focus the train row
  const trainTitleLocator = page.locator(`text="${topTrainTitle}"`).first();
  await trainTitleLocator.waitFor({ state: 'visible', timeout: 10000 });
  await trainTitleLocator.scrollIntoViewIfNeeded();
  await trainTitleLocator.click();

  // 👉 Click the first available seat
  const availableList = page.locator('.pre-avl:has(.AVAILABLE)');
  for (let i = 0; i < await availableList.count(); i++) {
    const item = availableList.nth(i);
    if (await item.isVisible()) {
      await item.click();
      console.log("✅ Selected available seat");
      break;
    }
  }

  // 👉 Pause for manual "Book Now" button click
  // await await humanDelay();
  
  // await page.waitForTimeout(1000);
   await humanDelay();

  // ✅ Fill passenger form after manual buy button click
  // ✅ Passenger Name
  await page.getByRole('searchbox', { name: 'Name' }).fill('Adarsh Yadav');

  // ✅ Age
  await page.getByPlaceholder('Age').fill('21');

  // ✅ Gender (select ONLY once)
  await page.getByRole('combobox').first().selectOption('M'); // M / F / T

  // ✅ Berth Preference (optional)
  await page.getByText('Reservation Choice').click();

  // Lower berth example
 await page
  .locator('label:has-text("Pay through BHIM/UPI")')
  .locator('.ui-radiobutton-box')
  .click();
  
  await humanDelay();
  await humanDelay();
  await humanDelay();
  // 🛑 Manual step: click "Continue" yourself.
  // Playwright Inspector opens here so you can do remaining steps manually.
  await page.waitForTimeout(140000); 
  return;
  // await page.waitForEvent('close');
// return;
});
