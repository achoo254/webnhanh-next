/** An error whose status and stable code are safe to send to the client. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Readonly<Record<string, string | number>> = {},
  ) {
    super(code);
    this.name = 'HttpError';
  }
}
