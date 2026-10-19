import type { components } from './schema';

type ErrorBody = components['schemas']['ApiError'];

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function apiRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const signal = options.signal;
  let response: Response;
  try {
    response = await fetch(path, options);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiRequestError('Cannot connect to the backend. Check that it is running and that BACKEND_URL in .env.local is correct.');
  }
  if (response.ok) return response;
  let body: Partial<ErrorBody> = {};
  try {
    const value: unknown = await response.json();
    if (value && typeof value === 'object') {
      const candidate = value as Record<string, unknown>;
      if (typeof candidate.code === 'string') body.code = candidate.code;
      if (typeof candidate.message === 'string') body.message = candidate.message;
    }
  } catch { /* Proxy failures can have empty or non-JSON responses. */ }
  const unavailable = response.status >= 500 && !body.code;
  throw new ApiRequestError(
    body.message ?? (unavailable
      ? 'Cannot connect to the backend. Check that it is running and that BACKEND_URL in .env.local is correct.'
      : `Request failed (HTTP ${response.status}).`),
    response.status, body.code, response.headers.get('X-Request-ID') ?? undefined,
  );
}

export function apiGet(path: string, accept: string, signal: AbortSignal): Promise<Response> {
  return apiRequest(path, { signal, headers: { Accept: accept } });
}
