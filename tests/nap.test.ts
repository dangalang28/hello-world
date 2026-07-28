import { describe, expect, it } from "vitest";
import { addressesMatch, extractPhones, namesMatch, normalizePhone } from "@/lib/crawler/nap";

describe("normalizePhone", () => {
  it("strips formatting and US country code", () => {
    expect(normalizePhone("(512) 555-1234")).toBe("5125551234");
    expect(normalizePhone("+1 512.555.1234")).toBe("5125551234");
    expect(normalizePhone("512-555-1234")).toBe("5125551234");
  });
});

describe("extractPhones", () => {
  it("finds phones in prose", () => {
    expect(extractPhones("Call us at (512) 555-1234 today")).toEqual(["(512) 555-1234"]);
  });
  it("does not match arbitrary long numbers", () => {
    expect(extractPhones("order #123456789012")).toEqual([]);
  });
});

describe("addressesMatch", () => {
  it("matches abbreviated forms", () => {
    expect(addressesMatch("123 Main Street, Austin, TX 78701", "123 Main St, Austin, TX 78701")).toBe(true);
  });
  it("rejects different street numbers", () => {
    expect(addressesMatch("123 Main St, Austin, TX", "125 Main St, Austin, TX")).toBe(false);
  });
});

describe("namesMatch", () => {
  it("ignores legal suffixes and punctuation", () => {
    expect(namesMatch("Acme Plumbing LLC", "Acme Plumbing")).toBe(true);
    expect(namesMatch("Joe's Pizza, Inc.", "Joes Pizza")).toBe(true);
  });
  it("rejects different brands", () => {
    expect(namesMatch("Acme Plumbing", "Zenith Roofing")).toBe(false);
  });
});
