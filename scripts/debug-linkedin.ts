import { chromium } from 'playwright';
import * as fs from 'fs';

const cookies = JSON.parse(fs.readFileSync('./sessions/linkedin.json', 'utf-8')).cookies;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(cookies);
  
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed/update/urn:li:activity:7423824702529257472/');
  await page.waitForTimeout(5000);
  
  await page.screenshot({ path: './sessions/debug-linkedin-post.png', fullPage: true });
  console.log('Screenshot saved');
  
  // Find buttons with Like
  const buttons = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    return Array.from(btns).map(b => ({
      text: b.textContent?.trim().substring(0, 50),
      ariaLabel: b.getAttribute('aria-label'),
      class: b.className.substring(0, 50)
    })).filter(b => b.ariaLabel?.toLowerCase().includes('like') || b.text?.toLowerCase().includes('like'));
  });
  console.log('Like buttons:', JSON.stringify(buttons, null, 2));
  
  // Find all reaction buttons
  const reactions = await page.evaluate(() => {
    const spans = document.querySelectorAll('span.react-button__text, button[aria-label*="React"]');
    return Array.from(spans).map(s => s.textContent?.trim());
  });
  console.log('Reactions:', reactions);
  
  await browser.close();
}

main().catch(console.error);
