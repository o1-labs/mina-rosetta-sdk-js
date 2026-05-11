/**
 * Mina-specific helpers for assembling Rosetta operations.
 *
 * Construction API callers don't compose `Operation[]` by hand — they call
 * these helpers, hand the result to `RosettaClient.constructionPreprocess()`,
 * and follow the standard derive/preprocess/metadata/payloads/combine/submit
 * sequence.
 */

import { DEFAULT_TOKEN_ID, MINA_CURRENCY, OperationType } from './constants.js';
import type { Operation } from './types.js';

/**
 * Build the three operations that represent a single MINA transfer:
 *
 *   index 0: `fee_payment`         — sender pays the fee
 *   index 1: `payment_source_dec`  — sender's balance decreases by amount
 *   index 2: `payment_receiver_inc` — receiver's balance increases by amount
 *
 * Operations 1 and 2 are related via `related_operations: [{ index: 1 }]`
 * per the Rosetta spec.
 *
 * @example
 * ```ts
 * import { buildTransferOperations } from '@o1-labs/mina-rosetta-sdk';
 *
 * const ops = buildTransferOperations({
 *   sender:        'B62qsender...',
 *   receiver:      'B62qreceiver...',
 *   amountNanomina: '1500000000', // 1.5 MINA
 *   feeNanomina:    '10000000',   // 0.01 MINA
 * });
 * ```
 */
export function buildTransferOperations(args: {
  sender: string;
  receiver: string;
  /** Transfer amount, nanomina as a decimal string. */
  amountNanomina: string;
  /** Transaction fee, nanomina as a decimal string. */
  feeNanomina: string;
  /** Token ID. Defaults to Mina's native token. */
  tokenId?: string;
}): Operation[] {
  const tokenId = args.tokenId ?? DEFAULT_TOKEN_ID;
  const senderAccount = { address: args.sender, metadata: { token_id: tokenId } };
  const receiverAccount = { address: args.receiver, metadata: { token_id: tokenId } };

  return [
    {
      operation_identifier: { index: 0 },
      type: OperationType.FeePayment,
      account: senderAccount,
      amount: { value: `-${args.feeNanomina}`, currency: MINA_CURRENCY },
    },
    {
      operation_identifier: { index: 1 },
      type: OperationType.PaymentSourceDec,
      account: senderAccount,
      amount: { value: `-${args.amountNanomina}`, currency: MINA_CURRENCY },
    },
    {
      operation_identifier: { index: 2 },
      related_operations: [{ index: 1 }],
      type: OperationType.PaymentReceiverInc,
      account: receiverAccount,
      amount: { value: args.amountNanomina, currency: MINA_CURRENCY },
    },
  ];
}

/**
 * Build the two operations that represent a stake delegation change.
 *
 *   index 0: `fee_payment`     — delegator pays the fee
 *   index 1: `delegate_change` — delegator's `metadata.delegate_change_target` set
 */
export function buildDelegationOperations(args: {
  delegator: string;
  newDelegate: string;
  feeNanomina: string;
  tokenId?: string;
}): Operation[] {
  const tokenId = args.tokenId ?? DEFAULT_TOKEN_ID;
  const delegatorAccount = {
    address: args.delegator,
    metadata: { token_id: tokenId },
  };

  return [
    {
      operation_identifier: { index: 0 },
      type: OperationType.FeePayment,
      account: delegatorAccount,
      amount: { value: `-${args.feeNanomina}`, currency: MINA_CURRENCY },
    },
    {
      operation_identifier: { index: 1 },
      type: OperationType.DelegateChange,
      account: delegatorAccount,
      metadata: { delegate_change_target: args.newDelegate },
    },
  ];
}
