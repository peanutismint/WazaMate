'use strict';
/* WazaMate v0.14. Parameter data below is generated from Roland's own editor files (BTS for WAZA-AIR 1.3.0). */
const DATA = /*__DATA__*/null;
const PARAMS = DATA.params.filter(p => p.scope !== 'ev1wl');
const LABELS = DATA.labels;
const P = Object.fromEntries(PARAMS.map(p => [p.id, p]));
const lin = w => ((w >> 8) & 0x7f) * 128 + (w & 0x7f);
const PATCH_SIZE = lin(0x121e) + 1;
const SIZE = { patch: PATCH_SIZE, system: 1024 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hex = a => Array.from(a).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) { if (k === 'class') e.className = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); }
  for (const k of kids.flat()) if (k != null) e.append(k);
  return e;
}

/* ------------------------------------------------------------ verification status */
// Hardware-tested by Jon on 2026-11-13 (project brief, section 4).
const VERIFIED = new Set(['SYS_KNOB_POS_TYPE', 'SYS_KNOB_POS_GAIN', 'SYS_KNOB_POS_VOLUME', 'SYS_KNOB_POS_BASS', 'SYS_KNOB_POS_MIDDLE',
  'SYS_KNOB_POS_TREBLE', 'SYS_KNOB_POS_PRESENCE', 'SEND_RETURN_MODE', 'SEND_RETURN_SW', 'ODDS_SW', 'DLY2_SW', 'NS1_SW']);
// Sent in the same test but did not behave as labelled (brief, section 5).
const FLAGGED = {
  FX1_SW: 'In your pedal test this made the volume jump up and down.',
  FX2_SW: 'In your pedal test this switched on a chorus-like effect.',
  DLY_SW: 'In your pedal test nothing was audible.',
  REVERB_SW: 'In your pedal test nothing was audible.',
  EQ_SW: 'In your pedal test nothing was audible.',
  SYS_EQ_SW: 'In your pedal test nothing was audible.',
  FXBTN: 'In your pedal test nothing was audible.',
};
let marks = {};
try { marks = JSON.parse(localStorage.getItem('wazamate.marks') || '{}'); } catch (e) { }
const statusOf = id => marks[id] || (VERIFIED.has(id) ? 'ok' : FLAGGED[id] ? 'flag' : 'untested');
function statusTitle(id) {
  const s = statusOf(id), a = P[id] ? ' Address ' + hex(addrOf(P[id])) + '.' : '';
  const t = marks[id] ? (s === 'ok' ? 'You marked this as working.' : 'You marked this as not working.')
    : s === 'ok' ? 'Tested on your headphones.' : s === 'flag' ? FLAGGED[id] : "From Roland's address map, not yet tested on your headphones.";
  return t + a + ' Click to change your mark.';
}
function dotEl(id) {
  const d = h('button', { class: 'dot', type: 'button', 'data-st': statusOf(id), title: statusTitle(id), 'aria-label': 'Test status' });
  d.addEventListener('pointerdown', e => e.stopPropagation());
  d.addEventListener('click', e => {
    e.stopPropagation(); e.preventDefault();
    const cur = marks[id];
    if (!cur) marks[id] = 'ok'; else if (cur === 'ok') marks[id] = 'bad'; else delete marks[id];
    try { localStorage.setItem('wazamate.marks', JSON.stringify(marks)); } catch (err) { }
    render();
  });
  return d;
}

/* ------------------------------------------------------------ state: byte buffers mirror the headphones */
const buf = { patch: new Uint8Array(SIZE.patch), system: new Uint8Array(SIZE.system) };
const owner = { patch: new Array(SIZE.patch), system: new Array(SIZE.system) };
for (const p of PARAMS) { const o = lin(p.addr); for (let k = 0; k < p.bytes; k++) owner[p.scope][o + k] = p.id; }
const state = { fails: 0, battery: null, bpm: null, div: {}, preset: null, tools: false, head: null, patch: 1, names: [], sel: 'amp', test: false, muted: false, sync: 'preview', progress: 0 };
function putRaw(p, raw) { const o = lin(p.addr), b = buf[p.scope]; if (p.bytes === 2) { b[o] = (raw >> 7) & 0x7f; b[o + 1] = raw & 0x7f; } else b[o] = raw & 0x7f; }
function rawOf(p) { const o = lin(p.addr), b = buf[p.scope]; return p.bytes === 2 ? (b[o] << 7) | b[o + 1] : b[o]; }
const get = id => rawOf(P[id]) - P[id].ofs;
function addrOf(p) { const o = lin(p.addr); return [p.scope === 'patch' ? 0x60 : 0x00, 0x00, (o >> 7) & 0x7f, o & 0x7f]; }
function resetBuffers(preview) {
  buf.patch.fill(0); buf.system.fill(0);
  for (const p of PARAMS) {
    if (p.bytes === 16) { for (let i = 0; i < 16; i++) buf.patch[i] = String(p.init).charCodeAt(i) || 32; }
    else putRaw(p, Number(p.init) + p.ofs);
  }
  if (preview) { // a few things switched on so the preview is not all grey
    for (const [id, v] of [['ODDS_SW', 1], ['DLY_SW', 1], ['REVERB_SW', 1], ['NS1_SW', 1], ['SYS_KNOB_POS_FX1', 17], ['SYS_KNOB_POS_FX2', 17],
      ['SYS_KNOB_POS_FX3', 21], ['SYS_LED_STATE_FX1', 1], ['SYS_LED_STATE_FX2', 2], ['SYS_LED_STATE_FX3', 1], ['SYS_FXSEL_STATE_FX1', 1], ['SYS_FXSEL_STATE_FX2', 1], ['SYS_FXSEL_STATE_FX3', 1], ['SEND_RETURN_MODE', 1]]) putRaw(P[id], v);
  }
}
const patchName = () => String.fromCharCode(...buf.patch.slice(0, 16)).replace(/[^\x20-\x7e]/g, '').trim();

