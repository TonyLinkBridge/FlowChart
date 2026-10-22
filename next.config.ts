import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Clerk rewrites to request.url to pass auth headers. Next's loopback normalization
  // changes 127.0.0.1 to localhost, which can turn that rewrite into a self-proxy loop.
  // Keep the incoming URL in local development; production routing stays unchanged.
  skipProxyUrlNormalize: process.env.NODE_ENV === 'development',
};

export default nextConfig;
