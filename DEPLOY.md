# Deploying Voxlabs on a company server

This guide is for the team that installs and runs the server. The app is a single Node.js web service. It stores everything in one data folder and calls the Cartesia API over HTTPS.

## 1. What the server needs

| Item | Minimum | Recommended |
| --- | --- | --- |
| OS | Linux (Ubuntu 22.04+, Debian 12, RHEL 9) or Windows Server 2019+ | Ubuntu 24.04 LTS |
| CPU / RAM | 2 cores / 2 GB | 4 cores / 4 GB |
| Disk | 50 GB, local SSD or HDD | 100 GB+. Audio uses about 320 MB per hour of finished audio, plus older takes. |
| Software | Node.js 22 LTS, **or** Docker | |
| Outbound | HTTPS (443) to `api.cartesia.ai` | |
| Inbound | One port for users (default 3000), ideally behind an HTTPS reverse proxy | |

During installation the server also needs internet access to download npm packages, including a prebuilt ffmpeg binary.

No compiler or Python is needed: SQLite and ffmpeg come prebuilt in the npm packages, and the repo's `.npmrc` disables npm install scripts on purpose.

**Important:**
- **Run exactly one instance.** The generation queue lives in the process and the database is SQLite. Do not load-balance several copies.
- **Keep the data folder on a local disk.** Do not put it on NFS or SMB shares, because SQLite can corrupt on network file systems.
- **Use HTTPS.** Browsers only allow microphone recording, used for voice cloning, on HTTPS pages. Without it, logins and scripts also travel unencrypted.

## 2. Where data is stored

Everything lives in `DATA_DIR`. The default is `./data` in the app folder.

```
DATA_DIR/studio.db          database: projects, chapters, text, users, settings (incl. Cartesia API key)
DATA_DIR/audio/...          generated audio, one WAV per paragraph version
DATA_DIR/cache/...          merged chapter audio for the player, rebuilt automatically
DATA_DIR/session-secret     key that signs login cookies (keep private)
DATA_DIR/backups/...        database snapshots from `npm run backup`
```

Temporary export files go to the OS temp folder and are deleted after about 10 minutes.

## 3. Option A: Docker (simplest)

You only need two files, `docker-compose.yml` and `deploy/.env.example`. You do not need the source code or Node.js.

1. Put both files in one folder. Rename `.env.example` to `.env` and set `VOXLABS_VERSION` to the release you were given.
2. Log in to the image registry once, with the read-only token you were given:

   ```sh
   docker login ghcr.io -u <github-username> -p <token>
   ```

3. Start the app. The first time, create the data folder owned by uid 1000 first: the container runs as user `node` (uid 1000), and a folder Docker creates itself is owned by root, so the database can't be written and the container keeps restarting.

   ```sh
   mkdir -p voxlabs-data && sudo chown 1000:1000 voxlabs-data
   docker compose pull && docker compose up -d
   ```

The app runs on port 3000 and stores its data in `./voxlabs-data` next to the compose file.

### Updating

1. Set `VOXLABS_VERSION` in `.env` to the new tag, for example `v0.3.0`. You can also keep `latest`.
2. Run:

   ```sh
   docker compose pull && docker compose up -d
   ```

3. **Rollback:** put the previous tag back in `.env` and run the same two commands. The data folder is never touched. Database changes apply themselves on start.
4. **Check what is running:**

   ```sh
   curl http://localhost:3000/api/version
   ```

   It returns the version and the commit, for example `{"version":"0.2.0","commit":"3f2a…"}`.

## 4. Option B: Linux with systemd

```sh
# Node.js 22 (NodeSource or your distro), then:
sudo useradd --system --home /opt/voxlabs voxlabs
sudo mkdir -p /opt/voxlabs /srv/voxlabs-data
sudo chown voxlabs:voxlabs /opt/voxlabs /srv/voxlabs-data
sudo -u voxlabs git clone <repo> /opt/voxlabs
cd /opt/voxlabs
sudo -u voxlabs npm ci
sudo -u voxlabs npm run build
sudo cp deploy/voxlabs.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now voxlabs
```

The service listens on `127.0.0.1:3000`. Put nginx in front of it with `deploy/nginx.conf`. That config handles HTTPS, 200 MB uploads, long export timeouts, and unbuffered live updates.

Logs:

```sh
journalctl -u voxlabs -f
```

Update:

```sh
cd /opt/voxlabs
sudo -u voxlabs git pull
sudo -u voxlabs npm ci
sudo -u voxlabs npm run build
sudo systemctl restart voxlabs
```

## 5. Option C: Windows Server

1. Install Node.js 22 LTS from https://nodejs.org.
2. Copy the app to `C:\voxlabs`. In PowerShell in that folder, run:

   ```powershell
   npm ci
   npm run build
   ```

3. Run it as a Windows service with [NSSM](https://nssm.cc):

   ```powershell
   nssm install Voxlabs "C:\Program Files\nodejs\node.exe" "C:\voxlabs\node_modules\next\dist\bin\next" start -p 3000
   nssm set Voxlabs AppDirectory C:\voxlabs
   nssm set Voxlabs AppEnvironmentExtra NODE_ENV=production DATA_DIR=D:\voxlabs-data
   nssm start Voxlabs
   ```

4. Either allow port 3000 in Windows Firewall, or publish it through IIS with URL Rewrite and ARR plus an HTTPS certificate. For IIS:
   - set the request size limit to 200 MB
   - set the proxy timeout to 10 minutes
   - turn off response buffering for `/api/projects/*/events`

## 6. First start

1. Open the site. The first visit asks you to **create the admin account**.
2. Go to **Settings** and paste the company's Cartesia API key. Then click **Test key**.
3. Go to **Account & users** and add your team. Members can do everything except change the API key and manage users.

## 7. Settings (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | 3000 | HTTP port |
| `HOSTNAME` | all interfaces | Use `127.0.0.1` when behind a reverse proxy |
| `DATA_DIR` | `./data` | Data folder (see section 2) |
| `CARTESIA_API_KEY` | none | Optional. The key saved in Settings takes priority. |
| `CARTESIA_ADMIN_KEY` | none | Optional. Cartesia admin key, only used to read credit usage for the sidebar. Can also be entered in Settings. |
| `GEN_CONCURRENCY` | 3 | Paragraphs generated in parallel. Raise only if your Cartesia plan allows it. |
| `SESSION_SECRET` | random file | Sign login cookies with a fixed secret instead of `DATA_DIR/session-secret` |
| `FFMPEG_PATH` | bundled | Use the system ffmpeg instead of the bundled one |
| `AUTH_DISABLED` | off | `1` turns login off. **Never on a shared server.** |

## 8. Backups

- **Database:**

  ```sh
  DATA_DIR=/srv/voxlabs-data npm run backup
  ```

  This writes a safe snapshot to `DATA_DIR/backups`, even while the app is running, and keeps the newest 14. Schedule it daily with cron or Task Scheduler.
- **Audio:** back up the whole `DATA_DIR` with your normal tool, such as rsync, restic, Veeam, or robocopy. Audio files never change after they are written, so incremental backups are cheap.
- **Restore:**
  1. Stop the app.
  2. Copy the data folder back.
  3. If you restore a snapshot, rename it to `studio.db`.
  4. Start the app again.

## 9. Health check

```sh
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/auth/me
```

It returns `401` or `200` when the app is up. The Docker image uses this check.
