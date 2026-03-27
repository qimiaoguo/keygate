/**
 * KeyGate API client — wraps HTTP calls to sandbox.
 */

export class KeyGateClient {
  private agentUrl: string;
  private clientUrl: string;

  constructor(opts?: { agentPort?: number; clientPort?: number; host?: string }) {
    const host = opts?.host ?? '127.0.0.1';
    this.agentUrl = `http://${host}:${opts?.agentPort ?? 9800}`;
    this.clientUrl = `http://${host}:${opts?.clientPort ?? 9801}`;
  }

  // ─── Client Endpoints ───

  async unseal(password: string): Promise<{ ok: boolean; unsealed?: number; error?: string }> {
    return this.post(`${this.clientUrl}/client/unseal`, { password });
  }

  async importKey(opts: {
    id: string;
    type: string;
    label: string;
    secret: string;
    password: string;
  }): Promise<{ ok: boolean; key?: { id: string }; error?: string }> {
    return this.post(`${this.clientUrl}/keys/import`, opts);
  }

  async configureKey(opts: {
    keyId: string;
    plugins: Record<string, unknown>;
    globalDailyLimit?: { amount: number; currency: string };
  }): Promise<{ ok: boolean; error?: string }> {
    return this.post(`${this.clientUrl}/keys/configure`, opts);
  }

  async listKeys(): Promise<{ ok: boolean; keys?: unknown[]; error?: string }> {
    return this.get(`${this.clientUrl}/keys/list`);
  }

  async disableKey(keyId: string): Promise<{ ok: boolean; error?: string }> {
    return this.post(`${this.clientUrl}/keys/disable`, { keyId });
  }

  async listPlugins(): Promise<{ ok: boolean; plugins?: unknown[]; error?: string }> {
    return this.get(`${this.clientUrl}/client/plugins`);
  }

  async togglePlugin(name: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
    return this.post(`${this.clientUrl}/client/plugins/toggle`, { name, enabled });
  }

  async issueToken(opts: {
    keyId: string;
    plugin: string;
    actions?: string[];
    limits?: { dailyLimit?: number; perTx?: number; currency?: string };
    expiresIn?: number;
  }): Promise<{ ok: boolean; token?: unknown; error?: string }> {
    return this.post(`${this.clientUrl}/client/tokens/issue`, opts);
  }

  async revokeToken(tokenId: string): Promise<{ ok: boolean; error?: string }> {
    return this.post(`${this.clientUrl}/client/tokens/revoke`, { tokenId });
  }

  async revokeAllTokens(keyId: string): Promise<{ ok: boolean; revoked?: number; error?: string }> {
    return this.post(`${this.clientUrl}/client/tokens/revoke`, { keyId });
  }

  async listTokens(): Promise<{ ok: boolean; tokens?: unknown[]; error?: string }> {
    return this.get(`${this.clientUrl}/client/tokens`);
  }

  async approveOnce(opts: {
    keyId: string;
    plugin: string;
    action: string;
    expiresIn?: number;
  }): Promise<{ ok: boolean; token?: unknown; error?: string }> {
    return this.post(`${this.clientUrl}/client/approve-once`, opts);
  }

  // ─── Agent Endpoints (for testing) ───

  async status(): Promise<{ ok: boolean; sealed: boolean; paired: boolean; pluginCount: number }> {
    return this.get(`${this.agentUrl}/agent/status`);
  }

  async capabilities(keyId: string): Promise<unknown> {
    return this.get(`${this.agentUrl}/agent/capabilities?key=${encodeURIComponent(keyId)}`);
  }

  async execute(opts: {
    plugin: string;
    action: string;
    key: string;
    params: Record<string, unknown>;
  }): Promise<{ ok: boolean; result?: unknown; error?: string }> {
    return this.post(`${this.agentUrl}/agent/execute`, opts);
  }

  // ─── Helpers ───

  private async get(url: string): Promise<any> {
    const resp = await fetch(url);
    return resp.json();
  }

  private async post(url: string, body: unknown): Promise<any> {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return resp.json();
  }
}
