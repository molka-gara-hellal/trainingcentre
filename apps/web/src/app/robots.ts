import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/*/espace", "/*/connexion", "/*/activer-compte", "/*/reinitialiser"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
