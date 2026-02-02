import { BrowserManager } from './browser/manager.js';
import { RateLimiter, DEFAULT_RATE_LIMITS } from './utils/rate-limiter.js';
import { InstagramHandler } from './platforms/instagram.js';
import { TwitterHandler } from './platforms/twitter.js';
import { LinkedInHandler } from './platforms/linkedin.js';
import { createHttpServer } from './server/http.js';
import { WebSocketManager } from './server/websocket.js';
import { initLogger, log } from './utils/logger.js';
import { configureDelays } from './utils/delays.js';
import { loadConfig } from './utils/config.js';
import type { ClawSocialConfig, Platform, RateLimitStatus, ServerConfig, BrowserConfig, RateLimitConfig, DelayConfig, SessionConfig, LoggingConfig } from './types/index.js';

interface ResolvedConfig {
  server: ServerConfig;
  browser: BrowserConfig;
  rateLimits: RateLimitConfig;
  delays: DelayConfig;
  session: SessionConfig;
  logging: LoggingConfig;
}
import type { Server } from 'http';

export class ClawSocial {
  private config: ResolvedConfig;
  private browserManager: BrowserManager;
  private rateLimiter: RateLimiter;
  private httpServer: Server | null = null;
  private wsManager: WebSocketManager | null = null;

  public instagram: InstagramHandler;
  public twitter: TwitterHandler;
  public linkedin: LinkedInHandler;

  constructor(config?: ClawSocialConfig) {
    // Load and merge config
    const defaultConfig = loadConfig();
    this.config = {
      server: { ...defaultConfig.server, ...config?.server },
      browser: { ...defaultConfig.browser, ...config?.browser },
      rateLimits: { 
        instagram: { ...defaultConfig.rateLimits.instagram, ...config?.rateLimits?.instagram },
        twitter: { ...defaultConfig.rateLimits.twitter, ...config?.rateLimits?.twitter },
        linkedin: { ...defaultConfig.rateLimits.linkedin, ...config?.rateLimits?.linkedin },
      },
      delays: { ...defaultConfig.delays, ...config?.delays },
      session: { ...defaultConfig.session, ...config?.session },
      logging: { ...defaultConfig.logging, ...config?.logging },
    };

    // Initialize logger
    initLogger(this.config.logging.level, this.config.logging.file);

    // Configure delays
    configureDelays({
      minMs: this.config.delays.minMs,
      maxMs: this.config.delays.maxMs,
      typingMinMs: this.config.delays.typingMinMs,
      typingMaxMs: this.config.delays.typingMaxMs,
    });

    // Initialize browser manager
    this.browserManager = new BrowserManager(
      this.config.browser,
      this.config.session.dir
    );

    // Initialize rate limiter
    const rateLimits = {
      instagram: { ...DEFAULT_RATE_LIMITS.instagram, ...this.config.rateLimits.instagram },
      twitter: { ...DEFAULT_RATE_LIMITS.twitter, ...this.config.rateLimits.twitter },
      linkedin: { ...DEFAULT_RATE_LIMITS.linkedin, ...this.config.rateLimits.linkedin },
    };
    this.rateLimiter = new RateLimiter(rateLimits, `${this.config.session.dir}/rate-limits.json`);

    // Initialize platform handlers
    this.instagram = new InstagramHandler(this.browserManager, this.rateLimiter);
    this.twitter = new TwitterHandler(this.browserManager, this.rateLimiter);
    this.linkedin = new LinkedInHandler(this.browserManager, this.rateLimiter);

    log.info('ClawSocial initialized', {
      headless: this.config.browser.headless,
      sessionDir: this.config.session.dir,
    });
  }

  /**
   * Initialize the browser
   */
  async initialize(): Promise<void> {
    log.info('Initializing ClawSocial...');
    await this.browserManager.initialize();
    log.info('ClawSocial ready');
  }

  /**
   * Start the HTTP and WebSocket servers
   */
  async startServer(): Promise<void> {
    const { host, port, wsPort, apiKey } = this.config.server;

    // Create and start HTTP server
    const app = createHttpServer(this, apiKey);
    this.httpServer = app.listen(port, host, () => {
      log.info(`HTTP server listening on http://${host}:${port}`);
    });

    // Create and start WebSocket server
    this.wsManager = new WebSocketManager(this, apiKey);
    this.wsManager.start(wsPort, host);

    // Setup graceful shutdown
    this.setupShutdownHandlers();
  }

  /**
   * Check if logged in to a platform
   */
  async isLoggedIn(platform: Platform): Promise<boolean> {
    switch (platform) {
      case 'instagram':
        return this.instagram.isLoggedIn();
      case 'twitter':
        return this.twitter.isLoggedIn();
      case 'linkedin':
        return this.linkedin.isLoggedIn();
      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }

  /**
   * Login to a platform
   */
  async login(platform: Platform): Promise<boolean> {
    switch (platform) {
      case 'instagram':
        return this.instagram.login();
      case 'twitter':
        return this.twitter.login();
      case 'linkedin':
        return this.linkedin.login();
      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }

  /**
   * Logout from a platform
   */
  async logout(platform: Platform): Promise<void> {
    switch (platform) {
      case 'instagram':
        await this.instagram.logout();
        break;
      case 'twitter':
        await this.twitter.logout();
        break;
      case 'linkedin':
        await this.linkedin.logout();
        break;
      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }

  /**
   * Get system status
   */
  async getStatus(): Promise<{
    browser: boolean;
    platforms: Record<Platform, { loggedIn: boolean; rateLimits: Record<string, RateLimitStatus> }>;
    uptime: number;
  }> {
    const platforms: Record<Platform, { loggedIn: boolean; rateLimits: Record<string, RateLimitStatus> }> = {
      instagram: {
        loggedIn: await this.isLoggedIn('instagram').catch(() => false),
        rateLimits: this.rateLimiter.getStatus('instagram'),
      },
      twitter: {
        loggedIn: await this.isLoggedIn('twitter').catch(() => false),
        rateLimits: this.rateLimiter.getStatus('twitter'),
      },
      linkedin: {
        loggedIn: await this.isLoggedIn('linkedin').catch(() => false),
        rateLimits: this.rateLimiter.getStatus('linkedin'),
      },
    };

    return {
      browser: this.browserManager.isRunning(),
      platforms,
      uptime: process.uptime(),
    };
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      log.info(`Received ${signal}, shutting down gracefully...`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  /**
   * Shutdown everything
   */
  async shutdown(): Promise<void> {
    log.info('Shutting down ClawSocial...');

    // Stop WebSocket server
    if (this.wsManager) {
      this.wsManager.stop();
      this.wsManager = null;
    }

    // Stop HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }

    // Shutdown browser
    await this.browserManager.shutdown();

    log.info('ClawSocial shutdown complete');
  }
}

// Export types
export * from './types/index.js';

// Export utilities
export { log } from './utils/logger.js';
export { RateLimiter, DEFAULT_RATE_LIMITS } from './utils/rate-limiter.js';
export { configureDelays, humanDelay, sleep } from './utils/delays.js';

// Export platform handlers for direct use
export { InstagramHandler } from './platforms/instagram.js';
export { TwitterHandler } from './platforms/twitter.js';
export { LinkedInHandler } from './platforms/linkedin.js';

// Default export
export default ClawSocial;
