import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launchPersistentContext('./browser-data', { 
    headless: true 
  });
  
  const page = await browser.newPage();
  await page.goto('https://www.linkedin.com/feed/');
  await page.waitForTimeout(3000);
  
  const cookies = await browser.cookies();
  console.log('All cookies:', cookies.map(c => c.name));
  
  const liAt = cookies.find(c => c.name === 'li_at');
  console.log('li_at cookie:', liAt ? 'FOUND' : 'MISSING');
  
  await page.screenshot({ path: './sessions/debug-linkedin-feed.png' });
  console.log('Screenshot saved');
  
  await browser.close();
}

main().catch(console.error);
