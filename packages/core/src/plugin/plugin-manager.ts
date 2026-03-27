/**
 * PluginManager — loads, validates, and executes plugins.
 *
 * Features:
 * - JSON manifest loading (plugin.json)
 * - JSON Schema param validation (per-action schemas/*.json)
 * - CHECKSUM integrity verification at load + before execution
 * - TS + Python runtimes via subprocess
 * - Credential injected via env var (never passed as arg)
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import _Ajv from 'ajv';
const Ajv = _Ajv as unknown as typeof _Ajv.default;
import type { PluginManifest, PluginInfo, PluginAction } from '@keygate/types';

const execFileAsync = promisify(execFile);
const ajv = new Ajv({ allErrors: true, strict: false });

interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string;
  enabled: boolean;
  checksum: string;
  /** Compiled JSON Schema validators per action */
  validators: Map<string, ReturnType<typeof ajv.compile>>;
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
    let entries: string[];
    try {
      entries = await readdir(this.pluginDir);
    } catch {
      return 0;
    }

    for (const dir of entries) {
      const pluginPath = join(this.pluginDir, dir);
      const s = await stat(pluginPath).catch(() => null);
      if (!s?.isDirectory()) continue;

      try {
        await this.loadOne(pluginPath);
      } catch (err) {
        console.warn(`[KeyGate] Failed to load plugin ${dir}:`, err instanceof Error ? err.message : err);
      }
    }

    return this.plugins.size;
  }

  private async loadOne(pluginPath: string): Promise<void> {
    // Try plugin.json first, then plugin.yaml (JSON only for MVP)
    let manifestRaw: string;
    try {
      manifestRaw = await readFile(join(pluginPath, 'plugin.json'), 'utf-8');
    } catch {
      // Fallback: plugin.yaml but parse as JSON
      manifestRaw = await readFile(join(pluginPath, 'plugin.yaml'), 'utf-8');
    }

    const manifest: PluginManifest = JSON.parse(manifestRaw);

    // Validate required fields
    if (!manifest.name || !manifest.version || !manifest.capabilities?.actions) {
      throw new Error(`Invalid manifest: missing name, version, or actions`);
    }

    // Compute checksum over all relevant files
    const checksum = await this.computeChecksum(pluginPath);

    // Load JSON Schema validators for each action
    const validators = new Map<string, ReturnType<typeof ajv.compile>>();
    const allActions = [
      ...(manifest.capabilities.actions ?? []),
      ...(manifest.capabilities.queries ?? []),
    ];

    for (const action of allActions) {
      if (action.paramsSchema) {
        const schemaPath = join(pluginPath, action.paramsSchema);
        try {
          const schemaRaw = await readFile(schemaPath, 'utf-8');
          const schema = JSON.parse(schemaRaw);
          validators.set(action.name, ajv.compile(schema));
        } catch (err) {
          console.warn(`[KeyGate] Failed to load schema for ${manifest.name}/${action.name}:`, err instanceof Error ? err.message : err);
        }
      }
    }

    this.plugins.set(manifest.name, {
      manifest,
      dir: pluginPath,
      enabled: true,
      checksum,
      validators,
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
      installedAt: '',
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
   * Validate params against the action's JSON Schema.
   * Returns null if valid, or error string if invalid.
   */
  validateParams(pluginName: string, actionName: string, params: Record<string, unknown>): string | null {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return 'plugin_not_found';

    const validate = plugin.validators.get(actionName);
    if (!validate) return null; // No schema = no validation

    if (!validate(params)) {
      return ajv.errorsText(validate.errors);
    }
    return null;
  }

  /**
   * Execute a plugin action.
   * Verifies checksum integrity before execution.
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

    // Integrity check: recompute checksum before execution
    const currentChecksum = await this.computeChecksum(plugin.dir);
    if (currentChecksum !== plugin.checksum) {
      throw new Error(
        `Plugin ${pluginName} integrity violation: checksum mismatch ` +
        `(expected ${plugin.checksum}, got ${currentChecksum}). ` +
        `Plugin files may have been tampered with.`
      );
    }

    // Find action definition
    const actionDef = this.findAction(plugin.manifest, action);
    if (!actionDef) {
      throw new Error(`Action ${action} not found in plugin ${pluginName}`);
    }

    // Validate params
    const validationError = this.validateParams(pluginName, action, params);
    if (validationError) {
      throw new Error(`Parameter validation failed: ${validationError}`);
    }

    const scriptPath = join(plugin.dir, actionDef.script);

    if (plugin.manifest.runtime === 'python') {
      return this.executePython(scriptPath, params, credential);
    } else {
      return this.executeTs(scriptPath, params, credential);
    }
  }

  private findAction(manifest: PluginManifest, name: string): PluginAction | undefined {
    return manifest.capabilities.actions.find((a) => a.name === name)
      ?? manifest.capabilities.queries?.find((a) => a.name === name);
  }

  private async executeTs(
    scriptPath: string,
    params: Record<string, unknown>,
    credential: Uint8Array,
  ): Promise<unknown> {
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      KEYGATE_CREDENTIAL: Buffer.from(credential).toString('hex'),
      KEYGATE_PARAMS: JSON.stringify(params),
    };

    // Use npx tsx for ESM + top-level await support
    const { stdout, stderr } = await execFileAsync('npx', ['tsx', scriptPath], {
      env,
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
    });

    if (stderr) {
      console.warn(`[KeyGate] Plugin stderr: ${stderr.slice(0, 500)}`);
    }

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
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      KEYGATE_CREDENTIAL: Buffer.from(credential).toString('hex'),
      KEYGATE_PARAMS: JSON.stringify(params),
    };

    const { stdout, stderr } = await execFileAsync('python3', [scriptPath], {
      env,
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
    });

    if (stderr) {
      console.warn(`[KeyGate] Plugin stderr: ${stderr.slice(0, 500)}`);
    }

    try {
      return JSON.parse(stdout);
    } catch {
      return { raw: stdout.trim() };
    }
  }

  /**
   * Compute SHA-256 checksum over all files in plugin directory.
   * Only includes files (not subdirectories) for deterministic hashing.
   */
  private async computeChecksum(pluginPath: string): Promise<string> {
    const entries = await readdir(pluginPath);
    const hash = createHash('sha256');

    const files: string[] = [];
    for (const entry of entries.sort()) {
      const entryPath = join(pluginPath, entry);
      const s = await stat(entryPath).catch(() => null);
      if (s?.isFile()) files.push(entry);
    }

    for (const file of files) {
      const content = await readFile(join(pluginPath, file));
      hash.update(file);
      hash.update(content);
    }

    return hash.digest('hex').slice(0, 16);
  }
}
