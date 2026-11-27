import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/delivery-countdown.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const m = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const accepted = '2026-11-27T10:00:00.000Z';
const at = (seconds, offset = 0) => m.computeCountdown(accepted, Date.parse(accepted) + seconds * 1000, offset);

// Phases and boundaries
assert.equal(at(0).remainingSeconds, 2700);
assert.equal(at(0).phase, 'ok');
assert.equal(at(2099).phase, 'ok');           // 10:01 left
assert.equal(at(2100).phase, 'warn');         // exactly 10:00 left
assert.equal(at(2699).remainingSeconds, 1);
assert.equal(at(2699).phase, 'warn');
assert.equal(at(2700).phase, 'late');         // the clock never shows 00:00 as a normal state
assert.equal(at(2700).remainingSeconds, 0);
// Never negative, never stuck: hours past the deadline stays late and parks before the door
assert.equal(at(99999).remainingSeconds, 0);
assert.equal(at(99999).phase, 'late');
assert.ok(at(99999).progress < 1);
// Progress grows with time
assert.ok(at(1350).progress > 0.49 && at(1350).progress < 0.51);
// A phone clock behind/ahead of the server must not change the result
assert.equal(at(600, 0).remainingSeconds, at(600 + 3600, -3600 * 1000).remainingSeconds);
assert.equal(at(600, 0).remainingSeconds, at(600 - 120, 120 * 1000).remainingSeconds);
// accepted_at slightly in the future (clock error) clamps to the full window instead of exceeding it
assert.equal(at(-30).remainingSeconds, 2700);
// Missing or invalid timestamps give no countdown (the app falls back to the plain banner)
assert.equal(m.computeCountdown(null, Date.now()), null);
assert.equal(m.computeCountdown(undefined, Date.now()), null);
assert.equal(m.computeCountdown('not a date', Date.now()), null);
// ETA = accepted + 45 min, in server time translated to the phone clock
assert.equal(at(0, 5000).etaMs, Date.parse(accepted) + 2700 * 1000 - 5000);

// Which statuses show the countdown
for (const status of ['accepted', 'assigned', 'shopping', 'awaiting_approval', 'purchased', 'delivering']) assert.equal(m.hasCountdown(status, accepted), true, status);
for (const status of ['requested', 'quoted', 'searching', 'delivered', 'settled', 'cancelled', 'disputed']) assert.equal(m.hasCountdown(status, accepted), false, status);
assert.equal(m.hasCountdown('shopping', null), false);

// Formatting
assert.deepEqual(m.formatClock(38 * 60 + 12), { minutes: '٣٨', seconds: '١٢' });
assert.deepEqual(m.formatClock(0), { minutes: '٠٠', seconds: '٠٠' });
assert.deepEqual(m.formatClock(-5), { minutes: '٠٠', seconds: '٠٠' });
assert.equal(m.toArabicDigits('07:40'), '٠٧:٤٠');
assert.match(m.formatEta(new Date(2026, 10, 27, 19, 58).getTime()), /^٧:٥٨ م$/);
assert.match(m.formatEta(new Date(2026, 10, 27, 0, 5).getTime()), /^١٢:٠٥ ص$/);

// Server clock estimate (symmetrical round trip)
assert.equal(m.estimateServerOffset('2026-11-27T10:00:10.000Z', Date.parse('2026-11-27T10:00:00.000Z'), Date.parse('2026-11-27T10:00:00.400Z')), 9800);
assert.equal(m.estimateServerOffset('garbage', 1, 2), null);
assert.equal(m.estimateServerOffset('2026-11-27T10:00:10.000Z', 5, 1), null);

// Migration: acceptance time is written by the accept function, reset on cancel, and the clock RPC is locked to signed-in users
const sql = await readFile(new URL('../../../supabase/migrations/20261127100000_order_accepted_at.sql', import.meta.url), 'utf8');
assert.match(sql, /add column if not exists accepted_at timestamptz/);
assert.match(sql, /status='accepted',driver_id=v_driver_id,accepted_at=now\(\)/);
assert.match(sql, /event_type = 'driver_accepted'/);
assert.match(sql, /revoke all on function public\.server_now\(\) from public, anon/);
assert.match(sql, /grant execute on function public\.server_now\(\) to authenticated/);
assert.match(sql, /new\.accepted_at := null/);
console.log('delivery countdown tests passed');
