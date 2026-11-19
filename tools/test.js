/**
 * Checks the message encoding against bytes captured from real headphones.
 *
 *     node tools/test.js
 *
 * These are the parts that must not drift: if a checksum or an address is wrong
 * the headphones silently ignore the message, which is painful to debug on
 * hardware. Everything here is verified against a real WAZA-AIR, either from the
 * test vectors in the project brief or from session logs.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = p => fs.readFileSync(path.join(root, 'src', p), 'utf8');

// Load app.js with its data placeholder filled in, then pull out the internals
// we want to exercise. The file guards its own init() behind a document check.
let code = src('app.js').replace('/*__DATA__*/null', src('schema.json'));
code += ';module.exports={dt1,rq1,wrapBle,BleParser,hex,P,addrOf,PARAMS,paramsFor,resetBuffers,get,putRaw,PRESET_IDS,llmPrompt,kindOf,fmt,PATCH_SIZE};';
const mod = { exports: {} };
new Function('module', 'localStorage', code)(mod, { getItem: () => null });
const A = mod.exports;

let failed = 0;
function is(actual, expected, name) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${ok ? '' : `\n      got      ${actual}\n      expected ${expected}`}`);
}

console.log('\nMessage format (vectors confirmed on hardware)');
is(A.hex(A.dt1([0, 1, 0, 0], [0, 1])), 'F0 41 00 00 00 00 6A 12 00 01 00 00 00 01 7E F7', 'select patch 1');
is(A.hex(A.dt1([0x60, 0, 0, 0x30], [1])), 'F0 41 00 00 00 00 6A 12 60 00 00 30 01 6F F7', 'stomp on');
is(A.hex(A.dt1([0x7f, 0, 0, 1], [1])), 'F0 41 00 00 00 00 6A 12 7F 00 00 01 01 7F F7', 'CONNECT 1 of 2');
is(A.hex(A.dt1([0x7f, 0, 0, 2], [0])), 'F0 41 00 00 00 00 6A 12 7F 00 00 02 00 7F F7', 'CONNECT 2 of 2');
is(A.hex(A.rq1([0, 0, 4, 0x20], 10)), 'F0 41 00 00 00 00 6A 11 00 00 04 20 00 00 00 0A 52 F7', 'read 10 bytes of amp state');

console.log('\nParameter addresses (seen in real session logs)');
const addresses = {
  SYS_KNOB_POS_TYPE: '00 00 04 20', SYS_KNOB_POS_GAIN: '00 00 04 21', SYS_KNOB_POS_VOLUME: '00 00 04 22',
  SYS_KNOB_POS_BASS: '00 00 04 23', SYS_KNOB_POS_PRESENCE: '00 00 04 26',
  SYS_KNOB_POS_FX1: '00 00 04 27', SYS_KNOB_POS_FX2: '00 00 04 28', SYS_KNOB_POS_FX3: '00 00 04 29',
  SEND_RETURN_MODE: '60 00 06 56', SEND_RETURN_SW: '60 00 06 55',
  ODDS_SW: '60 00 00 30', FX1_SW: '60 00 01 40', FX2_SW: '60 00 03 4C',
  DLY_SW: '60 00 05 60', DLY2_SW: '60 00 10 4E', REVERB_SW: '60 00 06 10',
  EQ_SW: '60 00 01 30', NS1_SW: '60 00 06 63', SYS_EQ_SW: '00 00 04 32', CHAIN_PTN: '60 00 12 00',
};
for (const id of Object.keys(addresses)) is(A.hex(A.addrOf(A.P[id])), addresses[id], id);

console.log('\nBLE-MIDI framing');
// A SysEx needs its own timestamp byte before the closing F7, and long messages
// must split across 20-byte packets. Without this the headphones ignore everything.
const long = A.dt1([0x60, 0, 0, 0], Array.from({ length: 128 }, (_, i) => i & 0x7f));
let seen = null;
const parser = new A.BleParser(m => { seen = m; });
for (const packet of A.wrapBle(long)) parser.push(packet);
is(A.hex(seen), A.hex(long), 'a 128 byte message survives wrap and parse');
is(A.wrapBle(long).every(p => p.length <= 20), true, 'no packet exceeds the 20 byte default MTU');
is(A.wrapBle(long).length > 1, true, 'a long message is split across packets');

console.log('\nEffect level dials (00 00 04 27-29)');
// The Katana-style shared dials have no control in the UI and are not offered
// to the LLM, but they are still part of the patch, so presets and backups
// must keep carrying them.
for (const n of [1, 2, 3]) is(A.PRESET_IDS.includes('SYS_KNOB_POS_FX' + n), true, `SYS_KNOB_POS_FX${n} is still saved in presets`);
A.resetBuffers(false);
const cat = A.llmPrompt('test');
for (const n of [1, 2, 3]) is(/SYS_KNOB_POS_FX/.test(cat), false, `the LLM catalogue does not offer SYS_KNOB_POS_FX${n}`);
for (const k of ['GAIN', 'BASS', 'MIDDLE', 'TREBLE', 'PRESENCE', 'VOLUME', 'TYPE']) {
  is(A.PRESET_IDS.includes('SYS_KNOB_POS_' + k), true, `the amp's ${k} knob survived the dial removal`);
}

console.log('\nSchema');
is(A.PARAMS.length > 500, true, `${A.PARAMS.length} parameters loaded`);
is(A.PATCH_SIZE, 2335, 'patch size matches Roland\'s map');
is(A.paramsFor('reverb').length > 0, true, 'reverb has parameters');
is(A.kindOf('REVERB_TYPE'), 'select', 'reverb type renders as a list');
is(A.fmt('FX1_LIMITER_RATIO', 11), '5:1', 'Roland\'s own display labels are used');

console.log(failed ? `\n${failed} check(s) failed\n` : '\nAll checks passed\n');
process.exit(failed ? 1 : 0);
