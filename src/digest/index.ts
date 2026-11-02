import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DigestResult, DigestRow, ReadNight, RunStatus } from './types.js';

interface RunEvent {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
}

interface JobHistory {
  row: DigestRow;
  firstTime: number;
  lastTime: number;
  lastErrorTime: number;
}

function isNight(night: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return false;
  const date = new Date(`${night}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === night;
}

function isTimestamp(at: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(at);
  return match !== null
    && isNight(match[1])
    && Number(match[2]) < 24
    && Number(match[3]) < 60
    && Number(match[4]) < 60
    && (match[5] === undefined || Number(match[5]) < 24)
    && (match[6] === undefined || Number(match[6]) < 60)
    && Number.isFinite(Date.parse(at));
}

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('at' in value) || typeof value.at !== 'string' || !isTimestamp(value.at)) return null;
  if (!('job' in value) || typeof value.job !== 'string' || value.job.trim() === '') return null;
  if (!('status' in value) || (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail')) return null;
  if (!('owner' in value) || (value.owner !== null && typeof value.owner !== 'string')) return null;
  const error = 'error' in value ? value.error : undefined;
  if (error !== undefined && typeof error !== 'string') return null;
  return {
    at: value.at,
    job: value.job,
    status: value.status,
    owner: value.owner,
    ...(error !== undefined ? { error } : {}),
  };
}

/** Read only the requested night; filesystem failures other than absence propagate. */
export const readNight: ReadNight = async (runsDir, night) => {
  if (!isNight(night)) return null;
  let contents: string;
  try {
    contents = await readFile(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const result: DigestResult = { night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const jobs = new Map<string, JobHistory>();
  // The newline terminating the final record does not create another JSONL record.
  const lines = contents === '' ? [] : contents.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  for (const line of lines) {
    const event = parseEvent(line);
    if (event === null) {
      result.badLines += 1;
      continue;
    }
    result.counts[event.status] += 1;
    const time = Date.parse(event.at);
    let history = jobs.get(event.job);
    if (history === undefined) {
      history = {
        row: {
          job: event.job, owner: event.owner, runs: 0, retries: 0, failures: 0,
          lastStatus: event.status, lastError: null, firstAt: event.at, lastAt: event.at,
        },
        firstTime: time,
        lastTime: time,
        lastErrorTime: -Infinity,
      };
      jobs.set(event.job, history);
    }
    const { row } = history;
    row.runs += 1;
    if (event.status === 'retry') row.retries += 1;
    if (event.status === 'fail') row.failures += 1;
    if (time < history.firstTime) {
      history.firstTime = time;
      row.firstAt = event.at;
    }
    // For equal instants, later file order determines the latest event and error.
    if (time >= history.lastTime) {
      history.lastTime = time;
      row.lastAt = event.at;
      row.lastStatus = event.status;
      row.owner = event.owner;
    }
    if (event.error !== undefined && time >= history.lastErrorTime) {
      history.lastErrorTime = time;
      row.lastError = event.error;
    }
  }

  result.rows = [...jobs.values()].map(({ row }) => row)
    .sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return result;
};
