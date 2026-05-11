/**
 * Rosetta API type definitions used by the Mina Rosetta endpoints.
 *
 * These mirror the [Rosetta API specification](https://docs.cdp.coinbase.com/mesh/docs/api-reference)
 * (now branded as Coinbase Mesh) — Mina implements the standard surface plus
 * a few Mina-specific operation types (see `constants.ts`).
 *
 * Hand-written rather than generated from openapi: the surface is small,
 * we only need the fields Mina actually populates, and a hand-curated shape
 * documents which fields are optional/null in practice.
 */

export interface NetworkIdentifier {
  blockchain: string;
  network: string;
  sub_network_identifier?: { network: string; metadata?: Record<string, unknown> };
}

export interface BlockIdentifier {
  index: number;
  hash: string;
}

export interface PartialBlockIdentifier {
  index?: number;
  hash?: string;
}

export interface AccountIdentifier {
  address: string;
  sub_account?: { address: string; metadata?: Record<string, unknown> };
  metadata?: { token_id?: string } & Record<string, unknown>;
}

export interface Currency {
  symbol: string;
  decimals: number;
  metadata?: Record<string, unknown>;
}

export interface Amount {
  /** Signed nanomina as a decimal string (negative = debit). */
  value: string;
  currency: Currency;
  metadata?: Record<string, unknown>;
}

export interface Operation {
  operation_identifier: { index: number; network_index?: number };
  related_operations?: { index: number }[];
  type: string;
  status?: string;
  account?: AccountIdentifier;
  amount?: Amount;
  coin_change?: { coin_identifier: { identifier: string }; coin_action: string };
  metadata?: Record<string, unknown>;
}

export interface Transaction {
  transaction_identifier: { hash: string };
  operations: Operation[];
  related_transactions?: {
    network_identifier?: NetworkIdentifier;
    transaction_identifier: { hash: string };
    direction: 'forward' | 'backward';
  }[];
  metadata?: Record<string, unknown>;
}

export interface Block {
  block_identifier: BlockIdentifier;
  parent_block_identifier: BlockIdentifier;
  /** Milliseconds since the Unix epoch. */
  timestamp: number;
  transactions: Transaction[];
  metadata?: Record<string, unknown>;
}

/** Rosetta `curve_type` discriminator. Mina uses `pallas`. */
export type CurveType = 'pallas' | 'secp256k1' | 'secp256r1' | 'edwards25519' | 'tweedle';

export interface PublicKey {
  hex_bytes: string;
  curve_type: CurveType;
}

export interface SigningPayload {
  account_identifier?: AccountIdentifier;
  /** Bytes to sign, hex-encoded. */
  hex_bytes: string;
  signature_type?: SignatureType;
}

export type SignatureType =
  | 'ecdsa'
  | 'ecdsa_recovery'
  | 'ed25519'
  | 'schnorr_1'
  | 'schnorr_bip340'
  | 'schnorr_poseidon';

export interface Signature {
  signing_payload: SigningPayload;
  public_key: PublicKey;
  signature_type: SignatureType;
  /** Hex-encoded signature bytes. */
  hex_bytes: string;
}

export interface Version {
  rosetta_version: string;
  node_version: string;
  middleware_version?: string;
  metadata?: Record<string, unknown>;
}

export interface Allow {
  operation_statuses: { status: string; successful: boolean }[];
  operation_types: string[];
  errors: { code: number; message: string; retriable: boolean; description?: string }[];
  historical_balance_lookup: boolean;
  timestamp_start_index?: number;
  call_methods?: string[];
  balance_exemptions?: unknown[];
  mempool_coins?: boolean;
}

export interface Peer {
  peer_id: string;
  metadata?: Record<string, unknown>;
}

// -- Response envelopes returned by RosettaClient methods --

export interface NetworkListResponse {
  network_identifiers: NetworkIdentifier[];
}

export interface NetworkStatusResponse {
  current_block_identifier: BlockIdentifier;
  current_block_timestamp: number;
  genesis_block_identifier: BlockIdentifier;
  oldest_block_identifier?: BlockIdentifier;
  sync_status?: {
    current_index?: number;
    target_index?: number;
    stage?: string;
    synced?: boolean;
  };
  peers: Peer[];
}

export interface NetworkOptionsResponse {
  version: Version;
  allow: Allow;
}

export interface BlockResponse {
  block: Block | null;
  /** Hashes of transactions too large to inline; fetch via /block/transaction. */
  other_transactions?: { hash: string }[];
}

export interface AccountBalanceResponse {
  block_identifier: BlockIdentifier;
  balances: Amount[];
  metadata?: Record<string, unknown>;
}

export interface MempoolResponse {
  transaction_identifiers: { hash: string }[];
}

export interface SearchTransactionsResponse {
  transactions: {
    block_identifier?: BlockIdentifier;
    transaction: Transaction;
  }[];
  total_count: number;
  next_offset?: number;
}

export interface ConstructionDeriveResponse {
  account_identifier?: AccountIdentifier;
  /** Older Rosetta versions used `address` directly; keep both. */
  address?: string;
  metadata?: Record<string, unknown>;
}

export interface ConstructionPreprocessResponse {
  options?: Record<string, unknown>;
  required_public_keys?: AccountIdentifier[];
}

export interface ConstructionMetadataResponse {
  metadata: Record<string, unknown>;
  suggested_fee?: Amount[];
}

export interface ConstructionPayloadsResponse {
  unsigned_transaction: string;
  payloads: SigningPayload[];
}

export interface ConstructionCombineResponse {
  signed_transaction: string;
}

export interface ConstructionParseResponse {
  operations: Operation[];
  account_identifier_signers?: AccountIdentifier[];
  metadata?: Record<string, unknown>;
}

export interface ConstructionHashResponse {
  transaction_identifier: { hash: string };
  metadata?: Record<string, unknown>;
}

export interface ConstructionSubmitResponse {
  transaction_identifier: { hash: string };
  metadata?: Record<string, unknown>;
}

// -- Raw Rosetta error envelope (from the server, not thrown by the SDK) --

export interface RosettaErrorBody {
  code: number;
  message: string;
  description?: string;
  retriable?: boolean;
  details?: Record<string, unknown>;
}
