# Talking to the WAZA-AIR

Notes on controlling BOSS WAZA-AIR headphones over Bluetooth MIDI. Everything
marked **confirmed** was seen working on real headphones. Everything else is
taken from Roland's own editor app and has not been proven on hardware, so treat
it accordingly.

## The connection

The headphones use two separate Bluetooth links: ordinary Bluetooth audio, and a
BLE MIDI link that advertises as **WAZA-AIR MIDI**. Control happens entirely on
the MIDI link.

- Service UUID `03b80e5a-ede8-4b33-a751-6ce34ec4c700`
- Characteristic UUID `7772e5db-3868-4112-a1a9-f2669d106bf3`

**Only one client at a time.** A phone running Roland's app, a WIDI Master, or a
second browser tab will hold the link and lock everything else out.

### BLE-MIDI framing matters

**Confirmed, and the single most important detail here.** A SysEx message needs
its own timestamp byte immediately before the closing `F7`. Without it the
headphones accept the write at the Bluetooth level and then silently ignore the
message. This cost days of debugging before it was found.

```
packet      = [header][timestamp][midi bytes...]
continued   = [header][midi bytes...]

t           = milliseconds & 0x1FFF
header      = 0x80 | ((t >> 7) & 0x3F)
timestamp   = 0x80 | (t & 0x7F)
```

Split anything longer than 20 bytes across packets, with each continuation
packet starting with its own header byte. For SysEx, strip the trailing `F7`,
write the body across packets, then append `timestamp, 0xF7` at the end, moving
to a new packet if the pair will not fit.

## Message format

**Confirmed.** Every write is a Roland DT1:

```
F0 41 00 00 00 00 6A 12 [A3 A2 A1 A0] [data...] [checksum] F7
|  |  |  -----------  |  |
|  |  |  model ID     |  command 12 = DT1 (write), 11 = RQ1 (read)
|  |  device ID 00
|  Roland manufacturer ID
SysEx start
```

The checksum covers the address and data bytes only, not the header:

```js
const checksum = bytes => (128 - bytes.reduce((a, b) => (a + b) & 0x7f, 0)) & 0x7f;
```

Reads are RQ1: the same shape, command `11`, with a four byte size in place of
the data. The headphones answer with a DT1 at that address.

Known good messages, byte for byte:

| What | Message |
| --- | --- |
| Select patch 1 | `F0 41 00 00 00 00 6A 12 00 01 00 00 00 01 7E F7` |
| Stomp on | `F0 41 00 00 00 00 6A 12 60 00 00 30 01 6F F7` |
| Read 10 bytes of amp state | `F0 41 00 00 00 00 6A 11 00 00 04 20 00 00 00 0A 52 F7` |

## The handshake

**Confirmed.** Two writes, and until they are sent most controls do nothing:

| Address | Data |
| --- | --- |
| `7F 00 00 01` | `01` |
| `7F 00 00 02` | `00` |

Sending these as acknowledged BLE writes (`writeValueWithResponse`) is worth it,
because a refused write then shows up as an error instead of vanishing.

Resend after the headphones restart. It is not known whether the state survives
a power cycle, so WazaMate sends it on every connect.

## Address ranges

| Range | Holds |
| --- | --- |
| `00 00 xx xx` | Live amp and effect state, and system settings |
| `00 01 00 00` | Current patch number, data `00 0n` |
| `60 00 xx xx` | The edit buffer, the patch playing right now |
| `10 0n 00 00` | Stored patch n, 1 to 6 |
| `7F xx xx xx` | Session and editor commands |

A patch is 2335 bytes. Not every byte is defined: **the headphones skip
undefined bytes and return a shorter reply than you asked for**, so a reader
that waits for the exact byte count will hang. Ask only for stretches that
Roland's map defines, and accept short replies.

## Confirmed addresses

