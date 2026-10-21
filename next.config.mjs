/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Folders starting with "@" are parallel routes in the App Router, so the short link is a rewrite.
    return [
      { source: "/@:username", destination: "/u/by-username/:username" },
      // The invitation link opens the person's blog first.
      { source: "/@:username/blog", destination: "/u/by-username/:username/blog" },
      // The member's public workshop: their listings for guests.
      { source: "/@:username/shop", destination: "/s/:username" }
    ];
  },
  async redirects() {
    // A payment link to a person. A redirect, not a rewrite: the client reads the query from the address bar.
    return [{ source: "/pay/@:username", destination: "/?view=wallet.wallet&payto=:username", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" }
        ]
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" }
        ]
      }
    ];
  }
};

export default nextConfig;
