import type { ExternalPlatform } from "./external/types";

// ─── Query Types ────────────────────────────────────────────────────────────
// Only generate types that make sense for the provided business context.

export const QUERY_TYPES = [
  "BUSINESS_DISCOVERY",
  "SERVICE_NEED",
  "PROBLEM_SIGNAL",
  "LOCAL_DISCOVERY",
  "WEBSITE_GAP",
  "SOFTWARE_GAP",
  "AUTOMATION_NEED",
  "HIRING_SIGNAL",
] as const;

export type QueryType = (typeof QUERY_TYPES)[number];

// ─── Generated Query ────────────────────────────────────────────────────────

export interface DiscoveryQuery {
  /** The search query string */
  query: string;
  /** What kind of signal this query targets */
  query_type: QueryType;
  /** 1-10, higher = more likely to yield qualified leads */
  priority: number;
  /** Why this query was generated */
  rationale: string;
  /** Which external platform this query is best suited for */
  best_platform: ExternalPlatform;
  /**
   * Geo scope of the query. The funnel expands outward from the business's
   * own city: LOCAL (city) -> NEARBY (neighbouring cities) -> DISTRICT ->
   * STATE -> COUNTRY -> GLOBAL. Omitted = LOCAL (backward compatible).
   */
  scope?: GeoScope;
}

/** Geographic reach of a discovery query — the expansion funnel. */
export type GeoScope = "LOCAL" | "NEARBY" | "DISTRICT" | "STATE" | "COUNTRY" | "GLOBAL";

/**
 * Curated neighbouring cities for major Indian business hubs.
 * Used for the NEARBY scope — cities within ~50km reach.
 */
const NEARBY_CITIES: Record<string, string[]> = {
  nagpur: ["Kamptee", "Wardha", "Bhandara", "Hingna", "Katol"],
  mumbai: ["Thane", "Navi Mumbai", "Kalyan", "Vasai", "Panvel"],
  pune: ["Pimpri-Chinchwad", "Hinjewadi", "Chakan", "Lonavala", "Baramati"],
  delhi: ["Noida", "Gurugram", "Ghaziabad", "Faridabad", "Gurgaon"],
  bangalore: ["Whitefield", "Electronic City", "Mysore", "Tumkur", " Hosur"],
  bengaluru: ["Whitefield", "Electronic City", "Mysore", "Tumkur", "Hosur"],
  hyderabad: ["Secunderabad", "Gachibowli", "Warangal", "Nizamabad"],
  chennai: ["Chengalpattu", "Sriperumbudur", "Kanchipuram", "Vellore"],
  ahmedabad: ["Gandhinagar", "Vadodara", "Rajkot", "Anand"],
  jaipur: ["Ajmer", "Kota", "Alwar", "Sikar"],
  lucknow: ["Kanpur", "Barabanki", "Sitapur", "Raebareli"],
  indore: ["Ujjain", "Dewas", "Bhopal", "Pithampur"],
  surat: ["Bharuch", "Navsari", "Vapi", "Valsad"],
  kolkata: ["Howrah", "Durgapur", "Asansol", "Kharagpur"],
  goa: ["Panaji", "Margao", "Vasco da Gama", "Mapusa"],
};

const STATE_NAMES = [
  "maharashtra", "delhi", "karnataka", "tamil nadu", "gujarat", "rajasthan",
  "west bengal", "uttar pradesh", "telangana", "andhra pradesh", "madhya pradesh",
  "kerala", "punjab", "haryana", "jharkhand", "odisha", "assam", "bihar",
  "chhattisgarh", "uttarakhand", "goa", "himachal", "jammu",
];

const COUNTRY_NAMES = [
  "india", "usa", "us", "united states", "uae", "uk", "united kingdom", "singapore",
  "australia", "canada", "germany", "france", "japan", "china", "brazil",
  "saudi arabia", "qatar", "oman", "nepal", "bangladesh", "sri lanka", "pakistan",
];

