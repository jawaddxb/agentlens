/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  generateBuildId: async () => {
    return `build-${Date.now()}`
  },
}

module.exports = nextConfig
