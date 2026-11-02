import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/index.js';

const night = '2026-10-28';
const event = {
  at: '2026-10-29T01:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook',
};

describe('night reader', () => {
  let runsDir: string;

  beforeEach(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'rig-reader-'));
  });

  afterEach(async () => {
    await rm(runsDir, { recursive: true, force: true });
  });

  async function writeEvents(events: unknown[]) {
    await writeFile(join(runsDir, `${night}.jsonl`), events.map((value) => JSON.stringify(value)).join('\n'));
  }

  it('reads the real fixture without modifying it: five jobs and one bad line', async () => {
    const result = await readNight(new URL('../runs/', import.meta.url).pathname, night);
    expect(result).toEqual({
      night,
      badLines: 1,
      counts: { ok: 10, retry: 4, fail: 1 },
      rows: [
        {
          job: 'digest/render', owner: null, runs: 1, retries: 0, failures: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, failures: 0,
          lastStatus: 'ok', lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, failures: 0,
          lastStatus: 'ok', lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, failures: 1,
          lastStatus: 'fail', lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, failures: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('distinguishes a missing night from an empty night', async () => {
    expect(await readNight(runsDir, night)).toBeNull();
    await writeEvents([]);
    expect(await readNight(runsDir, night)).toEqual({
      night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts invalid JSON and invalid records while retaining valid null-owner rows', async () => {
    const malformed: unknown[] = [
      null, [], 42, 'event', {}, { ...event, status: 'unknown' },
      { ...event, job: ' ' }, { ...event, owner: undefined }, { ...event, owner: 3 },
      { ...event, error: null }, { ...event, at: 'yesterday' },
      { ...event, at: '2026-02-30T01:00:00Z' },
      { ...event, at: '2026-10-29T24:00:00Z' },
      { ...event, at: '2026-10-29T01:00:00' },
    ];
    await writeEvents([...malformed, { ...event, owner: null }]);
    const path = join(runsDir, `${night}.jsonl`);
    await writeFile(path, '\n{broken\n', { flag: 'a' });
    const result = await readNight(runsDir, night);
    expect(result?.badLines).toBe(malformed.length + 1);
    expect(result?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(result?.rows).toHaveLength(1);
    expect(result?.rows[0].owner).toBeNull();
  });

  it('uses chronological instants across offsets for owner, status, error and time bounds', async () => {
    await writeEvents([
      { ...event, at: '2026-10-29T01:00:00-04:00', owner: null },
      { ...event, at: '2026-10-29T07:00:00+03:00', status: 'retry', error: 'latest error' },
      { ...event, at: '2026-10-29T06:00:00+03:00', status: 'fail', error: 'older error' },
    ]);
    expect((await readNight(runsDir, night))?.rows).toEqual([{
      job: 'lane/sync', owner: null, runs: 3, retries: 1, failures: 1,
      lastStatus: 'ok', lastError: 'latest error',
      firstAt: '2026-10-29T06:00:00+03:00', lastAt: '2026-10-29T01:00:00-04:00',
    }]);
  });

  it('breaks equal-time ties by file order and sorts job names deterministically', async () => {
    await writeEvents([
      { ...event, job: 'z', status: 'fail', error: 'first error' },
      { ...event, job: '__proto__' },
      { ...event, job: 'a' },
      { ...event, job: 'z', status: 'retry', owner: null, error: 'second error' },
    ]);
    const result = await readNight(runsDir, night);
    expect(result?.rows.map(({ job }) => job)).toEqual(['__proto__', 'a', 'z']);
    expect(result?.rows[2]).toMatchObject({
      runs: 2, failures: 1, retries: 1, lastStatus: 'retry', lastError: 'second error', owner: null,
    });
  });

  it('accepts CRLF and a final newline but counts an empty interior record', async () => {
    await writeFile(join(runsDir, `${night}.jsonl`), `${JSON.stringify(event)}\r\n\r\n${JSON.stringify(event)}\r\n`);
    const result = await readNight(runsDir, night);
    expect(result?.badLines).toBe(1);
    expect(result?.rows[0].runs).toBe(2);
  });

  it.each(['../2026-10-28', '/2026-10-28', '2026-02-30', '2026-1-01', '2026-10-28.jsonl', ''])
    ('rejects an invalid or traversing night: %s', async (invalidNight) => {
      expect(await readNight(runsDir, invalidNight)).toBeNull();
    });

  it('does not hide filesystem errors as missing nights', async () => {
    await mkdir(join(runsDir, `${night}.jsonl`));
    await expect(readNight(runsDir, night)).rejects.toMatchObject({ code: 'EISDIR' });
  });
});
