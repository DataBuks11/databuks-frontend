import type { SocialProviderAdapter } from "./types";
import { composioInstagramAdapter } from "./composio";
import { composioFacebookAdapter } from "./facebook";
import { whatsappAdapter } from "./whatsapp";
import { linkedinAdapter } from "./linkedin";

const adapters: Record<string, SocialProviderAdapter> = {
  instagram: composioInstagramAdapter,
  facebook: composioFacebookAdapter,
  whatsapp: whatsappAdapter,
  linkedin: linkedinAdapter,
};

export function getAdapterForProvider(provider: string): SocialProviderAdapter | null {
  return adapters[provider.toLowerCase()] ?? null;
}

export { composioInstagramAdapter, composioFacebookAdapter, whatsappAdapter };
export type { SocialProviderAdapter, SocialEventInput } from "./types";
