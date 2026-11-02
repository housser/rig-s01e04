import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const path = process.argv[2];
assert(path, 'Pass the captured HTML path.');
const html = await readFile(path, 'utf8');
assert(html.startsWith('<!doctype html>'), 'Expected a complete HTML document.');
assert(html.includes('<style>'), 'The stylesheet must be inline.');
assert(!/<script\b/i.test(html), 'A preview must not contain client JavaScript.');
assert(!/<link\b/i.test(html), 'A preview must not require external stylesheets.');
assert(html.includes('digest · 2026-10-28'), 'Expected the sample night.');
assert(html.includes('1 malformed line'), 'Expected the fixture bad-line count.');
assert(html.includes('digest/render'), 'The job with a null owner must remain visible.');
const marker = process.env.LANE_MARKER?.trim();
if (marker) {
  assert(html.includes(`<span class="marker">${marker}</span>`), 'Expected the lane banner.');
} else {
  assert(html.includes('no marker set'), 'Expected a clean lane banner.');
}
console.log('Captured preview passed its content checks.');
