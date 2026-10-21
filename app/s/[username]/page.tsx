import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/lib/guideLocales";
import { publicListingPath } from "@/lib/marketplaceGuestVisibility";
import { loadPublicShop } from "@/lib/marketplacePublic";
import { PUBLIC_MARKET_LABELS, listingLocale } from "@/lib/marketplacePublicLabels";

export const revalidate = 300;

function shopPath(username: string): string {
  return `/@${username}/shop`;
}

export async function generateMetadata({ params }: { params: { username: string } }): Promise<Metadata> {
  const shop = await loadPublicShop(decodeURIComponent(params.username));
  if (!shop || !shop.listings.length) return { title: "Open Abundance", robots: { index: false, follow: false } };
  const title = `${shop.displayName}: services and goods`;
  const description = shop.listings.slice(0, 3).map((item) => item.title).join(", ");
  return {
    title,
    description,
    alternates: { canonical: shopPath(shop.username) },
    robots: shop.indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: "website", title, description, url: shopPath(shop.username) }
  };
}

/** A member's public workshop (/@nickname/shop): what they offer, rated by the people who bought it. */
export default async function PublicShopPage({ params }: { params: { username: string } }) {
  const shop = await loadPublicShop(decodeURIComponent(params.username));
  if (!shop) notFound();
  const locale = listingLocale(...shop.listings.flatMap((item) => [item.title, item.description]));
  const labels = PUBLIC_MARKET_LABELS[locale];
  const signUp = `/?${new URLSearchParams({ utm_source: "shop", utm_medium: "public_shop", utm_campaign: shop.username }).toString()}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${shop.displayName}: ${labels.market}`,
    url: `${SITE_URL}${shopPath(shop.username)}`,
    itemListElement: shop.listings.map((item, index) => ({ "@type": "ListItem", position: index + 1, url: `${SITE_URL}${publicListingPath(item.id)}`, name: item.title }))
  };

  return (
    <main className="legal-page">
      {shop.indexable ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /> : null}
      <article className="legal-document" lang={locale}>
        <header className="legal-document-header">
          <Link className="legal-home-link" href={signUp}>Open Abundance</Link>
          <Link className="legal-home-link" href="/m">{labels.all}</Link>
        </header>

        <div className="legal-document-title">
          <small>{labels.market}</small>
          <h1>{shop.displayName}</h1>
          <p>
            {shop.level ? `${labels.level} ${shop.level}` : null}
            {shop.salesCount > 0 ? `${shop.level ? " · " : ""}${labels.sales(shop.salesCount)}` : null}
            {shop.ratingAverage !== null ? ` · ${labels.rating(shop.ratingAverage, shop.ratingCount)}` : null}
          </p>
        </div>

        <div className="legal-sections">
          {shop.listings.length ? shop.listings.map((listing) => (
            <section key={listing.id}>
              <h2><Link href={publicListingPath(listing.id)}>{listing.title}</Link></h2>
              <p>{labels.kind[listing.kind]}{listing.category ? ` · ${listing.category}` : ""} · {listing.priceAmount} {listing.currencyCode}</p>
            </section>
          )) : <p>No public listings yet. Пока нет публичных объявлений.</p>}
        </div>

        <Link className="legal-primary-action" href={signUp}>{labels.cta}</Link>
        <p>{labels.ctaNote}</p>
      </article>
    </main>
  );
}
