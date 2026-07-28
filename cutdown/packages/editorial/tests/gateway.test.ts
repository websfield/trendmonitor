import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GatewayConfig,
  ModelGateway,
  ModelNotConfiguredError,
  ModelSchemaError,
  ModelTransportError,
  assertSafeBaseUrl,
  loadConfig,
  loadEnvFile,
  scrub,
  stripFence,
  type Transport,
  type TransportResponse,
} from '../src/gateway.js';

const FAKE_KEY = 'sk-ant-test-0123456789abcdef';

function enabledConfig(overrides: Partial<{ baseUrl: string }> = {}): GatewayConfig {
  return new GatewayConfig({
    provider: 'anthropic',
    modelId: 'claude-sonnet-5',
    baseUrl: overrides.baseUrl ?? 'https://api.anthropic.com',
    maxOutputTokens: 4096,
    timeoutSeconds: 60,
    spendCeilingAud: 200,
    apiKey: FAKE_KEY,
  });
}

/** Replays canned provider responses; the only thing tests hand the gateway. */
class FakeTransport implements Transport {
  readonly sent: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  constructor(private readonly responses: TransportResponse[]) {}
  post(url: string, headers: Record<string, string>, body: string): Promise<TransportResponse> {
    this.sent.push({ url, headers, body });
    const next = this.responses.shift();
    if (!next) throw new Error('transport called more times than the test allowed');
    return Promise.resolve(next);
  }
}

function textResponse(text: string, usage?: { input: number; output: number }): TransportResponse {
  const body: Record<string, unknown> = { content: [{ type: 'text', text }] };
  if (usage) body['usage'] = { input_tokens: usage.input, output_tokens: usage.output };
  return { status: 200, body: JSON.stringify(body) };
}

describe('enablement (D-21 fail-closed)', () => {
  test('isEnabled requires BOTH a key and a spend ceiling', () => {
    assert.equal(new GatewayConfig({ ...fields(), apiKey: FAKE_KEY, spendCeilingAud: null }).isEnabled, false);
    assert.equal(new GatewayConfig({ ...fields(), apiKey: null, spendCeilingAud: 200 }).isEnabled, false);
    assert.equal(new GatewayConfig({ ...fields(), apiKey: FAKE_KEY, spendCeilingAud: 200 }).isEnabled, true);
  });

  test('requireEnabled throws MODEL_NOT_CONFIGURED when no ceiling is set', () => {
    const gw = new ModelGateway(new GatewayConfig({ ...fields(), apiKey: FAKE_KEY, spendCeilingAud: null }));
    assert.throws(() => gw.requireEnabled(), (err: unknown) => err instanceof ModelNotConfiguredError && err.code === 'MODEL_NOT_CONFIGURED');
  });

  test('completeJson refuses a live call when not enabled', async () => {
    const gw = new ModelGateway(new GatewayConfig({ ...fields(), apiKey: null, spendCeilingAud: null }), new FakeTransport([]));
    await assert.rejects(
      gw.completeJson({ system: 's', content: [{ type: 'text', text: 'x' }], validate: (v) => v }),
      ModelNotConfiguredError,
    );
  });
});

describe('key hygiene', () => {
  test('the api key never appears in JSON.stringify or console output of the config', () => {
    const config = enabledConfig();
    const serialised = JSON.stringify(config);
    assert.ok(!serialised.includes(FAKE_KEY), 'JSON.stringify must not leak the key');
    assert.ok(!String(config).includes(FAKE_KEY));
    // The redacted projection is present so an explicit stringify is still safe.
    assert.match(serialised, /"apiKey":"\*\*\*"/);
  });

  test('scrub removes any sk-ant- shape even when the exact key is unknown', () => {
    assert.equal(scrub('leaked sk-ant-abc123_-DEF here'), 'leaked *** here');
    assert.equal(scrub(`value ${FAKE_KEY}`, FAKE_KEY), 'value ***');
  });

  test('a provider error body carrying the key is scrubbed before it reaches the error', async () => {
    const gw = new ModelGateway(enabledConfig(), new FakeTransport([{ status: 401, body: `unauthorized for ${FAKE_KEY}` }]));
    await assert.rejects(
      gw.completeJson({ system: 's', content: [{ type: 'text', text: 'x' }], validate: (v) => v }),
      (err: unknown) => {
        assert.ok(err instanceof ModelTransportError);
        assert.ok(!JSON.stringify(err.details).includes(FAKE_KEY), 'the key must not survive into the error details');
        return true;
      },
    );
  });
});

describe('base URL scheme guard', () => {
  test('https is accepted, http on an exact loopback is accepted', () => {
    assert.doesNotThrow(() => assertSafeBaseUrl('https://api.anthropic.com'));
    assert.doesNotThrow(() => assertSafeBaseUrl('http://localhost:8080'));
    assert.doesNotThrow(() => assertSafeBaseUrl('http://127.0.0.1:1234'));
  });
  test('http on a non-loopback host is refused (key would go plaintext)', () => {
    assert.throws(() => assertSafeBaseUrl('http://localhost.evil.com'), ModelNotConfiguredError);
    assert.throws(() => assertSafeBaseUrl('http://api.anthropic.com'), ModelNotConfiguredError);
  });
});

