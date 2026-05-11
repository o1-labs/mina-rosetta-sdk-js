/**
 * `@o1-labs/mina-rosetta-sdk` — TypeScript SDK for Mina's Rosetta
 * (Coinbase Mesh) endpoints.
 *
 * Light wrapper: typed clients for the Data + Construction APIs, the
 * Mina-specific three-operation transfer helper, and a peer dependency on
 * `mina-signer` for the actual signing. Does not reimplement keypair
 * management or chain-state queries beyond Rosetta — for archive-node
 * queries use `@o1-labs/mina-archive-sdk`; for daemon GraphQL use
 * `mina-sdk`.
 *
 * @example
 * ```ts
 * import { RosettaClient } from '@o1-labs/mina-rosetta-sdk';
 *
 * const client = new RosettaClient({
 *   baseUrl: 'http://localhost:3087',
 *   network: 'devnet',
 * });
 *
 * const status = await client.networkStatus();
 * console.log('tip:', status.current_block_identifier.index);
 * ```
 */

export { RosettaClient } from './client.js';
export type { ClientConfig } from './client.js';

export {
  BLOCKCHAIN,
  CURVE_TYPE,
  DEFAULT_TOKEN_ID,
  MINA_CURRENCY,
  Network,
  OperationType,
  networkIdentifier,
} from './constants.js';

export {
  buildDelegationOperations,
  buildTransferOperations,
} from './helpers.js';

export {
  ConnectionError,
  HttpError,
  RosettaApiError,
} from './errors.js';

export type {
  AccountBalanceResponse,
  AccountIdentifier,
  Allow,
  Amount,
  Block,
  BlockIdentifier,
  BlockResponse,
  ConstructionCombineResponse,
  ConstructionDeriveResponse,
  ConstructionHashResponse,
  ConstructionMetadataResponse,
  ConstructionParseResponse,
  ConstructionPayloadsResponse,
  ConstructionPreprocessResponse,
  ConstructionSubmitResponse,
  Currency,
  CurveType,
  MempoolResponse,
  NetworkIdentifier,
  NetworkListResponse,
  NetworkOptionsResponse,
  NetworkStatusResponse,
  Operation,
  PartialBlockIdentifier,
  Peer,
  PublicKey,
  RosettaErrorBody,
  SearchTransactionsResponse,
  Signature,
  SignatureType,
  SigningPayload,
  Transaction,
  Version,
} from './types.js';
