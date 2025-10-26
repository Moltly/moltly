"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect } from "react";
import type { ReactNode } from "react";

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
  return <SessionProvider>{children}</SessionProvider>;
}
