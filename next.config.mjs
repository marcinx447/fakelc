/** @type {import('next').NextConfig} */
export default {
  async rewrites() {
    return [{ source: '/', destination: '/index.html' }];
  },
  async headers() {
    return [{ source: '/index.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'X-Frame-Options', value: 'DENY' }] }];
  },
};
