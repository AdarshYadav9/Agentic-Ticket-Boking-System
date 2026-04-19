import {humanDelay} from './pause.js';
export class LoginPage {
  constructor(page) {
    this.page = page;

    this.fromStation = page.getByRole('searchbox', { name: /From station/i });
    this.toStation = page.getByRole('searchbox', { name: /To station/i });

   
    this.dateInput = page.locator('input[placeholder*="Journey Date"]');

    this.searchButton = page.getByRole('button', { name: 'Search Trains' })
  }
 
  async openWebsite() {
    const username = (process.env.IRCTC_USERNAME || 'Adarshyadav2').trim();
    const password = (process.env.IRCTC_PASSWORD || 'SQv3QETnBwzbTg@').trim();

    await this.page.goto('https://www.irctc.co.in/nget/train-search');
    await humanDelay();

    await this.page.locator('.h_menu_drop_button.hidden-xs').click();
    await this.page.locator('button', { hasText: 'LOGIN / REGISTER' }).click();

    const usernameField = this.page.getByRole('textbox', { name: 'User Name' });
    const passwordField = this.page.getByRole('textbox', { name: 'Password' });
    const signInButton = this.page.getByRole('button', { name: 'SIGN IN' });

    await usernameField.fill(username);
    await passwordField.fill(password);
    await signInButton.click();

    await this.waitForLoginCompletion();
    await humanDelay();
  }
//  async loginuser(username, password) {
//      await await humanDelay();
//        await page.locator('a').first().click();

//       await page.locator('button', { hasText: 'LOGIN / REGISTER' }).click();
      
//       await page.getByRole('textbox', { name: 'User Name' }).click();
//        await page.getByRole('textbox', { name: 'User Name' }).fill('AdarshYadav9');

//        await page.getByRole('textbox', { name: 'Password' }).click();
//        await page.getByRole('textbox', { name: 'Password' }).fill('Adarsh@199700');
       
//        await page.getByText('Visually impaired users may').click();
//        await page.getByRole('button', { name: 'SIGN IN' }).click();
//        await await humanDelay();
 
// } 
  async dismissCommonPopups() {
    const candidates = [
      this.page.getByRole('button', { name: /^OK$/i }),
      this.page.getByRole('button', { name: /^Close$/i }),
      this.page.getByRole('button', { name: /^Continue$/i }),
      this.page.locator('button.close'),
      this.page.locator('button[aria-label="Close"]'),
      this.page.locator('button[aria-label="close"]'),
    ];

    for (const loc of candidates) {
      try {
        if (await loc.first().isVisible({ timeout: 500 })) {
          await loc.first().click({ timeout: 2000 });
        }
      } catch {
        // ignore
      }
    }
  }

  async selectStation(inputLocator, value) {
    const v = String(value ?? '').trim();
    if (!v) return;

    await inputLocator.click();
    await inputLocator.fill(v);

    await this.page.waitForTimeout(300);
    await inputLocator.press('ArrowDown');
    await inputLocator.press('Enter');
  }

  // ✅ FIXED DATE FUNCTION (clean + reliable)
  async selectJourneyDate(day) {
    const d = String(day ?? '').trim();
    if (!d) return;
  
    // Force click (IRCTC overlays sometimes block)
    // await this.page.locator('p-calendar').click({ force: true });
    const dateInput = this.page.locator('input[placeholder*="Journey Date"]');

    await dateInput.waitFor({ state: 'visible' });
     await dateInput.click();
  
    // await this.page.waitForSelector('.ui-datepicker-calendar');
  
    // await this.page.locator('.ui-datepicker-calendar a', { hasText: day }).click();
    
  }

  async waitForLoginCompletion() {
    const signInButton = this.page.getByRole('button', { name: 'SIGN IN' });

    try {
      // IRCTC requires captcha/manual confirmation in many cases.
      // Wait for the sign-in control to disappear before continuing.
      await signInButton.waitFor({ state: 'hidden', timeout: 90000 });
    } catch {
      throw new Error(
        'Login is not completed yet. Please solve captcha/OTP in the browser and sign in, then run again.'
      );
    }
  }

  async waitForResultsLoaded() {
    const indicators = [
      this.page.locator('.train_avl_enq_box'),
      this.page.locator('app-train-list'),
      this.page.getByRole('button', { name: /modify search/i }),
    ];

    await Promise.race(
      indicators.map((loc) =>
        loc.first().waitFor({ state: 'visible', timeout: 60000 })
      )
    );
  }

  async searchTrain(from, to, date) {       
    await this.dismissCommonPopups();
    // await this.await humanDelay();
    await humanDelay();
    await this.selectStation(this.fromStation, from);
    await this.dismissCommonPopups();
    // await this.await humanDelay();
    await humanDelay();
    await this.selectStation(this.toStation, to);
    await this.dismissCommonPopups();
    // await this.await humanDelay();
    await humanDelay();
    console.log("from", from);
    console.log("to", to);
    console.log("date", date);

    // ✅ DATE
    await this.selectJourneyDate(date);
    // await this.await humanDelay();
    await this.dismissCommonPopups();

    // ✅ SEARCH + WAIT
    await this.searchButton.click();

    await this.waitForResultsLoaded();

    // await this.await humanDelay();
    await humanDelay();
  }

   // page extraction 
  async getResultsPage() {
    await this.waitForResultsLoaded();
    return this.page;
  }
}