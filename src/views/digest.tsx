import type { DigestResult, DigestRow } from '../digest/types.js';

function missing(value: string | null): string {
  return value ?? '—';
}

function retryCount(row: DigestRow) {
  return row.retries >= 3 ? <strong class="warn">{row.retries}</strong> : row.retries;
}

function failures(row: DigestRow) {
  return row.failures > 0 ? <strong class="warn">{row.failures}</strong> : row.failures;
}

function lastStatus(row: DigestRow) {
  return row.failures > 0 ? <strong class="warn">{row.lastStatus}</strong> : row.lastStatus;
}

export function DigestPage({ digest }: { digest: DigestResult }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      <p>{digest.badLines} malformed {digest.badLines === 1 ? 'line' : 'lines'}</p>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>failures</th>
              <th>last status</th>
              <th>last error</th>
              <th>first time</th>
              <th>last time</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <tr>
                <td>{row.job}</td>
                <td>{missing(row.owner)}</td>
                <td>{row.runs}</td>
                <td>{retryCount(row)}</td>
                <td>{failures(row)}</td>
                <td>{lastStatus(row)}</td>
                <td>{missing(row.lastError)}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
