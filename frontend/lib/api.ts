export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = (await response.text()) || `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

function createJsonRequest(method: 'POST' | 'PATCH', payload?: object): RequestInit {
  if (payload === undefined) {
    return { method };
  }

  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

export function getJson<T>(url: string): Promise<T> {
  return request<T>(url);
}

export function postJson<T>(url: string, payload?: object): Promise<T> {
  return request<T>(url, createJsonRequest('POST', payload));
}

export function patchJson<T>(url: string, payload: object): Promise<T> {
  return request<T>(url, createJsonRequest('PATCH', payload));
}

export async function deleteJson(url: string): Promise<void> {
  await request<void>(url, { method: 'DELETE' });
}
