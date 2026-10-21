import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/lib/guideLocales";
import { publicListingPath } from "@/lib/marketplaceGuestVisibility";
import { loadPublicListing, type PublicListing } from "@/lib/marketplacePublic";
import { PUBLIC_MARKET_LABELS, listingLocale } from "@/lib/marketplacePublicLabels";

export const revalidate = 300;

function summary(listing: PublicListing): string {
  const text = listing.description?.trim() || listing.title;
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

function signUpPath(listing: PublicListing): string {
  return `/?${new URLSearchParams({ utm_source: "listing", utm_medium: "public_market", utm_campaign: listing.id }).toString()}`;
}

export async function generateMetadata({ params }: { params: { listingId: string } }): Promise<Metadata> {
  const listing = await loadPublicListing(params.listingId);
  if (!listing) return { title: "Open Abundance", robots: { index: false, follow: false } };
  const path = publicListingPath(listing.id);
  const description = summary(listing);
  const image = listing.imageUrl ? new URL(listing.imageUrl, SITE_URL).toString() : undefined;
  return {
    title: listing.title,
    description,
    alternates: { canonical: path },
    robots: listing.indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: "website", title: listing.title, description, url: path, images: image ? [image] : [] },
    twitter: { card: image ? "summary_large_image" : "summary", title: listing.title, description, images: image ? [image] : [] }
  };
}

export default async function PublicListingPage({ params }: { params: { listingId: string } }) {
  const listing = await loadPublicListing(params.listingId);
  if (!listing) notFound();
  const locale = listingLocale(listing.title, listing.description);
  const labels = PUBLIC_MARKET_LABELS[locale];
  const url = `${SITE_URL}${publicListingPath(listing.id)}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": listing.kind === "service" ? "Service" : "Product",
    name: listing.title,
    description: summary(listing),
    url,
    ...(listing.imageUrl ? { image: new URL(listing.imageUrl, SITE_URL).toString() } : {}),
    ...(listing.category ? { category: listing.category } : {}),
    ...(listing.kind === "service" ? { provider: { "@type": "Person", name: listing.sellerName ?? "Open Abundance member" } } : {}),
    ...(listing.ratingAverage !== null ? { aggregateRating: { "@type": "AggregateRating", ratingValue: listing.ratingAverage, ratingCount: listing.ratingCount, bestRating: 5, worstRating: 1 } } : {})
  };

  return (
    <main className="legal-page">
      {listing.indexable ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /> : null}
      <article className="legal-document" lang={locale}>
        <header className="legal-document-header">
          <Link className="legal-home-link" href={signUpPath(listing)}>Open Abundance</Link>
          <Link className="legal-home-link" href="/m">{labels.all}</Link>
        </header>

        <div className="legal-document-title">
          <small>{labels.market} · {labels.kind[listing.kind]}{listing.category ? ` · ${listing.category}` : ""}</small>
          <h1>{listing.title}</h1>
        </div>

        {listing.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- seller images come from many hosts; no optimisation needed here
          <img className="public-listing-image" src={listing.imageUrl} alt={listing.title} loading="lazy" />
        ) : null}

        <div className="legal-sections">
          {listing.description ? <section>{listing.description.split(/\n+/).map((line, index) => <p key={index}>{line}</p>)}</section> : null}
          <section>
            <ul>
              <li>{labels.price}: {listing.priceAmount} {listing.currencyCode}</li>
              {listing.kind !== "digital_asset" && listing.fulfillmentDays ? <li>{labels.fulfillment(listing.fulfillmentDays)}</li> : null}
              <li>{labels.seller}: {listing.sellerUsername ? <Link href={`/@${listing.sellerUsername}/shop`}>{listing.sellerName ?? listing.sellerUsername}</Link> : (listing.sellerName ?? "Open Abundance")}{listing.sellerLevel ? `, ${labels.level} ${listing.sellerLevel}` : ""}</li>
              {listing.ratingAverage !== null ? <li>{labels.rating(listing.ratingAverage, listing.ratingCount)}</li> : null}
              {listing.salesCount > 0 ? <li>{labels.sales(listing.salesCount)}</li> : null}
            </ul>
          </section>
        </div>

        <Link className="legal-primary-action" href={signUpPath(listing)}>{labels.cta}</Link>
        <p>{labels.ctaNote}</p>

        <footer className="legal-document-footer">
          <nav aria-label={labels.answers}>
            <Link href="/en/guide">Answers</Link>
            <Link href="/guide">Ответы</Link>
          </nav>
        </footer>
      </article>
    </main>
  );
}
