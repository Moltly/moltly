# Moltly

A cozy molt logbook and reminder center for tarantula keepers. Keep every shed, enclosure tweak, and follow-up in one place—credentials or Discord sign-in gets you to the same dashboard.

## Highlights

- Home dashboard shows active spiders, molt pace this year, the most recent shed, and the next reminder at a glance.
- Twelve-month timeline breaks down molt streaks with stage counts so you can spot quiet months fast.
- Reminder center lets you snooze or clear follow-ups without leaving the page.
- Full CRUD for molt entries with search, stage filtering, and asc/desc sorting.
- Inline attachment support for quick photo drops.
- Auth powered by NextAuth with classic email/password and Discord.

## Environment

Create a `.env` file with:

```
MONGODB_URI=mongodb://mongo:13777/molt-log
NEXTAUTH_SECRET=replace-with-strong-secret
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
NEXTAUTH_URL=http://localhost:5777
```

## Docker

```bash
docker compose up --build
```

## Discord Authentication

1. Head to the Applications section in the Discord Developer Portal, and click on “New Application” (https://discord.com/developers/applications)

2. In the settings menu, go to “OAuth2 => General”
* Copy the Client ID and paste it in DISCORD_CLIENT_ID in .env.

* Under Client Secret, click “Reset Secret” and copy that string to DISCORD_CLIENT_SECRET in .env. Be careful as you won’t be able to see this secret again, and resetting it will cause the existing one to expire.

* Click “Add Redirect” and paste in <app url>/api/auth/callback/discord (example for local development: http://localhost:5777/api/auth/callback/discord↗)

* Save your changes