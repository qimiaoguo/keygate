/**
 * ChannelManager — manages multiple notification channels.
 *
 * Broadcasts notifications to all active channels.
 * Routes commands from any channel to the sandbox.
 */

import type { Channel, CommandHandler, NotificationPayload } from './channel.js';

export class ChannelManager {
  private channels = new Map<string, Channel>();
  private commandHandler: CommandHandler | null = null;

  /**
   * Register a channel.
   */
  register(channel: Channel): void {
    this.channels.set(channel.name, channel);
  }

  /**
   * Start all registered channels.
   */
  async startAll(onCommand: CommandHandler): Promise<void> {
    this.commandHandler = onCommand;

    for (const [name, channel] of this.channels) {
      try {
        await channel.start(onCommand);
        console.log(`[KeyGate] Channel ${name}: connected`);
      } catch (err) {
        console.warn(`[KeyGate] Channel ${name}: failed to start —`, err instanceof Error ? err.message : err);
      }
    }
  }

  /**
   * Stop all channels.
   */
  async stopAll(): Promise<void> {
    for (const [name, channel] of this.channels) {
      try {
        await channel.stop();
      } catch (err) {
        console.warn(`[KeyGate] Channel ${name}: stop error —`, err instanceof Error ? err.message : err);
      }
    }
  }

  /**
   * Broadcast a notification to all connected channels.
   */
  async notify(payload: NotificationPayload): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [name, channel] of this.channels) {
      if (channel.isConnected()) {
        promises.push(
          channel.notify(payload).catch((err) => {
            console.warn(`[KeyGate] Channel ${name}: notify error —`, err instanceof Error ? err.message : err);
          }),
        );
      }
    }
    await Promise.allSettled(promises);
  }

  /**
   * Send a message to all connected channels.
   */
  async broadcast(text: string): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [, channel] of this.channels) {
      if (channel.isConnected()) {
        promises.push(channel.sendMessage(text).catch(() => {}));
      }
    }
    await Promise.allSettled(promises);
  }

  /**
   * Get a specific channel by name.
   */
  get(name: string): Channel | undefined {
    return this.channels.get(name);
  }

  /**
   * List all channels with their status.
   */
  list(): { name: string; connected: boolean }[] {
    return Array.from(this.channels.values()).map((ch) => ({
      name: ch.name,
      connected: ch.isConnected(),
    }));
  }

  get size(): number {
    return this.channels.size;
  }
}
