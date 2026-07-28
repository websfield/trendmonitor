import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { context, trace, type Span, type Tracer } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-node';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import { jobPaths } from './paths.js';

/**
 * Observability bootstrap (tech-spec §13).
 *
 * Traces span a job across CLI → local runner → skill entrypoint → subprocess,
 * with the job id and the skill-invocation ULID as correlation IDs from day one.
 *
 * The Stage A exporter is a FILE exporter — spans land in
 * `project-data/jobs/<id>/traces/`. A real collector is a Stage B concern, and
 * standing one up now would add an operational dependency to a local CLI for no
 * Phase 0 benefit. Writing JSONL keeps the spans greppable and diffable, which
 * is what actually helps while debugging a stuck index run.
 *
 * Context propagation into subprocesses is EXPLICIT: the runner passes
 * `TRACEPARENT` (W3C) via environment and entrypoints adopt it as parent
 * context. There is no automatic propagation across `spawn` — this is the
 * single most commonly assumed-and-absent piece of OTel behaviour.
 */

const SERVICE_NAME = 'cutdown-cli';
const SERVICE_VERSION = '0.1.0';

/** Writes each finished span as one JSON line under the job's `traces/` directory. */
class JobFileSpanExporter implements SpanExporter {
  private readonly file: string;

  constructor(jobId: string) {
    const dir = jobPaths(jobId).traces;
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'spans.jsonl');
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    try {
      const lines = spans.map((span) => {
        const ctx = span.spanContext();
        return JSON.stringify({
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          parentSpanId: span.parentSpanContext?.spanId ?? null,
          name: span.name,
          kind: span.kind,
          startTime: hrToIso(span.startTime),
          endTime: hrToIso(span.endTime),
          durationMs: span.duration[0] * 1000 + span.duration[1] / 1e6,
          status: span.status,
          attributes: span.attributes,
          events: span.events,
        });
      });
      if (lines.length > 0) appendFileSync(this.file, `${lines.join('\n')}\n`, 'utf8');
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      // Telemetry must never take the job down with it. A failed span write is
      // reported to the SDK and otherwise ignored — losing a trace line is an
      // acceptable outcome; losing an indexing run because the traces directory
      // was read-only is not.
      resultCallback({ code: ExportResultCode.FAILED, error: error as Error });
    }
  }

  async shutdown(): Promise<void> {
    /* appendFileSync is synchronous; nothing is buffered. */
  }

  async forceFlush(): Promise<void> {
    /* nothing buffered */
  }
}

function hrToIso(hr: [number, number]): string {
  return new Date(hr[0] * 1000 + hr[1] / 1e6).toISOString();
}

let provider: BasicTracerProvider | null = null;

/** Start tracing for one job. Idempotent per process. */
export function initTracing(jobId: string): Tracer {
  if (!provider) {
    provider = new BasicTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: SERVICE_NAME,
        [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
      }),
      spanProcessors: [new SimpleSpanProcessor(new JobFileSpanExporter(jobId))],
    });
    trace.setGlobalTracerProvider(provider);
  }
  return trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
}

export async function shutdownTracing(): Promise<void> {
  if (provider) {
    await provider.shutdown();
    provider = null;
  }
}

/**
 * Serialise the active span as a W3C `traceparent` header value.
 *
 * This is what gets handed to a child process in the environment. Version `00`,
 * sampled flag `01` — Phase 0 samples everything, because at a handful of local
 * jobs a day there is no cost argument for dropping any of it.
 */
export function currentTraceparent(span?: Span): string | undefined {
  const active = span ?? trace.getSpan(context.active());
  if (!active) return undefined;
  const ctx = active.spanContext();
  if (!ctx.traceId || !ctx.spanId) return undefined;
  return `00-${ctx.traceId}-${ctx.spanId}-01`;
}

/** Run `fn` inside a span, recording failure before rethrowing. */
export async function withSpan<T>(
  tracer: Tracer,
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const span = tracer.startSpan(name, { attributes });
  try {
    return await context.with(trace.setSpan(context.active(), span), () => fn(span));
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({ code: 2, message: (error as Error).message });
    throw error;
  } finally {
    span.end();
  }
}
