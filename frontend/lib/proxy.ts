import { NextResponse } from 'next/server';

const KB_API_URL = process.env.KB_API_URL || 'http://127.0.0.1:8001';

type ProxyHandlerContext = {
  params: Promise<{ path: string[] }>;
};

type CreateProxyHandlerOptions = {
  supportMultipart?: boolean;
};

async function forwardRequest(
  request: Request,
  pathPrefix: string,
  path: string[],
  options: CreateProxyHandlerOptions
) {
  const normalizedSegments = [pathPrefix, ...path].filter(Boolean);
  const url = new URL(`${KB_API_URL}/${normalizedSegments.join('/')}`);
  const incomingUrl = new URL(request.url);
  incomingUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const contentType = request.headers.get('content-type') || '';
  const isMultipart = options.supportMultipart && contentType.includes('multipart/form-data');
  let body: BodyInit | undefined;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = isMultipart ? await request.formData() : await request.text();
  }

  const response = await fetch(url, {
    method: request.method,
    headers: isMultipart
      ? undefined
      : {
          'Content-Type': contentType || 'application/json',
        },
    body,
    cache: 'no-store',
  });

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export function createProxyHandler(pathPrefix: string, options: CreateProxyHandlerOptions = {}) {
  const handler = () => async (request: Request, context: ProxyHandlerContext) => {
    const { path } = await context.params;
    return forwardRequest(request, pathPrefix, path, options);
  };

  return {
    GET: handler(),
    POST: handler(),
    PATCH: handler(),
    DELETE: handler(),
  };
}
