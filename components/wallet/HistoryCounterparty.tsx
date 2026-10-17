import Link from "next/link";
import { hasHistoryCounterparty, shortId } from "@/components/wallet/walletHelpers";
import type { TFunction, WalletHistoryRow } from "@/components/wallet/walletTypes";

/** "Counterparty: Name" where the name opens the person's public profile; the short id is used only when the name is unknown. */
export default function HistoryCounterparty({ row, t }: { row: WalletHistoryRow; t: TFunction }) {
  if (!hasHistoryCounterparty(row) || !row.counterpartyUserId) return null;
  return (
    <span className="history-counterparty">
      {t("wallet.history.counterparty")}: <Link className="history-counterparty-link" href={`/u/${row.counterpartyUserId}`}>{row.counterpartyName || shortId(row.counterpartyUserId)}</Link>
    </span>
  );
}
