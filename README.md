# Moltly

Your cozy logbook and reminder hub for tarantula keeping. Track molts, feedings, and enclosure tweaks without the fuss.

iOS Testflight: https://testflight.apple.com/join/4NE9tZGT

Android APK: https://github.com/moltly/moltly/releases/latest

## What you can do

- See your spiders at a glance: who molted last, who’s due next, and how this year is pacing.
- Snooze or clear reminders in one place, no extra clicks.
- Add, edit, and search molts and feedings; filter by stage and sort how you like.
- Drop in photos when you log an entry.
- Keep a lightweight research notebook for species or individuals; tag, filter, and duplicate notes.

## Self Host

### Environment

Create a `.env` file with:

```
MONGODB_URI=mongodb://mongo:13777/molt-log
NEXTAUTH_SECRET=replace-with-strong-secret
NEXTAUTH_URL=http://localhost:5777

S3_BUCKET=molt-uploads
S3_REGION=us-east-1
S3_ENDPOINT=http://minio:9000
S3_PUBLIC_URL=http://localhost:9000
S3_ACCESS_KEY=Change_ME!
S3_SECRET_KEY=Change_ME!
S3_FORCE_PATH_STYLE=true

TRAEFIK_WEB_HOST=localhost
TRAEFIK_MINIO_HOST=localhost
```

### Docker

```bash
docker compose up --build
```

### PWA & Offline

Moltly now ships with a web app manifest and a basic service worker to enable installable PWA and offline support on the web and inside the Capacitor Android/iOS apps.

- What’s cached
  - App shell and the homepage for offline navigation fallback.
  - Runtime caching for images, styles, scripts.
  - GET requests to `/api/*` are cached with a stale‑while‑revalidate strategy so previously viewed data can be read offline.
- What’s not cached (yet)
  - Mutations (`POST/PATCH/DELETE`) are not queued offline. In guest mode, entries are stored locally and work fully offline; when signed in, new changes require a connection.
- Install
  - On desktop browsers use the “Install app” prompt. On Android, Chrome will offer to install after a visit. On iOS, use “Add to Home Screen”.

Notes for mobile apps (Capacitor): iOS and Android WebViews support service workers; the same offline behavior applies when the app is packaged. Assets and cached API responses remain available when the device is offline.

### Species Autocomplete (optional)

To enable species autocomplete using `species.csv` (columns: genus, species, subspecies, etc.), import it into MongoDB:

```bash
# From the repo root
./scripts/import-species.sh species.csv
```

This creates a `species` collection with a `fullName` and `fullNameLC` field and an index optimized for prefix search.

Admin review of unknown species:

- When users enter a species not present in the `species` collection, a pending suggestion is created automatically.
- Add comma-separated admin emails to `ADMIN_EMAILS` in `.env`.
- (Optional) Allow Discord admins with `ADMIN_DISCORD_IDS` (comma-separated Discord user IDs).
- Admins can review at `/admin/species-suggestions` and approve to add to the autocomplete list or reject.

## Discord Authentication (optional)

1. Head to the Applications section in the Discord Developer Portal, and click on “New Application” (https://discord.com/developers/applications)

2. In the settings menu, go to “OAuth2 => General”
* Copy the Client ID and paste it in DISCORD_CLIENT_ID in .env.

* Under Client Secret, click “Reset Secret” and copy that string to DISCORD_CLIENT_SECRET in .env. Be careful as you won’t be able to see this secret again, and resetting it will cause the existing one to expire.

* Click “Add Redirect” and paste in appurl/api/auth/callback/discord (example for local development: http://localhost:5777/api/auth/callback/discord)

* Save your changes

## Google Authentication (optional)

1. Open Google Cloud Console and select or create a project.
2. Configure OAuth consent screen (External or Internal) and add your domain to Authorized domains.
3. Create Credentials → OAuth client ID → Web application.
   - Authorized redirect URI: `https://your-domain/api/auth/callback/google` (and `http://localhost:5777/api/auth/callback/google` for local dev)
4. Copy Client ID and Client Secret into `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Ensure `NEXTAUTH_URL` matches your site origin (e.g., `https://moltly.xyz` for production or `http://localhost:5777` for local).

## Apple Authentication (optional)

Add “Sign in with Apple” for web:

1. In Apple Developer, create a Services ID (Identifiers → Services IDs). This is your web `client_id` (e.g., `com.example.web`). Enable “Sign In with Apple”.
2. Under the Services ID → Configure:
   - Domains and Subdomains: add your domain (e.g., `moltly.xyz`)
   - Return URLs: `https://your-domain/api/auth/callback/apple` (and optionally `http://localhost:5777/api/auth/callback/apple` for local dev).
3. Create a new Key (ES256) with “Sign In with Apple” enabled. Note the Key ID and download the private key (.p8). Note your Team ID from Membership.
4. Generate the secret on start:
   - Put your `.p8` somewhere, Then add these to .env:
     ```bash
     APPLE_TEAM_ID=YOUR_TEAM_ID \
     APPLE_KEY_ID=YOUR_KEY_ID \
     APPLE_CLIENT_ID=your.services.id \
     APPLE_PRIVATE_KEY_PATH=./AuthKey_XXXXXX.p8 \
     ```
