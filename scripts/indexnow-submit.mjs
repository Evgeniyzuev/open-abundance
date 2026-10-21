// Tells Bing, Yandex and other IndexNow search engines about every URL in our sitemap.
// Run after publishing new pages:  node scripts/indexnow-submit.mjs
// The key is public by design: IndexNow checks that https://<site>/<key>.txt contains the same key.
const SITE = process.env.SITE_URL ?? "https://open-abundance.vercel.app";
const KEY = "2fb07cdd4549735eacc676d55773dfea";

const sitemap = await (await fetch(`${SITE}/sitemap.xml`)).text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (!urlList.length) throw new Error("No URLs found in the sitemap.");

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList })
});
console.log(`IndexNow: submitted ${urlList.length} URLs, status ${response.status}`);
if (response.status >= 400) process.exitCode = 1;
