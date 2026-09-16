/** 带稳定业务错误码的 HTTP 错误，由统一错误中间件序列化。 */
export class HttpError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
