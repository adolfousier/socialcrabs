import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { log } from '../utils/logger.js';
import type { ClawSocial } from '../index.js';
import type { Platform } from '../types/index.js';

export function createHttpServer(clawSocial: ClawSocial, apiKey?: string) {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // API Key authentication middleware
  const authenticate = (req: Request, res: Response, next: NextFunction): void => {
    if (!apiKey) {
      next();
      return;
    }

    const providedKey = req.headers['x-api-key'] || req.query.apiKey;
    if (providedKey !== apiKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    log.debug(`${req.method} ${req.path}`, { query: req.query, body: req.body });
    next();
  });

  // Health check (no auth required)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Apply authentication to all other routes
  app.use(authenticate);

  // ============================================================================
  // Status endpoints
  // ============================================================================

  app.get('/api/status', async (_req: Request, res: Response) => {
    try {
      const status = await clawSocial.getStatus();
      res.json(status);
    } catch (error) {
      log.error('Error getting status', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  // ============================================================================
  // Session endpoints
  // ============================================================================

  app.get('/api/session/:platform', async (req: Request, res: Response) => {
    try {
      const platform = req.params.platform as Platform;
      const isLoggedIn = await clawSocial.isLoggedIn(platform);
      res.json({ platform, loggedIn: isLoggedIn });
    } catch (error) {
      log.error('Error checking session', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/session/login/:platform', async (req: Request, res: Response) => {
    try {
      const platform = req.params.platform as Platform;
      log.info(`Login request for ${platform}`);
      const success = await clawSocial.login(platform);
      res.json({ platform, success });
    } catch (error) {
      log.error('Error logging in', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/session/logout/:platform', async (req: Request, res: Response) => {
    try {
      const platform = req.params.platform as Platform;
      await clawSocial.logout(platform);
      res.json({ platform, success: true });
    } catch (error) {
      log.error('Error logging out', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  // ============================================================================
  // Instagram endpoints
  // ============================================================================

  app.post('/api/instagram/like', async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      if (!url) {
        res.status(400).json({ error: 'URL required' });
        return;
      }
      const result = await clawSocial.instagram.like({ url });
      res.json(result);
    } catch (error) {
      log.error('Error liking Instagram post', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/instagram/comment', async (req: Request, res: Response) => {
    try {
      const { url, text } = req.body;
      if (!url || !text) {
        res.status(400).json({ error: 'URL and text required' });
        return;
      }
      const result = await clawSocial.instagram.comment({ url, text });
      res.json(result);
    } catch (error) {
      log.error('Error commenting on Instagram post', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/instagram/follow', async (req: Request, res: Response) => {
    try {
      const { username } = req.body;
      if (!username) {
        res.status(400).json({ error: 'Username required' });
        return;
      }
      const result = await clawSocial.instagram.follow({ username });
      res.json(result);
    } catch (error) {
      log.error('Error following Instagram user', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/instagram/unfollow', async (req: Request, res: Response) => {
    try {
      const { username } = req.body;
      if (!username) {
        res.status(400).json({ error: 'Username required' });
        return;
      }
      const result = await clawSocial.instagram.unfollow({ username });
      res.json(result);
    } catch (error) {
      log.error('Error unfollowing Instagram user', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/instagram/dm', async (req: Request, res: Response) => {
    try {
      const { username, message } = req.body;
      if (!username || !message) {
        res.status(400).json({ error: 'Username and message required' });
        return;
      }
      const result = await clawSocial.instagram.dm({ username, message });
      res.json(result);
    } catch (error) {
      log.error('Error sending Instagram DM', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/instagram/profile/:username', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;
      const profile = await clawSocial.instagram.getProfile(username);
      res.json(profile);
    } catch (error) {
      log.error('Error getting Instagram profile', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  // ============================================================================
  // Twitter endpoints
  // ============================================================================

  app.post('/api/twitter/like', async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      if (!url) {
        res.status(400).json({ error: 'URL required' });
        return;
      }
      const result = await clawSocial.twitter.like({ url });
      res.json(result);
    } catch (error) {
      log.error('Error liking tweet', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/twitter/tweet', async (req: Request, res: Response) => {
    try {
      const { text } = req.body;
      if (!text) {
        res.status(400).json({ error: 'Text required' });
        return;
      }
      const result = await clawSocial.twitter.post({ text });
      res.json(result);
    } catch (error) {
      log.error('Error posting tweet', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/twitter/reply', async (req: Request, res: Response) => {
    try {
      const { url, text } = req.body;
      if (!url || !text) {
        res.status(400).json({ error: 'URL and text required' });
        return;
      }
      const result = await clawSocial.twitter.comment({ url, text });
      res.json(result);
    } catch (error) {
      log.error('Error replying to tweet', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/twitter/retweet', async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      if (!url) {
        res.status(400).json({ error: 'URL required' });
        return;
      }
      const result = await clawSocial.twitter.retweet(url);
      res.json(result);
    } catch (error) {
      log.error('Error retweeting', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/twitter/follow', async (req: Request, res: Response) => {
    try {
      const { username } = req.body;
      if (!username) {
        res.status(400).json({ error: 'Username required' });
        return;
      }
      const result = await clawSocial.twitter.follow({ username });
      res.json(result);
    } catch (error) {
      log.error('Error following Twitter user', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/twitter/dm', async (req: Request, res: Response) => {
    try {
      const { username, message } = req.body;
      if (!username || !message) {
        res.status(400).json({ error: 'Username and message required' });
        return;
      }
      const result = await clawSocial.twitter.dm({ username, message });
      res.json(result);
    } catch (error) {
      log.error('Error sending Twitter DM', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/twitter/profile/:username', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;
      const profile = await clawSocial.twitter.getProfile(username);
      res.json(profile);
    } catch (error) {
      log.error('Error getting Twitter profile', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  // ============================================================================
  // LinkedIn endpoints
  // ============================================================================

  app.post('/api/linkedin/like', async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      if (!url) {
        res.status(400).json({ error: 'URL required' });
        return;
      }
      const result = await clawSocial.linkedin.like({ url });
      res.json(result);
    } catch (error) {
      log.error('Error liking LinkedIn post', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/linkedin/comment', async (req: Request, res: Response) => {
    try {
      const { url, text } = req.body;
      if (!url || !text) {
        res.status(400).json({ error: 'URL and text required' });
        return;
      }
      const result = await clawSocial.linkedin.comment({ url, text });
      res.json(result);
    } catch (error) {
      log.error('Error commenting on LinkedIn post', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/linkedin/connect', async (req: Request, res: Response) => {
    try {
      const { profileUrl, note } = req.body;
      if (!profileUrl) {
        res.status(400).json({ error: 'Profile URL required' });
        return;
      }
      const result = await clawSocial.linkedin.connect({ profileUrl, note });
      res.json(result);
    } catch (error) {
      log.error('Error sending LinkedIn connection', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/linkedin/message', async (req: Request, res: Response) => {
    try {
      const { username, message } = req.body;
      if (!username || !message) {
        res.status(400).json({ error: 'Username and message required' });
        return;
      }
      const result = await clawSocial.linkedin.dm({ username, message });
      res.json(result);
    } catch (error) {
      log.error('Error sending LinkedIn message', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/linkedin/profile/:username', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;
      const profile = await clawSocial.linkedin.getProfile(username);
      res.json(profile);
    } catch (error) {
      log.error('Error getting LinkedIn profile', { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  // ============================================================================
  // Error handling
  // ============================================================================

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error('Unhandled error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
