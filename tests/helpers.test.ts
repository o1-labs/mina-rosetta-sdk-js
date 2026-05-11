import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_TOKEN_ID,
  MINA_CURRENCY,
  buildDelegationOperations,
  buildTransferOperations,
} from '../src/index.js';

test('buildTransferOperations returns the canonical 3-op layout', () => {
  const ops = buildTransferOperations({
    sender: 'B62qsender',
    receiver: 'B62qreceiver',
    amountNanomina: '1500000000',
    feeNanomina: '10000000',
  });

  assert.equal(ops.length, 3);
  assert.equal(ops[0].type, 'fee_payment');
  assert.equal(ops[1].type, 'payment_source_dec');
  assert.equal(ops[2].type, 'payment_receiver_inc');

  assert.equal(ops[0].account?.address, 'B62qsender');
  assert.equal(ops[1].account?.address, 'B62qsender');
  assert.equal(ops[2].account?.address, 'B62qreceiver');
});

test('buildTransferOperations signs debits as negative amounts', () => {
  const ops = buildTransferOperations({
    sender: 'B62qsender',
    receiver: 'B62qreceiver',
    amountNanomina: '500',
    feeNanomina: '10',
  });
  assert.equal(ops[0].amount?.value, '-10');
  assert.equal(ops[1].amount?.value, '-500');
  assert.equal(ops[2].amount?.value, '500');
});

test('buildTransferOperations relates operations 1 and 2', () => {
  const ops = buildTransferOperations({
    sender: 'B62qsender',
    receiver: 'B62qreceiver',
    amountNanomina: '1',
    feeNanomina: '1',
  });
  assert.equal(ops[0].related_operations, undefined);
  assert.equal(ops[1].related_operations, undefined);
  assert.deepEqual(ops[2].related_operations, [{ index: 1 }]);
});

test('buildTransferOperations uses MINA currency on every op', () => {
  const ops = buildTransferOperations({
    sender: 'B62qs',
    receiver: 'B62qr',
    amountNanomina: '1',
    feeNanomina: '1',
  });
  for (const op of ops) {
    assert.deepEqual(op.amount?.currency, MINA_CURRENCY);
  }
});

test('buildTransferOperations defaults to MINA token id', () => {
  const ops = buildTransferOperations({
    sender: 'B62qs',
    receiver: 'B62qr',
    amountNanomina: '1',
    feeNanomina: '1',
  });
  assert.equal(ops[0].account?.metadata?.token_id, DEFAULT_TOKEN_ID);
  assert.equal(ops[2].account?.metadata?.token_id, DEFAULT_TOKEN_ID);
});

test('buildTransferOperations honors custom token id', () => {
  const ops = buildTransferOperations({
    sender: 'B62qs',
    receiver: 'B62qr',
    amountNanomina: '1',
    feeNanomina: '1',
    tokenId: 'wCustom',
  });
  for (const op of ops) {
    assert.equal(op.account?.metadata?.token_id, 'wCustom');
  }
});

test('buildDelegationOperations returns fee + delegate_change', () => {
  const ops = buildDelegationOperations({
    delegator: 'B62qdelegator',
    newDelegate: 'B62qtarget',
    feeNanomina: '10000000',
  });
  assert.equal(ops.length, 2);
  assert.equal(ops[0].type, 'fee_payment');
  assert.equal(ops[1].type, 'delegate_change');
  assert.equal(ops[1].metadata?.delegate_change_target, 'B62qtarget');
});
