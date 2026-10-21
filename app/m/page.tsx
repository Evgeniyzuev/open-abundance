import type { Metadata } from "next";
import Link from "next/link";
import { publicListingPath } from "@/lib/marketplaceGuestVisibility";
import { loadPublicListings } from "@/lib/marketplacePublic";
import { PUBLIC_MARKET_LABELS, listingLocale } from "@/lib/marketplacePublicLabels";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Marketplace: services and goods from members",
  description: "Services and goods offered by Open Abundance members. Deals are made inside the free app and rated by both sides.",
  alternates: { canonical: "/m" }
};

export default async function PublicMarketPage() {
  const listings = await loadPublicListings();
  return (
    <main className="legal-page">
      <article className="legal-document">
        <header className="legal-document-header">
          <Link className="legal-home-link" href="/?utm_source=listing&utm_medium=public_market">Open Abundance</Link>
        </header>

        <div className="legal-document-title">
          <h1>Marketplace · Маркетплейс</h1>
          <p>Services and goods offered by members of Open Abundance, a free community app for mutual help. Услуги и товары участников Open Abundance.</p>
        </div>

        <div className="legal-sections">
          {listings.length ? listings.map((listing) => {
            const labels = PUBLIC_MARKET_LABELS[listingLocale(listing.title, listing.description)];
            return (
              <section key={listing.id} lang={listingLocale(listing.title, listing.description)}>
                <h2><Link href={publicListingPath(listing.id)}>{listing.title}</Link></h2>
                <p>{labels.kind[listing.kind]}{listing.category ? ` · ${listing.category}` : ""} · {listing.priceAmount} {listing.currencyCode}</p>
              </section>
            );
          }) : <p>No public listings yet. Пока нет публичных объявлений.</p>}
        </div>

        <Link className="legal-primary-action" href="/?utm_source=listing&utm_medium=public_market">Start free in Open Abundance</Link>
      </article>
    </main>
  );
}
