# WazaMate

A web editor for the BOSS WAZA-AIR wireless guitar headphones.

Open one page in your browser, connect over Bluetooth, and get at every amp,
effect and setting the headphones have, laid out as a signal chain you can click
through. No app store, no install, no account.

WazaMate is a single HTML file. Everything runs in your browser, on your own
machine. Nothing is uploaded anywhere, there is no server, and there is nobody
collecting anything.

> Not affiliated with, endorsed by, or supported by Roland or BOSS. WAZA-AIR and
> BOSS are trademarks of their respective owners. This is an independent project
> built for people who own these headphones.

## What it does

**See the whole sound at once.** The signal chain runs along the top: noise
gate, stomp, mod, amp, EQ, delays, reverb and the 3D ambience. Each block shows
what it is set to and whether it is on. Click one to open it.

**Real controls, not a wall of sliders.** Open the stomp block and you get a
pedal with knobs on it. Pick the tape echo and you get a tape machine with
spinning reels. Switch the amp to Brown and the amp changes to match. The
controls are the ones Roland's own editor exposes, grouped the way the gear
would be.

**A preset library the headphones do not have.** The headphones hold six
memories. WazaMate lets you keep as many presets as you like in your browser,
load any of them instantly, and store the one you want into any of the six
memories when you are happy with it.

**Share presets as files.** Export one preset or your whole library to a small
`.json` file and send it to someone. They import it and hear what you heard.

**Follows the headphones.** Change a patch using the button on the headphones
and the screen follows. Turn your head and the ambience view turns with you.

## Getting started

Open `index.html` in Chrome or Edge on a desktop, or visit the hosted page if
you are using one. Press **Connect headphones** and pick WAZA-AIR MIDI.

Without a connection everything still works in preview mode, so you can build
and export presets with the headphones switched off.

### Browser support

Web Bluetooth is what makes this work, and not every browser has it.

| Where | Works |
| --- | --- |
| Chrome or Edge on Windows, macOS, Linux | Yes |
| Chrome on Android | Yes |
| **Safari or Chrome on iPhone and iPad** | **No** |
| Firefox anywhere | No |

**iPhone and iPad cannot connect.** Apple does not allow Web Bluetooth in any
browser on iOS, and that is not something this project can work around. The
editor, the preset library and import and export all work fine on an iPhone, you
just cannot talk to the headphones. Third party browsers such as Bluefy add Web
Bluetooth on iOS and may work, but that is untested here.

### If Windows refuses to connect

Windows is awkward with Bluetooth MIDI. If you get **"GATT Error: Not paired"**,
this sequence has worked:

1. Turn Bluetooth off and on on the headphones so the blue light flashes.
2. In Windows Settings, Bluetooth & devices, **Add device**, then **Show all
   devices**, and connect to WAZA-AIR MIDI.
3. Open Device Manager, find WAZA-AIR MIDI under Bluetooth, and **uninstall** it.
4. Back in WazaMate, press Connect headphones and pick WAZA-AIR MIDI.

Only one thing can hold the headphones' MIDI connection at a time, so close
Roland's app, and any other browser tab running WazaMate, before connecting.

## Your presets live in your browser

This is the one thing worth knowing before you spend an evening building sounds.

Presets are saved in your browser's local storage for this page. That means:

- **Clearing your browsing data can delete them.** "Cookies and other site data"
  is usually what does it, and browsers often clear it without making a fuss.
- They belong to one browser on one machine. Presets made in Chrome will not
  appear in Edge, or on your laptop.
- Opening the file from a different folder or under a different name can leave
  the old presets behind.

**So export your library.** Preset menu, **Export whole library**, and keep the
file somewhere safe. It takes two seconds and it is the only real backup there
is. Do it before you store anything into the headphones' memories, too, because
storing overwrites what was in that memory and the factory patches do not come
back on their own.

## Advanced

Under **Advanced**, turn on **Testing tools** to get:

- A live MIDI log of every message in and out, with a copy button.
- A console for sending raw SysEx by hand.
- Test marks on every control, for tracking what has been confirmed on hardware.
- **Send CONNECT** and **Read state** for re-running the handshake or re-reading
  the headphones by hand.

If something misbehaves, turning this on and copying the log is the fastest way
to work out what happened.

## Building from source

WazaMate ships as one file so it can be opened straight from disk. That file is
built from `src/`:

```
src/template.html   page structure
src/style.css       all styling
src/app.js          protocol, state and interface
src/schema.json     the parameter data (see below)

python3 build.py            writes index.html
python3 build.py --check    fails if index.html is stale
node tools/test.js          checks message encoding against hardware captures
```

Only Python 3 and Node are needed, with no packages to install. If you edit
anything in `src/`, run `build.py` and commit the rebuilt `index.html` too,
since that is the file the site actually serves.

### Where the parameter data comes from

WazaMate never guesses an address. Every parameter, range and display label in
`src/schema.json` was extracted from the data files inside Roland's own editor
app, BTS for WAZA-AIR. `tools/extract_schema.py` is the script that does it, kept
here so the data can be checked or rebuilt from a newer version of the app.

`docs/protocol.md` covers the message format, the handshake and what has been
confirmed on real hardware.

## Support

If WazaMate is useful to you and you would like to chip in towards the domain
and keep it free for everyone, there will be a link here. Entirely optional, and
the app will never ask you for anything.

<!-- Add the link when you have one, for example:
[Buy me a coffee](https://buymeacoffee.com/yourname)
-->

## Licence

MIT, see [LICENSE](LICENSE).
