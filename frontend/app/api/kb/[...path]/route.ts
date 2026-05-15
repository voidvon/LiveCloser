import { createProxyHandler } from '@/lib/proxy';

export const { GET, POST, PATCH, DELETE } = createProxyHandler('', {
  supportMultipart: true,
});
