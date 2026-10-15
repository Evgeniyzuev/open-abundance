import { readFileSync } from "node:fs";

// SocialApp and WalletApp were split into several files; contract checks look at the code as a whole.
const read = (path) => readFileSync(path, "utf8");

export function readSocialSource() {
  return ["components/SocialApp.tsx", "components/social/FeedParts.tsx", "components/social/FeedStoryRings.tsx", "components/social/socialHelpers.ts", "components/social/socialTypes.ts", "components/social/useFeed.ts"].map(read).join("\n");
}

export function readWalletSource() {
  return ["components/WalletApp.tsx", "components/wallet/WalletPanels.tsx", "components/wallet/WalletModals.tsx", "components/wallet/walletHelpers.ts", "components/wallet/walletTypes.ts"].map(read).join("\n");
}
