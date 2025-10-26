# Moltly

Your cozy logbook and reminder hub for tarantula keeping. Track molts, feedings, and enclosure tweaks without the fuss.

iOS Testflight: https://testflight.apple.com/join/4NE9tZGT

## What you can do

- See your spiders at a glance: who molted last, who’s due next, and how this year is pacing.
- Snooze or clear reminders in one place, no extra clicks.
- Add, edit, and search molts and feedings; filter by stage and sort how you like.
- Drop in photos when you log an entry.
- Keep a lightweight research notebook for species or individuals; tag, filter, and duplicate notes.

## To Do
- Major changes to notebook
- Android Application

## Self Host

### Environment

Create a `.env` file with:

```
MONGODB_URI=mongodb://mongo:13777/molt-log
NEXTAUTH_SECRET=replace-with-strong-secret
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
NEXTAUTH_URL=http://localhost:5777
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
