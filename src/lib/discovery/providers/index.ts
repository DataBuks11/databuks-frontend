import type { DiscoveryProvider, ProviderConfig } from "./types";
import { GoogleSearchProvider } from "./google-search";
import { MockGoogleSearchProvider } from "./mock";
import { GoogleMapsProvider } from "./google-maps";
import { JustdialProvider } from "./justdial";

export function getProvider(name: string): DiscoveryProvider | null {
  switch (name) {
    case "google_search":
      return new GoogleSearchProvider();
    case "google_maps":
      return new GoogleMapsProvider();
    case "justdial":
      return new JustdialProvider();
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
