/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" }
        ]
      },
      {
        source: "/offline.html",
        headers: [
          { key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }
        ]
      }
    ];
  }
};

export default nextConfig;