| Control | Address | Values |
| --- | --- | --- |
| Patch select | `00 01 00 00` | `00 01` to `00 06`, two bytes |
| Amp type | `00 00 04 20` | 0 Flat, 1 Clean, 2 Crunch, 3 Lead, 4 Brown |
| Gain | `00 00 04 21` | 0 to 100 |
| Volume | `00 00 04 22` | 0 to 100 |
| Bass, middle, treble, presence | `00 00 04 23` to `26` | 0 to 100 |
| Effect level dials | `00 00 04 27` to `29` | see below |
| Effect button state | `00 00 04 10` to `15` | LED colour and selection |
| 3D mode | `60 00 06 56` | 0 Off, 1 Surround, 2 Static, 3 Stage |
| 3D room | `60 00 06 55` | 0 Studio, 1 Stage |
| Stomp on/off | `60 00 00 30` | 0 or 1 |
| Mod 1, Mod 2 on/off | `60 00 01 40`, `60 00 03 4C` | 0 or 1 |
| Delay 1, Delay 2 on/off | `60 00 05 60`, `60 00 10 4E` | 0 or 1 |
| Reverb on/off | `60 00 06 10` | 0 or 1 |
| Noise gate on/off | `60 00 06 63` | 0 or 1 |
| Patch EQ on/off | `60 00 01 30` | 0 or 1 |
| Global EQ on/off | `00 00 04 32` | 0 or 1 |
| Chain order | `60 00 12 00` | 0, 1 or 2, see below |

There is no mute command. Mute is volume 0, so remember the old value and write
it back to unmute.

### Effect level dials

Six effects share three stored values, a leftover from the Katana amps that use
the same editor app. **Confirmed** from Roland's code and from live logs:

- Dials 1 and 2 (stomp with mod 1, delay 1 with mod 2): `0` and `52` mean off,
  `1` to `51` is the first effect at level 0 to 50, `53` to `103` is the second
  at level 0 to 50.
- Dial 3 (reverb with delay 2): `0` is off, `1` to `101` is level 0 to 100.

WazaMate reads and writes these values as part of a patch, so presets and
backups carry them, but from v0.16 it gives them no control of their own and
does not describe them to an LLM. They modelled a physical knob the headphones
do not have, and one value standing for two effects made every other level
control harder to reason about.

**Do not write these, and do not store them.** Confirmed over 18 to 20 Nov 2026:

- All six effect slots are independent in ordinary use. Stomp with mod 1, and
  delay 1 with mod 2, are audible together as long as nothing writes these
  addresses.
- Writing one forces the hardware to a single effect of its pair and mutes the
  other. With stomp and mod 1 both on and mod 1 set to tremolo, writing `1A` to
  `00 00 04 27` silenced the tremolo and `4E` silenced the stomp.

This is the same shape as the FXBOX block below: Katana panel state that the
firmware maintains for itself, which does harm only when an editor writes it
back. Two separate bugs came from exactly that, so from v0.22 WazaMate does not
store these in presets, does not send them, offers no control for them and does
not describe them to an LLM. They are still decoded in the log, so an incoming
one is named rather than showing as a bare address.

### The FXBOX block, and why a push must skip it

`60 00 12 01` to `12 1E`, apart from `12 00`, `12 17` and `12 18`, holds the
Katana's effect-button configuration: which effect each half of each button
picks, for each of the three colour layers, plus the selections. **Confirmed
20 Nov 2026:** the headphones keep these in step with the effect types by
themselves, and they also work the other way, so writing one makes them
re-derive the type from it.

That broke every patch load. `sendWholePatch` walked the buffer in address
order, so the FXBOX block went out last, carrying assignments left over from
whatever patch was read at connect. A log of one load shows it plainly:

| Time | What happened |
| --- | --- |
| 46.479 | push writes `01 41` = `03`, mod 1 set to COMP |
| 46.807 | headphones confirm `01 41` = `03` |
| 46.830 | headphones update `12 04` to `03` on their own |
| 48.902 | push writes the FXBOX block, `12 04` = `1D`, stale |
| 48.945 | headphones confirm `12 04` = `1D` |
| 49.005 | headphones push `01 41` = `1D`, mod 1 is CHORUS again |

The same two seconds turned PLATE back into HALL through `12 0D`, and DIGITAL
back into SDE-3000 through `12 07`. It looked like the LLM changing its mind,
because the explanation named the effects it had asked for and the editor
quietly replaced them.

