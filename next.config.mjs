const isGithub = process.env.GITHUB_ACTIONS === 'true'
const basePath = isGithub ? '/editor' : ''
export default { output: 'export', trailingSlash: true, basePath, distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next', env: { NEXT_PUBLIC_BASE_PATH: basePath } }
