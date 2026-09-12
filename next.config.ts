import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Neo4j driver and AI adapters are server-only; never expose them to the client bundle.
  serverExternalPackages: ["neo4j-driver"],
  poweredByHeader: false,
  // Next dev otherwise writes AGENTS.md/CLAUDE.md into the repo root on every start.
  agentRules: false,
};

export default nextConfig;
