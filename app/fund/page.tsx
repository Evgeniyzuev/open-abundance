import type { Metadata } from "next";
import Link from "next/link";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { summarizeFund, type FundKind, type FundRow, type FundSummary } from "@/lib/wishFund";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Wish fund: what Open Abundance fulfilled",
  description: "Every week Open Abundance helps fulfil wishes of active participants. This page shows what came into the fund, what was fulfilled and what each person did.",
  alternates: { canonical: "/fund" }
};

const CTA = "/?utm_source=fund&utm_medium=public_fund";
const KIND: Record<FundKind, string> = { founder: "основатель", patron: "меценат", help: "помощь людей", habit: "привычка с Новой", money: "деньги из фонда" };

async function loadFund(): Promise<FundSummary | null> {
  try {
    const db = createServiceSupabaseClient() as unknown as { from: (table: string) => any };
    const { data, error } = await db.from("wish_fund_entries").select("id,direction,kind,amount,week_start,title,person_did,result,is_public,created_at").order("created_at", { ascending: false }).limit(1000);
    if (error) return null;
    return summarizeFund((data ?? []) as FundRow[]);
  } catch {
    return null;
  }
}

export default async function WishFundPage() {
  const fund = await loadFund();
  return (
    <main className="legal-page">
      <article className="legal-document">
        <header className="legal-document-header">
          <Link className="legal-home-link" href={CTA}>Open Abundance</Link>
        </header>

        <div className="legal-document-title">
          <h1>Фонд исполнения желаний · Wish fund</h1>
          <p>Каждую неделю Open Abundance исполняет желания участников. Здесь видно, что пришло в фонд, что исполнено и что сделал сам человек. Every week we help fulfil participants&apos; wishes; this page shows what came in and what was fulfilled.</p>
        </div>

        <section className="legal-sections">
          <section>
            <h2>Как это работает · How it works</h2>
            <p>Участвует тот, кто записал желание и сделал хотя бы один шаг на этой неделе. Начинаем с маленьких желаний: помощь людей, привычка вместе с Новой, небольшая сумма. Подробности публикуются только с согласия человека; остальные записи входят в общие числа.</p>
            <p>Взнос в фонд не является вкладом под доход: он идёт на исполнение желаний, и это видно на этой странице.</p>
          </section>
          <section>
            <h2>Итог · Totals</h2>
            {fund ? (
              <p>Исполнено желаний: {fund.fulfilled}, из них без денег: {fund.fulfilledWithoutMoney}. Пришло в фонд: {money(fund.received)} ({fund.contributors} взн.), потрачено: {money(fund.spent)}, остаток: {money(fund.balance)}.</p>
            ) : <p>Учёт фонда скоро появится. The ledger will appear soon.</p>}
          </section>
        </section>

        <div className="legal-sections">
          {fund?.weeks.length ? fund.weeks.map((week) => (
            <section key={week.weekStart}>
              <h2>Неделя с {week.weekStart} · исполнено {week.fulfilled}{week.spent > 0 ? ` · ${money(week.spent)}` : ""}</h2>
              {week.entries.map((entry) => (
                <div key={entry.id}>
                  <p><strong>{entry.title}</strong> · {KIND[entry.kind]}{entry.amount > 0 ? ` · ${money(entry.amount)}` : ""}</p>
                  {entry.personDid ? <p>Что сделал человек: {entry.personDid}</p> : null}
                  {entry.result ? <blockquote>{entry.result}</blockquote> : null}
                </div>
              ))}
              {week.hidden ? <p>Ещё {week.hidden} без подробностей по просьбе участников.</p> : null}
            </section>
          )) : fund ? <p>Первые желания исполняются на этой неделе. The first wishes are being fulfilled this week.</p> : null}
        </div>

        <Link className="legal-primary-action" href={CTA}>Записать своё желание · Add your wish</Link>
      </article>
    </main>
  );
}

function money(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
