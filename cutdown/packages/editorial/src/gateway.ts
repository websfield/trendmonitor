/**
 * Provider-neutral editorial LLM gateway (Cutdown Phase 3, decisions.md D-21/D-32).
 *
 * A TypeScript port of `workers/indexer-python/src/model_gateway.py`, mirroring its
 * config surface deliberately so the two planes read as one system. Everything the
 * Python module owns, this owns for the editorial (propose/plan/EDL) stages:
 *
 * 1. **Key hygiene.** The API key is read from `cutdown/.env` (or the process
 *    environment) and nowhere else. It is never a default, never logged, never
 *    written into an artefact, and never included in an error. It lives in a
 *    private field so `JSON.stringify` / `console.log` cannot serialise it, and
 *    `scrub()` strips any `sk-ant-...` shape from every string that leaves here.
 * 2. **Provenance.** Every result carries `provider` and `modelId` so the
 *    artefact's `model-provenance-v1` block records exactly which model produced it.
 * 3. **Structured-output discipline** (D-32). A response that does not parse or
 *    does not validate gets EXACTLY ONE repair retry, then a structured
 *    `ModelSchemaError`. Never a partial write, never a silently coerced result.
 * 4. **Testability without network.** The transport is injected. `NodeHttpsTransport`
 *    is the only code path that touches a socket, and no test constructs it.
 *
 * ## Config surface (mirrors model_gateway.py, editorial ids)
 *
 * | env var                             | default                     | meaning                             |
 * |-------------------------------------|-----------------------------|-------------------------------------|
 * | `ANTHROPIC_API_KEY`                 | (none)                      | credential; absent => degrade/skip  |
 * | `CUTDOWN_MODEL_PROVIDER`            | `anthropic`                 | provider id, recorded per artefact  |
 * | `CUTDOWN_EDITORIAL_MODEL_ID`        | `claude-sonnet-5`           | model id, recorded per artefact     |
 * | `CUTDOWN_MODEL_BASE_URL`           | `https://api.anthropic.com` | endpoint (swap = config)            |
 * | `CUTDOWN_SPEND_CEILING_AUD`         | (none)                      | D-21 owner-set ceiling; absent=skip |
 * | `CUTDOWN_MODEL_TIMEOUT_SECONDS`     | `60`                        | per-call wall clock                 |
 * | `CUTDOWN_EDITORIAL_MAX_OUTPUT_TOKENS` | `4096`                    | per-call output cap                 |
 *
 * `CUTDOWN_SPEND_CEILING_AUD` has NO default on purpose: D-21 records the ceiling
 * as owner-set and not yet set, so an unset ceiling degrades to the skip path
 * rather than silently attempting a paid call.
 */

import { existsSync, readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- provider constants -----------------------------------------------------

export const PROVIDER_ANTHROPIC = 'anthropic';
export const DEFAULT_MODEL_ID = 'claude-sonnet-5';
export const DEFAULT_BASE_URL = 'https://api.anthropic.com';
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
export const DEFAULT_TIMEOUT_SECONDS = 60;

/** Anthropic Messages API version header — a wire constant, not a model version. */
export const ANTHROPIC_VERSION = '2023-06-01';

export const ENV_API_KEY = 'ANTHROPIC_API_KEY';
export const ENV_PROVIDER = 'CUTDOWN_MODEL_PROVIDER';
export const ENV_MODEL_ID = 'CUTDOWN_EDITORIAL_MODEL_ID';
export const ENV_BASE_URL = 'CUTDOWN_MODEL_BASE_URL';
export const ENV_SPEND_CEILING = 'CUTDOWN_SPEND_CEILING_AUD';
export const ENV_TIMEOUT_SECONDS = 'CUTDOWN_MODEL_TIMEOUT_SECONDS';
export const ENV_MAX_OUTPUT_TOKENS = 'CUTDOWN_EDITORIAL_MAX_OUTPUT_TOKENS';

export const CODE_NOT_CONFIGURED = 'MODEL_NOT_CONFIGURED';
export const CODE_SCHEMA_INVALID = 'MODEL_SCHEMA_INVALID';
export const CODE_TRANSPORT = 'MODEL_TRANSPORT_ERROR';

// --- errors -----------------------------------------------------------------

export class GatewayError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

/**
 * No API key, or no D-21 spend ceiling. Not a bug and not a crash: at Phase 0
 * this is the EXPECTED state, and the caller degrades to a clean skip rather
 * than fail the run.
 */
export class ModelNotConfiguredError extends GatewayError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(CODE_NOT_CONFIGURED, message, details);
  }
}