From v0.21 a push skips every `FXBOX_` byte, with a test to keep them out.
`CHAIN_PTN`, `POSITION_SEND_RETURN` and `POSITION_EQ` sit inside the same
address range and are still sent.

### Chain order

`CHAIN_PTN` at `60 00 12 00` picks where the amp sits:

| Value | Order |
| --- | --- |
| 0 | In, amp and EQ, stomp and mod, delay and mod 2, reverb, out |
| 1 | In, stomp and mod, amp and EQ, delay and mod 2, reverb, out |
| 2 | In, stomp and mod, delay and mod 2, amp and EQ, reverb, out |

`POSITION_EQ` at `60 00 12 18` puts the patch EQ before or after the amp.

## What the headphones send back

**Confirmed.** The headphones are chatty, which makes live sync easy:

- **Every write is echoed** back at the same address once it lands.
- **After a patch change** they push the amp knobs, the effect dials and the
  effect button state, unasked.
- **Changing a patch on the headphones** sends the new patch number, so a UI can
  follow along.

### Head tracking

**Confirmed.** On patches with the gyro enabled, `7F 00 06 00` streams one byte
several times a second as you turn your head. The value runs 0 to 119 and wraps,
which works out at 3 degrees per step for a full circle, although that step size
is inferred from the wrap rather than documented.

### Battery and tuner

**Confirmed** by a probe on 2026-11-18. Both are push-only and switched on by
running mode, `7F 00 00 02`. A plain read of either address gets no answer.

| Running mode | Effect |
| --- | --- |
| `00` | Normal play. The CONNECT handshake writes this. |
| `01` | Tuner. Sound keeps playing. The headphones push `7F 00 03 00` about every 50 ms while a note sounds, less often once it settles. |
| `03` | Battery. The headphones push `7F 00 05 02` once a second. |

**Tuner frame**, six data bytes:

| Byte | Meaning |
| --- | --- |
| 0 | Note. Open G (G3) reads `43` (67), so the octave is `floor(n / 12) - 2`. |
| 1 to 4 | One 16-bit value, a nibble per byte. `5000` is in tune, 100 per cent, so cents = (value - 5000) / 100. |
| 5 | `01` when the headphones count the note as in tune. Seen set from -2 to +3 cents. |

All six bytes zero means no note. The headphones send that on entering and
leaving tuner mode.

**Battery** is one byte, 0 to 3: the number of cells Roland's app lights. A
reading of `01` showed as 1 of 3 cells there, with the headphones' LED green
and not on USB power. Whether entering mode 3 interrupts the sound is not yet
known, so WazaMate only steps into it for about a second, on connect and when
the battery icon is clicked.

### Addresses missing from Roland's map

**Confirmed** by observation, meaning unclear. Writing an amp knob also produces
a message at one of these, which looks like the patch's own copy of the value:

| Address | Appears when |
| --- | --- |
| `60 00 00 51` | Amp type changes |
| `60 00 00 52` | Gain changes |
| `60 00 00 54` | Bass changes |
| `60 00 00 58` | Volume changes |

Bass maps one to one. Gain does not, so the headphones appear to rescale gain
per amp type.

## Storing a patch

**Confirmed.** Memory 1 was overwritten this way on 2026-11-16 and read back with
its new name. The sequence is Roland's own: write the name into the edit buffer,
then issue the store command.

1. Write 16 ASCII bytes of the patch name to `60 00 00 00`.
2. Write `00 0n` to `7F 00 01 04`, where n is the memory 1 to 6.
3. The headphones answer at the same address when it has landed.

**This overwrites the memory and cannot be undone.** Read the six patches out
and keep a copy before experimenting.

## Windows

Windows 11 is unreliable with Bluetooth MIDI. Chrome's device picker can report
WAZA-AIR MIDI as "Paired" while Windows refuses the secure link, which surfaces
as `GATT Error: Not paired` when subscribing to notifications. Pairing once
through Windows Settings, then uninstalling the device in Device Manager, has
cleared it. Retrying the GATT connection a few times is worth doing anyway,
since the first attempt often drops.
