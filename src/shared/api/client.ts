import type { components } from './schema';
type ErrorBody = components['schemas']['ApiError'];
export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'cancelled' | 'invalid-response';
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
export class ApiRequestError extends Error {
  constructor(message: string, public readonly status?: number, public readonly code?: string, public readonly requestId?: string, public readonly kind: ApiErrorKind = 'http', public readonly classifiedUnavailable = false) {
    super(message);
    this.name = 'ApiRequestError';
  }
}
export function isUncertainWriteError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError))
    return true;
  if (error.kind !== 'http' || error.status === undefined)
    return true;
  return error.status === 408 || (error.status >= 500 && !error.classifiedUnavailable);
}
export function invalidResponse(response: Response, message: string): ApiRequestError {
  return new ApiRequestError(message, response.status, undefined, response.headers.get('X-Request-ID') ?? undefined, 'invalid-response');
}
export async function apiRequest<T = Response>(path: string, options: RequestInit = {}, consume?: (response: Response) => Promise<T> | T, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<T> {
  const write = !['GET', 'HEAD'].includes((options.method ?? 'GET').toUpperCase());
  const outcomeGuidance = write ? ' Check the operation outcome before retrying.' : '';
  const abortGuidance = write ? ' Stopping the request does not guarantee a backend rollback.' : '';
  const controller = new AbortController();
  const signal = options.signal;
  let response: Response | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop: (kind: 'timeout' | 'cancelled') => void = () => { };
  const interrupted = new Promise<never>((_, reject) => {
    stop = kind => {
      reject(new ApiRequestError(kind === 'timeout'
        ? `The request timed out.${abortGuidance}`
        : `The request was cancelled.${abortGuidance}`, response?.status, undefined, response?.headers.get('X-Request-ID') ?? undefined, kind));
      controller.abort();
    };
  });
  const onAbort = () => stop('cancelled');
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted)
    onAbort();
  else
    timer = setTimeout(() => stop('timeout'), timeoutMs);
  const work = async (): Promise<T> => {
    if (controller.signal.aborted)
      return interrupted;
    try {
      response = await fetch(path, { ...options, signal: controller.signal });
    }
    catch {
      if (controller.signal.aborted)
        return interrupted;
      throw new ApiRequestError(`Unable to reach the server. Check your connection.${outcomeGuidance}`, undefined, undefined, undefined, 'network');
    }
    if (controller.signal.aborted)
      return interrupted;
    if (!response.ok) {
      let body: Partial<ErrorBody> = {};
      let classifiedUnavailable = false;
      try {
        const value: unknown = await response.json();
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const candidate = value as Record<string, unknown>;
          if (typeof candidate.code === 'string')
            body.code = candidate.code;
          if (typeof candidate.message === 'string')
            body.message = candidate.message;
          classifiedUnavailable = response.status === 503 && candidate.code === 'SERVICE_UNAVAILABLE' && typeof candidate.message === 'string' && candidate.message.length > 0 && Object.keys(candidate).length === 2;
        }
      }
      catch { /* Error bodies may be empty or non-JSON. */ }
      if (controller.signal.aborted)
        return interrupted;
      throw new ApiRequestError(body.message ?? `Request failed (HTTP ${response.status}).`, response.status, body.code, response.headers.get('X-Request-ID') ?? undefined, 'http', classifiedUnavailable);
    }
    try {
      const result = consume ? await consume(response) : response as T;
      if (controller.signal.aborted)
        return interrupted;
      return result;
    }
    catch (error) {
      if (error instanceof ApiRequestError)
        throw error;
      throw invalidResponse(response, `The server returned an unusable response.${outcomeGuidance}`);
    }
  };
  try {
    return await Promise.race([interrupted, work()]);
  }
  finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
export function apiGet<T = Response>(path: string, accept: string, signal: AbortSignal, consume?: (response: Response) => Promise<T> | T): Promise<T> {
  return apiRequest(path, { signal, headers: { Accept: accept } }, consume);
}
