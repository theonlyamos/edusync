/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    serverExternalPackages: ['@google/genai', 'bufferutil', 'utf-8-validate'],
    // @edusync/shared exports TypeScript source (no build step); Next must transpile it.
    transpilePackages: ['@edusync/shared']
}

module.exports = nextConfig 