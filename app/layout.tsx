import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const siteUrl = new URL("https://open-abundance.vercel.app");
const siteTitle = "Open Abundance - an open marketplace of possibilities";
const siteDescription = "An open experiment in building AI as an open marketplace of possibilities - connecting real desires and problems with knowledge, resources, people and real-world action.";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: siteTitle,
    template: "%s - Open Abundance"
  },
  description: siteDescription,
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    siteName: "Open Abundance",
    title: siteTitle,
    description: siteDescription,
    url: "/"
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription
  },
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
    const accentTheme = ["gray", "blue", "green", "violet", "amber", "teal"].includes(localStorage.getItem("openAbundanceAccentTheme"))
      ? localStorage.getItem("openAbundanceAccentTheme")
      : "gray";
    const resolvedTheme = colorTheme === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : colorTheme;
    const themeColors = {
      gray: { light: "#f2f2f7", dark: "#111318" },
      blue: { light: "#eef5fb", dark: "#0e151c" },
      green: { light: "#edf6f0", dark: "#101713" },
      violet: { light: "#f3f0fa", dark: "#14121b" },
      amber: { light: "#faf5ea", dark: "#19150f" },
      teal: { light: "#edf7f7", dark: "#0e1718" }
    };

    root.dataset.uiScale = uiScale;
    root.dataset.theme = colorTheme;
    root.dataset.accent = accentTheme;
    root.style.colorScheme = resolvedTheme;

    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute("content", themeColors[accentTheme][resolvedTheme]);
    });
  } catch {
    document.documentElement.dataset.uiScale = "100";
    document.documentElement.dataset.theme = "system";
    document.documentElement.dataset.accent = "gray";
  }
})();
`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="notranslate" data-accent="gray" data-ui-scale="100" data-theme="system" suppressHydrationWarning translate="no">
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
