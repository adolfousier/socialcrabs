/**
 * Debug script: Find the "More" button pattern on LinkedIn profiles
 * Profile: https://www.linkedin.com/in/sisto-zavala/
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const SESSION_PATH = path.join(process.cwd(), 'sessions', 'linkedin');

async function debug() {
  console.log('Loading LinkedIn session...');
  
  const browser = await chromium.launchPersistentContext(SESSION_PATH, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  
  const page = browser.pages()[0] || await browser.newPage();
  
  try {
    const profileUrl = 'https://www.linkedin.com/in/sisto-zavala/';
    console.log(`\nNavigating to: ${profileUrl}`);
    await page.goto(profileUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Take screenshot
    await page.screenshot({ path: '/tmp/sisto-profile.png' });
    console.log('Screenshot saved to /tmp/sisto-profile.png');
    
    // Find all buttons in the profile actions area
    console.log('\n=== All visible buttons ===');
    const buttons = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button:not([style*="display: none"])'));
      return btns.map((b, i) => ({
        index: i,
        text: b.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100),
        ariaLabel: b.getAttribute('aria-label'),
        className: b.className?.slice(0, 150),
        id: b.id,
        type: b.getAttribute('type'),
        visible: (b as HTMLElement).offsetParent !== null,
      })).filter(b => b.visible && (b.text || b.ariaLabel));
    });
    
    for (const btn of buttons) {
      console.log(`[${btn.index}] "${btn.text}" | aria: "${btn.ariaLabel}" | class: ${btn.className?.slice(0, 60)}`);
    }
    
    // Look specifically for "More" buttons
    console.log('\n=== "More" buttons ===');
    const moreButtons = buttons.filter(b => 
      b.text?.toLowerCase().includes('more') || 
      b.ariaLabel?.toLowerCase().includes('more')
    );
    
    for (const btn of moreButtons) {
      console.log(`  "${btn.text}" | aria: "${btn.ariaLabel}" | class: ${btn.className}`);
    }
    
    // Check for the actions dropdown/menu area
    console.log('\n=== Profile actions section ===');
    const actionsSection = await page.evaluate(() => {
      // Common patterns for LinkedIn profile actions
      const selectors = [
        'div.pv-top-card-v2-ctas', // Profile CTAs
        'div[class*="action"]',
        'div[class*="profile-actions"]',
        'section.artdeco-card div button',
        '.pvs-profile-actions',
        'div.ph5 button',
      ];
      
      const results: any[] = [];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          results.push({ selector: sel, count: els.length });
        }
      }
      return results;
    });
    console.log(actionsSection);
    
    // Try clicking a "More" button if found
    if (moreButtons.length > 0) {
      console.log('\n=== Clicking "More" button ===');
      const moreBtn = page.locator(`button:has-text("More")`).first();
      if (await moreBtn.isVisible()) {
        await moreBtn.click();
        await page.waitForTimeout(1500);
        
        // Screenshot after clicking More
        await page.screenshot({ path: '/tmp/sisto-more-clicked.png' });
        console.log('Screenshot after More click: /tmp/sisto-more-clicked.png');
        
        // Check for dropdown menu items
        const menuItems = await page.evaluate(() => {
          const items = Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"], .artdeco-dropdown__content-inner li, div[class*="dropdown"] li'));
          return items.map(item => ({
            text: item.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100),
          }));
        });
        
        console.log('\nDropdown menu items:');
        for (const item of menuItems) {
          console.log(`  - ${item.text}`);
        }
        
        // Look for Connect in the dropdown
        const connectInDropdown = await page.locator('[role="menu"] button:has-text("Connect"), .artdeco-dropdown__content-inner button:has-text("Connect"), div[class*="dropdown"] button:has-text("Connect")').count();
        console.log(`\nConnect buttons in dropdown: ${connectInDropdown}`);
      }
    }
    
  } finally {
    await browser.close();
  }
}

debug().catch(console.error);