/* ------------------------------------------------------------ Roland SysEx + BLE MIDI (verified format, brief sections 2 and 6) */
function checksum(body) { let s = 0; for (const b of body) s = (s + b) & 0x7f; return (128 - s) & 0x7f; }
function dt1(addr, data) { const body = [...addr, ...data]; return [0xF0, 0x41, 0x00, 0x00, 0x00, 0x00, 0x6A, 0x12, ...body, checksum(body), 0xF7]; }
function rq1(addr, size) { const body = [...addr, (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]; return [0xF0, 0x41, 0x00, 0x00, 0x00, 0x00, 0x6A, 0x11, ...body, checksum(body), 0xF7]; }
const abs = a => (a[0] << 21) | (a[1] << 14) | (a[2] << 7) | a[3];
const unabs = n => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
function wrapBle(midi, max = 20) {
  const t = Date.now() & 0x1fff, header = 0x80 | ((t >> 7) & 0x3f), stamp = 0x80 | (t & 0x7f);
  const sysex = midi[0] === 0xF0 && midi[midi.length - 1] === 0xF7;
  const body = sysex ? midi.slice(0, -1) : midi, out = []; let pkt = [header, stamp];
  for (const b of body) { if (pkt.length >= max) { out.push(pkt); pkt = [header]; } pkt.push(b); }
  if (sysex) { if (pkt.length + 2 > max) { out.push(pkt); pkt = [header]; } pkt.push(stamp, 0xF7); } // timestamp before F7: without it the headphones ignore the message
  out.push(pkt);
  return out.map(p => Uint8Array.from(p));
}
class BleParser {
  constructor(cb) { this.cb = cb; this.sx = null; }
  push(d) {
    let i = 1;
    while (i < d.length) {
      const b = d[i];
      if (this.sx) {
        if (b & 0x80) { if (d[i + 1] === 0xF7) { i++; continue; } if (b === 0xF7) { this.sx.push(b); this.cb(this.sx); this.sx = null; } i++; continue; }
        this.sx.push(b); i++; continue;
      }
      if (b === 0xF0) { this.sx = [b]; i++; continue; }
      i++;
    }
  }
}
const SVC = '03b80e5a-ede8-4b33-a751-6ce34ec4c700', CHR = '7772e5db-3868-4112-a1a9-f2669d106bf3';
const link = { dev: null, chr: null, connected: false, reads: false, chain: Promise.resolve(), pending: new Map(), flushing: false, readers: [], lastRx: 0 };
const logs = [];
function log(cls, bytes, text) {
  const t = new Date(); const ts = t.toTimeString().slice(0, 8) + '.' + String(t.getMilliseconds()).padStart(3, '0');
  logs.push({ cls, line: `${ts} ${cls === 'tx' ? 'TX' : cls === 'rx' ? 'RX' : cls === 'pv' ? '--' : '!!'}  ${bytes && bytes.length ? hex(bytes) + '  ' : ''}${text || ''}` });
  if (logs.length > 400) logs.shift();
  scheduleLog();
}
function tx(bytes, text, ack) { // serialised, paced sends. ack = ask the headphones to confirm delivery, so a refused write shows up as an error
  const job = link.chain.then(async () => {
    if (!link.connected) { log('pv', bytes, text + ' (preview, not sent)'); return true; }
    log('tx', bytes, text + (ack ? ' (confirmed write)' : ''));
    const pk = wrapBle(bytes);
    for (const p of pk) { if (ack && link.chr.writeValueWithResponse) await link.chr.writeValueWithResponse(p); else await link.chr.writeValueWithoutResponse(p); if (pk.length > 1) await sleep(8); }
    await sleep(20);
    return true;
  });
  link.chain = job.catch(e => { log('er', null, 'Send failed: ' + (e && e.message || e)); return false; });
  return link.chain;
}
function write(addr, data, text) { // coalesced: the newest value for an address wins
  link.pending.set(hex(addr), { addr, data, text });
  if (link.flushing) return;
  link.flushing = true;
  (async () => {
    await sleep(0);
    while (link.pending.size) { const [k, w] = link.pending.entries().next().value; link.pending.delete(k); await tx(dt1(w.addr, w.data), w.text); if (!link.connected) await sleep(60); }
    link.flushing = false;
  })();
}
function read(addr, size, ms = 1500) { // resolves with bytes, or null when the headphones do not answer in time
  if (!link.connected) return Promise.resolve(null);
  return new Promise(resolve => {
    const r = { start: abs(addr), size, got: new Uint8Array(size), mask: new Uint8Array(size), n: 0 };
    r.done = v => { if (r.fin) return; r.fin = true; clearTimeout(r.timer); clearTimeout(r.quiet); link.readers.splice(link.readers.indexOf(r), 1); resolve(v); };
    link.readers.push(r);
    tx(rq1(addr, size), 'Read ' + size + ' byte' + (size > 1 ? 's' : '')).then(() => { r.timer = setTimeout(() => r.done(null), ms); });
  });
}
// Edit-buffer addresses the headphones report that are missing from Roland's map (observed 2026-11-14)
// Reading 7F 00 05 02 directly gets no answer (confirmed 2026-11-16). Roland's app lists a
// matching running mode, batteryState = 3, alongside monoTuner = 1, so the headphones probably
// only report these while in that mode. probeModes() tests both.
const BATTERY_ADDR = [0x7F, 0x00, 0x05, 0x02];
const RUNNING_MODE = [0x7F, 0x00, 0x00, 0x02];
const SEEN = { 0x51: 'amp type as stored in the patch', 0x52: 'amp gain as stored in the patch', 0x54: 'amp bass as stored in the patch', 0x58: 'amp volume as stored in the patch' };
function onMidi(m) {
  link.lastRx = Date.now();
  if (m[1] === 0x7E && m[3] === 0x06 && m[4] === 0x02) { log('rx', m, 'Identity reply'); return; }
  if (m[1] !== 0x41 || m.length < 15 || m[7] !== 0x12) { log('rx', m, 'Unrecognised message'); return; }
  const body = m.slice(8, -2), addr = body.slice(0, 4), data = body.slice(4), ok = checksum(body) === m[m.length - 2];
  const o = (addr[2] << 7) | addr[3];
  if (ok && addr[0] === 0x7F && addr[1] === 0 && addr[2] === 6 && addr[3] === 0) { // head tracking stream: 0-119, 3 degrees a step (seen on hardware, not in Roland's map)
    if (state.head == null) log('rx', m, 'Head tracking angle. Further ones are not logged.');
    state.head = data[0]; (R.__head || []).forEach(f => f()); return;
  }
  const name = addr[0] === 0x60 && SEEN[o] ? SEEN[o] : addr[0] === 0x60 ? owner.patch[o] : addr[0] === 0 && addr[1] === 0 ? owner.system[o] : addr[0] === 0 && addr[1] === 1 ? 'current patch' : '';
  log(ok ? 'rx' : 'er', data.length > 24 ? m.slice(0, 20) : m, (data.length > 24 ? '... ' + data.length + ' data bytes ' : '') + (name || '') + (ok ? '' : ' BAD CHECKSUM'));
  if (!ok) return;
  applyIncoming(addr, data);
  const a0 = abs(addr);
  for (const r of [...link.readers]) {
    for (let i = 0; i < data.length; i++) { const k = a0 + i - r.start; if (k >= 0 && k < r.size && !r.mask[k]) { r.mask[k] = 1; r.got[k] = data[i]; r.n++; } }
    if (r.n >= r.size) r.done(r.got);
    else if (r.n) { clearTimeout(r.quiet); r.quiet = setTimeout(() => r.done(r.got), 250); } // the headphones skip bytes that are not in their map, so a short reply is normal
  }
}
let resyncTimer = null;
function applyIncoming(addr, data) {
  if (addr[0] === 0 && addr[1] === 1 && addr[2] === 0 && addr[3] === 0 && data.length >= 2) {
    if (data[1] !== state.patch) { state.patch = data[1]; if (!syncing) scheduleResync(); render(); }
    return;
  }
  if (addr[0] === 0x7F && addr[1] === 0 && addr[2] === 5 && addr[3] === 2) { state.battery = data[0]; renderBattery(); return; }
  const scope = addr[0] === 0x60 && addr[1] === 0 ? 'patch' : addr[0] === 0 && addr[1] === 0 ? 'system' : null;
  if (!scope) return;
  const o = (addr[2] << 7) | addr[3], touched = new Set();
  const volAt = lin(P.SYS_KNOB_POS_VOLUME.addr);
  for (let i = 0; i < data.length && o + i < SIZE[scope]; i++) {
    if (scope === 'system' && o + i === volAt && state.muted) { // muted: a non-zero volume is a patch loading its own level, keep it and mute again
      if (data[i] !== 0) { buf.system[volAt] = data[i]; setTimeout(() => state.muted && write(addrOf(P.SYS_KNOB_POS_VOLUME), [0], 'Keep muted'), 80); touched.add('SYS_KNOB_POS_VOLUME'); }
      continue;
    }
    if (buf[scope][o + i] !== data[i]) { buf[scope][o + i] = data[i]; if (owner[scope][o + i]) touched.add(owner[scope][o + i]); }
  }
  if (touched.size > 12 || syncing) scheduleRender(); else touched.forEach(notify);
}
function scheduleResync() { clearTimeout(resyncTimer); resyncTimer = setTimeout(() => { if (link.connected && link.reads) syncAll(); }, 700); }

async function connect() {
  if (link.connected) { try { link.dev.gatt.disconnect(); } catch (e) { } return; }
  if (!navigator.bluetooth) return showHelp('browser');
  try {
    const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: [SVC] }, { namePrefix: 'WAZA' }, { namePrefix: 'Waza' }, { namePrefix: 'BOSS' }], optionalServices: [SVC] });
    setSync('reading', 'Connecting');
    const parser = new BleParser(onMidi);
    let chr = null, err = null, step = '';
    // Windows often refuses the first try with "GATT Error: Not paired" while it sets up the secure link, then accepts a later one.
    for (let i = 0; i < 6 && !chr; i++) {
      let c = null;
      try {
        step = 'connect'; const g = dev.gatt.connected ? dev.gatt : await dev.gatt.connect();
        step = 'MIDI service'; const svc = await g.getPrimaryService(SVC);
        step = 'MIDI characteristic'; c = await svc.getCharacteristic(CHR);
        step = 'notifications'; await c.startNotifications();
        c.addEventListener('characteristicvaluechanged', ev => { const v = ev.target.value; parser.push(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); });
        chr = c;
      } catch (e) {
        err = e; log('er', null, `Attempt ${i + 1} of 6 failed at "${step}": ${e.message}`);
        if (step === 'notifications' && c && i >= 2) { // Windows will not let us listen. Carry on send-only: control may still work, read-back cannot.
          chr = c; log('er', null, 'Continuing without notifications: sending only, nothing can be read back from the headphones.'); break;
        }
        setSync('reading', 'Connecting, try ' + (i + 2));
        if (/not paired|authentication|encrypt/i.test(e.message) === false && step === 'connect' && i >= 3) break;
        try { if (step !== 'notifications') dev.gatt.disconnect(); } catch (e2) { }
        await sleep(1500);
      }
    }
    if (!chr) throw err;
    dev.addEventListener('gattserverdisconnected', () => { if (link.dev === dev) dropped(); });
    state.fails = 0;
    Object.assign(link, { dev, chr, connected: true, reads: false, chain: Promise.resolve() });
    link.pending.clear(); state.muted = false;
    log('rx', null, 'Bluetooth connected to ' + (dev.name || 'headphones'));
    resetBuffers(false);
    if (state.tools) $('#logbar').open = true;
    render(); setSync('none');
    await sleep(300); // give the link a moment before the first message
    await sendConnect();
    await syncAll();
  } catch (e) {
    const msg = String(e && e.message || e);
    if (e && e.name === 'NotFoundError' && /cancel/i.test(msg)) { setSync(link.connected ? state.sync : 'preview'); return; }
    log('er', null, msg);
    state.fails++;
    if (state.fails >= 2) { setSync('preview'); return showHelp('windows'); }
    toast(/permissions policy|disallowed|SecurityError/i.test(msg + (e && e.name)) ? 'Web Bluetooth is blocked here. Open this file in its own Chrome window.'
      : /not paired/i.test(msg) ? 'Windows reported "Not paired" six times in a row. Switch the headphones off and on, then connect again.'
      : /service/i.test(msg) ? 'Found the headphones but not their MIDI service. Something else is probably connected to them (phone app, WIDI Master, another tab).'
        : 'Could not connect: ' + msg);
    if (!link.connected) setSync('preview');
  }
}
async function sendConnect() { // the two writes verified in the brief (section 3), exactly what the pedal sends
  if (!link.connected) return toast('Connect the headphones first.');
  for (let i = 0; i < 3; i++) {
    if (await tx(dt1([0x7F, 0, 0, 1], [1]), 'CONNECT 1 of 2', true) && await tx(dt1([0x7F, 0, 0, 2], [0]), 'CONNECT 2 of 2', true)) { log('rx', null, 'CONNECT delivered'); return; }
    await sleep(1200);
  }
  toast('The headphones refused the CONNECT messages. Copy the log and send it over.');
}
function dropped() {
  link.connected = false; link.reads = false; link.dev = null; link.chr = null; state.muted = false; state.battery = null;
  for (const r of [...link.readers]) r.done(null);
  log('er', null, 'Bluetooth connection ended');
  setSync('preview'); render();
  if (!navigator.bluetooth) { const c = $('#sync'); c.className = 'chip none'; c.style.cursor = 'pointer'; c.lastChild.textContent = 'This browser cannot connect'; c.title = 'Click to find out why'; }
}
let syncing = false;
async function syncAll() { // read the headphones' state. Reading (RQ1) is not hardware-verified yet, so every step is allowed to fail.
  if (syncing || !link.connected) return;
  syncing = true; setSync('reading', 'Reading');
  try {
    await tx([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7], 'Identity request');
    let ok = !!(await read([0, 0, 4, 0x20], 10, 1500));
    if (!ok && await read([0, 0, 4, 0x20], 1, 1200)) { ok = true; for (let i = 1; i < 10; i++) await read([0, 0, 4, 0x20 + i], 1, 500); }
    link.reads = ok;
    if (!ok) { setSync('none'); log('er', null, 'No reply to read requests. Controls still send, but the screen shows defaults, not the headphones.'); return; }
    await read([0, 0, 4, 0x10], 6, 800);
    await read([0, 0, 4, 0x30], 15, 800);
    const cp = await read([0, 1, 0, 0], 2, 1000); if (cp) state.patch = cp[1];
    let missed = 0;
    for (let off = 0; off < PATCH_SIZE && link.connected; off += 128) { // ask only for the stretch of each 128-byte block that Roland's map defines
      let first = -1, last = -1;
      for (let k = off; k < Math.min(off + 128, PATCH_SIZE); k++) if (owner.patch[k]) { if (first < 0) first = k; last = k; }
      if (first < 0) continue;
      const a = unabs(abs([0x60, 0, 0, 0]) + first), n = last - first + 1;
      if (!(await read(a, n, 1500)) && !(await read(a, n, 2500))) { missed++; log('er', null, 'No answer for patch bytes ' + first + ' to ' + last); }
      setSync('reading', 'Reading ' + Math.round(100 * (off + 128) / PATCH_SIZE) + '%');
    }
    if (missed) toast(missed + ' part' + (missed > 1 ? 's' : '') + ' of the patch did not come back. See the log.');
    for (let n = 1; n <= 6 && link.connected; n++) { const r = await read([0x10, n, 0, 0], 16, 1000); if (r) state.names[n] = String.fromCharCode(...r).replace(/[^\x20-\x7e]/g, '').trim(); }
    if (link.connected) setSync('live');
  } finally { syncing = false; render(); }
}
function setSync(s, text) {
  state.sync = s;
  const c = $('#sync'); c.className = 'chip ' + s;
  c.lastChild.textContent = text || { preview: 'Preview, not connected', live: 'In sync with headphones', none: 'Connected, state not read', reading: 'Reading' }[s];
  c.title = s === 'none' ? 'Values on screen are defaults until "Read state" succeeds.' : s === 'preview' ? 'Controls move but nothing is sent.' : '';
  const b = $('#connect'), bl = link.connected ? 'Disconnect' : 'Connect headphones'; b.querySelector('.lbl').textContent = bl; b.title = bl; b.setAttribute('aria-label', bl); b.className = 'btn ic ' + (link.connected ? 'live' : 'primary');
  document.body.classList.toggle('gate', link.connected && state.tools && !state.test);
  document.body.classList.toggle('tools', state.tools);
  $('#hs').hidden = $('#readbtn').hidden = !link.connected || !state.tools;
}

/* ------------------------------------------------------------ setting values */
const locked = id => link.connected && state.tools && !state.test && statusOf(id) !== 'ok';
function set(id, v) {
  const p = P[id];
  if (locked(id)) { toast('Not tested on your headphones yet. Turn on "Test mode" to send it.'); return false; }
  v = clamp(Math.round(v), p.min, p.max);
  if (v === get(id)) return true;
  putRaw(p, v + p.ofs);
  if (!applyingTempo) for (const b of DELAY_BLOCKS) if (id === timeId(b) && state.div[b]) { delete state.div[b]; saveDivs(); scheduleRender(); }
  notify(id);
  if (id === 'SYS_KNOB_POS_VOLUME' && state.muted) return true; // applied when you unmute
  const raw = v + p.ofs;
  write(addrOf(p), p.bytes === 2 ? [(raw >> 7) & 0x7f, raw & 0x7f] : [raw], `${p.label} (${id}) = ${fmt(id, v)}`);
  return true;
}
function selectPatch(n) {
  state.patch = n; state.preset = null;
  tx(dt1([0, 1, 0, 0], [0, n]), 'Select patch ' + n);
  if (link.connected && link.reads) scheduleResync();
  else if (link.connected) toast('Patch ' + n + ' selected. The screen cannot follow because the headphones do not answer reads.');
  render();
}
function toggleMute() {
  const vol = P.SYS_KNOB_POS_VOLUME;
  state.muted = !state.muted;
  if (state.muted) tx(dt1(addrOf(vol), [0]), 'Mute (volume ' + get(vol.id) + ' remembered)');
  else tx(dt1(addrOf(vol), [rawOf(vol)]), 'Unmute (volume ' + get(vol.id) + ')');
  render();
}
function pressFxButton(n) {
  if (link.connected && state.tools && !state.test) { toast('Not tested on your headphones yet. Turn on "Test mode" to send it.'); return; }
  tx(dt1([0x7F, 0x01, 0x01, n - 1], [1]), 'Press effect button ' + n);
  if (!link.connected) { const id = 'SYS_LED_STATE_FX' + n; putRaw(P[id], (rawOf(P[id]) + 1) % 4); render(); }
}
function fmt(id, v) {
  const p = P[id], L = LABELS[id] || p.options;
  if (L && L[v + p.ofs]) return L[v + p.ofs];
  if (/DLY_TIME|PREDELAY/.test(id)) return v + ' ms';
  return p.ofs > 0 && v > 0 ? '+' + v : String(v);
}
function optionList(id) {
  const p = P[id], L = p.options || LABELS[id];
  if (!L) return null;
  const out = []; for (let r = p.min + p.ofs; r <= p.max + p.ofs; r++) if (L[r]) out.push([r - p.ofs, L[r]]);
  return out.length >= 2 && out.length <= 12 ? out : null;
}
const nice = id => P[id].label.replace(/^(FX_WAH_|SYS_)/, '').replace(/_/g, ' ');
const kindOf = id => { const o = optionList(id), p = P[id]; return o ? 'select' : (p.min === 0 && p.max === 1) ? 'toggle' : 'knob'; };

