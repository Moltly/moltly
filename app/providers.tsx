"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/lib/theme";

function useCapacitorUniversalLinks() {
  useEffect(() => {
    let remove: undefined | (() => void);
    // Dynamically import to avoid SSR issues
    import("@capacitor/app").then(({ App }) => {
      const sub = App.addListener("appUrlOpen", ({ url }) => {
        try {
          const target = new URL(url);
          // Only handle our domain
          if (target.host === "moltly.xyz") {
            window.location.href = url;
          }
        } catch {
          // As a fallback, still try to navigate
          window.location.href = url;
        }
      });
      // App.addListener returns a Promise<PluginListenerHandle>
      sub.then((h) => {
        remove = () => h.remove();
      });
    });
    return () => {
      if (remove) remove();
    };
  }, []);
}

export default function Providers({ children }: { children: ReactNode }) {
  useCapacitorUniversalLinks();
  // Ensure the Android status bar does not overlap the WebView
  useEffect(() => {
    // Run only on the client and only if the StatusBar plugin exists
    import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
      // On Android, stop the status bar from overlaying the WebView
      if (Capacitor.getPlatform() === "android") {
        StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
        // Prefer a dark status bar background with light content
        StatusBar.setBackgroundColor({ color: "#0B0B0B" }).catch(() => {});
        // Dark style = light icons/text (for dark backgrounds)
        StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
        // As a defensive fallback for Android 15 edge-to-edge enforcement,
        // compute the status bar height and expose it as a CSS var that
        // our CSS uses to pad headers away from the bar when necessary.
        StatusBar.getInfo()
          .then((info: any) => {
            const h = typeof info?.height === "number" ? info.height : 0;
            const pad = info.overlays && info.visible ? `${h}px` : "0px";
            document.documentElement.style.setProperty("--android-statusbar-pad", pad);
          })
          .catch(() => {});
      }
    }).catch(() => {
      // Plugin not available; ignore
    });
  }, []);
  return (
    <SessionProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </SessionProvider>
  );
}
