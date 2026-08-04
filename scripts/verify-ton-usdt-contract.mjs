import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260802140000_ton_usdt_jetton_rail.sql", "utf8");
const lib = fs.readFileSync("lib/tonUsdt.ts", "utf8");
const scanner = fs.readFileSync("app/api/internal/ton/usdt/deposits/scan/route.ts", "utf8");
const ui = fs.readFileSync("components/TonUsdtWalletModals.tsx", "utf8");
const walletUi = fs.readFileSync("components/WalletApp.tsx", "utf8");
const methodUi = fs.readFileSync("components/WalletCryptoMethodModal.tsx", "utf8");

function assertIncludes(source, value, label) {
  if (!source.includes(value)) throw new Error(`${label}: missing ${value}`);
}

assertIncludes(lib, "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs", "official master allowlist");
assertIncludes(lib, "TON_USDT_DECIMALS = 6", "USDT decimals contract");
assertIncludes(lib, "getWalletAddress", "master/token-wallet derivation");
assertIncludes(lib, "normalizeTonCenterRestEndpoint", "Toncenter REST endpoint normalization");
assertIncludes(lib, "normalizeTonCenterRpcEndpoint", "Toncenter JSON-RPC endpoint normalization");
assertIncludes(lib, "endpoint: config.rpcEndpoint", "Toncenter JSON-RPC client endpoint");
assertIncludes(lib, "0x0f8a7ea5", "jetton transfer opcode");
assertIncludes(lib, ".storeCoins(1)", "positive transfer notification amount");
assertIncludes(migration, "check (decimals = 6)", "database decimals guard");
assertIncludes(scanner, "0x7362d09c", "notification parser contract");
assertIncludes(migration, "settle_ton_usdt_deposit", "atomic deposit settlement RPC");
assertIncludes(migration, "reserve_ton_usdt_withdrawal", "atomic withdrawal reserve RPC");
assertIncludes(migration, "unique (network, master_address, transaction_hash, logical_time, message_index)", "chain-event idempotency");
assertIncludes(scanner, "0x7362d09c", "notification opcode parser");
assertIncludes(scanner, "verifyJettonWalletSource", "source wallet master verification");
assertIncludes(scanner, "claim_ton_chain_scan", "scanner lease");
assertIncludes(ui, "/api/wallet/deposits/usdt", "USDT deposit UI route");
assertIncludes(ui, "/api/wallet/withdrawals/usdt", "USDT withdrawal UI route");
assertIncludes(ui, "wallet.usdt.withdraw.unavailable.railDisabled", "USDT disabled reason");
assertIncludes(ui, "wallet.usdt.withdraw.unavailable.ownerMissing", "USDT owner reason");
assertIncludes(ui, "wallet.usdt.withdraw.unavailable.masterInvalid", "USDT master reason");
assertIncludes(ui, "wallet.usdt.withdraw.unavailable.jettonWalletMissing", "USDT Jetton wallet reason");
assertIncludes(methodUi, "wallet.cryptoMethod.ton", "TON method selector");
assertIncludes(methodUi, "wallet.cryptoMethod.usdtTon", "USDT method selector");
assertIncludes(walletUi, "setDepositMethodOpen(true)", "deposit method selector action");
assertIncludes(walletUi, "setWithdrawMethodOpen(true)", "withdrawal method selector action");
const walletActionCount = (walletUi.match(/wallet-action-button/g) ?? []).length;
if (walletActionCount !== 4) throw new Error(`Wallet action grid must keep four actions, found ${walletActionCount}.`);
console.log("TON USDT rail contract checks passed.");