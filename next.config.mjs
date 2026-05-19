/** @type {import('next').NextConfig} */
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === 'true';
const isUserPagesRepository = repositoryName?.endsWith('.github.io');
const basePath = isGitHubPagesBuild && repositoryName && !isUserPagesRepository
  ? `/${repositoryName}`
  : '';

const nextConfig = {
  turbopack: {
    root: process.cwd()
  },
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  ...(basePath
    ? {
        basePath,
        assetPrefix: `${basePath}/`
      }
    : {})
};

export default nextConfig;
