# Voxlabs

A local, ElevenLabs-Studio-style audiobook editor that uses the **Cartesia TTS API** (Sonic 3.6) as its voice engine.
Runs on Windows, macOS and Linux. All projects, text and audio stay on your machine.

## Features

- **Projects → chapters → paragraphs**, like ElevenLabs Studio. Drag chapters to reorder, double-click to rename.
- **Line-by-line generation.** Generate a whole chapter (several paragraphs in parallel) or one paragraph at a time. Live progress per line.
- **Edit and regenerate only what changed.** Edited paragraphs are marked "Changed since generated". The Generate button only redoes those.
- **History.** Every regeneration is kept. Play any older take and switch back to it.
- **Pauses.** Lines made only of `<break time="1s" />` tags become pause rows (shown as `⏸ 1s` chips). Pause rows are silence added locally, so they cost no credits. A single break tag inside a sentence is sent to Cartesia.
- **Voices per project, chapter or paragraph.** The paragraph voice overrides the chapter voice, which overrides the project voice.
- **Generation settings like the Cartesia playground**: voice, speed, volume, emotion, model, sample rate and bit depth. Set project defaults, and override voice, speed, volume or emotion on any paragraph from the chip on its row. Emotion works for Hindi too. Cartesia inline tags also work: `<speed ratio="1.2"/>`, `<volume ratio="1.5"/>`, `<emotion value="calm"/>`, `<spell>ABC</spell>`, `[laughter]`.
- **Smooth paragraphs.** Chapter generation uses Cartesia continuations, so each paragraph carries on the tone of the one before. Clip edges are trimmed and faded, and a set gap is placed between paragraphs. The gap is adjustable in Project settings.
- **Studio quality audio.** New projects generate 48 kHz, 32-bit float WAV. Older projects stay at 44.1 kHz, 16-bit until you change it in Project settings.
- **Player** that plays the whole chapter with pauses, highlights the current paragraph, and seeks by clicking the timeline.
- **Import**: paste text, or upload `.txt` / `.docx` files or a `.zip` of them. Each file becomes a chapter, in natural order (s1, s2, … s10).
- **Export**: full project, current chapter, or chosen chapters. One file per chapter (ZIP), one merged file, or one file per paragraph (ZIP). Formats: WAV (keeps the source quality), MP3 (128–320 kbps), FLAC (24-bit), OGG. ZIPs include the script text and a `manifest.json`.
- **Credits left** at the top of the sidebar, like ElevenLabs. Enter your Cartesia plan size and renewal day in Settings. Add an optional Cartesia admin key for exact usage; without it the app counts the characters it sends.
- **Voice library**: search Cartesia voices, filter by language and gender, preview, star favourites, and test any voice with your own sentence.
- **Voice cloning**: upload a clip or record with your microphone, trim it to 10–60 seconds, and create an instant clone. You can delete clones and add extra accents or languages to them.

## Requirements

- **Node.js 22 or newer**: https://nodejs.org (LTS installer for Windows/macOS, or your package manager on Linux).
- A **Cartesia API key**: https://play.cartesia.ai → API keys.
- Nothing else. ffmpeg and SQLite come with the npm packages for all three operating systems.

## Start

**Windows:** double-click `start.cmd`.

**macOS / Linux:**

```sh
./start.sh
```

The first start installs packages and builds the app. Then it opens http://localhost:3000.

1. The first visit asks you to **create the admin account**.
2. Go to **Settings**, paste your Cartesia API key, and click **Test key**.
3. Go to **Account & users** to add teammates. Members can do everything except change the API key and manage users.

To host it for a team on a company server, see **[DEPLOY.md](DEPLOY.md)**. It covers Docker, Linux with systemd and nginx, Windows Server, backups, and server requirements.

The key can also go in a `.env.local` file instead (copy `.env.example`).

After updating the code, rebuild once:

```sh
REBUILD=1 ./start.sh     # macOS / Linux
```

On Windows, in a Command Prompt in the app folder:

```bat
set REBUILD=1
start.cmd
```

### Development mode

```sh
npm install
npm run dev        # http://localhost:3000, reloads on code changes
```

## Work on it from another computer

The code is on GitHub at https://github.com/Voxsama/voxlabs (private). Install Node.js 22 and Git, then:

```sh
git clone https://github.com/Voxsama/voxlabs
cd voxlabs
npm install
npm run build
./start.sh          # Windows: double-click start.cmd
```

The `data/` folder is not in Git. Copy it over yourself if you want the same projects, audio, users and API key. Otherwise the first visit asks you to create the admin account.

After each change: `git add -A && git commit -m "what changed" && git push`. On the other computer: `git pull`.

## Releasing a new version