/* ------------------------------------------------------------ preset library (kept in this browser, shareable as files) */
const PRESET_IDS = PARAMS.filter(p => p.bytes !== 16 && (p.scope === 'patch' || /^SYS_KNOB_POS_/.test(p.id))).map(p => p.id);
let lib = [];
try { lib = JSON.parse(localStorage.getItem('wazamate.presets') || '[]'); } catch (e) { }
const saveLib = () => { try { localStorage.setItem('wazamate.presets', JSON.stringify(lib)); } catch (e) { toast('Could not save presets in this browser.'); } };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const cleanName = s => String(s == null ? '' : s).replace(/[^\x20-\x7d]/g, '').trim().slice(0, 16);
const curPreset = () => lib.find(p => p.id === state.preset);
const snapshot = () => Object.fromEntries(PRESET_IDS.map(id => [id, get(id)]));
function setNameBytes(name) { const n = cleanName(name).padEnd(16, ' '); for (let i = 0; i < 16; i++) buf.patch[i] = n.charCodeAt(i); }
function presetNew() {
  const name = cleanName(prompt('Name for the new preset (up to 16 characters):', patchName() || 'My preset')); if (!name) return;
  const p = { id: newId(), name, params: snapshot() }; lib.push(p); state.preset = p.id; setNameBytes(name); saveLib(); render(); toast('Saved "' + name + '" to your library.');
}
function presetSave() { const p = curPreset(); if (!p) return presetNew(); p.params = snapshot(); saveLib(); toast('Updated "' + p.name + '".'); }
function presetDuplicate() { const p = curPreset(); if (!p) return toast('Pick a preset first.'); const c = { id: newId(), name: cleanName(p.name.slice(0, 11) + ' copy'), params: { ...p.params } }; lib.push(c); state.preset = c.id; saveLib(); render(); }
function presetRename() { const p = curPreset(); if (!p) return toast('Pick a preset first.'); const name = cleanName(prompt('New name (up to 16 characters):', p.name)); if (!name) return; p.name = name; setNameBytes(name); saveLib(); render(); }
function presetDelete() { const p = curPreset(); if (!p) return toast('Pick a preset first.'); if (!confirm('Delete "' + p.name + '" from your library? The headphones are not changed.')) return; lib = lib.filter(x => x !== p); state.preset = null; saveLib(); render(); }
function sendWholePatch(what) { // pushes the whole edit buffer to the headphones. Nothing is stored until "Store in memory".
  for (let o = 0; o < PATCH_SIZE;) { // send every stretch of defined bytes, at most 64 at a time
    if (!owner.patch[o]) { o++; continue; }
    let e = o; while (e < PATCH_SIZE && owner.patch[e] && e - o < 64) e++;
    tx(dt1(unabs(abs([0x60, 0, 0, 0]) + o), Array.from(buf.patch.slice(o, e))), 'Patch bytes ' + o + ' to ' + (e - 1));
    o = e;
  }
  for (const pid of PRESET_IDS) if (P[pid].scope === 'system' && !(pid === 'SYS_KNOB_POS_VOLUME' && state.muted)) tx(dt1(addrOf(P[pid]), [rawOf(P[pid])]), nice(pid));
  link.chain.then(() => toast(link.connected ? what + ' sent to the headphones. Use "Store in memory" to keep it there.' : what + ' loaded (preview).'));
}
function applyParams(params) {
  for (const pid of PRESET_IDS) { const d = P[pid], v = params[pid]; if (typeof v === 'number' && isFinite(v)) putRaw(d, clamp(Math.round(v), d.min, d.max) + d.ofs); }
}
function presetLoad(id) {
  const p = lib.find(x => x.id === id); state.preset = p ? p.id : null; if (!p) return render();
  applyParams(p.params); setNameBytes(p.name);
  sendWholePatch('"' + p.name + '"');
  render();
}
/** Every parameter at the value Roland's map calls its default, with all effects switched off. */
function presetInit() {
  if (!confirm('Start from an empty patch?\n\nEvery effect is switched off and every control goes back to its default. The sound playing now is replaced, but nothing stored on the headphones changes.')) return;
  resetBuffers(false);
  for (const p of PARAMS) if (/(^|_)SW$/.test(p.id) || p.id === 'SEND_RETURN_MODE') putRaw(p, p.ofs);
  state.preset = null; setNameBytes('INIT');
  sendWholePatch('Empty patch');
  render();
}
/** Reads one stored memory (10 0n ..) into a params object, without switching to it. */
async function readStoredPatch(n) {
  const got = {}, base = abs([0x10, n & 0x7f, 0, 0]);
  for (let off = 0; off < PATCH_SIZE;) {
    if (!owner.patch[off]) { off++; continue; }
    let e = off; while (e < PATCH_SIZE && owner.patch[e] && e - off < 112) e++;
    const r = await read(unabs(base + off), e - off, 2000) || await read(unabs(base + off), e - off, 3000);
    if (!r) return null;
    for (let i = 0; i < r.length; i++) got[off + i] = r[i];
    off = e;
  }
  const params = {}, name = [];
  for (let i = 0; i < 16; i++) name.push(got[i] == null ? 32 : got[i]);
  for (const pid of PRESET_IDS) {
    const d = P[pid]; if (d.scope !== 'patch') continue;
    const o = lin(d.addr);
    if (got[o] == null || (d.bytes === 2 && got[o + 1] == null)) continue;
    params[pid] = (d.bytes === 2 ? (got[o] << 7) | got[o + 1] : got[o]) - d.ofs;
  }
  // The 12 KNOBPOS bytes hold this patch's amp settings, in the order of system addresses 04 20 onward.
  for (let i = 0; i < 10; i++) {
    const d = PARAMS.find(x => x.scope === 'system' && x.addr === 0x0420 + i), v = got[lin(0x0a40) + i];
    if (d && v != null) params[d.id] = v - d.ofs;
  }
  return { name: String.fromCharCode(...name).replace(/[^\x20-\x7e]/g, '').trim(), params };
}
/** Reads all six memories and saves them as a file, so a mistaken store can be undone. */
async function backupMemories() {
  if (!link.connected) return toast('Connect the headphones first.');
  if (!link.reads) return toast('The headphones are not answering read requests, so they cannot be backed up.');
  const out = [];
  setSync('reading', 'Backing up');
  for (let n = 1; n <= 6 && link.connected; n++) {
    setSync('reading', 'Backing up ' + n + ' of 6');
    const p = await readStoredPatch(n);
    if (!p) { setSync('live'); return toast('Memory ' + n + ' did not come back. Nothing was saved, try again.'); }
    out.push({ id: newId(), name: cleanName(p.name) || ('Memory ' + n), params: p.params });
  }
  setSync(link.connected ? 'live' : 'preview');
  if (!out.length) return;
  download('WazaMate headphone memories.wazamate.json', fileOf(out));
  if (confirm('Saved all six memories to a file.\n\nAlso add them to your preset library, so you can load any of them with one click?')) {
    const stamp = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < out.length; i++) lib.push({ ...out[i], id: newId(), name: cleanName((i + 1) + ' ' + out[i].name) });
    saveLib(); render(); toast('Six memories added to your library (backed up ' + stamp + ').');
  }
}
/** A prompt an LLM can answer with a preset file, built from the live parameter map. */
/** Only what differs from Roland's defaults, so a follow-up can carry the patch without the bulk. */
function changedParams() {
  const out = {};
  for (const id of PRESET_IDS) { const v = get(id); if (v !== Number(P[id].init)) out[id] = v; }
  return out;
}

function llmPrompt(wanted) {
  const skip = /^(KNOBPOS|SYS_LED|SYS_FXSEL|FXBOX_SEL|PEDAL_FX|EV1WL)|_HARM_\d/;
  // FX2 and Delay 2 repeat the same parameters under another prefix, so describe them once.
  const mirrored = /^(FX:|DELAY2)/;
  const lines = [], byGroup = new Map();
  for (const pid of PRESET_IDS) {
    const d = P[pid];
    if (skip.test(pid) || mirrored.test(d.group) || ['GLOBAL_EQ', 'USB_TUNER', 'SYSTEM', 'FX_COMMON', 'DELAY2_COMMON'].includes(d.group)) continue;
    if (!byGroup.has(d.group)) byGroup.set(d.group, []);
    byGroup.get(d.group).push(d);
  }
  for (const [group, defs] of byGroup) {
    lines.push(group);
    for (const d of defs) {
      const L = d.options || LABELS[d.id];
      let range = d.min + '-' + d.max;
      if (L) {
        const names = [];
        for (let r = d.min + d.ofs; r <= d.max + d.ofs; r++) if (L[r]) names.push((r - d.ofs) + '=' + L[r]);
        if (names.length && names.length <= 12) range = names.join(' ');
        else if (names.length) range = d.min + '-' + d.max + ' (' + names[0] + ' ... ' + names[names.length - 1] + ')';
      }
      lines.push(' ' + d.id + ' ' + range);
    }
  }
  return [
    'You are setting up a guitar patch on a BOSS WAZA-AIR, a modelling headphone amp.',
    '',
    'THE SOUND I WANT: ' + (wanted || '<describe it here, for example "a chiming delay-heavy clean tone like The Edge on U2\'s Pride">'),
    '',
    'Reply in two parts.',
    '',
    'PART 1, a short plain-English explanation of what you chose and why. Cover the amp type, the drive or stomp, any modulation, the delay (including roughly what note value the delay time works out to) and the reverb. Name the real-world sound or technique you are going for. Keep it to a short paragraph per block so I can tweak before I load it.',
    '',
    'PART 2, the patch itself, as JSON in a fenced code block, in exactly this shape:',
    '```json',
    '{"format":"wazamate-presets","version":1,"presets":[{"name":"<16 characters max>","params":{"PARAM_ID":number}}]}',
    '```',
    '',
    'Rules for part 2:',
    '- Use only the parameter ids listed below, with values inside the range given.',
    '- Switch each effect on or off explicitly with its SW parameter, 1 is on and 0 is off.',
    '- Set the TYPE of any effect you switch on.',
    '- SYS_KNOB_POS_FX1 and FX2 are shared level dials: 0 and 52 are off, 1-51 sets the first effect of the pair (stomp, delay 1) at level 0-50, 53-103 sets the second (mod 1, mod 2). SYS_KNOB_POS_FX3 is 0 for off, else 1-101 for reverb and delay 2 level 0-100. An effect switched on whose dial is off will not be heard, so set these.',
    '- Mod 2 repeats Mod 1: every FX1_ parameter below also exists as FX2_ with the same range, and its switch and type are FX2_SW and FX2_FXTYPE.',
    '- Delay 2 repeats Delay 1: every DLY_ parameter below also exists as DLY2_, and its switch and type are DLY2_SW and DLY2_TYPE.',
    '- Anything you leave out keeps the value it already has, so to switch an effect off, say so with its SW parameter rather than omitting it.',
    '- Put nothing but the JSON inside the code block.',
    '',
    'PARAMETERS (id, then either a range or the meaning of each value)',
    lines.join('\n'),
    '',
    'THE PATCH I HAVE NOW, as a starting point. Only the parameters that differ from the defaults are',
    'listed, so everything not mentioned here is at its default value:',
    JSON.stringify({ name: cleanName(patchName()) || 'Current', params: changedParams() }),
  ].join('\n');
}
/**
 * Providers that allow calls straight from a web page. OpenAI is missing on purpose: it refuses
 * browser origins outright, so no key can make it work from a static site.
 * The key is kept in this browser and goes only to the provider the user picked. It is never
 * logged, never exported and never sent anywhere else.
 */
