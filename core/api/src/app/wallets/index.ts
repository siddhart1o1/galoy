export * from "./add-invoice-for-wallet"
export * from "./add-pending-on-chain-transaction"
export * from "./remove-pending-on-chain-transaction"
export * from "./add-settled-on-chain-transaction"
export * from "./create-on-chain-address"
export * from "./get-balance-for-wallet"
export * from "./get-last-on-chain-address"
export * from "./get-on-chain-fee"
export * from "./get-pending-onchain-balance-for-wallet"
export * from "./get-transaction-by-id"
export * from "./get-transactions-by-addresses"
export * from "./get-transactions-by-hash"
export * from "./get-transactions-for-wallet"
export * from "./register-broadcasted-payout-txn"
export * from "./settle-payout-txn"
export * from "./update-legacy-on-chain-receipt"
export * from "./update-pending-invoices"
export * from "./validate"

import { WalletsRepository } from "@/services/mongoose"

export const getWallet = async (walletId: WalletId) => {
  const wallets = WalletsRepository()
  return wallets.findById(walletId)
}

export const listWalletsByAccountId = async (
  accountId: AccountId,
): Promise<Wallet[] | RepositoryError> => {
  return WalletsRepository().listByAccountId(accountId)
}

export const listWalletIds = async (
  walletCurrency: WalletCurrency,
): Promise<WalletId[] | RepositoryError> => {
  const wallets = await WalletsRepository().listByWalletCurrency(walletCurrency)
  if (wallets instanceof Error) return wallets
  return wallets.map((wallet) => wallet.id)
}
