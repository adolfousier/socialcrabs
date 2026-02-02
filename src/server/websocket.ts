import { WebSocketServer, WebSocket } from 'ws';
import { log } from '../utils/logger.js';
import type { ClawSocial } from '../index.js';
import type { WSMessage, Platform, ActionType } from '../types/index.js';

interface WSClient {
  ws: WebSocket;
  id: string;
  subscriptions: Set<string>;
  authenticated: boolean;
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WSClient> = new Map();
  private clawSocial: ClawSocial;
  private apiKey?: string;

  constructor(clawSocial: ClawSocial, apiKey?: string) {
    this.clawSocial = clawSocial;
    this.apiKey = apiKey;
  }

  /**
   * Start the WebSocket server
   */
  start(port: number, host: string): void {
    this.wss = new WebSocketServer({ port, host });

    this.wss.on('connection', (ws, _req) => {
      const clientId = this.generateClientId();
      const client: WSClient = {
        ws,
        id: clientId,
        subscriptions: new Set(),
        authenticated: !this.apiKey, // Auto-authenticated if no API key required
      };

      this.clients.set(clientId, client);
      log.info(`WebSocket client connected: ${clientId}`);

      ws.on('message', async (data) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());
          await this.handleMessage(client, message);
        } catch (error) {
          log.error('Error handling WebSocket message', { error: String(error) });
          this.sendError(client, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        log.info(`WebSocket client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
        log.error(`WebSocket error for client ${clientId}`, { error: String(error) });
      });

      // Send welcome message
      this.send(client, {
        type: 'status',
        payload: {
          connected: true,
          clientId,
          authenticated: client.authenticated,
        },
      });
    });

    log.info(`WebSocket server started on ${host}:${port}`);
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(client: WSClient, message: WSMessage): Promise<void> {
    log.debug('WebSocket message received', { type: message.type, id: message.id });

    switch (message.type) {
      case 'ping':
        this.send(client, { type: 'pong', id: message.id });
        break;

      case 'command':
        if (!client.authenticated && this.apiKey) {
          this.sendError(client, 'Not authenticated', message.id);
          return;
        }
        await this.handleCommand(client, message);
        break;

      case 'subscribe':
        if (!client.authenticated && this.apiKey) {
          this.sendError(client, 'Not authenticated', message.id);
          return;
        }
        const topic = message.payload?.topic as string;
        if (topic) {
          client.subscriptions.add(topic);
          this.send(client, {
            type: 'status',
            id: message.id,
            payload: { subscribed: topic },
          });
        }
        break;

      case 'unsubscribe':
        const unsubTopic = message.payload?.topic as string;
        if (unsubTopic) {
          client.subscriptions.delete(unsubTopic);
          this.send(client, {
            type: 'status',
            id: message.id,
            payload: { unsubscribed: unsubTopic },
          });
        }
        break;

      default:
        // Check for API key in payload for authentication
        if (this.apiKey && message.payload?.apiKey === this.apiKey) {
          client.authenticated = true;
          this.send(client, {
            type: 'status',
            id: message.id,
            payload: { authenticated: true },
          });
          return;
        }
        this.sendError(client, `Unknown message type: ${message.type}`, message.id);
    }
  }

  /**
   * Handle command messages
   */
  private async handleCommand(client: WSClient, message: WSMessage): Promise<void> {
    const payload = message.payload || {};
    const platform = payload.platform as Platform;
    const action = payload.action as ActionType;

    if (!platform || !action) {
      this.sendError(client, 'Platform and action required', message.id);
      return;
    }

    try {
      let result;

      switch (platform) {
        case 'instagram':
          result = await this.executeInstagramAction(action, payload);
          break;
        case 'twitter':
          result = await this.executeTwitterAction(action, payload);
          break;
        case 'linkedin':
          result = await this.executeLinkedInAction(action, payload);
          break;
        default:
          this.sendError(client, `Unknown platform: ${platform}`, message.id);
          return;
      }

      this.send(client, {
        type: 'result',
        id: message.id,
        payload: { result },
      });

      // Broadcast to subscribers
      this.broadcast(`${platform}:${action}`, {
        type: 'result',
        payload: { platform, action, result },
      });
    } catch (error) {
      log.error('Error executing command', { error: String(error) });
      this.sendError(client, String(error), message.id);
    }
  }

  /**
   * Execute Instagram action
   */
  private async executeInstagramAction(
    action: ActionType,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    const handler = this.clawSocial.instagram;

    switch (action) {
      case 'like':
        return handler.like({ url: payload.url as string });
      case 'comment':
        return handler.comment({
          url: payload.url as string,
          text: payload.text as string,
        });
      case 'follow':
        return handler.follow({ username: payload.username as string });
      case 'unfollow':
        return handler.unfollow({ username: payload.username as string });
      case 'dm':
        return handler.dm({
          username: payload.username as string,
          message: payload.message as string,
        });
      case 'view_profile':
        return handler.getProfile(payload.username as string);
      default:
        throw new Error(`Unknown Instagram action: ${action}`);
    }
  }

  /**
   * Execute Twitter action
   */
  private async executeTwitterAction(
    action: ActionType,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    const handler = this.clawSocial.twitter;

    switch (action) {
      case 'like':
        return handler.like({ url: payload.url as string });
      case 'comment':
      case 'reply':
        return handler.comment({
          url: payload.url as string,
          text: payload.text as string,
        });
      case 'follow':
        return handler.follow({ username: payload.username as string });
      case 'unfollow':
        return handler.unfollow({ username: payload.username as string });
      case 'dm':
        return handler.dm({
          username: payload.username as string,
          message: payload.message as string,
        });
      case 'post':
        return handler.post({ text: payload.text as string });
      case 'retweet':
        return handler.retweet(payload.url as string);
      case 'view_profile':
        return handler.getProfile(payload.username as string);
      default:
        throw new Error(`Unknown Twitter action: ${action}`);
    }
  }

  /**
   * Execute LinkedIn action
   */
  private async executeLinkedInAction(
    action: ActionType,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    const handler = this.clawSocial.linkedin;

    switch (action) {
      case 'like':
        return handler.like({ url: payload.url as string });
      case 'comment':
        return handler.comment({
          url: payload.url as string,
          text: payload.text as string,
        });
      case 'follow':
        return handler.follow({ username: payload.username as string });
      case 'connect':
        return handler.connect({
          profileUrl: payload.profileUrl as string,
          note: payload.note as string | undefined,
        });
      case 'dm':
        return handler.dm({
          username: payload.username as string,
          message: payload.message as string,
        });
      case 'view_profile':
        return handler.getProfile(payload.username as string);
      default:
        throw new Error(`Unknown LinkedIn action: ${action}`);
    }
  }

  /**
   * Send message to a client
   */
  private send(client: WSClient, message: WSMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error to a client
   */
  private sendError(client: WSClient, error: string, id?: string): void {
    this.send(client, {
      type: 'error',
      id,
      payload: { error },
    });
  }

  /**
   * Broadcast message to all subscribed clients
   */
  private broadcast(topic: string, message: WSMessage): void {
    for (const client of this.clients.values()) {
      if (client.subscriptions.has(topic) || client.subscriptions.has('*')) {
        this.send(client, message);
      }
    }
  }

  /**
   * Broadcast event to all clients
   */
  broadcastEvent(event: string, data: unknown): void {
    const message: WSMessage = {
      type: 'status',
      payload: { event, data },
    };

    for (const client of this.clients.values()) {
      if (client.authenticated) {
        this.send(client, message);
      }
    }
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Stop the WebSocket server
   */
  stop(): void {
    if (this.wss) {
      for (const client of this.clients.values()) {
        client.ws.close();
      }
      this.clients.clear();
      this.wss.close();
      this.wss = null;
      log.info('WebSocket server stopped');
    }
  }
}
