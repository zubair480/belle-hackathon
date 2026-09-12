import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Neo4j driver and AI adapters are server-only; never expose them to the client bundle.
  serverExternalPackages: ["neo4j-driver"],
  poweredByHeader: false,
};

export default nextConfig;