```sh
npm version minor     # new features (npm version patch for fixes). Bumps package.json, commits, tags vX.Y.Z
git push --follow-tags
gh run watch          # or open the repo → Actions tab
```

The tag starts `.github/workflows/release.yml`. It builds the Docker image `ghcr.io/voxsama/voxlabs:vX.Y.Z` (and `:latest`) and creates a GitHub Release with notes. The server team then updates as described in [DEPLOY.md](DEPLOY.md#updating). The version shows at the bottom of the sidebar, at the top of Settings, and at `/api/version`.

## Typical workflow

1. **Projects → New project.** Set the name, language (e.g. Hindi), model, and default voice. Optionally attach chapter files.
2. In the studio, **+ Add** a chapter or **Import** files. Then **Paste text**.
3. Click **Generate**. Listen with the player at the bottom.
4. Fix a line: edit the text, then click **Regenerate** on that line or press Ctrl/Cmd+Enter.
   - Enter at the end of a line adds a new line below. Enter at the start adds one above. Enter in the middle splits the line.
   - Backspace on an empty line deletes it. Backspace at the start of a line merges it with the one above. Delete at the end merges the next line in.
   - Arrow up and down move between lines. Pasting several lines into a row creates one row per line.
   - Hover a row (or Tab into it) for its actions: Play, Regenerate, History, Text above, Pause above and Delete. Click the empty space under the last line to add a line.
   - Space plays or pauses the chapter when you are not typing in a field.
5. **Export** when every paragraph is generated.

### Themes

The theme switch is at the bottom of the sidebar and on the login page. Pick System (follows your OS), Studio (dark) or Paper (light). The choice is remembered per browser.

## Where data is stored

Everything is in the `data/` folder next to the app. Set `DATA_DIR` to store it elsewhere.

```
data/studio.db           projects, chapters, paragraphs, versions, settings
data/audio/<project>/…   one WAV per generated paragraph version
data/cache/              merged chapter audio and converted clips for the player (safe to delete)
data/session-secret      signs login cookies (keep private)
```

Back up `data/` to back up everything. The folder can be copied between Windows, macOS and Linux.

## Settings (`.env.local`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `CARTESIA_API_KEY` | none | API key. A key saved in the Settings page wins. |
| `CARTESIA_ADMIN_KEY` | none | Optional admin key (`sk_car_admin_...`) for exact credit usage. A key saved in Settings wins. |
| `CARTESIA_VERSION` | `2026-08-14` | Cartesia API version header |
| `DATA_DIR` | `./data` | Where the database and audio are stored |
| `GEN_CONCURRENCY` | `3` | Paragraphs generated at the same time. Also changeable in Settings. |
| `FFMPEG_PATH` | bundled | Use your own ffmpeg binary |
| `SESSION_SECRET` | random file in `DATA_DIR` | Secret that signs login cookies |
| `AUTH_DISABLED` | off | `1` turns the login off. Only for a private single-user PC. |

## Design skills

Claude Code skills for UI work live in `.claude/skills/`:

- **voxlabs-ui**: Voxlabs house rules (colours, components, editor keys, review loop).
- **ui-ux-pro-max**: design direction, palettes and fonts. Needs Python 3 (check with `python3 --version`).
- **impeccable**: polish, audit and critique. Downloads a small engine on first use.
- **frontend-design**: avoids generic, templated looks.
- **baseline-ui**: quick spacing and hierarchy pass.
- **fixing-accessibility**: accessibility check before shipping.

## Tests

```sh
npm test            # unit tests (text splitting, pauses, WAV handling)
npm run typecheck
npm run smoke       # real Cartesia call: writes data/smoke.wav (uses a few credits)

# Full end-to-end test against a fake Cartesia API (no credits used):
npm run build
npm run mock &                                                    # fake API on :4010
CARTESIA_BASE_URL=http://localhost:4010 CARTESIA_API_KEY=sk_car_mock DATA_DIR=/tmp/studio-test npx next start -p 3001 &
npm run e2e -- http://localhost:3001
```

CI (`.github/workflows/ci.yml`) runs all of these on Ubuntu, Windows and macOS.

## Notes and limits

- Cartesia documents emotion for English. It is accepted for Hindi and other languages, where it works as a hint.
- Long paragraphs (over 1500 characters) are split at sentence ends (`.`, `?`, `!`, `।`) when imported.
- Some Cartesia voices have no preview clip. The ▶ button then generates a short sample once, which uses a few credits.
- Voice cloning needs the speaker's permission. The app asks you to confirm this before creating a clone.
- Professional voice clones (30+ minutes of audio) are made in the Cartesia dashboard. They then appear in the voice library like any other voice.
