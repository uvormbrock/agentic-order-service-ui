import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, isUncertainWriteError } from './client';

afterEach(() => vi.useRealTimers());
const json = (body: unknown, status = 503) => new Response(JSON.stringify(body), { status, headers: { 'X-Request-ID': 'trace-123' } });

describe('request reliability', () => {
  it.each([408, 500, 502, 503, 504])('preserves HTTP %i and distinguishes server failure from transport failure', async status => {
    const fetch = vi.fn().mockResolvedValue(json({ message: 'Gateway could not confirm the operation.' }, status));
    vi.stubGlobal('fetch', fetch);
    const error = await apiRequest('/orders', { method: 'POST' }).catch(reason => reason);
    expect(error).toMatchObject({ status, message: 'Gateway could not confirm the operation.', requestId: 'trace-123' });
    expect(error.message).not.toContain('Cannot connect');
    expect(isUncertainWriteError(error)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ code: 'SERVICE_UNAVAILABLE', message: 'A required service is temporarily unavailable.' }, false],
    [{ code: 'SERVICE_UNAVAILABLE' }, true],
    [{ code: 'UNKNOWN', message: 'Unavailable' }, true],
    [{}, true],
  ])('classifies only the complete recognized 503 envelope: %j', async (body, uncertain) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(body)));
    const error = await apiRequest('/orders', { method: 'POST' }).catch(reason => reason);
    expect(error.status).toBe(503);
    expect(isUncertainWriteError(error)).toBe(uncertain);
  });

  it('uses an HTTP fallback for an empty proxy error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 502 })));
    const error = await apiRequest('/orders', { method: 'POST' }).catch(reason => reason);
    expect(error).toMatchObject({ status: 502, kind: 'http' });
    expect(error.message).toContain('HTTP 502');
    expect(error.message).not.toMatch(/Cannot connect|Unable to reach/);
  });

  it('preserves HTTP diagnostics when the error body stalls until the deadline', async () => {
    vi.useFakeTimers();
    const response = new Response(null, { status: 504, headers: { 'X-Request-ID': 'stalled-error' } });
    vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const result = apiRequest('/orders', { method: 'POST' }, undefined, 50).catch(reason => reason);
    await vi.advanceTimersByTimeAsync(51);
    expect(await result).toMatchObject({ status: 504, requestId: 'stalled-error', kind: 'timeout' });
  });

  it('reports transport failure and never retries', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetch);
    const error = await apiRequest('/orders', { method: 'POST' }).catch(reason => reason);
    expect(error.message).toContain('Unable to reach');
    expect(error.kind).toBe('network');
    expect(error.status).toBeUndefined();
    expect(isUncertainWriteError(error)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['json', 'blob'] as const)('bounds stalled %s body consumption, even when the body ignores abort', async method => {
    vi.useFakeTimers();
    const response = new Response(null);
    vi.spyOn(response, method).mockImplementation(() => new Promise(() => {}));
    const fetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetch);
    const result = apiRequest('/products', { method: 'PUT' }, result => result[method](), 50).catch(reason => reason);
    await vi.advanceTimersByTimeAsync(51);
    const error = await result;
    expect(error).toMatchObject({ kind: 'timeout', status: 200 });
    expect(isUncertainWriteError(error)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it.each(['GET', 'POST'])('uses operation-appropriate deadline guidance for %s', async method => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const result = apiRequest('/orders', { method }, undefined, 50).catch(reason => reason);
    await vi.advanceTimersByTimeAsync(51);
    const error = await result;
    expect(error.kind).toBe('timeout');
    if (method === 'GET') expect(error.message).not.toMatch(/rollback|operation outcome/);
    else expect(error.message).toMatch(/does not guarantee a backend rollback/);
  });

  it('does not consume late fetch results after caller cancellation', async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const consume = vi.fn((response: Response) => response.json());
    const result = apiRequest('/orders', { method: 'POST', signal: controller.signal }, consume).catch(reason => reason);
    controller.abort();
    await result;
    resolve(json({ id: 'late' }, 201));
    await Promise.resolve();
    expect(consume).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
