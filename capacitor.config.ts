/// <reference types="@capacitor/status-bar" />
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'xyz.moltly.app',
  appName: 'Moltly',
  webDir: 'mobile-shell',
  // Ensure the WebView is laid out below the status bar so
  // content is not overlapped on Android devices.
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      // Keep the status bar dark to match the app theme
      // and avoid contrast issues on light icons.
      style: 'DARK',
      backgroundColor: '#0B0B0B',
    },
  },
  server: {
    // Allow navigation to any HTTPS domain for self-hosted support
    // HTTP is allowed for local development (localhost/LAN IPs)
    allowNavigation: ['*'],
  },
};

export default config;

