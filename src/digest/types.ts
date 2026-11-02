export type RunStatus = 'ok' | 'retry' | 'fail';

export interface DigestRow {
  job: string;
  /** Owner from the latest event; missing owners remain null. */
  owner: string | null;
  /** Number of valid events for the job, including retries and failures. */
  runs: number;
  retries: number;
  failures: number;
  lastStatus: RunStatus;
  /** Most recent recorded error, even if a later event succeeds. */
  lastError: string | null;
  /** Chronological bounds, retaining each event's original timestamp offset. */
  firstAt: string;
  lastAt: string;
}

export interface DigestResult {
  night: string;
  /** Sorted ascending by job, using code-point string comparison. */
  rows: DigestRow[];
  badLines: number;
  /** Valid event counts, not counts of jobs' final statuses. */
  counts: Record<RunStatus, number>;
}

/**
 * Implemented as readNight in src/digest/index.ts.
 * Missing files and invalid YYYY-MM-DD nights return null; an empty file returns
 * a result with no rows and zero counts. Other filesystem errors reject.
 */
export type ReadNight = (
  runsDir: string,
  night: string,
) => Promise<DigestResult | null>;
