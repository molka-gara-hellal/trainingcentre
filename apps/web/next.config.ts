import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** En-têtes de sécurité statiques. La CSP (avec nonce par requête) est posée par src/proxy.ts. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Ignoré en HTTP (développement) ; en HTTPS, impose HTTPS pendant 2 ans.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** Pages recevant un jeton à usage unique dans l'URL : ni cache, ni Referer vers un site tiers. */
const tokenPages = ["/:locale/activer-compte", "/:locale/reinitialiser"];

const nextConfig: NextConfig = {
  // Image Docker minimale (Phase 11)
  output: "standalone",
  // Monorepo : la trace du build inclut les packages internes situés à la racine du dépôt.
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  // Les packages internes sont publiés en TypeScript source
  transpilePackages: ["@center/shared", "@center/proto-gen"],
  // grpc-js reste un vrai module Node (non empaqueté)
  serverExternalPackages: ["@grpc/grpc-js"],
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...tokenPages.map((source) => ({
        source,
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      })),
    ];
  },
};

export default withNextIntl(nextConfig);
