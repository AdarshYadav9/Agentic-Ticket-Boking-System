import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www.irctc.co.in/nget/train-search');
  
  await page.locator('.h_menu_drop_button.hidden-xs').click();
 
  await page.locator('button', { hasText: 'LOGIN / REGISTER' }).click();

  await page.getByRole('textbox', { name: 'User Name' }).click();
  await page.getByRole('textbox', { name: 'User Name' }).click();
  await page.getByRole('textbox', { name: 'User Name' }).fill('Adarshyadav2');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('SQv3QETnBwzbTg@');
  await page.getByRole('textbox', { name: 'Password' }).press('Enter');
  await page.getByRole('button', { name: 'SIGN IN' }).click();


});