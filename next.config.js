/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    output: 'standalone',
    serverExternalPackages: ['@google/genai', 'bufferutil', 'utf-8-validate']
}

module.exports = nextConfig 