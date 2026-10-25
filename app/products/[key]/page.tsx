"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { parseMarkdown, type MdBlock, type MdInline } from "@/lib/miniMarkdown";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type Product = { title: string; markdown: string };

function Inline({ parts }: { parts: MdInline[] }): ReactNode {
  return parts.map((part, index) => (part.bold ? <strong key={index}>{part.text}</strong> : <span key={index}>{part.text}</span>));
}

function Block({ block }: { block: MdBlock }): ReactNode {
  switch (block.type) {
    case "heading":
      return block.level === 1 ? <h1><Inline parts={block.inline} /></h1> : block.level === 2 ? <h2><Inline parts={block.inline} /></h2> : <h3><Inline parts={block.inline} /></h3>;
    case "paragraph":
      return <p><Inline parts={block.inline} /></p>;
    case "quote":
      return <blockquote><Inline parts={block.inline} /></blockquote>;
    case "list": {
      const items = block.items.map((item, index) => <li key={index}><Inline parts={item} /></li>);
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
    case "table":
      return (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr>{block.head.map((cell, index) => <th key={index}><Inline parts={cell} /></th>)}</tr></thead>
            <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}><Inline parts={cell} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
  }
}

/** The text of an Open Abundance product, shown only to the person who bought it on the Market. */
export default function OaProductPage({ params }: { params: { key: string } }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    fetchWithSupabaseAuth(`/api/oa-products/${encodeURIComponent(params.key)}`, { cache: "no-store" }, { authRequired: true })
      .then(async (response) => {
        if (response.status === 404 || response.status === 401) { if (!cancelled) setState("denied"); return; }
        if (!response.ok) throw new Error("Request failed");
        const data = (await response.json()) as Product;
        if (!cancelled) { setProduct(data); setState("ready"); }
      })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [params.key]);

  return (
    <main className="legal-page">
      <article className="legal-document" lang="ru">
        <header className="legal-document-header">
          <Link className="legal-home-link" href="/">Open Abundance</Link>
        </header>
        {state === "loading" ? <p>Загрузка…</p> : null}
        {state === "denied" ? (
          <>
            <h1>Продукт не найден</h1>
            <p>Продукт открывается тому, кто купил его на Маркете. Войдите в тот аккаунт, с которого покупали, или найдите продукт в Кошелёк → Маркет.</p>
          </>
        ) : null}
        {state === "error" ? <p>Не удалось загрузить. Обновите страницу.</p> : null}
        {state === "ready" && product ? parseMarkdown(product.markdown).map((block, index) => <Block block={block} key={index} />) : null}
      </article>
    </main>
  );
}