/** Derive city / district / state / country from a free-form location string. */
export function parseLocationParts(location: string): {
  city: string;
  district: string;
  state: string;
  country: string;
} {
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  const fallback = parts[0] || location.trim();
  if (parts.length === 0) return { city: fallback, district: "", state: "", country: "" };

  const last = parts[parts.length - 1].toLowerCase();
  const country = COUNTRY_NAMES.includes(last) ? parts[parts.length - 1] : "";

  let state = "";
  for (const part of parts) {
    if (STATE_NAMES.includes(part.toLowerCase())) {
      state = part;
      break;
    }
  }

  // District: the part right before the state/country when it differs from the city
  const beforeStateIdx = state ? parts.indexOf(state) - 1 : country ? parts.length - 2 : parts.length - 1;
  let district = "";
  if (beforeStateIdx >= 0 && beforeStateIdx < parts.length) {
    const candidate = parts[beforeStateIdx];
    if (candidate.toLowerCase() !== fallback.toLowerCase()) district = candidate;
  }

  return {
    city: parts[0] || fallback,
    district: district || fallback, // many Indian cities share the district name
    state,
    country,
  };
}

/** Resolve the location string for a given geo scope. */
function scopeLocation(location: string, scope: GeoScope): string {
  const parsed = parseLocationParts(location);
  switch (scope) {
    case "GLOBAL": return "worldwide";
    case "COUNTRY": return parsed.country || location;
    case "STATE": return parsed.state || parsed.district || parsed.city || location;
    case "DISTRICT": return parsed.district || parsed.city || location;
    case "NEARBY": {
      const nearby = NEARBY_CITIES[parsed.city.toLowerCase()];
      return nearby ? nearby.join(" or ") : `${parsed.city} nearby areas`;
    }
    default: return parsed.city || location;
  }
}

/**
 * Transform the location set for a given geo scope so that queries for
 * different scopes are genuinely different search strings:
 *   LOCAL    -> cities as provided
 *   NEARBY   -> curated neighbouring cities (fallback: "{city} nearby areas")
 *   DISTRICT -> the district portion
 *   STATE    -> the state portion
 *   COUNTRY  -> the country portion
 *   GLOBAL   -> ["worldwide"]
 */
function scopedLocations(locations: string[], scope: GeoScope): string[] {
  if (scope === "GLOBAL") return ["worldwide"];
  const mapped = locations.map((loc) => scopeLocation(loc, scope));
  return [...new Set(mapped.filter(Boolean))];
}

/** Derive city / state / country from a free-form location string. */


// ─── Input from Business Context ────────────────────────────────────────────

