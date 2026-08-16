import type { SocialProviderAdapter } from "./types";
import { composioInstagramAdapter } from "./composio";
import { whatsappAdapter } from "./whatsapp";

const adapters: Record<string, SocialProviderAdapter> = {
  instagram: composioInstagramAdapter,
  facebook: composioInstagramAdapter,
  whatsapp: whatsappAdapter,
};

export function getAdapterForProvider(provider: string): SocialProviderAdapter | null {
  return adapters[provider.toLowerCase()] ?? null;
}

export { composioInstagramAdapter, whatsappAdapter };
export type { SocialProviderAdapter, SocialEventInput } from "./types";
