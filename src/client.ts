/**
 * `RosettaClient` — typed wrapper over Mina's Rosetta (Coinbase Mesh) HTTP API.
 *
 * Design notes:
 *
 * - Stateless HTTP client. Every method maps 1:1 to a Rosetta endpoint and
 *   passes the configured `network` through automatically — callers don't
 *   spell out the `network_identifier` envelope every call.
 * - Uses `fetch` (universal across Node 20+, browsers, edge runtimes); the
 *   transport is overridable for tests.
 * - Retry on transport / 5xx / `retriable: true` Rosetta errors; never on
 *   GraphQL-style validation errors (they're deterministic).
 * - Construction API methods are async-friendly: the typical flow is
 *   `derive` → `preprocess` → `metadata` → `payloads` → sign (with
 *   `mina-signer`, see examples) → `combine` → `submit`.
 */

import {
  ConnectionError,
  HttpError,
  RosettaApiError,
} from './errors.js';
import type {
  AccountBalanceResponse,
  BlockResponse,
  ConstructionCombineResponse,
  ConstructionDeriveResponse,
  ConstructionHashResponse,
  ConstructionMetadataResponse,
  ConstructionParseResponse,
  ConstructionPayloadsResponse,
  ConstructionPreprocessResponse,
  ConstructionSubmitResponse,
  MempoolResponse,
  MempoolTransactionResponse,
  NetworkIdentifier,
  NetworkListResponse,
  NetworkOptionsResponse,
  NetworkStatusResponse,
  Operation,
  PartialBlockIdentifier,
  PublicKey,
  RosettaErrorBody,
  SearchTransactionsResponse,
  Signature,
} from './types.js';

import { networkIdentifier as defaultNetworkIdentifier } from './constants.js';

export interface ClientConfig {
  /** Rosetta server base URL (e.g. `https://rosetta-devnet.minaprotocol.network`). */
  baseUrl: string;
  /**
   * Network identifier to attach to every request. Accepts either a plain
   * network name (`'mainnet'`, `'devnet'`) or a full `NetworkIdentifier`.
   * Defaults to mainnet.
   */
  network?: string | NetworkIdentifier;
  /** Total attempts including the initial try. Default 3. */
  retries?: number;
  /** Milliseconds between retries. Default 5000. */
  retryDelayMs?: number;
  /** Per-request timeout in ms. Default 30000. */
  timeoutMs?: number;
  /** Extra headers attached to every request. */
  headers?: Record<string, string>;
  /** Override fetch (testing). Defaults to global fetch. */
  fetch?: typeof fetch;
}

const DEFAULTS = {
  retries: 3,
  retryDelayMs: 5_000,
  timeoutMs: 30_000,
};

export class RosettaClient {
  readonly #baseUrl: string;
  readonly #network: NetworkIdentifier;
  readonly #retries: number;
  readonly #retryDelayMs: number;
  readonly #timeoutMs: number;
  readonly #headers: Record<string, string>;
  readonly #fetch: typeof fetch;

  constructor(config: ClientConfig) {
    if (!config.baseUrl) throw new Error('baseUrl is required');
    if ((config.retries ?? DEFAULTS.retries) < 1) {
      throw new Error('retries must be at least 1');
    }
    if ((config.timeoutMs ?? DEFAULTS.timeoutMs) <= 0) {
      throw new Error('timeoutMs must be greater than zero');
    }
    this.#baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.#network =
      typeof config.network === 'string' || config.network === undefined
        ? defaultNetworkIdentifier(config.network as string | undefined)
        : config.network;
    this.#retries = config.retries ?? DEFAULTS.retries;
    this.#retryDelayMs = config.retryDelayMs ?? DEFAULTS.retryDelayMs;
    this.#timeoutMs = config.timeoutMs ?? DEFAULTS.timeoutMs;
    this.#headers = config.headers ?? {};
    this.#fetch = config.fetch ?? fetch;
  }

  /** Rosetta server base URL (trailing slashes stripped). */
  get baseUrl(): string {
    return this.#baseUrl;
  }

  /** The `NetworkIdentifier` attached to every request. */
  get network(): NetworkIdentifier {
    return this.#network;
  }

  // -- Low-level transport --

  /**
   * POST `body` to `endpoint`, returning the parsed JSON response.
   * Retries transport failures, 5xx, and `retriable: true` Rosetta errors.
   *
   * Public so consumers can hit Mina-specific endpoints we haven't typed yet
   * (e.g. future `/call` methods) through the same retry path.
   */
  async post<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.#baseUrl}${endpoint}`;
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.#retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

