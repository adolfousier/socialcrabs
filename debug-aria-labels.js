/**
 * Debug: Check exact aria-labels of buttons on LinkedIn profile
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function debug() {
  console.log('Loading LinkedIn session...');
  
  // Load cookies from the JSON session file
  const sessionPath = path.join(process.cwd(), 'sessions', 'linkedin.json');
  const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  
  // Load cookies from session
  await context.addCookies(sessionData.cookies);
  
  const page = await context.newPage();
  
  try {
    const profileUrl = 'https://www.linkedin.com/in/sisto-zavala/';
    console.log(`\nNavigating to: ${profileUrl}`);
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    console.log('\n=== Checking at different time points ===');
    
    for (let i = 1; i <= 10; i++) {
      await page.waitForTimeout(2000);
      
      // Check for Message button
      const messageButtons = await page.locator('button[aria-label^="Message "]').all();
      const messageCount = messageButtons.length;
      
      // Check for More actions button
      const moreButtons = await page.locator('button[aria-label="More actions"]').all();
      const moreCount = moreButtons.length;
      
      // Get all aria-labels that contain "Message" or "More"
      const relevantButtons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button'))
          .filter(b => {
            const aria = b.getAttribute('aria-label') || '';
            const text = b.textContent || '';
            return aria.toLowerCase().includes('message') || 
                   aria.toLowerCase().includes('more') ||
                   text.toLowerCase().includes('message') ||
                   text.toLowerCase().includes('more');
          })
          .map(b => ({
            ariaLabel: b.getAttribute('aria-label'),
            text: b.textContent?.trim().replace(/\s+/g, ' ').slice(0, 50),
            visible: b.offsetParent !== null,
          }));
      });
      
      console.log(`\n[${i * 2}s] Message buttons: ${messageCount}, More buttons: ${moreCount}`);
      if (relevantButtons.length > 0) {
        console.log('Relevant buttons:');
        relevantButtons.forEach(b => {
          console.log(`  - aria="${b.ariaLabel}" text="${b.text}" visible=${b.visible}`);
        });
      }
      
      if (messageCount > 0 && moreCount > 0) {
        console.log('\n✅ Both buttons found!');
        break;
      }
    }
    
  } finally {
    await browser.close();
  }
}

debug().catch(console.error);