const LLM_PROVIDERS = {
  gemini: {
    name: 'Google Gemini', model: 'gemini-2.0-flash', keys: 'https://aistudio.google.com/apikey',
    note: 'Free tier, and confirmed to work from a web page. The best place to start.',
    async send(cfg, turns, signal) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, {
        method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.key },
        body: JSON.stringify({
          contents: turns.map(t => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] })),
          generationConfig: { temperature: 0.8 },
        }),
      });
      const d = await readJson(r);
      return d.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    },
  },
  groq: {
    name: 'Groq', model: 'llama-3.3-70b-versatile', openai: 'https://api.groq.com/openai/v1', keys: 'https://console.groq.com/keys',
    note: 'Generous free tier. Whether it accepts calls from a web page is unconfirmed, so this one may come back blocked.',
  },
  openrouter: {
    name: 'OpenRouter', model: 'google/gemini-2.0-flash-exp:free', openai: 'https://openrouter.ai/api/v1', keys: 'https://openrouter.ai/keys',
    note: 'One key reaches many models, including free ones.',
  },
  anthropic: {
    name: 'Anthropic Claude', model: 'claude-sonnet-4-5', keys: 'https://console.anthropic.com/settings/keys',
    note: 'Paid. Needs a browser-access header, which WazaMate sends for you.',
    async send(cfg, turns, signal) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: cfg.model, max_tokens: 4000, messages: turns.map(t => ({ role: t.role, content: t.text })) }),
      });
      const d = await readJson(r);
      return (d.content || []).map(c => c.text || '').join('');
    },
  },
  custom: {
    name: 'Anything OpenAI-compatible', model: '', openai: '', keys: '',
    note: 'A local model, a proxy of your own, or any other endpoint that speaks the OpenAI chat format.',
  },
};
/** Shared by every OpenAI-compatible provider. */
async function sendOpenAiStyle(cfg, turns, signal) {
  const base = (cfg.baseUrl || LLM_PROVIDERS[cfg.provider].openai || '').replace(/\/+$/, '');
  if (!base) throw new Error('No endpoint address is set for this provider.');
  const r = await fetch(base + '/chat/completions', {
    method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key },
    body: JSON.stringify({ model: cfg.model, temperature: 0.8, messages: turns.map(t => ({ role: t.role, content: t.text })) }),
  });
  const d = await readJson(r);
  return d.choices?.[0]?.message?.content || '';
}
async function readJson(r) {
  const text = await r.text();
  let d = null;
  try { d = JSON.parse(text); } catch (e) { }
  if (!r.ok) {
    const msg = d?.error?.message || d?.message || text.slice(0, 200) || ('HTTP ' + r.status);
    if (r.status === 401 || r.status === 403) throw new Error('The provider rejected the key: ' + msg);
    if (r.status === 404) throw new Error('No such model. Check the model name in Settings: ' + msg);
    if (r.status === 429) throw new Error('Rate limit or quota reached. Wait a moment, or try a different provider: ' + msg);
    throw new Error(msg);
  }
  if (!d) throw new Error('The provider sent something that was not JSON.');
  return d;
}
const llmCfg = () => { try { return JSON.parse(localStorage.getItem('wazamate.llm') || 'null'); } catch (e) { return null; } };
const saveLlmCfg = c => { try { localStorage.setItem('wazamate.llm', JSON.stringify(c)); } catch (e) { toast('This browser would not save the settings.'); } };
/** `turns` is the whole conversation so far, so a follow-up can edit what came before. */
async function askLlm(cfg, turns, signal) {
  const p = LLM_PROVIDERS[cfg.provider];
  try {
    const text = await (p.send ? p.send(cfg, turns, signal) : sendOpenAiStyle(cfg, turns, signal));
    if (!text.trim()) throw new Error('The provider replied with nothing.');
    return text;
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    // A blocked cross-origin request surfaces as a bare TypeError with nothing useful in it.
    if (e instanceof TypeError) throw new Error('The browser blocked the request before it reached ' + p.name + '. This provider probably does not allow calls from a web page. Gemini is the safe choice.');
    throw e;
  }
}

