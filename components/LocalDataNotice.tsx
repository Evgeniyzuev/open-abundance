"use client";

import { useUserContext } from "@/components/UserProvider";

type LocalDataNoticeProps = {
  status: "ready" | "loading" | "slow" | "error";
  onRetry: () => void;
};

export default function LocalDataNotice({ status, onRetry }: LocalDataNoticeProps) {
  const { t } = useUserContext();

  if (status !== "slow" && status !== "error") return null;

  return (
    <div className={`local-data-notice ${status}`} role={status === "error" ? "alert" : "status"}>
      <span>{t(status === "error" ? "localData.error" : "localData.slow")}</span>
      {status === "error" ? (
        <button type="button" onClick={onRetry}>{t("localData.retry")}</button>
      ) : null}
    </div>
  );
}
