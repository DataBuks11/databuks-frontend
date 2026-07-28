import type {
  Lead,
  ContentItem,
  Approval,
  Conversation,
  AutomationTask,
  SocialConnection,
  DashboardStats,
  AnalyticsData,
  WebsiteData,
  SettingsData,
  BillingData,
} from "@/types";

export const dashboardStats: DashboardStats = {
  totalLeads: 0,
  leadsGrowth: 0,
  contentPublished: 0,
  contentGrowth: 0,
  conversationsActive: 0,
  conversationsGrowth: 0,
  meetingsBooked: 0,
  meetingsGrowth: 0,
  revenue: 0,
  revenueGrowth: 0,
  responseRate: 0,
  responseGrowth: 0,
};

export const leads: Lead[] = [];

export const contentItems: ContentItem[] = [];

export const approvals: Approval[] = [];

export const conversations: Conversation[] = [];

export const analyticsData: AnalyticsData = {
  reach: 0,
  impressions: 0,
  followers: 0,
  replies: 0,
  qualifiedLeads: 0,
  meetings: 0,
  revenue: 0,
  growth: 0,
  reachChart: [],
  impressionsChart: [],
  followersChart: [],
  engagementChart: [],
};

export const automationTasks: AutomationTask[] = [];

export const websiteData: WebsiteData = {
  businessName: "",
  tagline: "",
  summary: "",
  brandVoice: [],
  targetAudience: [],
  knowledgeBase: [],
  competitors: [],
  products: [],
  services: [],
};

export const socialConnections: SocialConnection[] = [];

export const settingsData: SettingsData = {
  businessProfile: {
    name: "",
    email: "",
    phone: "",
    website: "",
    address: "",
  },
  notifications: {
    emailAlerts: true,
    pushNotifications: true,
    leadNotifications: true,
    contentNotifications: false,
    weeklyReport: true,
  },
  integrations: [],
  apiKeys: [],
  security: {
    twoFactorEnabled: false,
    lastPasswordChange: "",
    loginHistory: [],
  },
};

export const billingData: BillingData = {
  plan: {
    name: "Free",
    price: 0,
    billingCycle: "monthly",
    features: [],
  },
  usage: {
    leads: { used: 0, limit: 0 },
    content: { used: 0, limit: 0 },
    automations: { used: 0, limit: 0 },
    storage: { used: 0, limit: 0, unit: "GB" },
  },
  invoices: [],
  paymentMethods: [],
};

export const chartData = {
  weekly: {
    conversations: [
      { day: "Mon", value: 0 },
      { day: "Tue", value: 0 },
      { day: "Wed", value: 0 },
      { day: "Thu", value: 0 },
      { day: "Fri", value: 0 },
      { day: "Sat", value: 0 },
      { day: "Sun", value: 0 },
    ],
    leads: [
      { day: "Mon", value: 0 },
      { day: "Tue", value: 0 },
      { day: "Wed", value: 0 },
      { day: "Thu", value: 0 },
      { day: "Fri", value: 0 },
      { day: "Sat", value: 0 },
      { day: "Sun", value: 0 },
    ],
    revenue: [
      { day: "Mon", value: 0 },
      { day: "Tue", value: 0 },
      { day: "Wed", value: 0 },
      { day: "Thu", value: 0 },
      { day: "Fri", value: 0 },
      { day: "Sat", value: 0 },
      { day: "Sun", value: 0 },
    ],
  },
  monthly: {
    conversations: [
      { month: "Jan", value: 0 },
      { month: "Feb", value: 0 },
      { month: "Mar", value: 0 },
      { month: "Apr", value: 0 },
      { month: "May", value: 0 },
      { month: "Jun", value: 0 },
      { month: "Jul", value: 0 },
      { month: "Aug", value: 0 },
      { month: "Sep", value: 0 },
      { month: "Oct", value: 0 },
      { month: "Nov", value: 0 },
      { month: "Dec", value: 0 },
    ],
    leads: [
      { month: "Jan", value: 0 },
      { month: "Feb", value: 0 },
      { month: "Mar", value: 0 },
      { month: "Apr", value: 0 },
      { month: "May", value: 0 },
      { month: "Jun", value: 0 },
      { month: "Jul", value: 0 },
      { month: "Aug", value: 0 },
      { month: "Sep", value: 0 },
      { month: "Oct", value: 0 },
      { month: "Nov", value: 0 },
      { month: "Dec", value: 0 },
    ],
    revenue: [
      { month: "Jan", value: 0 },
      { month: "Feb", value: 0 },
      { month: "Mar", value: 0 },
      { month: "Apr", value: 0 },
      { month: "May", value: 0 },
      { month: "Jun", value: 0 },
      { month: "Jul", value: 0 },
      { month: "Aug", value: 0 },
      { month: "Sep", value: 0 },
      { month: "Oct", value: 0 },
      { month: "Nov", value: 0 },
      { month: "Dec", value: 0 },
    ],
    growth: [
      { month: "Jan", value: 0 },
      { month: "Feb", value: 0 },
      { month: "Mar", value: 0 },
      { month: "Apr", value: 0 },
      { month: "May", value: 0 },
      { month: "Jun", value: 0 },
      { month: "Jul", value: 0 },
      { month: "Aug", value: 0 },
      { month: "Sep", value: 0 },
      { month: "Oct", value: 0 },
      { month: "Nov", value: 0 },
      { month: "Dec", value: 0 },
    ],
  },
};
