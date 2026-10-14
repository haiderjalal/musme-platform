import { getSupabaseConfig } from "@/lib/supabase/config";

interface CspOptions {
  nonce: string;
  isDevelopment: boolean;
}

/**
 * Strict Content Security Policy. Scripts need the per-request nonce, and only the Supabase
 * origin may receive data. Styles keep 'unsafe-inline' because Next.js injects inline styles.
 */
export function buildContentSecurityPolicy({ nonce, isDevelopment }: CspOptions): string {
  const supabaseOrigin = supabaseOriginOrWildcard();
  const scriptSources = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`];
  if (isDevelopment) {
    // React development tooling and hot reloading need eval. Production never allows it.
    scriptSources.push(`'unsafe-eval'`);
  }

  return [
    `default-src 'self'`,
    `script-src ${scriptSources.join(" ")}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: ${supabaseOrigin}`,
    `font-src 'self' data:`,
    `connect-src 'self' ${supabaseOrigin} ${websocketOrigin(supabaseOrigin)}`,
    `media-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

function supabaseOriginOrWildcard(): string {
  try {
    return new URL(getSupabaseConfig().url).origin;
  } catch {
    // Missing configuration should not break the page. The data layer reports the error.
    return "https://*.supabase.co";
  }
}

function websocketOrigin(httpOrigin: string): string {
  return httpOrigin.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}