      try {
        const resp = await this.#fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            ...this.#headers,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);

        const text = await resp.text();
        let parsed: unknown;
        try {
          parsed = text.length > 0 ? JSON.parse(text) : undefined;
        } catch {
          // Non-JSON response — surface as HttpError, no retry.
          throw new HttpError(endpoint, resp.status, resp.statusText, text);
        }

        if (!resp.ok) {
          // Rosetta error envelope: { code, message, retriable?, details? }
          if (isRosettaErrorBody(parsed)) {
            if (parsed.retriable && attempt < this.#retries) {
              lastError = new RosettaApiError(endpoint, resp.status, parsed);
              await sleep(this.#retryDelayMs);
              continue;
            }
            throw new RosettaApiError(endpoint, resp.status, parsed);
          }
          // Generic HTTP failure — retry 5xx, fail fast on 4xx.
          if (resp.status >= 500 && attempt < this.#retries) {
            lastError = new HttpError(endpoint, resp.status, resp.statusText, text);
            await sleep(this.#retryDelayMs);
            continue;
          }
          throw new HttpError(endpoint, resp.status, resp.statusText, text);
        }

        return parsed as T;
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof RosettaApiError || err instanceof HttpError) {
          throw err;
        }
        lastError = err;
        if (attempt < this.#retries) {
          await sleep(this.#retryDelayMs);
        }
      }
    }

    throw new ConnectionError(endpoint, this.#retries, lastError);
  }

  // -- Data API --

  networkList() {
    return this.post<NetworkListResponse>('/network/list', { metadata: {} });
  }

  networkStatus() {
    return this.post<NetworkStatusResponse>('/network/status', {
      network_identifier: this.#network,
    });
  }

  networkOptions() {
    return this.post<NetworkOptionsResponse>('/network/options', {
      network_identifier: this.#network,
    });
  }

  /** Look up a block by index, hash, or both. Pass `{}` for the tip. */
  block(id: PartialBlockIdentifier = {}) {
    return this.post<BlockResponse>('/block', {
      network_identifier: this.#network,
      block_identifier: id,
    });
  }

  /** Balance of `address` at the current tip (or at `blockIdentifier`). */
  accountBalance(args: {
    address: string;
    tokenId?: string;
    blockIdentifier?: PartialBlockIdentifier;
  }) {
    const account_identifier =
      args.tokenId !== undefined
        ? { address: args.address, metadata: { token_id: args.tokenId } }
        : { address: args.address };
    return this.post<AccountBalanceResponse>('/account/balance', {
      network_identifier: this.#network,
      account_identifier,
      block_identifier: args.blockIdentifier,
    });
  }

  mempool() {
    return this.post<MempoolResponse>('/mempool', {
      network_identifier: this.#network,
    });
  }

  /** Fetch the full operations of a single pending transaction by hash. */
  mempoolTransaction(transactionHash: string) {
    return this.post<MempoolTransactionResponse>('/mempool/transaction', {
      network_identifier: this.#network,
      transaction_identifier: { hash: transactionHash },
    });
  }

  searchTransactions(args: {
    address?: string;
    transactionHash?: string;
    limit?: number;
    offset?: number;
    success?: boolean;
  }) {
    return this.post<SearchTransactionsResponse>('/search/transactions', {
      network_identifier: this.#network,
      address: args.address,
      transaction_identifier: args.transactionHash
        ? { hash: args.transactionHash }
        : undefined,
      limit: args.limit,
      offset: args.offset,
      success: args.success,
    });
  }

  // -- Construction API --

  /** Derive an account identifier from a public key. */
  constructionDerive(publicKey: PublicKey) {
    return this.post<ConstructionDeriveResponse>('/construction/derive', {
      network_identifier: this.#network,
      public_key: publicKey,
    });
  }

  /** First step of the construction flow — operations in, options out. */
  constructionPreprocess(args: {
    operations: Operation[];
    metadata?: Record<string, unknown>;
  }) {
    return this.post<ConstructionPreprocessResponse>(
      '/construction/preprocess',
      {
        network_identifier: this.#network,
        operations: args.operations,
        metadata: args.metadata,
      },
    );
  }

  /** Get the network-side metadata (nonce, suggested fee, etc.). */
  constructionMetadata(args: {
    options: Record<string, unknown>;
    publicKeys?: PublicKey[];
  }) {
    return this.post<ConstructionMetadataResponse>('/construction/metadata', {
      network_identifier: this.#network,
      options: args.options,
      public_keys: args.publicKeys,
    });
  }

  /** Build the signing payloads from operations + metadata. */
  constructionPayloads(args: {
    operations: Operation[];
    metadata?: Record<string, unknown>;
    publicKeys?: PublicKey[];
  }) {
    return this.post<ConstructionPayloadsResponse>('/construction/payloads', {
      network_identifier: this.#network,
      operations: args.operations,
      metadata: args.metadata,
      public_keys: args.publicKeys,
    });
  }

  /** Combine an unsigned transaction with its signatures. */
  constructionCombine(args: {
    unsignedTransaction: string;
    signatures: Signature[];
  }) {
    return this.post<ConstructionCombineResponse>('/construction/combine', {
      network_identifier: this.#network,
      unsigned_transaction: args.unsignedTransaction,
      signatures: args.signatures,
    });
  }

  /** Parse a signed or unsigned transaction back into operations (round-trip check). */
  constructionParse(args: { signed: boolean; transaction: string }) {
    return this.post<ConstructionParseResponse>('/construction/parse', {
      network_identifier: this.#network,
      signed: args.signed,
      transaction: args.transaction,
    });
  }

  /** Compute the transaction hash without submitting. */
  constructionHash(signedTransaction: string) {
    return this.post<ConstructionHashResponse>('/construction/hash', {
      network_identifier: this.#network,
      signed_transaction: signedTransaction,
    });
  }

  /** Submit a signed transaction to the network. */
  constructionSubmit(signedTransaction: string) {
    return this.post<ConstructionSubmitResponse>('/construction/submit', {
      network_identifier: this.#network,
      signed_transaction: signedTransaction,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRosettaErrorBody(x: unknown): x is RosettaErrorBody {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as RosettaErrorBody).code === 'number' &&
    typeof (x as RosettaErrorBody).message === 'string'
  );
}