/**
 * The model's output did not conform after the single repair retry. Raised
 * instead of coercing, truncating, or best-effort-parsing: a silently salvaged
 * structured output is indistinguishable from a fabricated one.
 */
export class ModelSchemaError extends GatewayError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(CODE_SCHEMA_INVALID, message, details);
  }
}

/** The provider was unreachable or returned a non-2xx status. */
export class ModelTransportError extends GatewayError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(CODE_TRANSPORT, message, details);
  }
}

// --- secret scrubbing -------------------------------------------------------

const KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]+/g;

/** Remove any credential material from a string bound for a log, error, or artefact. */
export function scrub(text: string, apiKey?: string | null): string {
  let out = text;
  if (apiKey) out = out.split(apiKey).join('***');
  return out.replace(KEY_PATTERN, '***');
}

// --- .env loading -----------------------------------------------------------

/**
 * Parse `cutdown/.env` — the same tiny format model_gateway.py accepts:
 * `KEY=VALUE`, `#` comments, blank lines, optional surrounding quotes, optional
 * `export ` prefix. A missing file is not an error: an unconfigured checkout is
 * the default Phase 0 state and must degrade rather than raise.
 */
export function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const values: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    if (line.startsWith('export ')) line = line.slice('export '.length).trimStart();
    const eq = line.indexOf('=');
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === "'" || value[0] === '"')) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
  }
  return values;
}

/** `.env` wins over the process environment (the file is the documented location, D-21). */
function lookup(env: Record<string, string>, key: string): string | null {
  const value = (env[key] ?? process.env[key] ?? '').trim();
  return value.length > 0 ? value : null;
}

/**
 * The cutdown workspace root, where `.env` lives. Resolved from
 * `CUTDOWN_WORKSPACE_ROOT` when a caller sets it (the skill runtime does), else
 * from this module's location: `packages/editorial/dist/src/gateway.js` -> up four.
 */
export function workspaceRoot(): string {
  const fromEnv = process.env['CUTDOWN_WORKSPACE_ROOT'];
  if (fromEnv) return fromEnv;
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', '..');
}

// --- configuration ----------------------------------------------------------

export interface GatewayConfigFields {
  provider: string;
  modelId: string;
  baseUrl: string;
  maxOutputTokens: number;
  timeoutSeconds: number;
  /** D-21 owner-set ceiling in AUD. `null` = NOT SET, which forces the skip path. */
  spendCeilingAud: number | null;
  apiKey: string | null;
}

/**
 * Everything a model call needs, minus the prompt. `apiKey` is a private field
 * (`#apiKey`): private fields never serialise through `JSON.stringify` and are
 * not shown by `util.inspect`, so a stray log line or error `details` object can
 * never leak the credential. `toJSON()` is defined as belt-and-braces.
 */
export class GatewayConfig {
  readonly provider: string;
  readonly modelId: string;
  readonly baseUrl: string;
  readonly maxOutputTokens: number;
  readonly timeoutSeconds: number;
  readonly spendCeilingAud: number | null;
  readonly #apiKey: string | null;

  constructor(fields: GatewayConfigFields) {
    this.provider = fields.provider;
    this.modelId = fields.modelId;
    this.baseUrl = fields.baseUrl;
    this.maxOutputTokens = fields.maxOutputTokens;
    this.timeoutSeconds = fields.timeoutSeconds;
    this.spendCeilingAud = fields.spendCeilingAud;
    this.#apiKey = fields.apiKey;
  }

  /** For the transport only — the single reader of the raw key. */
  apiKey(): string | null {
    return this.#apiKey;
  }

