/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    webpack: (config, { isServer }) => {
        if (isServer) {
            // Add WebSocket support for server-side
            config.externals = config.externals || [];
            config.externals.push({
                'bufferutil': 'bufferutil',
                'utf-8-validate': 'utf-8-validate',
            });
        }
        return config;
    },
    serverExternalPackages: ['@google/genai']
}

module.exports = nextConfig 