// Payloads of the transaction a person's own TON wallet signs through TON Connect: a TON transfer with the invoice
// comment, or a USDT Jetton transfer (TEP-74) from the person's Jetton wallet to our deposit owner with the same
// comment. Pure: no network, tested directly by node.
import { Address, beginCell, toNano } from "@ton/ton";

/** Text comment cell (op 0 + text), base64 BOC, as wallets expect in a TON Connect message payload. */
export function commentPayload(comment: string): string {
  return beginCell().storeUint(0, 32).storeStringTail(comment).endCell().toBoc().toString("base64");
}

/**
 * Jetton transfer body: `amountUnits` Jettons to `destinationOwner`, excess TON back to `responseOwner`, 1 nanoTON
 * forwarded so the deposit owner gets a transfer notification carrying `comment` (the scanner reads it from there).
 */
export function jettonTransferPayload(input: { amountUnits: string; destinationOwner: string; responseOwner: string; comment?: string | null; queryId?: bigint }): string {
  const builder = beginCell()
    .storeUint(0x0f8a7ea5, 32)
    .storeUint(input.queryId ?? BigInt(0), 64)
    .storeCoins(BigInt(input.amountUnits))
    .storeAddress(Address.parse(input.destinationOwner))
    .storeAddress(Address.parse(input.responseOwner))
    .storeBit(0)
    .storeCoins(1);
  if (input.comment) builder.storeBit(1).storeRef(beginCell().storeUint(0, 32).storeStringTail(input.comment).endCell());
  else builder.storeBit(0);
  return builder.endCell().toBoc().toString("base64");
}

/** TON Connect chain id: "-239" mainnet, "-3" testnet. */
export function tonConnectChain(network: "mainnet" | "testnet"): "-239" | "-3" {
  return network === "mainnet" ? "-239" : "-3";
}

export function nanoFromTon(value: string): string {
  return toNano(value).toString();
}
