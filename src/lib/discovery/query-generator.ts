import type { ExternalPlatform } from "./external/types";

// â”€â”€â”€ Query Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Generated Query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
}

// â”€â”€â”€ Input from Business Context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface QueryGeneratorInput {
  services: { name: string; description?: string | null }[];
  target_audience: { segment: string; description?: string | null }[];
  industries: string[];
  locations: string[];
  content_themes?: { title: string; description?: string | null }[];
  business_name?: string | null;
}

// â”€â”€â”€ Internal Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Query Family Generators â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Find target businesses in a location */
function generateBusinessDiscoveryQueries(
  customerTypes: string[],
  locations: string[]
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  for (const customerType of customerTypes) {
    for (const location of locations) {
      queries.push({
        query: `${customerType} in ${location}`,
        query_type: "BUSINESS_DISCOVERY",
        priority: 7,
        rationale: `Find ${customerType} businesses in ${location} that may need our services`,
        best_platform: "google_maps",
      });
    }
  }
  return queries;
}

/** Find businesses actively looking for the service */
function generateServiceNeedQueries(
  customerTypes: string[],
  serviceKeywords: string[],
  locations: string[]
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  const needPhrases = ["looking for", "need", "requirement", "seeking", "wanted"];
  for (const customerType of customerTypes.slice(0, 3)) {
    for (const keyword of serviceKeywords.slice(0, 3)) {
      for (const location of locations.slice(0, 2)) {
        for (const phrase of needPhrases.slice(0, 2)) {
          queries.push({
            query: `${customerType} ${location} ${phrase} ${keyword}`,
            query_type: "SERVICE_NEED",
            priority: 9,
            rationale: `Actively searching: ${customerType} in ${location} ${phrase} ${keyword}`,
            best_platform: "google_search",
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
  locations: string[]
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  const problemPhrases = ["problems", "issues", "struggling with", "help with"];
  for (const customerType of customerTypes.slice(0, 2)) {
    for (const keyword of serviceKeywords.slice(0, 3)) {
      for (const location of locations.slice(0, 1)) {
        for (const phrase of problemPhrases.slice(0, 2)) {
          queries.push({
            query: `${customerType} ${location} ${phrase} ${keyword}`,
            query_type: "PROBLEM_SIGNAL",
            priority: 8,
            rationale: `Problem-signal search: ${customerType} ${phrase} related to ${keyword}`,
            best_platform: "google_search",
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
  locations: string[]
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  for (const customerType of customerTypes) {
    for (const location of locations) {
      queries.push({
        query: `${customerType} near ${location}`,
        query_type: "LOCAL_DISCOVERY",
        priority: 6,
        rationale: `Local discovery: ${customerType} near ${location}`,
        best_platform: "google_maps",
      });
    }
  }
  return queries;
}

/** Find businesses with website gaps (only if service is web-related) */
function generateWebsiteGapQueries(
  customerTypes: string[],
  locations: string[]
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  const gapPhrases = ["without website", "no website", "needs website"];
  for (const customerType of customerTypes.slice(0, 3)) {
    for (const location of locations.slice(0, 2)) {
      for (const phrase of gapPhrases) {
        queries.push({
          query: `${customerType} ${location} ${phrase}`,
          query_type: "WEBSITE_GAP",
          priority: 9,
          rationale: `Website gap: ${customerType} in ${location} ${phrase}`,
          best_platform: "google_search",
        });
      }
    }
  }
  return queries;
}

/** Find businesses needing software (only if service is software-related) */
function generateSoftwareGapQueries(
  customerTypes: string[],
  locations: string[]
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  const softwarePhrases = ["software solution", "custom software", "erp system", "crm software"];
  for (const customerType of customerTypes.slice(0, 3)) {
    for (const location of locations.slice(0, 2)) {
      for (const phrase of softwarePhrases.slice(0, 2)) {
        queries.push({
          query: `${customerType} ${location} ${phrase}`,
          query_type: "SOFTWARE_GAP",
          priority: 8,
          rationale: `Software gap: ${customerType} in ${location} looking for ${phrase}`,
          best_platform: "google_search",
        });
      }
    }
  }
  return queries;
}

/** Find businesses needing automation (only if service is automation-related) */
function generateAutomationNeedQueries(
  customerTypes: string[],
  locations: string[]
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  const automationPhrases = ["business automation", "workflow automation", "process automation"];
  for (const customerType of customerTypes.slice(0, 3)) {
    for (const location of locations.slice(0, 2)) {
      for (const phrase of automationPhrases) {
        queries.push({
          query: `${customerType} ${location} ${phrase}`,
          query_type: "AUTOMATION_NEED",
          priority: 8,
          rationale: `Automation need: ${customerType} in ${location} looking for ${phrase}`,
          best_platform: "google_search",
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
  locations: string[]
): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [];
  const hiringPhrases = ["hiring", "looking to hire", "outsourcing", "freelancer needed"];
  for (const customerType of customerTypes.slice(0, 2)) {
    for (const keyword of serviceKeywords.slice(0, 2)) {
      for (const location of locations.slice(0, 1)) {
        for (const phrase of hiringPhrases.slice(0, 2)) {
          queries.push({
            query: `${customerType} ${location} ${phrase} ${keyword}`,
            query_type: "HIRING_SIGNAL",
            priority: 9,
            rationale: `Hiring/outsourcing signal: ${customerType} ${phrase} ${keyword}`,
            best_platform: "google_search",
          });
        }
      }
    }
  }
  return queries;
}

// â”€â”€â”€ Main Query Generator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function generateDiscoveryQueries(
  input: QueryGeneratorInput,
  maxQueries: number = 30
): DiscoveryQuery[] {
  // â”€â”€â”€ Extract customer types from target audience â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ Extract service keywords â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ Extract locations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const locations = input.locations.map(extractShortLocation).filter(Boolean);

  // â”€â”€â”€ Determine which query types to generate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const hasWebsiteService = serviceCategories.has("website");
  const hasSoftwareService = serviceCategories.has("software") || serviceCategories.has("erp");
  const hasAutomationService = serviceCategories.has("automation") || serviceCategories.has("ai");

  if (customerTypes.length === 0) {
    customerTypes.push("small business");
  }
  if (locations.length === 0) {
    locations.push("India");
  }

  // â”€â”€â”€ Generate query families â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let allQueries: DiscoveryQuery[] = [];

  // Always generate: basic business discovery
  allQueries.push(...generateBusinessDiscoveryQueries(customerTypes, locations));

  // Always generate: service need queries (high priority)
  allQueries.push(
    ...generateServiceNeedQueries(customerTypes, serviceKeywords, locations)
  );

  // Problem signals
  allQueries.push(...generateProblemSignalQueries(customerTypes, serviceKeywords, locations));

  // Local discovery (maps)
  allQueries.push(...generateLocalDiscoveryQueries(customerTypes, locations));

  // Conditional: website gap (only when service includes web development)
  if (hasWebsiteService) {
    allQueries.push(...generateWebsiteGapQueries(customerTypes, locations));
  }

  // Conditional: software gap (only when service includes software)
  if (hasSoftwareService) {
    allQueries.push(...generateSoftwareGapQueries(customerTypes, locations));
  }

  // Conditional: automation need (only when service includes automation)
  if (hasAutomationService) {
    allQueries.push(...generateAutomationNeedQueries(customerTypes, locations));
  }

  // Hiring/outsourcing signals (always relevant)
  allQueries.push(...generateHiringSignalQueries(customerTypes, serviceKeywords, locations));

  // â”€â”€â”€ Deduplicate and prioritize â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  allQueries = deduplicateQueries(allQueries);
  allQueries.sort((a, b) => b.priority - a.priority);

  if (process.env.DEBUG_QUERIES === "1") {
    console.log(`[QGEN] total=${allQueries.length}`);
    for (const q of allQueries) {
      console.log(`[QGEN] [${q.query_type}] p=${q.priority} "${q.query}"`);
    }
  }

  return allQueries.slice(0, maxQueries);
}
