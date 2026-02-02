/**
 * Human-like delay utilities
 * Simulates natural human behavior with randomized timing
 */

// Default delay ranges (can be overridden)
let DELAY_MIN = 1500;
let DELAY_MAX = 4000;
let TYPING_MIN = 30;
let TYPING_MAX = 100;

/**
 * Configure delay ranges
 */
export function configureDelays(config: {
  minMs?: number;
  maxMs?: number;
  typingMinMs?: number;
  typingMaxMs?: number;
}): void {
  if (config.minMs !== undefined) DELAY_MIN = config.minMs;
  if (config.maxMs !== undefined) DELAY_MAX = config.maxMs;
  if (config.typingMinMs !== undefined) TYPING_MIN = config.typingMinMs;
  if (config.typingMaxMs !== undefined) TYPING_MAX = config.typingMaxMs;
}

/**
 * Generate a random delay between min and max milliseconds
 */
export function randomDelay(min: number = DELAY_MIN, max: number = DELAY_MAX): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleep for a random duration between min and max
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep for a random duration within the configured range
 */
export async function humanDelay(
  min: number = DELAY_MIN,
  max: number = DELAY_MAX
): Promise<void> {
  const delay = randomDelay(min, max);
  await sleep(delay);
}

/**
 * Generate a random typing delay per character
 */
export function typingDelay(): number {
  return randomDelay(TYPING_MIN, TYPING_MAX);
}

/**
 * Human-like thinking pause before an action
 * Longer delay to simulate reading/thinking
 */
export async function thinkingPause(): Promise<void> {
  await humanDelay(2000, 5000);
}

/**
 * Quick reaction delay (for likes, follows)
 */
export async function quickDelay(): Promise<void> {
  await humanDelay(800, 1500);
}

/**
 * Delay before typing (looking at input field)
 */
export async function preTypeDelay(): Promise<void> {
  await humanDelay(500, 1200);
}

/**
 * Delay after typing (reviewing what was typed)
 */
export async function postTypeDelay(): Promise<void> {
  await humanDelay(300, 800);
}

/**
 * Page load wait with buffer
 */
export async function pageLoadDelay(): Promise<void> {
  await humanDelay(2000, 4000);
}

/**
 * Scroll pause (simulating reading)
 */
export async function scrollPause(): Promise<void> {
  await humanDelay(1000, 3000);
}

/**
 * Generate random jitter for a base delay
 * Returns base ± jitter%
 */
export function jitter(base: number, jitterPercent: number = 20): number {
  const variance = base * (jitterPercent / 100);
  return base + (Math.random() * 2 - 1) * variance;
}

/**
 * Exponential backoff for retries
 */
export function exponentialBackoff(attempt: number, baseMs: number = 1000): number {
  return Math.min(baseMs * Math.pow(2, attempt), 30000);
}

/**
 * Calculate total typing time for a string
 */
export function estimateTypingTime(text: string): number {
  const avgDelay = (TYPING_MIN + TYPING_MAX) / 2;
  return text.length * avgDelay;
}