async function copyLlmPrompt() {
  const text = llmPrompt();
  try { await navigator.clipboard.writeText(text); toast('Prompt copied (' + Math.round(text.length / 1024) + ' KB). Paste it into any LLM, describe the sound you want, then bring its whole reply back with "Paste a patch from an LLM".'); }
  catch (e) { download('WazaMate LLM prompt.txt', text); toast('Your browser would not let the page copy, so the prompt was downloaded as a text file instead.'); }
}
async function storeToMemory(n) {
  if (!link.connected) return toast('Connect the headphones first.');
  const name = cleanName((curPreset() || {}).name || patchName()) || 'WAZA AIR';
  if (!confirm('Store the current sound in memory ' + n + (state.names[n] ? ' ("' + state.names[n] + '")' : '') + ' as "' + name + '"?\n\nThis replaces what is in that memory on the headphones and cannot be undone.')) return;
  setNameBytes(name);
  await tx(dt1([0x60, 0, 0, 0], Array.from(buf.patch.slice(0, 16))), 'Patch name "' + name + '"');
  const reply = new Promise(res => { const r = { start: abs([0x7F, 0, 1, 4]), size: 2, got: new Uint8Array(2), mask: new Uint8Array(2), n: 0 }; r.done = v => { if (r.fin) return; r.fin = true; clearTimeout(r.timer); clearTimeout(r.quiet); link.readers.splice(link.readers.indexOf(r), 1); res(v); }; r.timer = setTimeout(() => r.done(null), 3000); link.readers.push(r); });
  await tx(dt1([0x7F, 0, 1, 4], [0, n]), 'Store in memory ' + n);
  if (await reply) { state.names[n] = name; toast('Stored in memory ' + n + '.'); } else toast('Sent, but the headphones did not confirm. Select memory ' + n + ' to check.');
  render();
}
function download(name, obj) { const text = typeof obj === 'string', a = h('a', { href: URL.createObjectURL(new Blob([text ? obj : JSON.stringify(obj, null, 1)], { type: text ? 'text/plain' : 'application/json' })), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
const fileOf = list => ({ format: 'wazamate-presets', version: 1, device: 'BOSS WAZA-AIR', presets: list.map(p => ({ name: p.name, params: p.params })) });
function presetExport(all) { const p = curPreset(); if (!all && !p) return toast('Pick a preset first.'); if (all && !lib.length) return toast('Your library is empty.'); download((all ? 'WazaMate library' : p.name) + '.wazamate.json', fileOf(all ? lib : [p])); }
/** Pulls the preset JSON out of a reply that may have explanation and code fences around it. */
function extractJson(text) {
  const tries = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) tries.push(fence[1]);
  tries.push(text);
  const first = text.indexOf('{'), last = text.lastIndexOf('}');
  if (first >= 0 && last > first) tries.push(text.slice(first, last + 1));
  const at = text.indexOf('{"format"');
  if (at >= 0) { // walk the braces from the start of the object, ignoring any inside strings
    let depth = 0, str = false, esc = false;
    for (let i = at; i < text.length; i++) {
      const c = text[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { str = !str; continue; }
      if (str) continue;
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { tries.push(text.slice(at, i + 1)); break; }
    }
  }
  for (const t of tries) { try { const d = JSON.parse(t.trim()); if (d && typeof d === 'object') return d; } catch (e) { } }
  return null;
}
async function presetImport(file) { return importData(extractJson(await file.text())); }
function importData(d) {
  try {
    if (!d) throw new Error('no preset JSON found in that text');
    if (d.format !== 'wazamate-presets' || !Array.isArray(d.presets)) throw new Error('not a WazaMate preset file');
    let n = 0, last = null;
    for (const src of d.presets.slice(0, 500)) { // only known parameters with in-range numbers are taken from the file
      if (!src || typeof src.params !== 'object' || !src.params) continue;
      const params = {};
      for (const id of PRESET_IDS) { const v = src.params[id]; if (typeof v === 'number' && isFinite(v)) params[id] = clamp(Math.round(v), P[id].min, P[id].max); }
      if (!Object.keys(params).length) continue;
      last = { id: newId(), name: cleanName(src.name) || 'Imported', params }; lib.push(last); n++;
    }
    if (!n) throw new Error('no usable presets in the file');
    saveLib(); state.preset = last.id; presetLoad(last.id);
    toast('Imported ' + n + ' preset' + (n > 1 ? 's' : '') + '. "' + last.name + '" is loaded now.');
  } catch (e) { toast('Could not import: ' + (e.message || e)); }
}
function llmSettings(then) {
  const cfg = llmCfg() || { provider: 'gemini', key: '', model: LLM_PROVIDERS.gemini.model, baseUrl: '' };
  const box = $('#llmbox');
  box.textContent = '';
  const sel = h('select', { 'aria-label': 'Provider' });
  for (const id in LLM_PROVIDERS) sel.append(h('option', { value: id, selected: id === cfg.provider ? '' : null }, LLM_PROVIDERS[id].name));
  const key = h('input', { type: 'password', value: cfg.key || '', placeholder: 'Paste your API key', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'API key' });
  const model = h('input', { type: 'text', value: cfg.model || '', placeholder: 'Model name', spellcheck: 'false', 'aria-label': 'Model' });
  const base = h('input', { type: 'text', value: cfg.baseUrl || '', placeholder: 'https://example.com/v1', spellcheck: 'false', 'aria-label': 'Endpoint address' });
  const note = h('p', { class: 'note' }), keyLink = h('p', {}), baseRow = h('label', { class: 'lrow' }, h('span', {}, 'Endpoint'), base);
  const refresh = () => {
    const p = LLM_PROVIDERS[sel.value];
    note.textContent = p.note;
    keyLink.textContent = '';
    if (p.keys) keyLink.append('Get a key: ', h('a', { href: p.keys, target: '_blank', rel: 'noopener' }, p.keys));
    baseRow.hidden = sel.value !== 'custom';
    if (!model.value || model.value === LLM_PROVIDERS[cfg.provider]?.model) model.value = p.model;
  };
  sel.addEventListener('change', refresh);
  box.append(h('h2', {}, 'Where should patches come from?'),
    h('p', {}, 'WazaMate has no server, so your key is kept in this browser and sent straight to the provider you pick. It is never logged, never exported, and never reaches anyone else.'),
    h('label', { class: 'lrow' }, h('span', {}, 'Provider'), sel), note,
    h('label', { class: 'lrow' }, h('span', {}, 'API key'), key), keyLink,
    h('label', { class: 'lrow' }, h('span', {}, 'Model'), model),
    h('p', { class: 'note' }, 'Model names change. If the provider says there is no such model, check its documentation and put the current name here.'),
    baseRow,
    h('div', { class: 'prow' },
      h('button', { class: 'btn', type: 'button', onclick: () => { $('#llm').close(); } }, 'Cancel'),
      h('button', { class: 'btn', type: 'button', onclick: () => { localStorage.removeItem('wazamate.llm'); $('#llm').close(); toast('Key removed from this browser.'); } }, 'Forget my key'),
      h('button', {
        class: 'btn primary', type: 'button', onclick: () => {
          if (!key.value.trim() && sel.value !== 'custom') return toast('Paste an API key first.');
          saveLlmCfg({ provider: sel.value, key: key.value.trim(), model: model.value.trim() || LLM_PROVIDERS[sel.value].model, baseUrl: base.value.trim() });
          $('#llm').close();
          if (then) then();
        },
      }, 'Save')));
  refresh();
  $('#llm').showModal();
  key.focus();
}

function llmCreate() {
  const cfg = llmCfg();
  if (!cfg || (!cfg.key && cfg.provider !== 'custom')) return llmSettings(llmCreate);
  const box = $('#llmbox');
  box.textContent = '';
  const want = h('textarea', { class: 'pastebox', rows: '3', 'aria-label': 'The sound you want',
    placeholder: 'A chiming delay-heavy clean tone like The Edge on U2’s Pride' });
  let thread = []; // the whole exchange, so "now add a delay" edits what came before
  const status = h('p', { class: 'note' }), reason = h('div', { class: 'reason' });
  const buttons = h('div', { class: 'prow' });
  let ctrl = null, started = 0, timer = null;
  const setStage = t => { status.textContent = t + ' (' + Math.round((Date.now() - started) / 1000) + 's)'; };
  const stop = () => { clearInterval(timer); timer = null; if (ctrl) { ctrl.abort(); ctrl = null; } };
  const buttonRow = (...kids) => { buttons.textContent = ''; buttons.append(...kids); };
  const close = () => { stop(); $('#llm').close(); };

  async function go() {
    const wanted = want.value.trim();
    if (!wanted) return toast('Describe the sound you want first.');
    ctrl = new AbortController();
    started = Date.now();
    want.disabled = true;
    reason.textContent = '';
    setStage('Asking ' + LLM_PROVIDERS[cfg.provider].name);
    timer = setInterval(() => setStage('Asking ' + LLM_PROVIDERS[cfg.provider].name), 1000);
    buttonRow(h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'));
    try {
      // First time, send the full brief. After that, just the new request plus whatever has
      // changed since, because the model still has the parameter list earlier in the thread.
      const message = thread.length
        ? wanted + '\n\nThis is a change to the patch you just gave me, so keep what works and alter only what I asked for.'
          + '\n\nThe patch as it stands, showing only what differs from the defaults (I may have tweaked it by hand):\n'
          + JSON.stringify(changedParams())
          + '\n\nReply in the same two parts as before: the explanation, then the full patch as JSON in a fenced code block.'
        : llmPrompt(wanted);
      thread.push({ role: 'user', text: message });
      const text = await askLlm(cfg, thread, ctrl.signal);
      thread.push({ role: 'assistant', text });
      clearInterval(timer); timer = null; ctrl = null;
      status.textContent = 'Reading the reply';
      const data = extractJson(text);
      if (!data) throw new Error('The reply had no patch in it. Try asking again, or pick a stronger model.');
      // Everything the model wrote except the JSON block is its reasoning, which is the useful part.
      reason.textContent = text.replace(/```[\s\S]*?```/g, '').replace(/\{"format"[\s\S]*\}/, '')
        .replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s*/gm, '').replace(/\n{3,}/g, '\n\n').trim();
      const before = lib.length;
      importData(data);
      if (lib.length === before) throw new Error('That patch could not be loaded. See the message above.');
      status.textContent = 'Loaded and playing. Ask for a change, or keep it.';
      want.disabled = false;
      want.value = '';
      want.placeholder = 'Now ask for a change, for example: give it more delay, or make it darker';
      want.focus();
      buttonRow(h('button', { class: 'btn', type: 'button', title: 'Forget this conversation and start from a new description', onclick: startFresh }, 'Start fresh'),
        h('button', { class: 'btn', type: 'button', onclick: go }, 'Ask for a change'),
        h('button', { class: 'btn primary', type: 'button', onclick: close }, 'Done'));
    } catch (e) {
      clearInterval(timer); timer = null; ctrl = null;
      want.disabled = false;
      if (thread.length && thread[thread.length - 1].role === 'user') thread.pop(); // do not keep a question that went nowhere
      status.textContent = e.name === 'AbortError' ? 'Cancelled.' : e.message;
      buttonRow(h('button', { class: 'btn', type: 'button', onclick: () => llmSettings(llmCreate) }, 'Settings'),
        h('button', { class: 'btn', type: 'button', onclick: close }, 'Close'),
        h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Try again'));
    }
  }
  const firstButtons = () => [
    h('button', { class: 'btn', type: 'button', onclick: () => llmSettings(llmCreate) }, 'Settings'),
    h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
    h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Create patch'),
  ];
  function startFresh() {
    thread = []; want.value = ''; want.placeholder = 'Describe a different sound';
    reason.textContent = ''; status.textContent = ''; buttonRow(...firstButtons()); want.focus();
  }
  box.append(h('h2', {}, 'New patch from an LLM'),
    h('p', {}, 'Describe the sound you are after. A song, a player, an era, or just the feel of it. Once it answers you can keep asking for changes, and it remembers what it built.'),
    want, status, reason, buttons);
  buttonRow(...firstButtons());
  $('#llm').addEventListener('close', stop, { once: true });
  $('#llm').showModal();
  want.focus();
}

function pasteImport() {
  const box = $('#helpbox');
  box.textContent = '';
  const area = h('textarea', { class: 'pastebox', rows: '10', placeholder: 'Paste the whole reply here, explanation and all. The patch will be pulled out of it.', 'aria-label': 'Paste an LLM reply' });
  box.append(h('h2', {}, 'Paste a patch from an LLM'),
    h('p', {}, 'Paste the entire reply, including anything it wrote around the JSON. Whatever it chose will load straight away, so you can hear it before saving.'),
    area,
    h('div', { class: 'prow' },
      h('button', { class: 'btn', type: 'button', onclick: () => $('#help').close() }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => { const t = area.value; $('#help').close(); if (t.trim()) importData(extractJson(t)); } }, 'Load this patch')));
  $('#help').showModal();
  area.focus();
}
function renderLib() {
  const s = $('#preset'); s.textContent = '';
  s.append(h('option', { value: '' }, lib.length ? 'Headphone memory (no preset)' : 'No presets yet'));
  for (const p of lib) s.append(h('option', { value: p.id }, p.name));
  s.value = curPreset() ? state.preset : '';
  const m = $('#slist'); m.textContent = '';
  m.append(h('div', { class: 'mhead' }, 'Store current sound in memory'));
  for (let n = 1; n <= 6; n++) m.append(h('button', { type: 'button', onclick: () => { $('#smenu').open = false; storeToMemory(n); } }, h('b', {}, String(n)), ' ' + (state.names[n] || '')));
}

/* ------------------------------------------------------------ tempo: tap, note values, and keeping both delays together */
const DIVISIONS = [['1/4', 1], ['1/8.', 0.75], ['1/4T', 2 / 3], ['1/8', 0.5], ['1/8T', 1 / 3], ['1/16', 0.25]];
const DELAY_BLOCKS = ['delay', 'delay2'];
const timeId = b => (b === 'delay' ? 'DLY_COMMON_DLY_TIME' : 'DLY2_COMMON_DLY_TIME');
let taps = [], applyingTempo = false;
const msFor = factor => 60000 / state.bpm * factor;
const saveDivs = () => { try { localStorage.setItem('wazamate.divs', JSON.stringify(state.div)); } catch (e) { } };

/** Writes the tempo to one delay at its own subdivision. The tempo is shared, the note value is not. */
function applyTempo(b) {
  const factor = state.div[b];
  if (!state.bpm || !factor) return;
  const id = timeId(b);
  applyingTempo = true;
  set(id, clamp(Math.round(msFor(factor)), P[id].min, P[id].max));
  applyingTempo = false;
}
function setDivision(b, factor) {
  if (factor) state.div[b] = factor; else delete state.div[b];
  saveDivs();
  applyTempo(b);
  scheduleRender();
}
function tap() {
  const now = Date.now();
  if (taps.length && now - taps[taps.length - 1] > 3000) taps = []; // a long gap starts a new count
  taps.push(now);
  if (taps.length > 5) taps.shift();
  if (taps.length >= 2) {
    let total = 0; for (let i = 1; i < taps.length; i++) total += taps[i] - taps[i - 1];
    state.bpm = clamp(Math.round(60000 / (total / (taps.length - 1))), 20, 400);
    for (const b of DELAY_BLOCKS) applyTempo(b); // one tempo, each delay keeps its own note value
  }
  scheduleRender();
}
function tempoBar(b) {
  const other = b === 'delay' ? 'delay2' : 'delay', max = P[timeId(b)].max;
  const row = h('div', { class: 'tempo' },
    h('button', { class: 'btn tapbtn', type: 'button', title: 'Tap four times in time with the music. The tempo is shared by both delays.', onclick: tap }, 'TAP'),
    h('div', { class: 'bpm' }, state.bpm ? h('b', {}, String(state.bpm)) : h('b', { class: 'dim' }, '--'), ' BPM'));
  const divs = h('div', { class: 'divs' });
  for (const [label, factor] of DIVISIONS) {
    const ms = state.bpm ? Math.round(msFor(factor)) : null;
    divs.append(h('button', {
      type: 'button', class: state.div[b] === factor ? 'on' : '', disabled: state.bpm ? null : '',
      title: ms ? label + ' at ' + state.bpm + ' BPM is ' + ms + ' ms' + (ms > max ? ', longer than this delay can go, so it will stop at ' + max + ' ms' : '') : 'Tap a tempo first',
      onclick: () => setDivision(b, factor),
    }, label));
  }
  divs.append(h('button', {
    type: 'button', class: 'free' + (state.div[b] ? '' : ' on'), title: 'Set this delay’s time by hand, ignoring the tempo',
    onclick: () => setDivision(b, null),
  }, 'MS'));
  row.append(divs);
  const theirs = state.div[other], name = SLOTS[other].label;
  row.append(h('div', { class: 'otherdiv', title: theirs ? name + ' follows the same tempo at its own note value' : name + ' is set by hand' },
    name + ': ' + (theirs ? (DIVISIONS.find(d => d[1] === theirs) || [''])[0] : 'manual')));
  return row;
}

/* ------------------------------------------------------------ controls */
let R = {};
const reg = (id, fn) => { (R[id] = R[id] || []).push(fn); fn(); };
function notify(id) { (R[id] || []).forEach(f => f()); if (STRUCT.has(id)) scheduleRender(); else if (/^SYS_KNOB_POS_FX|^SEND_RETURN_MODE$/.test(id)) renderChain(); }
function vknob(o) { // o: label,min,max,get,set,fmt,ids[],stId,zero,big
  const el = h('div', { class: 'ctl knob' + (o.big ? ' big' : ''), tabindex: 0, role: 'slider', 'aria-label': o.label, 'data-st': o.stId ? statusOf(o.stId) : 'ok' });
  const val = h('div', { class: 'k-val' }), lab = h('div', { class: 'k-lab' }, o.label);
  if (o.stId) lab.append(dotEl(o.stId));
  el.append(h('div', { class: 'k-dial' }, h('div', { class: 'k-ring' }), h('div', { class: 'k-cap' }, h('i'))), val, lab);
  const span = (o.max - o.min) || 1, z = o.zero == null ? 0 : (o.zero - o.min) / span;
  const upd = () => {
    const v = o.get(), t = (v - o.min) / span;
    el.style.setProperty('--t', t); el.style.setProperty('--a', Math.min(t, z) * 270 + 'deg'); el.style.setProperty('--b', Math.max(t, z) * 270 + 'deg');
    if (!val.querySelector('input')) val.textContent = o.fmt(v);
    el.setAttribute('aria-valuenow', v); el.setAttribute('aria-valuetext', o.fmt(v));
  };
  (o.ids || []).forEach(id => reg(id, upd)); upd();
  let drag = null;
  el.addEventListener('pointerdown', e => { if (e.target.tagName === 'INPUT' || e.target === val) return; el.setPointerCapture(e.pointerId); drag = { y: e.clientY, v: o.get() }; });
  el.addEventListener('pointermove', e => { if (!drag) return; const px = clamp(span * 1.6, 110, 320) * (e.shiftKey ? 6 : 1); o.set(clamp(Math.round(drag.v + (drag.y - e.clientY) / px * span), o.min, o.max)); });
  el.addEventListener('pointerup', () => drag = null); el.addEventListener('pointercancel', () => drag = null);
  el.addEventListener('wheel', e => { e.preventDefault(); o.set(clamp(o.get() + (e.deltaY < 0 ? 1 : -1), o.min, o.max)); }, { passive: false });
  el.addEventListener('keydown', e => { const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key]; if (d) { e.preventDefault(); o.set(clamp(o.get() + d, o.min, o.max)); } });
  if (o.init != null) el.addEventListener('dblclick', e => { if (e.target !== val) o.set(o.init); });
  val.title = 'Click to type a value';
  val.addEventListener('click', () => {
    if (val.querySelector('input')) return;
    const inp = h('input', { type: 'number', min: o.min, max: o.max, value: o.get() });
    val.textContent = ''; val.append(inp); inp.focus(); inp.select();
    const done = ok => { if (ok && inp.value !== '') o.set(clamp(Math.round(+inp.value), o.min, o.max)); inp.remove(); upd(); };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
    inp.addEventListener('blur', () => done(true));
  });
  return el;
}
const knob = (id, o = {}) => { const p = P[id]; return vknob({ label: o.label || nice(id), min: p.min, max: p.max, get: () => get(id), set: v => set(id, v), fmt: v => fmt(id, v), ids: [id], stId: id, zero: p.ofs > 0 ? 0 : null, init: Number(p.init), big: o.big }); };
function selectCtl(id, label) {
  const p = P[id], s = h('select', { 'aria-label': label || nice(id) });
  for (const [v, t] of optionList(id)) s.append(h('option', { value: v }, t));
  s.addEventListener('change', () => { if (!set(id, +s.value)) s.value = get(id); });
  reg(id, () => { s.value = get(id); });
  return h('label', { class: 'ctl sel', 'data-st': statusOf(id) }, h('span', {}, label || nice(id), dotEl(id)), s);
}
function toggleCtl(id, label) {
  const p = P[id], txt = h('span', { class: 't-txt' });
  const b = h('button', { class: 'ctl tog', type: 'button', 'data-st': statusOf(id), onclick: () => set(id, get(id) ? 0 : 1) }, h('span', { class: 't-sw' }), txt, h('span', {}, label || nice(id), dotEl(id)));
  reg(id, () => { b.setAttribute('aria-pressed', !!get(id)); txt.textContent = get(id) ? 'ON' : 'OFF'; });
  return b;
}
const ctl = id => ({ knob, select: selectCtl, toggle: toggleCtl })[kindOf(id)](id);
function swButton(id, cls, label) { // footswitch or power button bound to an effect switch
  const b = h('button', { class: 'ctl ' + cls, type: 'button', 'data-st': statusOf(id), onclick: () => set(id, get(id) ? 0 : 1) },
    cls === 'foot' ? [h('span', { class: 'f-led' }), h('span', { class: 'f-btn' })] : [h('span', { class: 'p-btn' })], h('span', {}, label || 'ON / OFF', dotEl(id)));
  reg(id, () => b.setAttribute('aria-pressed', !!get(id)));
  return b;
}

/* ------------------------------------------------------------ blocks */
const SLOTS = {
  booster: { label: 'Stomp', cat: 'drive', sw: 'ODDS_SW', type: 'ODDS_TYPE', asg: 'FX1A', button: 1, half: 'low', groups: ['BOOSTER'] },
  mod: { label: 'Mod 1', cat: 'mod', sw: 'FX1_SW', type: 'FX1_FXTYPE', asg: 'FX1B', button: 1, half: 'high', prefix: 'MOD' },
  delay: { label: 'Delay 1', cat: 'delay', sw: 'DLY_SW', type: 'DLY_TYPE', asg: 'FX2A', button: 2, half: 'low', prefix: 'DELAY' },
  fx: { label: 'Mod 2', cat: 'mod', sw: 'FX2_SW', type: 'FX2_FXTYPE', asg: 'FX2B', button: 2, half: 'high', prefix: 'FX' },
  reverb: { label: 'Reverb', cat: 'reverb', sw: 'REVERB_SW', type: 'REVERB_TYPE', asg: 'FX3A', selId: 'FXBOX_SEL_FX3', button: 3, half: 'single', groups: ['REVERB'] },
  delay2: { label: 'Delay 2', cat: 'delay', sw: 'DLY2_SW', type: 'DLY2_TYPE', asg: 'FX3B', selId: 'FXBOX_SEL_FX3', button: 3, half: 'single', prefix: 'DELAY2' },
  amp: { label: 'Amp', cat: 'amp', type: 'SYS_KNOB_POS_TYPE' },
  eq: { label: 'EQ', cat: 'eq', sw: 'EQ_SW', groups: ['EQ'] },
  ns: { label: 'Noise gate', cat: 'dyn', sw: 'NS1_SW', groups: ['NOISE_SUPPRESSOR'] },
  amb: { label: 'Ambience', cat: 'amb' },
  sys: { label: 'System', cat: 'dyn' },
};
const KNOB_NAMES = { 1: 'Stomp / Mod 1', 2: 'Delay 1 / Mod 2', 3: 'Reverb / Delay 2' }; // Roland calls these BST/MOD, DELAY/FX and REVERB
const FX_GROUP = { 0: 'TWAH', 1: 'AWAH', 2: 'SUBWAH', 3: 'ADCOMP', 4: 'LIMITER', 6: 'GEQ', 7: 'PEQ', 9: 'GTRSIM', 10: 'SLOWGEAR', 12: 'WAVESYN', 14: 'OCTAVE', 15: 'PITCHSHIFT', 16: 'HARMONIST', 18: 'ACPROCESS', 19: 'PHASER', 20: 'FLANGER', 21: 'TREMOLO', 22: 'ROTARY', 23: 'UNI', 25: 'SLICER', 26: 'VIBRATO', 27: 'RINGMOD', 28: 'HUMANIZER', 29: 'CHORUS', 31: 'ACSIM', 35: 'EVH_PHASER', 36: 'EVH_FLANGER' };
const idsIn = (groups, drop = []) => PARAMS.filter(p => groups.includes(p.group) && p.bytes !== 16 && !drop.includes(p.id)).map(p => p.id);
function paramsFor(b) { // which parameters matter for a block and its current type (same rules as Roland's editor)
  const s = SLOTS[b], t = s.type ? get(s.type) : 0, drop = [s.sw, s.type];
  if (b === 'amp') return ['SYS_KNOB_POS_GAIN', 'SYS_KNOB_POS_BASS', 'SYS_KNOB_POS_MIDDLE', 'SYS_KNOB_POS_TREBLE', 'SYS_KNOB_POS_PRESENCE', 'SYS_KNOB_POS_VOLUME'];
  if (b === 'mod' || b === 'fx') return FX_GROUP[t] ? idsIn([s.prefix + ':' + FX_GROUP[t]]) : [];
  if (b === 'delay' || b === 'delay2') {
    const g = [s.prefix + ':COMMON']; if (t === 9 || t === 10) g.push(s.prefix + ':MOD'); if (t === 10) g.push(s.prefix + ':VINTAGE');
    return idsIn(g, t === 10 ? [b === 'delay' ? 'DLY_COMMON_HICUT' : 'DLY2_COMMON_HICUT'] : []);
  }
  if (b === 'reverb') return idsIn(['REVERB'], t === 5 ? drop : [...drop, 'REVERB_SPRING_SENS']);
  if (b === 'eq') return [...idsIn(['EQ'], drop), 'POSITION_EQ'];
  if (b === 'amb') return idsIn(['AMBIENCE_MOTION']);
  return idsIn(s.groups || [], drop);
}
const typeName = b => { const s = SLOTS[b]; if (!s.type) return ''; const p = P[s.type], n = (p.options || LABELS[s.type] || [])[get(s.type)]; return n || 'Type ' + get(s.type); };
const STRUCT = new Set(['CHAIN_PTN', 'POSITION_EQ', ...PARAMS.filter(p => /^(SYS_LED_STATE|SYS_FXSEL|FXBOX_)/.test(p.id)).map(p => p.id), ...Object.values(SLOTS).flatMap(s => [s.sw, s.type]).filter(Boolean)]);
function dial(button) { // decode an effect knob position (Roland's editor: 0 and 52 are OFF, 1-51 first effect, 53-103 second effect)
  const raw = get('SYS_KNOB_POS_FX' + button);
  if (button === 3) return raw <= 0 ? { half: 'off', level: 0 } : { half: 'single', level: raw - 1 };
  if (raw === 0 || raw === 52) return { half: 'off', level: 0 };
  return raw < 52 ? { half: 'low', level: raw - 1 } : { half: 'high', level: raw - 53 };
}

/* ------------------------------------------------------------ chain screen */
const ICON = {
  drive: '<path d="M2 12h3l2-7 3 14 3-14 3 14 2-7h4"/>', mod: '<path d="M2 9c3-6 5-6 8 0s5 6 8 0 3-3 4-1M2 16c3-6 5-6 8 0s5 6 8 0 3-3 4-1"/>',
  delay: '<path d="M4 5v14M9 7v10M14 9v6M18 10.5v3M21.5 11.5v1"/>', reverb: '<path d="M4 18a8 8 0 0 1 8-8M4 18a14 14 0 0 1 14-14M4 18h.01M4 18a3 3 0 0 1 3-3"/>',
  amp: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="13.5" r="4"/><path d="M6 7h3M15 7h3"/>',
  eq: '<path d="M6 4v16M12 4v16M18 4v16"/><path d="M4 9h4M10 15h4M16 7h4" stroke-width="3"/>', dyn: '<path d="M2 18h7l4-12h9"/><path d="M9 21v-6"/>',
  amb: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5"/><circle cx="20" cy="9" r="1.2" fill="currentColor"/>',
};
const svg = (name, extra = '') => `<svg viewBox="0 0 24 24" ${extra}>${ICON[name]}</svg>`;
function tile(b) {
  const s = SLOTS[b], on = s.sw ? !!get(s.sw) : b === 'amb' ? get('SEND_RETURN_MODE') > 0 : true;
  const t = b === 'amb' ? fmt('SEND_RETURN_MODE', get('SEND_RETURN_MODE')) : typeName(b);
  const btn = h('button', { class: 'tile', type: 'button', style: `--c:var(--${s.cat})`, 'aria-label': s.label + (t ? ', ' + t : '') + (on ? ', on' : ', off'), title: s.sw ? 'Click to open. Double-click to switch on or off.' : 'Click to open' });
  btn.innerHTML = svg(s.cat);
  btn.addEventListener('click', () => { state.sel = b; render(); });
  if (s.sw) btn.addEventListener('dblclick', () => set(s.sw, get(s.sw) ? 0 : 1));
  return h('div', { class: 'tw' + (on ? '' : ' off') + (state.sel === b ? ' cur' : '') }, btn, h('div', { class: 'tcap' }, h('b', {}, s.label), t));
}
const wire = () => h('div', { class: 'wire' });
function renderChain() {
  const path = $('#path'); path.textContent = '';
  const G = { A: () => { const p = h('div', { class: 'pair' }); const order = get('POSITION_EQ') === 0 ? ['eq', 'amp'] : ['amp', 'eq']; p.append(tile(order[0]), wire(), tile(order[1])); return p; }, B: () => pair('booster', 'mod'), D: () => pair('delay', 'fx'), R: () => pair('reverb', 'delay2') };
  const pair = (x, y) => { const p = h('div', { class: 'pair' }); p.append(tile(x), wire(), tile(y)); return p; };
  const order = [['A', 'B', 'D', 'R'], ['B', 'A', 'D', 'R'], ['B', 'D', 'A', 'R']][get('CHAIN_PTN')] || ['B', 'A', 'D', 'R'];
  const node = (ic, t) => { const n = h('div', { class: 'node', title: t }); n.innerHTML = ic; return n; };
  path.append(node('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 12h12M11 6l6 6-6 6"/></svg>', 'Guitar in'), wire(), tile('ns'));
  for (const g of order) path.append(wire(), G[g]());
  path.append(wire(), tile('amb'), wire(), node('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 15v-3a7 7 0 0 1 14 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/></svg>', 'Headphones'));
  $('#lcdnum').textContent = 'CH ' + state.patch;
  $('#lcdname').textContent = state.sync === 'none' ? '' : patchName();
  const cs = $('#chainsel'); cs.value = get('CHAIN_PTN'); cs.parentElement.dataset.st = statusOf('CHAIN_PTN');
  const pb = $('#patches'); pb.textContent = '';
  for (let n = 1; n <= 6; n++) pb.append(h('button', { type: 'button', class: n === state.patch ? 'on' : '', 'aria-pressed': n === state.patch, onclick: () => selectPatch(n) }, String(n), state.names[n] ? h('span', {}, state.names[n]) : null));
  const m = $('#mute'); m.setAttribute('aria-pressed', state.muted); m.querySelector('.lbl').textContent = state.muted ? 'Muted' : 'Mute'; m.title = state.muted ? 'Unmute' : 'Mute';
}

/* ------------------------------------------------------------ device graphics (original drawings, no real brands) */
const BOOST_COL = ['#d8cfb8', '#ecebe6', '#98a3aa', '#c8692a', '#7c8f3b', '#b3522a', '#a23427', null, '#2a2b2f', '#5d3c90', '#2f66b8', '#e3b524', '#3e9a58', '#df8a1f', '#e2661c', '#1d1e21', '#c8a13a', '#e2c81f', '#27282c', '#b6312a', '#b8bcc1'];
const FX_COL = { TWAH: '#7b4d9e', AWAH: '#8a56a8', SUBWAH: '#2b2b2e', ADCOMP: '#3b76c0', LIMITER: '#5b6975', GTRSIM: '#8a5a2b', SLOWGEAR: '#6a7985', WAVESYN: '#1b8e89', OCTAVE: '#7a4a2a', PITCHSHIFT: '#2a6eaf', HARMONIST: '#c13b6a', ACPROCESS: '#b08a4a', PHASER: '#3f8f52', FLANGER: '#6a3e9f', TREMOLO: '#2e8e8a', ROTARY: '#7a5230', UNI: '#34363b', SLICER: '#d03a3a', VIBRATO: '#2b6ecf', RINGMOD: '#44474d', HUMANIZER: '#d05999', CHORUS: '#59b6d5', ACSIM: '#c8a56a', EVH_PHASER: '#e7691b', EVH_FLANGER: '#2a2b2e' };
const DELAY_COL = { 0: '#e8e9ea', 6: '#3a3f8f', 7: '#7a1f3d', 9: '#2c7f8f' };
function inkFor(hexc) { const n = parseInt(hexc.slice(1), 16), l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? '#16171a' : '#f4f1ea'; }
function split(ids, max) { const k = ids.filter(i => kindOf(i) === 'knob'), s = ids.filter(i => kindOf(i) !== 'knob'); return { face: k.slice(0, max), rest: k.slice(max), sw: s }; }
function stomp(b, color, ids, opt = {}) {
  const s = SLOTS[b], ink = inkFor(color), parts = split(ids, 6), n = parts.face.length;
  const d = h('div', { class: 'dev stomp' + (n === 1 ? ' one' : ''), style: `--c:${color};--ink:${ink};--acc:${ink};--track:${ink === '#16171a' ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.2)'};--w:${n > 3 || parts.sw.length > 3 ? 400 : 330}px` });
  if (opt.display) d.append(opt.display);
  d.append(h('div', { class: 'krow' }, parts.face.map(id => knob(id, { big: n <= 2 }))));
  if (parts.sw.length) d.append(h('div', { class: 'srow' }, parts.sw.map(ctl)));
  d.append(h('div', { class: 'plate' }, h('b', {}, opt.title || typeName(b) || s.label), h('span', {}, s.label.toUpperCase())));
  d.append(h('div', { style: 'display:flex;justify-content:center' }, swButton(s.sw, 'foot')));
  return { el: d, rest: parts.rest };
}
function display(id, acc) { const w = h('div', { class: 'lcdwin', style: acc ? '--acc:' + acc : '' }); reg(id, () => { w.textContent = fmt(id, get(id)); }); return w; }
function rack(b, ids, opt = {}) {
  const s = SLOTS[b], parts = split(ids, opt.max || 8);
  const d = h('div', { class: 'dev rack', 'data-cap': 'silver', style: '--acc:' + (opt.acc || '#ff5038') });
  d.append(h('div', { class: 'rhead' }, s.sw ? swButton(s.sw, 'pwr', 'POWER') : null, h('div', { class: 'rname' }, h('b', {}, opt.title || typeName(b) || s.label.toUpperCase()), h('span', {}, opt.sub || s.label.toUpperCase())), h('div', { class: 'grow' }), opt.extra || null, opt.display || null));
  d.append(h('div', { class: 'krow' }, parts.face.map(id => knob(id))));
  if (parts.sw.length) d.append(h('div', { class: 'srow' }, parts.sw.map(ctl)));
  return { el: d, rest: parts.rest };
}
function tape(b, ids) {
  const s = SLOTS[b], parts = split(ids, 6), time = ids.find(i => /DLY_TIME/.test(i));
  const d = h('div', { class: 'dev tape' });
  reg(s.sw, () => d.classList.toggle('run', !!get(s.sw)));
  reg(time, () => d.style.setProperty('--spd', (0.8 + get(time) / 500).toFixed(2) + 's'));
  d.append(h('div', { class: 'deck' }, h('div', { class: 'reel' }), h('div', { class: 'heads' }, h('i'), h('i'), h('i')), h('div', { class: 'reel' })),
    h('div', { class: 'face' }, h('div', { class: 'rhead' }, swButton(s.sw, 'pwr', 'POWER'), h('div', { class: 'rname' }, h('b', {}, 'TAPE ECHO'), h('span', {}, s.label.toUpperCase()))), h('div', { class: 'krow' }, parts.face.map(id => knob(id))), parts.sw.length ? h('div', { class: 'srow' }, parts.sw.map(ctl)) : null));
  return { el: d, rest: parts.rest };
}
function ampDev() {
  const t = get('SYS_KNOB_POS_TYPE'), key = ['flat', 'clean', 'crunch', 'lead', 'brown'][t] || 'clean';
  const d = h('div', { class: `dev amp amp-${key}` + (key === 'crunch' ? ' top' : ''), 'data-cap': { flat: 'silver', clean: 'skirt', crunch: 'cream', lead: 'gold', brown: 'gold' }[key] });
  d.append(h('div', { class: 'amp-grille' }, h('div', { class: 'amp-badge' }, fmt('SYS_KNOB_POS_TYPE', t))),
    h('div', { class: 'amp-panel' }, h('div', { class: 'amp-jewel', title: 'Pilot lamp' }), paramsFor('amp').map(id => knob(id))));
  return { el: d, rest: [] };
}
function geq(b, ids) {
  const s = SLOTS[b], d = h('div', { class: 'dev rack geq' });
  const slide = id => { const p = P[id], i = h('input', { type: 'range', min: p.min, max: p.max, step: 1, 'aria-label': p.label }), v = h('div', { class: 'k-val' }); i.addEventListener('input', () => { if (!set(id, +i.value)) i.value = get(id); }); reg(id, () => { i.value = get(id); v.textContent = fmt(id, get(id)); }); return h('div', { class: 'ctl vslide', 'data-st': statusOf(id) }, v, i, h('div', { class: 'k-lab' }, p.label, dotEl(id))); };
  d.append(h('div', { class: 'rhead' }, swButton(s.sw, 'pwr', 'POWER'), h('div', { class: 'rname' }, h('b', {}, 'GRAPHIC EQ'), h('span', {}, s.label.toUpperCase()))), h('div', { class: 'krow' }, ids.map(slide)));
  return { el: d, rest: [] };
}
function ambDev() {
  const d = h('div', { class: 'dev amb' }), fig = h('div');
  const draw = () => {
    const mode = get('SEND_RETURN_MODE'), ang = (rawOf(P.SEND_RETURN_SEND_LEVEL) * 3 - 180) * Math.PI / 180, x = 150 + 105 * Math.sin(ang), y = 150 - 105 * Math.cos(ang), room = get('SEND_RETURN_SW');
    fig.innerHTML = `<svg viewBox="0 0 300 300" role="img" aria-label="Where the amp sits around your head"><circle cx="150" cy="150" r="${room ? 140 : 118}" fill="none" stroke="#3a3f4a" stroke-dasharray="3 6"/><circle cx="150" cy="150" r="105" fill="none" stroke="${mode ? '#a98bfa' : '#3a3f4a'}" stroke-width="2"/>
      <g transform="rotate(${(state.head || 0) * 3} 150 150)"><circle cx="150" cy="150" r="30" fill="#262a33" stroke="#cfd3da" stroke-width="2"/><path d="M150 112l8 12h-16z" fill="#cfd3da"/><rect x="110" y="136" width="12" height="28" rx="5" fill="#cfd3da"/><rect x="178" y="136" width="12" height="28" rx="5" fill="#cfd3da"/></g>
      <g transform="translate(${x} ${y})" opacity="${mode ? 1 : .3}"><rect x="-17" y="-14" width="34" height="28" rx="4" fill="#15171c" stroke="#e5484d" stroke-width="2"/><circle r="7" fill="none" stroke="#e5484d" stroke-width="2"/></g>
      <text x="150" y="284" text-anchor="middle" fill="#8b909a" font-size="12">${fmt('SEND_RETURN_MODE', mode)}, ${fmt('SEND_RETURN_SW', room)} room${state.head != null ? ', head at ' + state.head * 3 + '°' : ''}</text><text x="150" y="298" text-anchor="middle" fill="#666c77" font-size="10">Sketch, directions not confirmed</text></svg>`;
  };
  ['SEND_RETURN_MODE', 'SEND_RETURN_SEND_LEVEL', 'SEND_RETURN_SW', '__head'].forEach(id => reg(id, draw));
  d.append(fig, h('div', { class: 'panel' }, h('div', { class: 'srow', style: 'justify-content:flex-start;margin:0' }, selectCtl('SEND_RETURN_MODE', 'POSITION TYPE'), selectCtl('SEND_RETURN_SW', 'AMBIENCE TYPE')),
    h('div', { class: 'krow', style: 'justify-content:flex-start' }, knob('SEND_RETURN_SEND_LEVEL', { label: 'GUITAR POSITION', big: true }), knob('SEND_RETURN_RETURN_LEVEL', { label: 'AMBIENCE LEVEL', big: true })),
    h('div', { class: 'srow', style: 'justify-content:flex-start;margin:0' }, toggleCtl('MIXER_SPREAD', 'LOCK STAGE'), toggleCtl('SEND_RETURN_DUMMY', 'LOCK STATIC'))));
  return { el: d, rest: [] };
}
function sysDev() {
  const g = h('div', { class: 'sysgrid' });
  const unit = (title, sub, ids, sw) => { const d = h('div', { class: 'dev rack', 'data-cap': 'silver' }); d.append(h('div', { class: 'rhead' }, sw ? swButton(sw, 'pwr', 'POWER') : null, h('div', { class: 'rname' }, h('b', {}, title), h('span', {}, sub))), h('div', { class: 'krow' }, ids.filter(i => kindOf(i) === 'knob').map(i => knob(i))), h('div', { class: 'srow' }, ids.filter(i => kindOf(i) !== 'knob').map(ctl))); return d; };
  g.append(unit('GLOBAL EQ', 'ALL PATCHES', idsIn(['GLOBAL_EQ'], ['SYS_EQ_SW']), 'SYS_EQ_SW'), unit('KEY AND PEDAL WAH', 'THIS PATCH', ['MASTER_KEY', ...idsIn(['PEDAL_FX'])]), unit('TUNER, USB, POWER', 'HEADPHONES', idsIn(['USB_TUNER', 'SYSTEM'])));
  return { el: g, rest: [] };
}
function deviceFor(b) {
  const s = SLOTS[b], ids = paramsFor(b), t = s.type ? get(s.type) : 0;
  if (b === 'amp') return ampDev();
  if (b === 'amb') return ambDev();
  if (b === 'sys') return sysDev();
  if (b === 'booster') return stomp(b, BOOST_COL[t] || '#888d94', ids);
  if (b === 'ns') return stomp(b, '#6d7782', ids, { title: 'GATE' });
  if (b === 'eq') return rack(b, ids, { title: 'PARAMETRIC EQ', sub: 'PATCH EQ', acc: '#ecd13f', max: 12 });
  if (b === 'mod' || b === 'fx') {
    const g = FX_GROUP[t];
    if (g === 'GEQ') return geq(b, ids);
    if (g === 'PEQ') return rack(b, ids, { acc: '#ecd13f', max: 12 });
    if (g === 'HARMONIST') { const main = ids.filter(i => !/_HARM_\d/.test(i)), r = stomp(b, FX_COL[g], main); r.scale = ids.filter(i => /_HARM_\d/.test(i)); return r; }
    return stomp(b, FX_COL[g] || '#888d94', ids);
  }
  if (b === 'delay' || b === 'delay2') {
    const time = ids.find(i => /DLY_TIME/.test(i));
    if (t === 8) return tape(b, ids);
    if (t === 10) return rack(b, ids, { title: 'SDE-3000', sub: 'DIGITAL DELAY', acc: '#ff3d2e', display: display(time) });
    return stomp(b, DELAY_COL[t] || '#888d94', ids, { display: t === 0 ? display(time, '#49e28a') : null });
  }
  if (b === 'reverb') return rack(b, ids, { sub: 'REVERB', acc: { 1: '#ffb347', 3: '#7fc4ff', 4: '#d9dde3', 5: '#9be36a', 6: '#c59bff' }[t], extra: t === 5 ? h('div', { class: 'springs', title: 'Spring tank' }) : null, display: display('REVERB_TIME', { 1: '#ffb347', 3: '#7fc4ff', 4: '#d9dde3', 5: '#9be36a', 6: '#c59bff' }[t]) });
  return rack(b, ids);
}

/* ------------------------------------------------------------ side cards */
function typeCard(b) {
  const s = SLOTS[b], p = P[s.type], cur = get(s.type), L = p.options || LABELS[s.type];
  const grid = h('div', { class: 'types' });
  L.forEach((name, i) => {
    if (!name) return;
    grid.append(h('button', { type: 'button', class: i === cur ? 'on' : '', onclick: () => { if (!set(s.type, i)) return; if (s.asg) { const col = get(s.selId || 'FXBOX_SEL_' + s.asg); set('FXBOX_ASGN_' + s.asg + '_' + 'GRY'[col], i); } } }, name));
  });
  const c = h('div', { class: 'card ctl', 'data-st': statusOf(s.type) }, h('h3', {}, b === 'amp' ? 'Amp type' : s.label + ' type', dotEl(s.type)), grid);
  return c;
}
function amountCard(b) { // how much of this effect is mixed in. The headphones store it as one value per pair of effects (00 00 04 27, 28, 29).
  const s = SLOTS[b], n = s.button, kid = 'SYS_KNOB_POS_FX' + n, max = n === 3 ? 100 : 50;
  const other = { booster: 'mod', mod: 'booster', delay: 'fx', fx: 'delay' }[b];
  const mine = () => { const d = dial(n); return d.half === s.half ? d.level : 0; };
  const note = h('div', { class: 'note' });
  const lvl = vknob({ label: 'AMOUNT', min: 0, max, get: mine, set: v => set(kid, n === 3 ? 1 + v : s.half === 'high' ? 53 + v : 1 + v), fmt: v => { const d = dial(n); return d.half === s.half ? String(v) : 'OFF'; }, ids: [kid], stId: kid });
  reg(kid, () => { const d = dial(n); note.textContent = d.half === s.half ? '' : d.half === 'off' || !other ? 'Currently off.' : 'Currently off. The amount is set on ' + SLOTS[other].label + ' instead, the two share one setting.'; });
  const card = h('div', { class: 'card' }, h('h3', {}, s.label + ' amount'), h('div', { class: 'hprow' }, lvl, h('div', { style: 'flex:1' }, note, h('button', { class: 'btn', type: 'button', onclick: () => set(kid, 0) }, 'Off'))));
  if (n === 3) { const col = 'GRY'[get('FXBOX_SEL_FX3')] || 'G'; card.append(h('div', { class: 'srow', style: 'justify-content:flex-start' }, selectCtl('FXBOX_FX3_LAYER_' + col, 'AMOUNT CONTROLS'))); }
  return card;
}
function legendCard() {
  const row = (st, t) => h('span', {}, h('b', { class: 'dot', 'data-st': st, style: 'cursor:default;margin:0' }), t);
  return h('div', { class: 'card legend' }, row('ok', 'Tested on your headphones'), row('untested', "From Roland's map, not tested yet"), row('flag', 'Tested, behaved oddly or you marked it wrong'),
    h('span', {}, 'Click a dot after testing to mark it. Drag knobs up and down, hold Shift for fine steps, double-click to reset.'));
}

/* ------------------------------------------------------------ render */
function renderDetail() {
  R = {};
  const b = state.sel, s = SLOTS[b], main = $('#main'), side = $('#side');
  main.textContent = ''; side.textContent = '';
  const dev = deviceFor(b);
  if (b === 'delay' || b === 'delay2') main.append(tempoBar(b));
  main.append(dev.el);
  if (dev.rest && dev.rest.length) main.append(h('div', { class: 'more' }, h('h4', {}, 'More ' + s.label.toLowerCase() + ' controls'), dev.rest.map(ctl)));
  if (dev.scale) main.append(h('div', { class: 'more' }, h('h4', {}, 'User scale (harmony per note)'), dev.scale.map(id => knob(id))));
  if ((b === 'mod' || b === 'fx') && !paramsFor(b).length) main.append(h('p', { style: 'color:var(--mute)' }, 'Roland\'s map has no parameters for this type.'));
  if (b === 'sys') side.append(h('div', { class: 'card', style: 'font-size:13px;color:var(--mute)' }, 'Settings outside the signal chain. None of these have been tested on your headphones yet.'));
  if (s.type) side.append(typeCard(b));
  if (s.button) side.append(amountCard(b));
  if (state.tools) side.append(legendCard());
}
let rq = 0;
function scheduleRender() { if (!rq) rq = requestAnimationFrame(() => { rq = 0; render(); }); }
function render() { renderChain(); renderDetail(); renderLib(); }
let lq = 0;
function scheduleLog() {
  if (lq) return;
  lq = requestAnimationFrame(() => {
    lq = 0; const last = logs[logs.length - 1]; $('#lastlog').textContent = last ? last.line : '';
    if (!$('#logbar').open) return;
    const box = $('#log'); box.textContent = '';
    for (const l of logs.slice(-200)) box.append(h('div', { class: l.cls }, l.line));
    box.scrollTop = box.scrollHeight;
  });
}
const HELP = {
  browser: () => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return {
      title: ios ? 'iPhones and iPads cannot connect' : 'This browser cannot connect',
      body: ios
        ? ['Apple does not allow Web Bluetooth in Safari or in Chrome on iOS, so no browser Apple ships can reach the headphones. This is not something WazaMate can work around.',
           'Everything else works here: build patches, keep a library, import and export files. They will play as soon as you open the same library on a desktop.',
           'If you want to connect from this device, a third party browser with Web Bluetooth built in, such as Bluefy, is the usual route. That is untested with WazaMate.']
        : ['Connecting needs Web Bluetooth, which this browser does not have. Chrome or Edge on Windows, macOS or Linux will work, as will Chrome on Android. Firefox does not support it on any platform.',
           'You can still build patches and export them here, then open the file on a machine that can connect.'],
      link: ios ? { text: 'Browser support, in the README', href: 'https://github.com/peanutismint/WazaMate#browser-support' } : null,
    };
  },
  windows: () => ({
    title: 'Still not connecting',
    body: ['Two attempts failed. Worth trying first, in order:',
      '1. On the headphones, turn Bluetooth off and on with a short hold of the Bluetooth button, then connect again.',
      '2. Close anything else that might be holding the headphones: Roland\'s app on your phone, another WazaMate tab, a WIDI Master. They accept one MIDI connection at a time.',
      '3. On Windows, "GATT Error: Not paired" needs a particular dance: pair the headphones through Windows Settings using Add device and Show all devices, then uninstall them in Device Manager, then connect here again. The README has the full sequence.'],
    link: { text: 'The full Windows sequence', href: 'https://github.com/peanutismint/WazaMate#if-windows-refuses-to-connect' },
  }),
};
function showHelp(kind) {
  const d = HELP[kind](), box = $('#helpbox');
  box.textContent = '';
  box.append(h('h2', {}, d.title), ...d.body.map(p => h('p', {}, p)));
  if (d.link) box.append(h('p', {}, h('a', { href: d.link.href, target: '_blank', rel: 'noopener' }, d.link.text)));
  box.append(h('button', { class: 'btn primary', type: 'button', onclick: () => $('#help').close() }, 'Close'));
  $('#help').showModal();
}
function renderBattery() {
  const e = $('#battery'), v = state.battery;
  // Nothing sensible to show unless a non-zero byte arrived: the format is unverified.
  if (v == null || v === 0 || v > 100) { e.hidden = true; return; }
  e.hidden = false;
  const pct = v <= 4 ? [0, 25, 50, 75, 100][v] : v;
  e.style.setProperty('--fill', pct + '%');
  e.title = 'Headphone battery, about ' + pct + '%. Roland\'s app shows four levels, and the raw value here is ' + v + '. The exact meaning is not confirmed.';
  e.setAttribute('aria-label', 'Battery about ' + pct + ' percent');
}
/** Puts the headphones into their battery and tuner modes briefly, logging whatever they send. */
async function probeModes() {
  if (!link.connected) return toast('Connect the headphones first.');
  if (!confirm('This switches the headphones into their battery mode, then their tuner mode, then back to normal play.\n\nYour sound may cut out for about fifteen seconds. Play and hold a note when the log says to.\n\nNothing is written to any patch. Run it?')) return;
  const mark = t => log('rx', null, '--------- ' + t + ' ---------');
  try {
    mark('probe: battery mode');
    await tx(dt1(RUNNING_MODE, [3]), 'Running mode 3 (battery)');
    await sleep(2500);
    await read(BATTERY_ADDR, 1, 1200);
    mark('probe: tuner mode, PLAY AND HOLD A NOTE NOW');
    await tx(dt1(RUNNING_MODE, [1]), 'Running mode 1 (tuner)');
    await sleep(8000);
    await read([0x7F, 0x00, 0x03, 0x00], 2, 1200);
    await sleep(1500);
  } finally {
    await tx(dt1(RUNNING_MODE, [0]), 'Running mode 0 (play)');
    mark('probe finished, back in play mode');
  }
  toast('Probe finished. Copy the log and send it over.');
}
let toastTimer = null;
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => e.classList.remove('show'), 4200); }
function parseHex(s) { const m = s.trim().split(/[\s,]+/).filter(Boolean).map(x => parseInt(x, 16)); return m.length && m.every(n => n >= 0 && n <= 255) ? m : null; }
const UI_ICON = {
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  tools: '<path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l4 6M21 9l-4 6"/>', bt: '<path d="M7 7l10 10-5 4V3l5 4L7 17"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h7V3M8 21v-7h8v7"/>', dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  store: '<path d="M5 14v-2a7 7 0 0 1 14 0v2"/><rect x="3" y="13" width="4" height="7" rx="1.5"/><rect x="17" y="13" width="4" height="7" rx="1.5"/><path d="M12 3v7M9 7l3 3 3-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  imp: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  blank: '<rect x="4" y="3" width="16" height="18" rx="2"/>',
  paste: '<rect x="7" y="4" width="11" height="16" rx="2"/><path d="M11 4V3h3v1M4 8v11a2 2 0 0 0 2 2h1"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>', exp: '<path d="M12 15V3M7 8l5-5 5 5M4 20h16"/>',
};
function init() {
  for (const e of document.querySelectorAll('[data-ic]')) e.insertAdjacentHTML('afterbegin', `<svg class="uic" viewBox="0 0 24 24" aria-hidden="true">${UI_ICON[e.dataset.ic]}</svg>`);
  try { state.tools = localStorage.getItem('wazamate.tools') === '1'; state.div = JSON.parse(localStorage.getItem('wazamate.divs') || '{}'); } catch (e) { }
  $('#battery').hidden = true;
  if (!navigator.bluetooth) $('#sync').addEventListener('click', () => showHelp('browser'));
  resetBuffers(true);
  $('#tools').checked = state.tools;
  $('#tools').addEventListener('change', e => { state.tools = e.target.checked; try { localStorage.setItem('wazamate.tools', state.tools ? '1' : '0'); } catch (err) { } setSync(state.sync); render(); });
  document.addEventListener('click', e => { for (const m of [$('#adv'), $('#pmenu'), $('#smenu')]) if (m.open && !m.contains(e.target)) m.open = false; });
  $('#connect').addEventListener('click', connect);
  $('#preset').addEventListener('change', e => presetLoad(e.target.value));
  $('#psave').addEventListener('click', presetSave);
  const acts = { pnew: presetNew, pinit: presetInit, pdup: presetDuplicate, pren: presetRename, pdel: presetDelete, pexp: () => presetExport(false), pexpall: () => presetExport(true), pimp: () => $('#pfile').click(), pbackup: backupMemories, pllm: copyLlmPrompt, ppaste: pasteImport, pgen: llmCreate, pllmset: llmSettings };
  for (const k in acts) $('#' + k).addEventListener('click', () => { $('#pmenu').open = false; acts[k](); });
  $('#pfile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) presetImport(f); });
  $('#mute').addEventListener('click', toggleMute);
  $('#hs').addEventListener('click', sendConnect);
  $('#readbtn').addEventListener('click', () => { if (link.connected) syncAll(); });
  $('#sysbtn').addEventListener('click', () => { state.sel = 'sys'; render(); });
  $('#test').addEventListener('change', e => { state.test = e.target.checked; setSync(state.sync); if (state.test) toast('Test mode on. Untested controls now send to the headphones. Try one at a time.'); });
  const cs = $('#chainsel'); (P.CHAIN_PTN.options).forEach((n, i) => cs.append(h('option', { value: i }, n)));
  cs.addEventListener('change', () => { if (!set('CHAIN_PTN', +cs.value)) cs.value = get('CHAIN_PTN'); });
  $('#chainlab').append(dotEl('CHAIN_PTN'));
  $('#logbar').addEventListener('toggle', scheduleLog);
  $('#sendraw').addEventListener('click', () => { const m = parseHex($('#raw').value); if (!m) return toast('Type hex bytes, for example F0 41 ... F7.'); tx(m, 'Raw message'); });
  $('#senddt1').addEventListener('click', () => { const m = parseHex($('#raw').value); if (!m || m.length < 5 || m.some(n => n > 127)) return toast('Type 4 address bytes and then the data bytes, all 00 to 7F.'); tx(dt1(m.slice(0, 4), m.slice(4)), 'Raw DT1'); });
  $('#probe').addEventListener('click', probeModes);
  $('#copylog').addEventListener('click', () => navigator.clipboard.writeText(logs.map(l => l.line).join('\n')).then(() => toast('Log copied.')));
  $('#copymarks').addEventListener('click', () => { const out = Object.entries(marks).map(([id, m]) => `${m === 'ok' ? 'WORKS' : 'WRONG'}  ${id}  ${P[id] ? hex(addrOf(P[id])) : ''}`).join('\n') || 'No marks yet.'; navigator.clipboard.writeText(out).then(() => toast('Test results copied. Paste them into the chat.')); });
  setSync('preview'); render();
}
if (typeof document !== 'undefined') init();
