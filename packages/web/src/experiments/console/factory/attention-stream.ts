import { useEffect } from 'react';
import type { components } from '@/lib/api.generated';
import { SSE_BASE_URL } from '../lib/http';
import * as skill from '../skills';
import type { AttentionQueue } from '../skills/runs';
import { invalidate, useEntity, type EntityView } from '../store/cache';
import { K } from '../store/keys';

type StreamLineType = components['schemas']['AttentionStreamLine']['type'];

/** The part of an EventSource the watch uses, so a test can hand in its own. */
export interface AttentionEventSource {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  readonly readyState: number;
  close(): void;
}

/** Bursts (a run resolving several items) refetch once. */
const COALESCE_MS = 250;
const CLOSED = 2;

function lineType(data: string): StreamLineType | undefined {
  try {
    const parsed = JSON.parse(data) as { type?: StreamLineType };
    return parsed.type;
  } catch {
    return undefined;
  }
}

/**
 * Follow a project's attention stream and call `onChange` when its open set may have
 * changed. The list is refetched rather than rebuilt from the lines: the server's list is
 * the one reading of the queue, and the stream only says when to read it again.
 *
 * Every line but `bookmark` counts, the connect snapshot and `ready` included, so an item
 * that opened between the list fetch and the stream connecting is not missed. An `error`
 * line means the server ended the stream on a cursor it can no longer read; reconnecting
 * natively would resend that cursor, so a fresh stream starts instead.
 */
export function watchAttentionStream(
  url: string,
  onChange: () => void,
  open: (url: string) => AttentionEventSource
): () => void {
  let source: AttentionEventSource | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const schedule = (): void => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      onChange();
    }, COALESCE_MS);
  };

  const connect = (): void => {
    const current = open(url);
    source = current;
    current.onmessage = (event): void => {
      const type = lineType(event.data);
      if (type === undefined || type === 'bookmark') return;
      if (type === 'error') {
        current.close();
        if (!stopped) connect();
        return;
      }
      schedule();
    };
    current.onerror = (): void => {
      // EventSource retries a dropped connection itself; only a closed one is final.
      if (current.readyState === CLOSED) console.warn('[console-sse] attention stream closed');
    };
  };

  connect();
  return (): void => {
    stopped = true;
    source?.close();
    if (timer !== undefined) clearTimeout(timer);
  };
}

/**
 * A project's attention queue, kept live. Mounted once per Factory page (by FactoryFrame),
 * so the sub-navigation count and the Needs-you list share one fetch and one stream.
 * The dashboard SSE's `invalidate('runs')` refreshes it too: the key sits under `runs:`.
 */
export function useFactoryAttention(projectId: string): EntityView<AttentionQueue> {
  const key = K.factoryAttention(projectId);
  const view = useEntity<AttentionQueue>(key, () => skill.listAttentionQueue(projectId));
  useEffect(
    () =>
      watchAttentionStream(
        `${SSE_BASE_URL}/api/runs/attention/stream?project=${encodeURIComponent(projectId)}`,
        () => {
          invalidate(key);
          // An ask opening or closing changes a card's pill and stop line on the board.
          invalidate(K.factoryItems(projectId));
        },
        url => new EventSource(url)
      ),
    [projectId, key]
  );
  return view;
}
