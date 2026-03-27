/**
 * PluginManager — loads, validates, and executes plugins.
 *
 * MVP: TS plugins via dynamic import, Python via subprocess.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PluginManifest, PluginInfo } from '@keygate/types';

const execFileAsync = promisify(execFile);

interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string;
  enabled: boolean;
  checksum: string;
}

export class PluginManager {
  private pluginDir: string;
  private plugins = new Map<string, LoadedPlugin>();

  constructor(pluginDir: string) {
    this.pluginDir = pluginDir;
  }

  get count(): number {
    return this.plugins.size;
  }

  /**
   * Scan plugin directory and load manifests.
   */
  async loadAll(): Promise<number> {
    let dirs: string[];
    try {
      dirs = await readdir(this.pluginDir);
    } catch {
      return 0;
    }

    for (const dir of dirs) {
      const pluginPath = join(this.pluginDir, dir);
      try {
        await this.loadOne(pluginPath);
      } catch (err) {
        console.warn(`[KeyGate] Failed to load plugin ${dir}:`, err);
      }
    }

    return this.plugins.size;
  }

  private async loadOne(pluginPath: string): Promise<void> {
    const manifestRaw = await readFile(join(pluginPath, 'plugin.yaml'), 'utf-8');
    // Simple YAML parser for flat structure (avoid heavy deps)
    const manifest = this.parseSimpleYaml(manifestRaw);

    const checksum = await this.computeChecksum(pluginPath);

    this.plugins.set(manifest.name, {
      manifest,
      dir: pluginPath,
      enabled: true,
      checksum,
    });
  }

  /**
   * Get a loaded plugin by name.
   */
  get(name: string): LoadedPlugin | undefined {
    const p = this.plugins.get(name);
    if (p && p.enabled) return p;
    return undefined;
  }

  /**
   * List all plugins.
   */
  list(): PluginInfo[] {
    return Array.from(this.plugins.values()).map((p) => ({
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      enabled: p.enabled,
      checksum: p.checksum,
      installedAt: '', // TODO
    }));
  }

  /**
   * Toggle plugin enabled/disabled.
   */
  toggle(name: string, enabled: boolean): boolean {
    const p = this.plugins.get(name);
    if (!p) return false;
    p.enabled = enabled;
    return true;
  }

  /**
   * Execute a plugin action.
   * Credential is injected via environment variable.
   */
  async execute(
    pluginName: string,
    action: string,
    params: Record<string, unknown>,
    credential: Uint8Array,
  ): Promise<unknown> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin || !plugin.enabled) {
      throw new Error(`Plugin ${pluginName} not found or disabled`);
    }

    const actionDef = plugin.manifest.capabilities.actions.find((a) => a.name === action)
      ?? plugin.manifest.capabilities.queries?.find((a) => a.name === action);
    if (!actionDef) {
      throw new Error(`Action ${action} not found in plugin ${pluginName}`);
    }

    const scriptPath = join(plugin.dir, actionDef.script);

    if (plugin.manifest.runtime === 'python') {
      return this.executePython(scriptPath, params, credential);
    } else {
      return this.executeTs(scriptPath, params, credential);
    }
  }

  private async executeTs(
    scriptPath: string,
    params: Record<string, unknown>,
    credential: Uint8Array,
  ): Promise<unknown> {
    // Execute TS script via tsx / node
    const env = {
      ...process.env,
      KEYGATE_CREDENTIAL: Buffer.from(credential).toString('hex'),
      KEYGATE_PARAMS: JSON.stringify(params),
    };

    const { stdout } = await execFileAsync('node', ['--import', 'tsx', scriptPath], {
      env,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });

    try {
      return JSON.parse(stdout);
    } catch {
      return { raw: stdout.trim() };
    }
  }

  private async executePython(
    scriptPath: string,
    params: Record<string, unknown>,
    credential: Uint8Array,
  ): Promise<unknown> {
    const env = {
      ...process.env,
      KEYGATE_CREDENTIAL: Buffer.from(credential).toString('hex'),
      KEYGATE_PARAMS: JSON.stringify(params),
    };

    const { stdout } = await execFileAsync('python3', [scriptPath], {
      env,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });

    try {
      return JSON.parse(stdout);
    } catch {
      return { raw: stdout.trim() };
    }
  }

  private async computeChecksum(pluginPath: string): Promise<string> {
    const files = await readdir(pluginPath);
    const hash = createHash('sha256');

    for (const file of files.sort()) {
      const content = await readFile(join(pluginPath, file));
      hash.update(file);
      hash.update(content);
    }

    return hash.digest('hex').slice(0, 16);
  }

  /**
   * Minimal YAML parser for plugin.yaml.
   * Only handles flat key-value and simple nested structures.
   * For MVP — replace with proper parser later.
   */
  private parseSimpleYaml(raw: string): PluginManifest {
    // For MVP, use JSON plugin manifests as alternative
    // Try JSON first
    try {
      return JSON.parse(raw);
    } catch {
      // Fall through to YAML parsing
    }

    // Minimal YAML: just extract top-level string fields
    const lines = raw.split('\n');
    const result: Record<string, unknown> = {};

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        result[key] = value.replace(/^["']|["']$/g, '');
      }
    }

    // Provide defaults for required fields
    return {
      name: (result.name as string) ?? 'unknown',
      version: (result.version as string) ?? '0.0.0',
      description: (result.description as string) ?? '',
      author: (result.author as string) ?? '',
      category: (result.category as PluginManifest['category']) ?? 'other',
      runtime: (result.runtime as PluginManifest['runtime']) ?? 'ts',
      capabilities: { actions: [] },
    };
  }
}