  get hasApiKey(): boolean {
    return Boolean(this.#apiKey);
  }

  /** A paid call is permitted only with BOTH a key and a spend ceiling. */
  get isEnabled(): boolean {
    return Boolean(this.#apiKey) && this.spendCeilingAud !== null;
  }

  /** Why a call is not permitted, phrased for a caller's skip reason. */
  unconfiguredReason(): string | null {
    if (!this.#apiKey) {
      return `${ENV_API_KEY} is not set in cutdown/.env; the editorial model call is skipped rather than attempting a call`;
    }
    if (this.spendCeilingAud === null) {
      return `${ENV_SPEND_CEILING} is not set; the D-21 spend ceiling is owner-set and not yet configured, so no paid model call is attempted`;
    }
    return null;
  }

  /** Redacted projection, so even an explicit stringify cannot leak the key. */
  toJSON(): Omit<GatewayConfigFields, 'apiKey'> & { apiKey: string | null } {
    return {
      provider: this.provider,
      modelId: this.modelId,
      baseUrl: this.baseUrl,
      maxOutputTokens: this.maxOutputTokens,
      timeoutSeconds: this.timeoutSeconds,
      spendCeilingAud: this.spendCeilingAud,
      apiKey: this.#apiKey ? '***' : null,
    };
  }
}

export interface LoadConfigOptions {
  /** Path to `cutdown/.env`. Defaults to `<workspaceRoot>/.env`. */
  envFile?: string;
  /** Explicit env map for tests, so no real key can reach a test run. Merged over `.env`. */
  environ?: Record<string, string>;
  /** Field overrides applied last. */
  overrides?: Partial<GatewayConfigFields>;
}

function parseIntOr(env: Record<string, string>, key: string, fallback: number): number {
  const raw = lookup(env, key);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ModelNotConfiguredError(`${key} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

/** Build a `GatewayConfig` from `cutdown/.env` plus process env plus explicit overrides. */
export function loadConfig(options: LoadConfigOptions = {}): GatewayConfig {
  const env: Record<string, string> = {};
  const envFile = options.envFile ?? join(workspaceRoot(), '.env');
  Object.assign(env, loadEnvFile(envFile));
  if (options.environ) Object.assign(env, options.environ);

  let ceiling: number | null = null;
  const ceilingRaw = lookup(env, ENV_SPEND_CEILING);
  if (ceilingRaw !== null) {
    const parsed = Number(ceilingRaw);
    if (!Number.isFinite(parsed)) {
      throw new ModelNotConfiguredError(`${ENV_SPEND_CEILING} must be a number, got ${JSON.stringify(ceilingRaw)}`);
    }
    if (parsed <= 0) {
      throw new ModelNotConfiguredError(`${ENV_SPEND_CEILING} must be greater than zero, got ${JSON.stringify(ceilingRaw)}`);
    }
    ceiling = parsed;
  }

  const baseUrl = (lookup(env, ENV_BASE_URL) ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  assertSafeBaseUrl(baseUrl);

  const fields: GatewayConfigFields = {
    provider: lookup(env, ENV_PROVIDER) ?? PROVIDER_ANTHROPIC,
    modelId: lookup(env, ENV_MODEL_ID) ?? DEFAULT_MODEL_ID,
    baseUrl,
    maxOutputTokens: parseIntOr(env, ENV_MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS),
    timeoutSeconds: parseIntOr(env, ENV_TIMEOUT_SECONDS, DEFAULT_TIMEOUT_SECONDS),
    spendCeilingAud: ceiling,
    apiKey: lookup(env, ENV_API_KEY),
  };
  const merged = { ...fields, ...options.overrides };
  if (merged.baseUrl !== baseUrl) assertSafeBaseUrl(merged.baseUrl);
  return new GatewayConfig(merged);
}

/**
 * The base URL is the destination of a key-bearing POST. Allowing `http://` would
 * put the credential on the wire in plaintext because of a one-character `.env`
 * edit, so the scheme is parsed rather than trusted. Parsed, not prefix-matched:
 * `http://localhost.evil.com` would sail through a `startsWith` check.
 */
export function assertSafeBaseUrl(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ModelNotConfiguredError(`${ENV_BASE_URL} is not a valid URL: ${JSON.stringify(baseUrl)}`);
  }
  const loopback = new Set(['localhost', '127.0.0.1', '::1']);
  const ok = parsed.protocol === 'https:' || (parsed.protocol === 'http:' && loopback.has(parsed.hostname));
  if (!ok) {
    throw new ModelNotConfiguredError(
      `${ENV_BASE_URL} must be an https:// URL (or http:// on an exact loopback host); got ${JSON.stringify(baseUrl)}. The API key is sent to this host.`,
    );
  }
}

// --- transport --------------------------------------------------------------

export interface TransportResponse {
  status: number;
  body: string;
}

/**
 * The single seam between this module and the network. Tests supply a fake;
 * `NodeHttpsTransport` is the only implementation that opens a socket, and no
 * test constructs it.
 */
export interface Transport {
  post(url: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<TransportResponse>;
}

/** `POST` over Node's stdlib `node:https` / `node:http` — no SDK, mirroring the Python path. */
export class NodeHttpsTransport implements Transport {
  post(url: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<TransportResponse> {
    return new Promise<TransportResponse>((resolvePromise, rejectPromise) => {
      let target: URL;
      try {
        target = new URL(url);
      } catch (err) {
        rejectPromise(new ModelTransportError(`invalid request URL: ${(err as Error).message}`));
        return;
      }
      const send = target.protocol === 'http:' ? httpRequest : httpsRequest;
      const req = send(target, { method: 'POST', headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolvePromise({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', (err) => rejectPromise(new ModelTransportError(`provider unreachable: ${err.message}`)));
      req.setTimeout(timeoutMs, () => {
        req.destroy(new ModelTransportError(`provider did not respond within ${timeoutMs}ms`));
      });
      req.write(body);
      req.end();
    });
  }
}

// --- gateway ----------------------------------------------------------------

/** Appended verbatim as the repair turn — a constraint, not a vague "try again". */
export const REPAIR_INSTRUCTION =
  'Your previous reply was not valid JSON matching the required shape: {error}. Reply again with ONLY the JSON object, no prose, no markdown fence.';

export type ContentBlock = { type: string; [key: string]: unknown };

/** A validator raises (throws) when the parsed object is wrong; anything it returns is trusted as typed. */
export type Validator<T> = (parsed: unknown) => T;

export interface TokenUsage {
  /** null when the provider returned no usage accounting. */
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface CompleteJsonParams<T> {
  system: string;
  content: readonly ContentBlock[];
  validate: Validator<T>;
  /** Recorded onto the result so it can be written into `model-provenance-v1` later. */
  promptTemplateId?: string;
}

export interface GatewayResult<T> {
  data: T;
  provider: string;
  modelId: string;
  promptTemplateId?: string;
  /** 1 = first attempt validated; 2 = the repair retry was needed. */
  attempts: number;
  usage: TokenUsage;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Concatenate a Messages API response's text blocks. Indexing `content[0].text`
 * blindly breaks the moment a thinking block leads, so typed blocks are filtered.
 */
export function firstText(response: Record<string, unknown>): string {
  const blocks = response['content'];
  if (!Array.isArray(blocks)) {
    throw new ModelSchemaError('provider response has no content array', { keys: Object.keys(response).sort() });
  }
  const parts: string[] = [];
  for (const block of blocks) {
    const rec = asRecord(block);
    if (rec && rec['type'] === 'text' && typeof rec['text'] === 'string') parts.push(rec['text']);
  }
  if (parts.length === 0) throw new ModelSchemaError('provider response contained no text block');
  return parts.join('');
}

/** Tolerate a ```json fence around otherwise-valid JSON. Unwrapping is not coercion — the bytes are still validated. */
export function stripFence(text: string): string {
  let stripped = text.trim();
  if (stripped.startsWith('```')) {
    stripped = stripped.includes('\n') ? stripped.slice(stripped.indexOf('\n') + 1) : '';
    if (stripped.trimEnd().endsWith('```')) {
      stripped = stripped.trimEnd().slice(0, -3);
    }
  }
  return stripped.trim();
}

function readTokens(response: Record<string, unknown>): { input: number | null; output: number | null } {
  const usage = asRecord(response['usage']);
  if (!usage) return { input: null, output: null };
  const input = typeof usage['input_tokens'] === 'number' ? usage['input_tokens'] : null;
  const output = typeof usage['output_tokens'] === 'number' ? usage['output_tokens'] : null;
  return { input, output };
}

/** Provider-neutral, structured-output-only entry point for editorial model calls. */
export class ModelGateway {
  readonly config: GatewayConfig;
  private readonly transport: Transport;

  constructor(config: GatewayConfig, transport?: Transport) {
    this.config = config;
    this.transport = transport ?? new NodeHttpsTransport();
  }

  /**
   * Refuse a live call when not enabled. An EXPECTED skip state (no key or no
   * ceiling), distinct from a runtime failure — callers surface it so recorded
   * fixtures are unaffected but live calls are refused without a ceiling (D-21).
   */
  requireEnabled(): void {
    const reason = this.config.unconfiguredReason();
    if (reason !== null) throw new ModelNotConfiguredError(reason);
  }

  /**
   * One structured-output call, with at most ONE repair retry. `validate` throws
   * when the parsed object is wrong; anything it returns is returned unchanged.
   * Anything it rejects twice raises `ModelSchemaError`. There is no third path —
   * no coercion, no partial result, no `null` a caller might read as "no findings".
   */
  async completeJson<T>(params: CompleteJsonParams<T>): Promise<GatewayResult<T>> {
    this.requireEnabled();
    const key = this.config.apiKey();

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': key ?? '',
      'anthropic-version': ANTHROPIC_VERSION,
    };
    const url = `${this.config.baseUrl}/v1/messages`;

    let messages: Array<Record<string, unknown>> = [{ role: 'user', content: [...params.content] }];
    let lastError = '';
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;

    for (const attempt of [1, 2]) {
      const payload = {
        model: this.config.modelId,
        max_tokens: this.config.maxOutputTokens,
        system: params.system,
        messages,
      };

      const response = await this.transport.post(url, headers, JSON.stringify(payload), this.config.timeoutSeconds * 1000);
      if (response.status < 200 || response.status >= 300) {
        throw new ModelTransportError(`provider returned HTTP ${response.status}`, {
          status: response.status,
          body: scrub(response.body.slice(0, 2000), key),
          provider: this.config.provider,
          modelId: this.config.modelId,
        });
      }

      let parsedResponse: Record<string, unknown>;
      try {
        const value = JSON.parse(response.body) as unknown;
        const rec = asRecord(value);
        if (!rec) throw new ModelSchemaError('provider response was not a JSON object');
        parsedResponse = rec;
      } catch (err) {
        if (err instanceof ModelSchemaError) throw err;
        throw new ModelTransportError(`provider response was not JSON: ${scrub((err as Error).message, key)}`);
      }

      const tokens = readTokens(parsedResponse);
      if (tokens.input !== null) inputTokens = (inputTokens ?? 0) + tokens.input;
      if (tokens.output !== null) outputTokens = (outputTokens ?? 0) + tokens.output;

      const text = firstText(parsedResponse);
      try {
        const data = params.validate(JSON.parse(stripFence(text)) as unknown);
        const result: GatewayResult<T> = {
          data,
          provider: this.config.provider,
          modelId: this.config.modelId,
          attempts: attempt,
          usage: { inputTokens, outputTokens },
        };
        if (params.promptTemplateId !== undefined) result.promptTemplateId = params.promptTemplateId;
        return result;
      } catch (err) {
        lastError = scrub(err instanceof Error ? err.message : String(err), key);
        if (attempt === 2) break;
        messages = [
          ...messages,
          { role: 'assistant', content: [{ type: 'text', text }] },
          { role: 'user', content: [{ type: 'text', text: REPAIR_INSTRUCTION.replace('{error}', lastError) }] },
        ];
      }
    }

    throw new ModelSchemaError('model output failed schema validation after one repair retry', {
      provider: this.config.provider,
      modelId: this.config.modelId,
      attempts: 2,
      validationError: lastError,
    });
  }
}
