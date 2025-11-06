import "./globals.css";
import Providers from "./providers";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Moltly",
  description: "Moltly (moltly.xyz) keeps every tarantula molt, reminder, and husbandry detail in sync."
};

export const viewport: Viewport = {
  themeColor: "#0B0B0B"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
