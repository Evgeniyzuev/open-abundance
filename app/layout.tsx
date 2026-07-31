import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Open Abundance",
  description: "Offline-first growth app prototype",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/twenty-levels-app-icon-512.png",
    apple: "/icons/twenty-levels-app-icon-192.png"
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Open Abundance"
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#111318" }
  ],
  width: "device-width",
  initialScale: 1
};

const appearanceBootstrapScript = `
(() => {
  try {
    const root = document.documentElement;
    const uiScale = ["100", "120", "140"].includes(localStorage.getItem("openAbundanceUiScale"))
      ? localStorage.getItem("openAbundanceUiScale")
      : "100";
    const colorTheme = ["system", "light", "dark"].includes(localStorage.getItem("openAbundanceColorTheme"))
      ? localStorage.getItem("openAbundanceColorTheme")
      : "system";
    const resolvedTheme = colorTheme === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : colorTheme;

    root.dataset.uiScale = uiScale;
    root.dataset.theme = colorTheme;
    root.style.colorScheme = resolvedTheme;

    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute("content", resolvedTheme === "dark" ? "#111318" : "#f2f2f7");
    });
  } catch {
    document.documentElement.dataset.uiScale = "100";
    document.documentElement.dataset.theme = "system";
  }
})();
`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="notranslate" data-ui-scale="100" data-theme="system" suppressHydrationWarning translate="no">
      <head>
        <meta name="google" content="notranslate" />
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrapScript }} />
      </head>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