export interface QueryGeneratorInput {
  services: { name: string; description?: string | null }[];
  target_audience: { segment: string; description?: string | null }[];
  industries: string[];
  locations: string[];
  content_themes?: { title: string; description?: string | null }[];
  business_name?: string | null;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/** Keywords that map services to query-relevant categories */
const SERVICE_CATEGORY_MAP: { pattern: RegExp; category: "website" | "software" | "automation" | "ai" | "erp" | "app" | "digital_marketing" | "generic_service" }[] = [
  { pattern: /website|web\s?dev|landing\s?page|web\s?design/i, category: "website" },
  { pattern: /software|saas|erp|crm|system|portal|dashboard/i, category: "software" },
  { pattern: /automat|workflow|integration|bot/i, category: "automation" },
  { pattern: /ai|artificial|intelligence|ml|machine|chatbot|agent/i, category: "ai" },
  { pattern: /app|mobile|android|ios|flutter|react\s?native/i, category: "app" },
  { pattern: /seo|marketing|social\s?media|content\s?strategy|branding/i, category: "digital_marketing" },
];

/** Extract the core searchable keyword from a service name */
function extractServiceKeyword(serviceName: string): string {
  const cleaned = serviceName
    .replace(/^(custom|professional|expert|advanced|modern|best)\s+/i, "")
    .replace(/\s+(development|design|services?|solutions?|consulting|agency|company)$/i, "")
    .trim();
  return cleaned || serviceName.trim();
}

/** Determine which service category a service belongs to */
function categorizeService(serviceName: string): string {
  const lower = serviceName.toLowerCase();
  for (const mapping of SERVICE_CATEGORY_MAP) {
    if (mapping.pattern.test(lower)) return mapping.category;
  }
  return "generic_service";
}

/** Extract short location (city name, not full address) */
function extractShortLocation(location: string): string {
  const parts = location.split(",").map((p) => p.trim());
  return parts[0] || location.trim();
}

/** Normalize a query for deduplication */
function normalizeQueryForDedup(q: string): string {
  return q
    .toLowerCase()
    .replace(/\b(in|the|for|a|an|near)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove semantically duplicate queries */
function deduplicateQueries(queries: DiscoveryQuery[]): DiscoveryQuery[] {
  const seen = new Set<string>();
  const unique: DiscoveryQuery[] = [];
  for (const q of queries) {
    const key = normalizeQueryForDedup(q.query);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(q);
  }
  return unique;
}

// ─── Query Family Generators ────────────────────────────────────────────────

/** Find target businesses in a location */
function generateBusinessDiscoveryQueries(
  customerTypes: string[],
  locations: string[],
  scope: GeoScope = "LOCAL"
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  const spots = scopedLocations(locations, scope);
  for (const customerType of customerTypes) {
    for (const location of spots) {
      queries.push({
        query: `${customerType} in ${location}`,
        query_type: "BUSINESS_DISCOVERY",
        priority: scope === "LOCAL" ? 7 : 6,
        rationale: `Find ${customerType} businesses in ${location} (${scope.toLowerCase()}) that may need our services`,
        best_platform: "google_maps",
        scope,
      });
    }
  }
  return queries;
}

/** Find businesses actively looking for the service */
function generateServiceNeedQueries(
  customerTypes: string[],
  serviceKeywords: string[],
  locations: string[],
  scope: GeoScope = "LOCAL"
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  const needPhrases = scope === "LOCAL" ? ["looking for", "need"] : ["looking for", "seeking", "want"];
  for (const customerType of customerTypes.slice(0, 3)) {
    for (const keyword of serviceKeywords.slice(0, 3)) {
      const spots = scopedLocations(locations, scope).slice(0, 2);
      for (const location of spots) {
        for (const phrase of needPhrases.slice(0, scope === "LOCAL" ? 2 : 2)) {
          queries.push({
            query: `${customerType} ${location} ${phrase} ${keyword}`,
            query_type: "SERVICE_NEED",
            priority: scope === "LOCAL" ? 9 : 8,
            rationale: `Actively searching: ${customerType} in ${location} ${phrase} ${keyword}`,
            best_platform: "google_search",
            scope,
          });
        }
      }
    }
  }
  return queries;
}

/** Find businesses expressing problems the service solves */
function generateProblemSignalQueries(
  customerTypes: string[],
  serviceKeywords: string[],
  locations: string[],
  scope: GeoScope = "LOCAL"
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  const problemPhrases = scope === "LOCAL" ? ["problems", "issues"] : ["struggling with", "help with", "frustrated with"];
  for (const customerType of customerTypes.slice(0, 2)) {
    for (const keyword of serviceKeywords.slice(0, 3)) {
      const spots = scopedLocations(locations, scope).slice(0, 1);
      for (const location of spots) {
        for (const phrase of problemPhrases.slice(0, scope === "LOCAL" ? 1 : 2)) {
          queries.push({
            query: `${customerType} ${location} ${phrase} ${keyword}`,
            query_type: "PROBLEM_SIGNAL",
            priority: scope === "LOCAL" ? 8 : 7,
            rationale: `Problem-signal search: ${customerType} ${phrase} related to ${keyword}`,
            best_platform: "google_search",
            scope,
          });
        }
      }
    }
  }
  return queries;
}

/** Local discovery for maps/directories */
function generateLocalDiscoveryQueries(
  customerTypes: string[],
  locations: string[],
  scope: GeoScope = "LOCAL"
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  for (const customerType of customerTypes) {
    for (const location of scopedLocations(locations, scope)) {
      queries.push({
        query: scope === "GLOBAL" ? `${customerType} business` : `${customerType} near ${location}`,
        query_type: "LOCAL_DISCOVERY",
        priority: scope === "LOCAL" ? 6 : 5,
        rationale: `Local discovery: ${customerType} ${scope === "GLOBAL" ? "worldwide" : `near ${location}`}`,
        best_platform: "google_maps",
        scope,
      });
    }
  }
  return queries;
}

/** Find businesses with website gaps (only if service is web-related) */
function generateWebsiteGapQueries(
  customerTypes: string[],
  locations: string[],
  scope: GeoScope = "LOCAL"
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  const gapPhrases = ["without website", "no website", "needs website"];
  for (const customerType of customerTypes.slice(0, 3)) {
    for (const location of scopedLocations(locations, scope).slice(0, 2)) {
      for (const phrase of gapPhrases.slice(0, scope === "LOCAL" ? 3 : 2)) {
        queries.push({
          query: `${customerType} ${location} ${phrase}`,
          query_type: "WEBSITE_GAP",
          priority: scope === "LOCAL" ? 9 : 8,
          rationale: `Website gap: ${customerType} in ${location} ${phrase}`,
          best_platform: "google_search",
          scope,
        });
      }
    }
  }
  return queries;
}

/** Find businesses needing software (only if service is software-related) */
function generateSoftwareGapQueries(
  customerTypes: string[],
  locations: string[],
  scope: GeoScope = "LOCAL"
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  const softwarePhrases = ["software solution", "custom software", "erp system", "crm software"];
  for (const customerType of customerTypes.slice(0, 3)) {
    for (const location of scopedLocations(locations, scope).slice(0, 2)) {
      for (const phrase of softwarePhrases.slice(0, scope === "LOCAL" ? 2 : 2)) {
        queries.push({
          query: `${customerType} ${location} ${phrase}`,
          query_type: "SOFTWARE_GAP",
          priority: scope === "LOCAL" ? 8 : 7,
          rationale: `Software gap: ${customerType} in ${location} looking for ${phrase}`,
          best_platform: "google_search",
          scope,
        });
      }
    }
  }
  return queries;
}

/** Find businesses needing automation (only if service is automation-related) */
function generateAutomationNeedQueries(
  customerTypes: string[],
  locations: string[],
  scope: GeoScope = "LOCAL"
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  const automationPhrases = ["business automation", "workflow automation", "process automation"];
  for (const customerType of customerTypes.slice(0, 3)) {
    for (const location of scopedLocations(locations, scope).slice(0, 2)) {
      for (const phrase of automationPhrases.slice(0, scope === "LOCAL" ? 3 : 2)) {
        queries.push({
          query: `${customerType} ${location} ${phrase}`,
          query_type: "AUTOMATION_NEED",
          priority: scope === "LOCAL" ? 8 : 7,
          rationale: `Automation need: ${customerType} in ${location} looking for ${phrase}`,
          best_platform: "google_search",
          scope,
        });
      }
    }
  }
  return queries;
}

/** Find businesses hiring/outsourcing (signals they need external help) */
function generateHiringSignalQueries(
  customerTypes: string[],
  serviceKeywords: string[],
  locations: string[],
  scope: GeoScope = "LOCAL"
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  const hiringPhrases = scope === "LOCAL" ? ["hiring", "looking to hire"] : ["outsourcing", "freelancer needed", "developers wanted"];
  for (const customerType of customerTypes.slice(0, 2)) {
    for (const keyword of serviceKeywords.slice(0, 2)) {
      for (const location of scopedLocations(locations, scope).slice(0, 1)) {
        for (const phrase of hiringPhrases.slice(0, scope === "LOCAL" ? 1 : 2)) {
          queries.push({
            query: `${customerType} ${location} ${phrase} ${keyword}`,
            query_type: "HIRING_SIGNAL",
            priority: scope === "LOCAL" ? 9 : 8,
            rationale: `Hiring/outsourcing signal: ${customerType} ${phrase} ${keyword}`,
            best_platform: "google_search",
            scope,
          });
        }
      }
    }
  }
  return queries;
}

// ─── Main Query Generator ───────────────────────────────────────────────────

export function generateDiscoveryQueries(
  input: QueryGeneratorInput,
  maxQueries: number = 30,
  scopes: GeoScope[] = ["LOCAL"]
): DiscoveryQuery[] {
  // ─── Extract customer types from target audience ─────────────────────────
  const customerTypes: string[] = [];
  for (const audience of input.target_audience) {
    const segment = audience.segment.trim();
    if (segment) customerTypes.push(segment.toLowerCase());
    if (audience.description) {
      // Extract business-type keywords from descriptions
      const businessTypes = audience.description.match(
        /\b(hotel|hotels|restaurant|restaurants|clinic|clinics|hospital|hospitals|school|schools|college|colleges|gym|gyms|salon|salons|store|stores|shop|shops|agency|agencies|startup|startups|business|businesses|company|companies|firm|firms|enterprise|enterprises|retail|ecommerce|e-commerce)\b/gi
      );
      if (businessTypes) {
        for (const bt of businessTypes) {
          if (!customerTypes.includes(bt.toLowerCase())) {
            customerTypes.push(bt.toLowerCase());
          }
        }
      }
    }
  }

  // ─── Extract service keywords ─────────────────────────────────────────────
  const serviceKeywords: string[] = [];
  const serviceCategories = new Set<string>();
  for (const service of input.services) {
    const keyword = extractServiceKeyword(service.name);
    if (keyword && !serviceKeywords.includes(keyword.toLowerCase())) {
      serviceKeywords.push(keyword.toLowerCase());
    }
    serviceCategories.add(categorizeService(service.name));
  }
  for (const theme of input.content_themes ?? []) {
    const keyword = extractServiceKeyword(theme.title);
    if (keyword && !serviceKeywords.includes(keyword.toLowerCase())) {
      serviceKeywords.push(keyword.toLowerCase());
    }
  }

  // ─── Extract locations ────────────────────────────────────────────────────
  // Raw strings kept intact — geo-scope expansion needs state/country parts.
  const rawLocations = input.locations.map((l) => String(l ?? "").trim()).filter(Boolean);
  const locations = rawLocations.map(extractShortLocation).filter(Boolean);

  // ─── Determine which query types to generate ──────────────────────────────
  const hasWebsiteService = serviceCategories.has("website");
  const hasSoftwareService = serviceCategories.has("software") || serviceCategories.has("erp");
  const hasAutomationService = serviceCategories.has("automation") || serviceCategories.has("ai");

  if (customerTypes.length === 0) {
    customerTypes.push("small business");
  }
  if (locations.length === 0) {
    locations.push("India");
  }
  if (rawLocations.length === 0) {
    rawLocations.push("India");
  }

  // ─── Generate query families ──────────────────────────────────────────────
  let allQueries: DiscoveryQuery[] = [];

  // Always generate: basic business discovery (per scope)
  for (const scope of scopes) {
    allQueries.push(...generateBusinessDiscoveryQueries(customerTypes, rawLocations, scope));
  }

  // Always generate: service need queries (high priority, per scope)
  for (const scope of scopes) {
    allQueries.push(
      ...generateServiceNeedQueries(customerTypes, serviceKeywords, rawLocations, scope)
    );
  }

  // Problem signals
  for (const scope of scopes) {
    allQueries.push(...generateProblemSignalQueries(customerTypes, serviceKeywords, rawLocations, scope));
  }

  // Local discovery (maps)
  for (const scope of scopes) {
    allQueries.push(...generateLocalDiscoveryQueries(customerTypes, rawLocations, scope));
  }

  // Conditional: website gap (only when service includes web development)
  if (hasWebsiteService) {
    for (const scope of scopes) {
      allQueries.push(...generateWebsiteGapQueries(customerTypes, rawLocations, scope));
    }
  }

  // Conditional: software gap (only when service includes software)
  if (hasSoftwareService) {
    for (const scope of scopes) {
      allQueries.push(...generateSoftwareGapQueries(customerTypes, rawLocations, scope));
    }
  }

  // Conditional: automation need (only when service includes automation)
  if (hasAutomationService) {
    for (const scope of scopes) {
      allQueries.push(...generateAutomationNeedQueries(customerTypes, rawLocations, scope));
    }
  }

  // Hiring/outsourcing signals (always relevant)
  for (const scope of scopes) {
    allQueries.push(...generateHiringSignalQueries(customerTypes, serviceKeywords, rawLocations, scope));
  }

  // ─── Deduplicate and prioritize ───────────────────────────────────────────
  // Scope-fair selection: sort within each scope by priority, then
  // round-robin across scopes so no geo scope gets squeezed out by the cap.
  allQueries = deduplicateQueries(allQueries);

  const byScope = new Map<GeoScope, DiscoveryQuery[]>();
  for (const q of allQueries) {
    const s = (q.scope ?? "LOCAL") as GeoScope;
    if (!byScope.has(s)) byScope.set(s, []);
    byScope.get(s)!.push(q);
  }
  for (const list of byScope.values()) {
    list.sort((a, b) => b.priority - a.priority);
  }

  const selected: DiscoveryQuery[] = [];
  let progressed = true;
  while (selected.length < maxQueries && progressed) {
    progressed = false;
    for (const list of byScope.values()) {
      if (selected.length >= maxQueries) break;
      const next = list.shift();
      if (next) {
        selected.push(next);
        progressed = true;
      }
    }
  }

  if (process.env.DEBUG_QUERIES === "1") {
    console.log(`[QGEN] total=${allQueries.length} selected=${selected.length}`);
    for (const q of selected) {
      console.log(`[QGEN] [${q.query_type}][${q.scope ?? "LOCAL"}] p=${q.priority} "${q.query}"`);
    }
  }

  return selected;
}