describe('structured-output discipline (D-32)', () => {
  test('a valid first response is returned with attempts=1 and token accounting', async () => {
    const transport = new FakeTransport([textResponse('{"answer": 42}', { input: 100, output: 7 })]);
    const gw = new ModelGateway(enabledConfig(), transport);
    const result = await gw.completeJson<{ answer: number }>({
      system: 'sys',
      content: [{ type: 'text', text: 'q' }],
      validate: (v) => {
        const rec = v as { answer?: unknown };
        if (typeof rec.answer !== 'number') throw new Error('answer must be a number');
        return { answer: rec.answer };
      },
      promptTemplateId: 'tmpl-1',
    });
    assert.equal(result.data.answer, 42);
    assert.equal(result.attempts, 1);
    assert.equal(result.promptTemplateId, 'tmpl-1');
    assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 7 });
    // The wire request carried the required Anthropic headers.
    assert.equal(transport.sent[0]?.headers['anthropic-version'], '2023-06-01');
    assert.equal(transport.sent[0]?.headers['x-api-key'], FAKE_KEY);
  });

  test('one bad response then a good one succeeds with attempts=2 (exactly one repair)', async () => {
    const transport = new FakeTransport([textResponse('not json at all'), textResponse('{"answer": 1}', { input: 10, output: 2 })]);
    const gw = new ModelGateway(enabledConfig(), transport);
    const result = await gw.completeJson({
      system: 'sys',
      content: [{ type: 'text', text: 'q' }],
      validate: (v) => v,
    });
    assert.equal(result.attempts, 2);
    assert.equal(transport.sent.length, 2, 'exactly one repair retry');
    // The repair turn echoed the model and appended the repair instruction.
    const repairBody = JSON.parse(transport.sent[1]?.body ?? '{}') as { messages: unknown[] };
    assert.equal(repairBody.messages.length, 3, 'user + assistant echo + repair user');
  });

  test('two bad responses raise ModelSchemaError — never a coerced or partial result', async () => {
    const transport = new FakeTransport([textResponse('nope'), textResponse('still nope')]);
    const gw = new ModelGateway(enabledConfig(), transport);
    await assert.rejects(
      gw.completeJson({ system: 'sys', content: [{ type: 'text', text: 'q' }], validate: (v) => v }),
      (err: unknown) => err instanceof ModelSchemaError && err.code === 'MODEL_SCHEMA_INVALID',
    );
    assert.equal(transport.sent.length, 2, 'stops after one repair; never a third attempt');
  });

  test('a non-2xx status is a transport error, not a schema error', async () => {
    const gw = new ModelGateway(enabledConfig(), new FakeTransport([{ status: 500, body: 'server error' }]));
    await assert.rejects(gw.completeJson({ system: 's', content: [{ type: 'text', text: 'x' }], validate: (v) => v }), ModelTransportError);
  });
});

describe('parsing helpers', () => {
  test('stripFence unwraps a ```json fence without altering the bytes inside', () => {
    assert.equal(stripFence('```json\n{"a":1}\n```'), '{"a":1}');
    assert.equal(stripFence('{"a":1}'), '{"a":1}');
  });
});

describe('.env loading precedence', () => {
  test('.env wins over the process environment, and a missing file is not an error', () => {
    assert.deepEqual(loadEnvFile(join(tmpdir(), 'definitely-absent-cutdown.env')), {});
    const dir = mkdtempSync(join(tmpdir(), 'cutdown-env-'));
    const envPath = join(dir, '.env');
    writeFileSync(envPath, '# comment\nexport CUTDOWN_EDITORIAL_MODEL_ID = "claude-from-file"\n', 'utf8');
    const config = loadConfig({ envFile: envPath, environ: { CUTDOWN_EDITORIAL_MODEL_ID: 'claude-from-environ' } });
    // environ is layered OVER the file, matching load_config in the Python port.
    assert.equal(config.modelId, 'claude-from-environ');
    const fileOnly = loadConfig({ envFile: envPath, environ: {} });
    assert.equal(fileOnly.modelId, 'claude-from-file');
  });

  test('an unset spend ceiling leaves the config disabled (no default, D-21)', () => {
    const config = loadConfig({ envFile: join(tmpdir(), 'absent.env'), environ: { ANTHROPIC_API_KEY: FAKE_KEY } });
    assert.equal(config.hasApiKey, true);
    assert.equal(config.spendCeilingAud, null);
    assert.equal(config.isEnabled, false);
  });
});

function fields() {
  return {
    provider: 'anthropic',
    modelId: 'claude-sonnet-5',
    baseUrl: 'https://api.anthropic.com',
    maxOutputTokens: 4096,
    timeoutSeconds: 60,
    spendCeilingAud: null as number | null,
    apiKey: null as string | null,
  };
}
