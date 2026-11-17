import { expect, test } from 'bun:test';
import { watchAttentionStream, type AttentionEventSource } from './attention-stream';

class FakeSource implements AttentionEventSource {
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 1;
  closed = false;
  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
  send(type: string): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ type, cursor: '1' }) }));
  }
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 300));

function watch(): { sources: FakeSource[]; changes: () => number; stop: () => void } {
  const sources: FakeSource[] = [];
  let changes = 0;
  const stop = watchAttentionStream(
    '/api/runs/attention/stream?project=cb-1',
    () => {
      changes += 1;
    },
    () => {
      const source = new FakeSource();
      sources.push(source);
      return source;
    }
  );
  return { sources, changes: () => changes, stop };
}

test('a burst of lines refetches once, and a bookmark alone refetches nothing', async () => {
  const { sources, changes, stop } = watch();
  const [source] = sources;
  source?.send('attention');
  source?.send('ready');
  await settle();
  expect(changes()).toBe(1);

  source?.send('bookmark');
  await settle();
  expect(changes()).toBe(1);

  source?.send('resolved');
  source?.send('terminal');
  await settle();
  expect(changes()).toBe(2);
  stop();
});

test('a cursor error starts a fresh stream; stopping closes it and drops a pending refetch', async () => {
  const { sources, changes, stop } = watch();
  sources[0]?.send('error');
  expect(sources[0]?.closed).toBe(true);
  expect(sources).toHaveLength(2);

  sources[1]?.send('attention');
  stop();
  await settle();
  expect(sources[1]?.closed).toBe(true);
  expect(changes()).toBe(0);
});
