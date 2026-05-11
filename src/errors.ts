/**
 * Typed errors thrown by `RosettaClient`. Match by `instanceof` or `.name`.
 *
 * The Rosetta server returns errors as an envelope with `code` + `message`;
 * `RosettaApiError` carries that envelope verbatim so callers can inspect
 * `code` to drive recovery logic. Transport failures (DNS, refused, timeout)
 * surface as `ConnectionError`.
 */

import type { RosettaErrorBody } from './types.js';

export class RosettaApiError extends Error {
  override name = 'RosettaApiError';
  constructor(
    public endpoint: string,
    public httpStatus: number,
    public body: RosettaErrorBody,
  ) {
    super(
      `${endpoint} ${httpStatus}: [${body.code}] ${body.message}${
        body.description ? ` — ${body.description}` : ''
      }`,
    );
  }

  get retriable(): boolean {
    return this.body.retriable === true;
  }
}

export class ConnectionError extends Error {
  override name = 'ConnectionError';
  constructor(
    public endpoint: string,
    public attempts: number,
    public override cause: unknown,
  ) {
    super(
      `failed to reach ${endpoint} after ${attempts} attempt(s): ${String(cause)}`,
    );
  }
}

export class HttpError extends Error {
  override name = 'HttpError';
  constructor(
    public endpoint: string,
    public status: number,
    public statusText: string,
    public body?: string,
  ) {
    super(
      `HTTP ${status} ${statusText} from ${endpoint}${
        body ? `: ${body.slice(0, 200)}` : ''
      }`,
    );
  }
}
