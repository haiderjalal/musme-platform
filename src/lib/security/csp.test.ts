import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "./csp";

const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example-project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

afterEach(() => {
  restore("NEXT_PUBLIC_SUPABASE_URL", ORIGINAL_URL);
  restore("NEXT_PUBLIC_SUPABASE_ANON_KEY", ORIGINAL_KEY);
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("buildContentSecurityPolicy", () => {
  it("allows scripts only with the request nonce, and never unsafe-inline", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc123", isDevelopment: false });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
  });

  it("allows eval only in development, for React tooling", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc123", isDevelopment: true });
    expect(csp).toMatch(/script-src[^;]*'unsafe-eval'/);
  });

  it("limits data connections to the configured Supabase origin, over HTTPS and WSS", () => {
    const csp = buildContentSecurityPolicy({ nonce: "n", isDevelopment: false });
    expect(csp).toContain(
      "connect-src 'self' https://example-project.supabase.co wss://example-project.supabase.co",
    );
  });

  it("blocks framing, plugins and foreign form targets", () => {
    const csp = buildContentSecurityPolicy({ nonce: "n", isDevelopment: false });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("falls back to a wildcard Supabase origin when the URL is missing, without throwing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const csp = buildContentSecurityPolicy({ nonce: "n", isDevelopment: false });
    expect(csp).toContain("https://*.supabase.co");
  });
});
