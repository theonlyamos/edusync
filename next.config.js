/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    serverExternalPackages: ['@google/genai', 'bufferutil', 'utf-8-validate']
}

module.exports = nextConfig 