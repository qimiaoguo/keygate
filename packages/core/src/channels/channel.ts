/**
 * Channel — abstract notification + command interface.
 *
 * Channels are pluggable: Telegram, Discord, Slack, webhook, etc.
 * They serve two purposes:
 *   1. Push notifications to the user (approval requests, trade results, alerts)
 *   2. Receive commands from the user (approve, deny, configure)
 *
 * Important: Channels do NOT hold any secrets or signing keys.
 * They relay user intent to the CLI daemon, which does the actual signing.
 */

export interface ApprovalRequest {
  id: string;
  keyId: string;
  plugin: string;
  action: string;
  params: Record<string, unknown>;
  reason?: string;
  requestedAt: string;
}

export interface NotificationPayload {
  type: 'approval_request' | 'trade_result' | 'alert' | 'info';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** For approval_request: the request to approve/deny */
  approvalRequest?: ApprovalRequest;
}

export interface ChannelCommand {
  type: 'approve' | 'deny' | 'configure' | 'status' | 'disable_key' | 'custom';
  /** For approve/deny */
  approvalId?: string;
  /** For configure */
  keyId?: string;
  plugin?: string;
  config?: Record<string, unknown>;
  /** Raw text from user */
  rawText?: string;
}

export type CommandHandler = (cmd: ChannelCommand) => Promise<string>;

export interface Channel {
  /** Channel name (e.g. 'telegram', 'discord', 'slack') */
  readonly name: string;

  /** Initialize the channel (connect, set up webhook, etc.) */
  start(onCommand: CommandHandler): Promise<void>;

  /** Stop the channel gracefully */
  stop(): Promise<void>;

  /** Push a notification to the user */
  notify(payload: NotificationPayload): Promise<void>;

  /** Send a raw text message */
  sendMessage(text: string): Promise<void>;

  /** Check if the channel is connected */
  isConnected(): boolean;
}
