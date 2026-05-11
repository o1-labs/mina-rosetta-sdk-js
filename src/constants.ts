/**
 * Mina-specific Rosetta constants.
 *
 * These are stable across Mina mainnet/devnet/etc. — only `network` varies
 * by environment, which the consumer passes in when constructing a client.
 */

import type { Currency, CurveType, NetworkIdentifier } from './types.js';

/** Rosetta `blockchain` discriminator for Mina. */
export const BLOCKCHAIN = 'mina';

/** Rosetta `curve_type` Mina uses for public keys + signatures. */
export const CURVE_TYPE: CurveType = 'pallas';

/** Native MINA currency with the canonical 9-decimal (nanomina) precision. */
export const MINA_CURRENCY: Currency = { symbol: 'MINA', decimals: 9 };

/** Default MINA token ID — used when an `AccountIdentifier` omits `token_id`. */
export const DEFAULT_TOKEN_ID = 'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf';

/**
 * Mina-specific operation type strings used by the Rosetta server.
 *
 * `payment_source_dec` + `payment_receiver_inc` form a single conceptual
 * MINA transfer; `fee_payment` is always sender-side. See
 * `buildTransferOperations` in `./helpers.ts` for the canonical layout.
 */
export const OperationType = {
  FeePayment: 'fee_payment',
  PaymentSourceDec: 'payment_source_dec',
  PaymentReceiverInc: 'payment_receiver_inc',
  AccountCreationFeeViaPayment: 'account_creation_fee_via_payment',
  AccountCreationFeeViaFeePayer: 'account_creation_fee_via_fee_payer',
  DelegateChange: 'delegate_change',
  ZkappFeePayerDec: 'zkapp_fee_payer_dec',
  ZkappBalanceUpdate: 'zkapp_balance_update',
  CoinbaseInc: 'coinbase_inc',
  FeeReceiverInc: 'fee_receiver_inc',
  FeePayerDec: 'fee_payer_dec',
} as const;

export type OperationType = (typeof OperationType)[keyof typeof OperationType];

/** Common Rosetta network names for Mina. Consumers can pass any string. */
export const Network = {
  Mainnet: 'mainnet',
  Devnet: 'devnet',
} as const;

export type Network = (typeof Network)[keyof typeof Network];

/** Build a `NetworkIdentifier` for the given network name (defaults to mainnet). */
export function networkIdentifier(network: string = Network.Mainnet): NetworkIdentifier {
  return { blockchain: BLOCKCHAIN, network };
}
