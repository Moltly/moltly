import "./globals.css";
import Providers from "./providers";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Moltly",
  description: "Moltly (moltly.xyz) keeps every tarantula molt, reminder, and husbandry detail in sync.",
  themeColor: "#0B0B0B"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
