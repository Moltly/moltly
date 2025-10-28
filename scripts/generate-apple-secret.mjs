// Usage:
//   APPLE_TEAM_ID=TEAMID \
//   APPLE_KEY_ID=KEYID \
//   APPLE_CLIENT_ID=com.example.web \
//   APPLE_PRIVATE_KEY_PATH=./AuthKey_KEYID.p8 \
//   node scripts/generate-apple-secret.mjs
//
// Or set APPLE_PRIVATE_KEY to the PEM contents directly.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { SignJWT, importPKCS8 } from 'jose';

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadDotEnv();
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const clientId = process.env.APPLE_CLIENT_ID;
  let privateKey = process.env.APPLE_PRIVATE_KEY;
  const privateKeyPath = process.env.APPLE_PRIVATE_KEY_PATH;

  if (!teamId || !keyId || !clientId) {
    console.error('Missing required env: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID');
    process.exit(1);
  }

  if (!privateKey && privateKeyPath) {
    try {
      privateKey = fs.readFileSync(path.resolve(privateKeyPath), 'utf8');
    } catch (err) {
      console.error('Failed to read APPLE_PRIVATE_KEY_PATH:', err.message);
      process.exit(1);
    }
  }

  if (!privateKey) {
    console.error('Provide APPLE_PRIVATE_KEY or APPLE_PRIVATE_KEY_PATH');
    process.exit(1);
  }

  const normalizedKey = privateKey.includes('-----BEGIN')
    ? privateKey
    : privateKey.replace(/\\n/g, '\n');

  const alg = 'ES256';
  const pk = await importPKCS8(normalizedKey, alg);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 180 - 60; // ~6 months minus a minute

  const token = await new SignJWT({})
    .setProtectedHeader({ alg, kid: keyId })
    .setIssuer(teamId)
    .setAudience('https://appleid.apple.com')
    .setSubject(clientId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(pk);

  process.stdout.write(token + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
