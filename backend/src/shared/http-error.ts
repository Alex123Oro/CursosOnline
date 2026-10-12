export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly fields?: { path: string; message: string }[]
  ) {
    super(message);
  }
}
