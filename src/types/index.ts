export interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  industry: string;
  leadScore: number;
  status: "new" | "contacted" | "qualified" | "nurturing" | "converted" | "lost";
  location: string;
  createdAt: string;
  lastContact: string;
  notes?: string;
  avatar?: string;
}

export interface ContentItem {
  id: string;
  title: string;
  type: "post" | "reel" | "story" | "carousel" | "email";
  platform: "instagram" | "facebook" | "linkedin" | "twitter" | "email" | "whatsapp" | "telegram";
  status: "draft" | "scheduled" | "published";
  date: string;
  thumbnail?: string;
  engagement?: {
    likes: number;
    comments: number;
    shares: number;
  };
  author: string;
}

export interface Approval {
  id: string;
  type: "post" | "dm" | "reply" | "comment";
  content: string;
  platform: string;
  submittedBy: string;
  date: string;
  status: "pending" | "approved" | "rejected";
  urgency: "low" | "medium" | "high";
}

export interface Conversation {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
  unread: number;
  platform: "instagram" | "facebook" | "whatsapp" | "telegram" | "linkedin";
  avatar?: string;
  status: "online" | "offline" | "away";
  tags?: string[];
}

export interface AutomationTask {
  id: string;
  name: string;
  agent: string;
  status: "running" | "completed" | "queued" | "failed";
  progress: number;
  time: string;
  description?: string;
  lastRun?: string;
}

export interface SocialConnection {
  id: string;
  platform: "instagram" | "facebook" | "whatsapp" | "telegram" | "linkedin";
  handle: string;
  status: "connected" | "disconnected" | "expired" | "error";
  followers: number;
  lastSync: string;
  profileUrl?: string;
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: "paid" | "pending" | "overdue" | "cancelled";
  description: string;
  invoiceUrl?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string | null;
  permissions: string[];
  environment: "production" | "development" | "sandbox";
}

export interface DashboardStats {
  totalLeads: number;
  leadsGrowth: number;
  contentPublished: number;
  contentGrowth: number;
  conversationsActive: number;
  conversationsGrowth: number;
  meetingsBooked: number;
  meetingsGrowth: number;
  revenue: number;
  revenueGrowth: number;
  responseRate: number;
  responseGrowth: number;
}

export interface AnalyticsData {
  reach: number;
  impressions: number;
  followers: number;
  replies: number;
  qualifiedLeads: number;
  meetings: number;
  revenue: number;
  growth: number;
  reachChart: { date: string; value: number }[];
  impressionsChart: { date: string; value: number }[];
  followersChart: { date: string; value: number }[];
  engagementChart: { date: string; value: number }[];
}

export interface WebsiteData {
  businessName: string;
  tagline: string;
  summary: string;
  brandVoice: string[];
  targetAudience: {
    segment: string;
    description: string;
    painPoints: string[];
  }[];
  knowledgeBase: {
    title: string;
    content: string;
    category: string;
  }[];
  competitors: {
    name: string;
    url: string;
    strengths: string[];
    weaknesses: string[];
  }[];
  products: {
    name: string;
    description: string;
    price: string;
    features: string[];
  }[];
  services: {
    name: string;
    description: string;
    price: string;
    features: string[];
  }[];
}

export interface SettingsData {
  businessProfile: {
    name: string;
    email: string;
    phone: string;
    website: string;
    address: string;
    logo?: string;
  };
  notifications: {
    emailAlerts: boolean;
    pushNotifications: boolean;
    leadNotifications: boolean;
    contentNotifications: boolean;
    weeklyReport: boolean;
  };
  integrations: {
    name: string;
    connected: boolean;
    lastSync?: string;
  }[];
  apiKeys: ApiKey[];
  security: {
    twoFactorEnabled: boolean;
    lastPasswordChange: string;
    loginHistory: {
      date: string;
      ip: string;
      location: string;
      device: string;
    }[];
  };
}

export interface BillingData {
  plan: {
    name: string;
    price: number;
    billingCycle: "monthly" | "annual";
    features: string[];
    usage: {
      leads: { used: number; limit: number };
      content: { used: number; limit: number };
      automations: { used: number; limit: number };
      storage: { used: number; limit: number; unit: string };
    };
  };
  invoices: Invoice[];
  paymentMethods: {
    id: string;
    type: "visa" | "mastercard" | "amex";
    lastFour: string;
    expiry: string;
    isDefault: boolean;
  }[];
}
