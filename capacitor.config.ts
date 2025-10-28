import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl =
  process.env.CAP_SERVER_URL && process.env.CAP_SERVER_URL.length > 0
    ? process.env.CAP_SERVER_URL
    : 'https://moltly.xyz';

const config: CapacitorConfig = {
  appId: 'xyz.moltly.app',
  appName: 'Moltly',
  webDir: 'mobile-shell',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    allowNavigation: ['moltly.xyz', 'www.moltly.xyz', 'discord.com', 'appleid.apple.com', 'appleid.cdn-apple.com'],
  },
};

export default config;
