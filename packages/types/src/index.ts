// ─── Credential Types ───

export type CredentialType = 'crypto_key' | 'payment_key' | 'api_key' | 'oauth_token' | 'cert';

export interface CredentialMeta {
  id: string;
  type: CredentialType;
  label: string;
  createdAt: string;
  /** Which plugins this key is authorized for, with per-plugin limits */
  plugins: Record<string, PluginKeyConfig>;
  /** Global daily limit across all plugins */
  globalDailyLimit?: LimitConfig;
  /** Whether the key is currently active */
  enabled: boolean;
}

export interface PluginKeyConfig {
  dailyLimit?: number;
  perTx?: number;
  currency?: string;
  /** Actions that require one-time approval */
  requireApproval?: string[];
  /** Actions that auto-execute with token */
  autoAllow?: string[];
}

export interface LimitConfig {
  amount: number;
  currency: string;
}

// ─── Plugin Types ───

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  category: 'crypto' | 'payment' | 'api' | 'data' | 'other';
  capabilities: {
    actions: PluginAction[];
    queries?: PluginAction[];
  };
  runtime: 'ts' | 'python';
  internals?: {
    contracts?: Array<{ address: string; chain: string }>;
    never?: string[];
  };
}

export interface PluginAction {
  name: string;
  script: string;
  description: string;
  riskLevel: 'read' | 'normal' | 'elevated';
  paramsSchema?: string;
}

export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  checksum: string;
  installedAt: string;
}

// ─── Auth Types ───

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface PairingInfo {
  sandboxPk: string;   // hex
  clientPk: string;    // hex
  pairedAt: string;
}

export interface AuthToken {
  id: string;
  keyId: string;
  plugin: string;
  actions: string[] | '*';
  limits?: {
    dailyLimit?: number;
    perTx?: number;
    currency?: string;
  };
  expiresAt?: string;
  issuedAt: string;
  /** one-time tokens are deleted after use */
  oneTime: boolean;
}

// ─── Request / Response Types ───

export interface ExecuteRequest {
  plugin: string;
  action: string;
  key: string;
  params: Record<string, unknown>;
}

export interface ExecuteResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
  hint?: string;
  /** Extra info for limit errors */
  limit?: number;
  used?: number;
  currency?: string;
  resetsAt?: string;
}

export interface CapabilityEntry {
  plugin: string;
  actions: Array<{
    name: string;
    description: string;
    riskLevel: string;
    paramsSchema?: Record<string, unknown>;
  }>;
  limits?: {
    dailyLimit?: number;
    perTx?: number;
    remainingDaily?: number;
    currency?: string;
  };
}

export interface CapabilitiesResponse {
  key: string;
  plugins: CapabilityEntry[];
}

// ─── Audit Types ───

export interface AuditEntry {
  id: string;
  timestamp: string;
  source: 'agent' | 'client';
  keyId?: string;
  plugin?: string;
  action?: string;
  params?: Record<string, unknown>;
  result: 'success' | 'denied' | 'error';
  error?: string;
  /** Amount in the limit currency */
  amount?: number;
  currency?: string;
}

// ─── Key Storage Types ───

export type KeyStorageStrategy = 'encrypted-file' | 'split-master' | 'client-held';

export interface EncryptedKeyFile {
  keyId: string;
  type: CredentialType;
  /** AES-256-GCM encrypted payload */
  ciphertext: string;  // base64
  iv: string;          // base64
  tag: string;         // base64
  /** KDF parameters for master key derivation */
  kdf: {
    algorithm: 'argon2id';
    salt: string;       // base64
    memCost: number;
    timeCost: number;
    parallelism: number;
  };
}

// ─── Sandbox Config ───

export interface SandboxConfig {
  socketDir: string;
  pluginDir: string;
  keyDir: string;
  auditDir: string;
  storageStrategy: KeyStorageStrategy;
}

export interface ClientConfig {
  sandboxHost: string;
  clientKeyPath: string;
  channels: ChannelConfig[];
}

export interface ChannelConfig {
  type: string;
  config: Record<string, unknown>;
}
