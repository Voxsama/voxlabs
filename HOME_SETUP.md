# Voxlabs — take it home, put it on GitHub, ship updates to a server you don't own

Follow the parts in order. Every command works in a terminal on Windows (PowerShell), macOS or Linux unless marked otherwise. At home you can also open the folder in Claude Code and say "follow HOME_SETUP.md part C" for the code changes.

## Part A — What to take home

Copy the whole folder `Cartasia_AI`. Two subfolders are big and can be left out; they are rebuilt automatically:
- `node_modules/` (770 MB) — recreated by `npm install`
- `.next/` (296 MB) — recreated by `npm run build`

`data/` (499 MB) holds your projects, generated audio, your Cartesia API key, users and logins. Take it if you want the same projects at home. It must never go into GitHub (it is already in `.gitignore`).

At home install:
- Node.js 22 LTS — https://nodejs.org
- Git — https://git-scm.com (or GitHub Desktop, which includes it)
- GitHub CLI `gh` — https://cli.github.com (optional, used below; GitHub Desktop works instead)

No compiler or Python is needed: SQLite and ffmpeg come prebuilt in the npm packages, and `.npmrc` disables npm install scripts on purpose.

Then, in the folder:
```sh
npm install
npm run build
./start.sh          # macOS/Linux        (Windows: double-click start.cmd)
```
Open http://localhost:3000. If you did not bring `data/`, the first visit asks you to create the admin account; then paste your Cartesia API key in Settings.

## Part B — Put the code on GitHub (private repo `Voxsama/voxlabs`)

```sh
git init -b main
git add .
git status            # must NOT list data/, .env.local, node_modules/, .next/
git commit -m "Voxlabs: audiobook studio powered by Cartesia"
gh auth login         # once, if gh is not logged in
gh repo create Voxsama/voxlabs --private --source=. --remote=origin --push
```
Without `gh`: open GitHub Desktop → File → Add local repository → Publish repository → keep "private" ticked.

From now on, after each change: `git add -A && git commit -m "what changed" && git push`.
At home or at work: `git pull` to get the latest code.

## Part C — Code changes to add (small; Claude Code can do them from this file)

### C1. Show the running version
New file `app/api/version/route.ts`:
```ts
import pkg from "@/package.json";
import { handle, json } from "@/lib/http";

export const GET = handle(async () => json({ version: pkg.version, commit: process.env.GIT_SHA || null }), { public: true });
```
In `components/Nav.tsx` footer, under "Powered by Cartesia", fetch `/api/version` once and show `Voxlabs v{version}`. In `app/settings/page.tsx` show the same line at the top.

In `Dockerfile`, in the final stage add:
```dockerfile
ARG GIT_SHA=
ENV GIT_SHA=$GIT_SHA
LABEL org.opencontainers.image.source="https://github.com/Voxsama/voxlabs"
```

### C2. Release workflow — GitHub builds and publishes the Docker image on every tag
New file `.github/workflows/release.yml`:
```yaml
name: Release
on:
  push:
    tags: ["v*"]
permissions:
  contents: write
  packages: write
jobs:
  image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          build-args: GIT_SHA=${{ github.sha }}
          tags: |
            ghcr.io/voxsama/voxlabs:${{ github.ref_name }}
            ghcr.io/voxsama/voxlabs:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
      - name: GitHub release with notes
        run: gh release create "${{ github.ref_name }}" --generate-notes
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### C3. Compose file for IT — pull the published image instead of building
Replace `docker-compose.yml` with:
```yaml
# IT: docker login ghcr.io (once), then:  docker compose pull && docker compose up -d
services:
  voxlabs:
    image: ghcr.io/voxsama/voxlabs:${VOXLABS_VERSION:-latest}
    build: .                      # developers only: docker compose build
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      CARTESIA_API_KEY: ${CARTESIA_API_KEY:-}
      GEN_CONCURRENCY: ${GEN_CONCURRENCY:-3}
    volumes:
      - ./voxlabs-data:/data      # all projects, audio, database. Back this up.
```
New file `deploy/.env.example` (IT copies it to `.env` next to the compose file):
```
VOXLABS_VERSION=v0.2.0
CARTESIA_API_KEY=
GEN_CONCURRENCY=3
```

### C4. Docs
`DEPLOY.md`, new section "Updating" (for IT):
1. One-time: `docker login ghcr.io -u <github-username> -p <token>` using the read-only token you give them (Part E). Then, in the compose folder, `mkdir -p voxlabs-data && sudo chown 1000:1000 voxlabs-data` (the container runs as uid 1000; a folder Docker creates itself is owned by root, so SQLite can't write and the container restart-loops).
2. Per update: set `VOXLABS_VERSION` in `.env` to the new tag (or keep `latest`), then
   ```sh
   docker compose pull && docker compose up -d
   ```
3. Rollback: put the previous tag back, same two commands. Data is never touched; database changes apply themselves on start.
4. Check what is running: `curl http://localhost:3000/api/version`.

`README.md`, two new sections: "Work on it from another computer" (Part A + `git clone https://github.com/Voxsama/voxlabs`) and "Releasing a new version" (Part D).

Commit and push Part C: `git add -A && git commit -m "Version endpoint, release workflow, image-based compose" && git push`.

## Part D — Make the first release

```sh
npm version 0.2.0 -m "Release v%s"   # bumps package.json, commits, creates tag v0.2.0
git push --follow-tags
gh run watch                          # or open the repo → Actions tab
```
When the "Release" run is green:
- the image `ghcr.io/voxsama/voxlabs:v0.2.0` (and `:latest`) exists under your GitHub profile → Packages
- a GitHub Release "v0.2.0" exists with auto-generated notes

This is the first time the Docker image is ever built (Docker is not installed on the work PC). If the run fails, read the log, fix, and release `0.2.1`.

Every later release is the same two commands with the next number: `npm version minor` (new features) or `npm version patch` (fixes), then `git push --follow-tags`.

## Part E — Hand-off to the company's IT

Give them:
1. `DEPLOY.md`, `docker-compose.yml`, `deploy/.env.example`.
2. A read-only token so their server can pull the private image: GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → scope `read:packages` only → expiry 1 year. You can revoke it any time.
3. The update commands from Part C4. They never need the source code, Node.js or your account.

What stays yours: the code, the GitHub repo, releases. What stays theirs: the server, the `voxlabs-data` folder and its backups.

## Checklist
- [ ] A: runs at home on http://localhost:3000
- [ ] B: repo `Voxsama/voxlabs` is private and `git status` was clean of data/keys before the first commit
- [ ] C: version shows in the sidebar; Actions tab shows CI green
- [ ] D: Release v0.2.0 green; package `voxlabs` visible under your profile
- [ ] E: IT has the three files and a read-only token
