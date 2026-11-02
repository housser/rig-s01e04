import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const tempDirs: string[] = [];

async function makeRunsDir(): Promise<string> {
  const runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
  tempDirs.push(runsDir);
  return runsDir;
}

function appFor(runsDir: string) {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

async function writeNight(runsDir: string, contents: string): Promise<void> {
  await writeFile(join(runsDir, '2026-10-28.jsonl'), contents, 'utf8');
}

beforeEach(() => {
  tempDirs.length = 0;
});

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('digest routes', () => {
  it('returns sorted JSON rows and renders the same rows in HTML', async () => {
    const runsDir = await makeRunsDir();
    await writeNight(
      runsDir,
      [
        JSON.stringify({ at: '2026-10-28T08:15:00+02:00', job: 'zeta', status: 'retry', owner: 'ops' }),
        JSON.stringify({ at: '2026-10-28T08:20:00+02:00', job: 'zeta', status: 'retry', owner: 'ops' }),
        JSON.stringify({ at: '2026-10-28T08:25:00+02:00', job: 'zeta', status: 'retry', owner: 'ops' }),
        JSON.stringify({ at: '2026-10-28T08:30:00+02:00', job: 'zeta', status: 'fail', owner: 'ops', error: '<script>alert("x")</script>' }),
        JSON.stringify({ at: '2026-10-28T09:00:00-07:00', job: 'zeta', status: 'ok', owner: 'ops' }),
        JSON.stringify({ at: '2026-10-28T09:10:00+02:00', job: 'alpha', status: 'ok', owner: null }),
      ].join('\n'),
    );

    const app = appFor(runsDir);
    const jsonResponse = await app.request('/api/digest/2026-10-28');
    const pageResponse = await app.request('/digest/2026-10-28');
    const json: unknown = await jsonResponse.json();
    const html = await pageResponse.text();

    expect(jsonResponse.status).toBe(200);
    expect(json).toEqual({
      night: '2026-10-28',
      badLines: 0,
      counts: { ok: 2, retry: 3, fail: 1 },
      rows: [
        {
          job: 'alpha', owner: null, runs: 1, retries: 0, failures: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T09:10:00+02:00', lastAt: '2026-10-28T09:10:00+02:00',
        },
        {
          job: 'zeta', owner: 'ops', runs: 5, retries: 3, failures: 1,
          lastStatus: 'ok', lastError: '<script>alert("x")</script>',
          firstAt: '2026-10-28T08:15:00+02:00', lastAt: '2026-10-28T09:00:00-07:00',
        },
      ],
    });
    expect(pageResponse.status).toBe(200);
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('>—</td>');
    expect(html).toContain('<strong class="warn">3</strong>');
    expect(html).toContain('<strong class="warn">1</strong>');
    expect(html).toContain('<strong class="warn">ok</strong>');
    expect(html).toContain('2026-10-28T08:15:00+02:00');
    expect(html).toContain('2026-10-28T09:00:00-07:00');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('returns 404 for a night with no file from both routes', async () => {
    const app = appFor(await makeRunsDir());

    expect((await app.request('/api/digest/2026-10-28')).status).toBe(404);
    expect((await app.request('/digest/2026-10-28')).status).toBe(404);
  });

  it('renders an empty night as nothing ran and returns empty JSON rows', async () => {
    const runsDir = await makeRunsDir();
    await writeNight(runsDir, '');
    const app = appFor(runsDir);

    const jsonResponse = await app.request('/api/digest/2026-10-28');
    const pageResponse = await app.request('/digest/2026-10-28');
    const json: unknown = await jsonResponse.json();
    const html = await pageResponse.text();

    expect(jsonResponse.status).toBe(200);
    expect(json).toEqual({ night: '2026-10-28', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
    expect(pageResponse.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('counts malformed JSON and invalid records while keeping valid rows', async () => {
    const runsDir = await makeRunsDir();
    await writeNight(
      runsDir,
      [
        '{not json',
        JSON.stringify({ at: '2026-10-28T10:00:00Z', job: 'bad-status', status: 'queued', owner: 'ops' }),
        JSON.stringify({ at: '2026-10-28T10:05:00-07:00', job: 'usable', status: 'ok', owner: 'reader' }),
      ].join('\n'),
    );
    const app = appFor(runsDir);

    const jsonResponse = await app.request('/api/digest/2026-10-28');
    const pageResponse = await app.request('/digest/2026-10-28');
    const json: unknown = await jsonResponse.json();
    const html = await pageResponse.text();

    expect(jsonResponse.status).toBe(200);
    expect(json).toEqual({
      night: '2026-10-28',
      badLines: 2,
      counts: { ok: 1, retry: 0, fail: 0 },
      rows: [{
        job: 'usable', owner: 'reader', runs: 1, retries: 0, failures: 0,
        lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-28T10:05:00-07:00', lastAt: '2026-10-28T10:05:00-07:00',
      }],
    });
    expect(pageResponse.status).toBe(200);
    expect(html).toContain('2 malformed lines');
    expect(html).toContain('usable');
  });
});
