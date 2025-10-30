# Moltly

Your cozy logbook and reminder hub for tarantula keeping. Track molts, feedings, and enclosure tweaks without the fuss.

iOS Testflight: https://testflight.apple.com/join/4NE9tZGT
Android APK: https://github.com/0xgingi/moltly/releases/latest

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
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
NEXTAUTH_URL=http://localhost:5777

S3_BUCKET=molt-uploads
S3_REGION=us-east-1
S3_ENDPOINT=http://minio:9000
S3_PUBLIC_URL=http://localhost:9000
S3_ACCESS_KEY=Change_ME!
S3_SECRET_KEY=Change_ME!
S3_FORCE_PATH_STYLE=true

```

### Docker

```bash
docker compose up --build
```

## Discord Authentication

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
