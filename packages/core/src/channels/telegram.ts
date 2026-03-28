/**
 * Telegram Channel — notification + command interface via Telegram Bot API.
 *
 * Features:
 *   - Inline keyboard buttons for approve/deny
 *   - Command parsing (/approve, /deny, /status, /disable)
 *   - Long polling (no webhook server needed)
 *   - Authorized chat IDs only
 */

import type {
  Channel,
  CommandHandler,
  NotificationPayload,
  ChannelCommand,
} from './channel.js';

interface TelegramConfig {
  botToken: string;
  /** Authorized chat IDs — only these can send commands */
  authorizedChatIds: number[];
  /** Polling interval in ms (default: 2000) */
  pollInterval?: number;
}

interface TgMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
  from?: { id: number; first_name?: string };
}

interface TgCallbackQuery {
  id: string;
  message?: TgMessage;
  data?: string;
  from?: { id: number; first_name?: string };
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export class TelegramChannel implements Channel {
  readonly name = 'telegram';
  private config: TelegramConfig;
  private onCommand: CommandHandler | null = null;
  private running = false;
  private offset = 0;
  private connected = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  async start(onCommand: CommandHandler): Promise<void> {
    this.onCommand = onCommand;
    this.running = true;

    // Verify bot token
    const me = await this.apiCall('getMe');
    if (!me.ok) {
      throw new Error(`Telegram bot auth failed: ${JSON.stringify(me)}`);
    }
    console.log(`[KeyGate] Telegram channel connected as @${me.result.username}`);
    this.connected = true;

    // Start polling
    this.poll();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.connected = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async notify(payload: NotificationPayload): Promise<void> {
    for (const chatId of this.config.authorizedChatIds) {
      if (payload.type === 'approval_request' && payload.approvalRequest) {
        await this.sendApprovalMessage(chatId, payload);
      } else {
        const icon = payload.type === 'alert' ? '🚨'
          : payload.type === 'trade_result' ? '📊'
          : 'ℹ️';
        await this.sendTgMessage(chatId, `${icon} **${payload.title}**\n\n${payload.body}`);
      }
    }
  }

  async sendMessage(text: string): Promise<void> {
    for (const chatId of this.config.authorizedChatIds) {
      await this.sendTgMessage(chatId, text);
    }
  }

  // ─── Private ───

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const updates = await this.apiCall('getUpdates', {
        offset: this.offset,
        timeout: 30,
        allowed_updates: ['message', 'callback_query'],
      });

      if (updates.ok && updates.result?.length) {
        for (const update of updates.result as TgUpdate[]) {
          this.offset = update.update_id + 1;

          if (update.callback_query) {
            await this.handleCallback(update.callback_query);
          } else if (update.message?.text) {
            await this.handleMessage(update.message);
          }
        }
      }
    } catch (err) {
      console.warn('[KeyGate] Telegram poll error:', err instanceof Error ? err.message : err);
    }

    // Schedule next poll
    const interval = this.config.pollInterval ?? 2000;
    this.pollTimer = setTimeout(() => this.poll(), interval);
  }

  private isAuthorized(chatId: number): boolean {
    return this.config.authorizedChatIds.includes(chatId);
  }

  private async handleMessage(msg: TgMessage): Promise<void> {
    if (!this.isAuthorized(msg.chat.id)) {
      await this.sendTgMessage(msg.chat.id, '⛔ Unauthorized. Your chat ID is not in the allowlist.');
      return;
    }

    const text = msg.text?.trim() ?? '';
    const cmd = this.parseCommand(text);

    if (cmd && this.onCommand) {
      const response = await this.onCommand(cmd);
      await this.sendTgMessage(msg.chat.id, response);
    } else if (text.startsWith('/')) {
      await this.sendTgMessage(msg.chat.id, this.helpText());
    }
  }

  private async handleCallback(cb: TgCallbackQuery): Promise<void> {
    const chatId = cb.message?.chat.id;
    if (!chatId || !this.isAuthorized(chatId)) {
      await this.answerCallback(cb.id, '⛔ Unauthorized');
      return;
    }

    const data = cb.data ?? '';

    // Parse callback data: "approve:<id>" or "deny:<id>"
    if (data.startsWith('approve:') || data.startsWith('deny:')) {
      const [action, approvalId] = data.split(':');
      const cmd: ChannelCommand = {
        type: action as 'approve' | 'deny',
        approvalId,
      };

      if (this.onCommand) {
        const response = await this.onCommand(cmd);
        // Update the original message to show result
        if (cb.message) {
          await this.editMessage(chatId, cb.message.message_id, response);
        }
        await this.answerCallback(cb.id, action === 'approve' ? '✅ Approved' : '❌ Denied');
      }
    } else {
      await this.answerCallback(cb.id, 'Unknown action');
    }
  }

  private parseCommand(text: string): ChannelCommand | null {
    if (text.startsWith('/approve ')) {
      const approvalId = text.slice('/approve '.length).trim();
      return { type: 'approve', approvalId };
    }
    if (text.startsWith('/deny ')) {
      const approvalId = text.slice('/deny '.length).trim();
      return { type: 'deny', approvalId };
    }
    if (text === '/status') {
      return { type: 'status' };
    }
    if (text.startsWith('/disable ')) {
      const keyId = text.slice('/disable '.length).trim();
      return { type: 'disable_key', keyId };
    }
    return null;
  }

  private async sendApprovalMessage(chatId: number, payload: NotificationPayload): Promise<void> {
    const req = payload.approvalRequest!;
    const text = [
      `🔔 **Approval Request**`,
      ``,
      `**Plugin:** ${req.plugin}`,
      `**Action:** ${req.action}`,
      `**Key:** ${req.keyId}`,
      req.reason ? `**Reason:** ${req.reason}` : '',
      ``,
      `**Params:**`,
      '```json',
      JSON.stringify(req.params, null, 2),
      '```',
      ``,
      `ID: \`${req.id}\``,
    ].filter(Boolean).join('\n');

    const keyboard = {
      inline_keyboard: [[
        { text: '✅ Approve', callback_data: `approve:${req.id}` },
        { text: '❌ Deny', callback_data: `deny:${req.id}` },
      ]],
    };

    await this.apiCall('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }

  private helpText(): string {
    return [
      '🔑 **KeyGate Commands**',
      '',
      '`/status` — Sandbox status',
      '`/approve <id>` — Approve a request',
      '`/deny <id>` — Deny a request',
      '`/disable <keyId>` — Emergency disable a key',
    ].join('\n');
  }

  // ─── Telegram API helpers ───

  private async apiCall(method: string, params?: Record<string, unknown>): Promise<any> {
    const url = `https://api.telegram.org/bot${this.config.botToken}/${method}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: params ? JSON.stringify(params) : undefined,
    });
    return resp.json();
  }

  private async sendTgMessage(chatId: number, text: string): Promise<void> {
    await this.apiCall('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    });
  }

  private async editMessage(chatId: number, messageId: number, text: string): Promise<void> {
    await this.apiCall('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'Markdown',
    });
  }

  private async answerCallback(callbackQueryId: string, text: string): Promise<void> {
    await this.apiCall('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
    });
  }
}
