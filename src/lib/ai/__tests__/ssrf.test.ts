import { describe, expect, it } from "vitest";
import { isPrivateHost, isSafePublicUrl } from "@/lib/ai/website-scanner/crawler";

describe("SSRF protections", () => {
  it("blocks localhost and private IPv4 ranges", () => {
    expect(isPrivateHost("localhost")).toBe(true);
    expect(isPrivateHost("api.localhost")).toBe(true);
    expect(isPrivateHost("127.0.0.1")).toBe(true);
    expect(isPrivateHost("10.0.0.5")).toBe(true);
    expect(isPrivateHost("192.168.1.1")).toBe(true);
    expect(isPrivateHost("172.16.0.1")).toBe(true);
    expect(isPrivateHost("169.254.169.254")).toBe(true);
    expect(isPrivateHost("0.0.0.0")).toBe(true);
    expect(isPrivateHost("100.64.0.1")).toBe(true);
  });

  it("blocks cloud metadata endpoints", () => {
    expect(isPrivateHost("metadata.google.internal")).toBe(true);
    expect(isPrivateHost("169.254.170.2")).toBe(true);
  });

  it("blocks private IPv6 ranges", () => {
    expect(isPrivateHost("::1")).toBe(true);
    expect(isPrivateHost("fe80::1")).toBe(true);
    expect(isPrivateHost("fd12:3456::1")).toBe(true);
  });

  it("blocks .local/.internal hostnames", () => {
    expect(isPrivateHost("internal-service.local")).toBe(true);
    expect(isPrivateHost("db.internal")).toBe(true);
  });

  it("allows public hostnames", () => {
    expect(isPrivateHost("example.com")).toBe(false);
    expect(isPrivateHost("databuks.org")).toBe(false);
    expect(isPrivateHost("8.8.8.8")).toBe(false);
    expect(isPrivateHost("2606:4700::1111")).toBe(false);
  });

  it("isSafePublicUrl validates scheme and host", () => {
    expect(isSafePublicUrl("https://example.com").safe).toBe(true);
    expect(isSafePublicUrl("http://127.0.0.1/admin").safe).toBe(false);
    expect(isSafePublicUrl("file:///etc/passwd").safe).toBe(false);
    expect(isSafePublicUrl("ftp://example.com").safe).toBe(false);
    expect(isSafePublicUrl("javascript:alert(1)").safe).toBe(false);
    expect(isSafePublicUrl("https://169.254.169.254/latest/meta-data").safe).toBe(false);
    expect(isSafePublicUrl("https://api.localhost").safe).toBe(false);
    expect(isSafePublicUrl("not a url").safe).toBe(false);
  });
});
