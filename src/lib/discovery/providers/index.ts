import type { DiscoveryProvider, ProviderConfig } from "./types";
import { GoogleSearchProvider } from "./google-search";
import { MockGoogleSearchProvider } from "./mock";

export function getProvider(name: string): DiscoveryProvider | null {
  switch (name) {
    case "google_search":
      return new GoogleSearchProvider();
    default:
      return null;
  }
}

export function getMockProvider(name: string): DiscoveryProvider | null {
  switch (name) {
    case "google_search":
      return new MockGoogleSearchProvider();
    default:
      return null;
  }
}

export type { DiscoveryProvider, DiscoveryProviderResult, ProviderConfig, RawDiscoveryCandidate } from "./types";
