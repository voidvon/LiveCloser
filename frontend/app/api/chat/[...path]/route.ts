import { NextResponse } from 'next/server';

const KB_API_URL = process.env.KB_API_URL || 'http://127.0.0.1:8001';

async function forward(request: Request, path: string[]) {
  const url = new URL(`${KB_API_URL}/chat/${path.join('/')}`);
  const incomingUrl = new URL(request.url);
  incomingUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const contentType = request.headers.get('content-type') || '';
  let body: BodyInit | undefined;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.text();
  }

  const response = await fetch(url, {
    method: request.method,
    headers: {
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

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path);
}
