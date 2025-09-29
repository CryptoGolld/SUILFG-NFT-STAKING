/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  images: {
    domains: ['gateway.pinata.cloud', 'ipfs.io'],
  },
}

module.exports = nextConfig
