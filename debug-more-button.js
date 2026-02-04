/**
 * Debug script: Find the "More" button pattern on LinkedIn profiles
 * Profile: https://www.linkedin.com/in/sisto-zavala/
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
    await page.waitForTimeout(3000);
    
    // Find all buttons with their text
    console.log('\n=== Finding profile action buttons ===');
    const actionButtons = await page.evaluate(() => {
      // Focus on the profile header area
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.map(b => {
        const rect = b.getBoundingClientRect();
        return {
          text: b.textContent?.trim().replace(/\s+/g, ' '),
          ariaLabel: b.getAttribute('aria-label'),
          class: b.className,
          top: rect.top,
          left: rect.left,
          visible: rect.width > 0 && rect.height > 0 && rect.top < 800,
        };
      }).filter(b => b.visible && b.top > 400 && b.top < 600 && (b.text || b.ariaLabel)); // Profile actions area
    });
    
    console.log(`Found ${actionButtons.length} buttons in profile actions area:`);
    for (const btn of actionButtons) {
      console.log(`  "${btn.text}" | aria: ${btn.ariaLabel} | y: ${Math.round(btn.top)}`);
    }
    
    // Click the More button using exact text match
    const moreButton = actionButtons.find(b => b.text === 'More');
    if (moreButton) {
      console.log('\n=== Found "More" button, clicking... ===');
      
      // Click by coordinates
      await page.mouse.click(moreButton.left + 20, moreButton.top + 15);
      await page.waitForTimeout(1500);
      
      // Screenshot after click
      await page.screenshot({ path: '/tmp/sisto-more-clicked.png' });
      console.log('Screenshot: /tmp/sisto-more-clicked.png');
      
      // Get dropdown content
      console.log('\n=== Dropdown contents ===');
      const dropdownItems = await page.evaluate(() => {
        const dropdowns = document.querySelectorAll('.artdeco-dropdown__content');
        const items = [];
        
        dropdowns.forEach(dropdown => {
          if (dropdown.offsetParent !== null) {
            const allItems = dropdown.querySelectorAll('li, [role="menuitem"], span');
            allItems.forEach(item => {
              const text = item.textContent?.trim().replace(/\s+/g, ' ');
              if (text && text.length > 2 && text.length < 80) {
                items.push(text);
              }
            });
          }
        });
        
        // Dedupe
        return [...new Set(items)];
      });
      
      for (const item of dropdownItems) {
        console.log(`  - ${item}`);
      }
      
      // Check for Connect
      const hasConnect = dropdownItems.some(i => i.toLowerCase() === 'connect');
      console.log(`\n✓ Connect in dropdown: ${hasConnect ? 'YES ✅' : 'NO'}`);
    } else {
      console.log('\n❌ Could not find "More" button');
    }
    
  } finally {
    await browser.close();
  }
}

debug().catch(console.error);
