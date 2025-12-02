"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/lib/theme";
import type { Session } from "next-auth";

function useCapacitorUniversalLinks() {
  useEffect(() => {
    let remove: undefined | (() => void);
    // Dynamically import to avoid SSR issues
    import("@capacitor/app").then(({ App }) => {
      const sub = App.addListener("appUrlOpen", ({ url }) => {
        try {
          const target = new URL(url);
          // Only handle our domain
          if (target.host === "moltly.xyz" || target.host === "www.moltly.xyz") {
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

function useServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const isHttps = window.location.protocol === "https:";
    if (!("serviceWorker" in navigator)) return;
    if (!isHttps && !isLocalhost) return; // SWs need HTTPS (except on localhost)

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        reg.addEventListener?.("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // New SW installed; tell it to activate immediately
              newWorker.postMessage("SKIP_WAITING");
            }
          });
        });
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      } catch {
        // ignore registration errors
      }
    };
    register();
  }, []);
}

export default function Providers({ children, session }: { children: ReactNode; session: Session | null }) {
  useCapacitorUniversalLinks();
  useServiceWorkerRegistration();
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
    <SessionProvider session={session}>
      <ThemeProvider>{children}</ThemeProvider>
    </SessionProvider>
  );
}
