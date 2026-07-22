"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  BookOpen,
  Headphones,
  Users,
  PlayCircle,
  ChevronDown,
  Send,
  ExternalLink,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const quickActions = [
  {
    icon: BookOpen,
    title: "Documentation",
    description: "Browse our comprehensive guides and API references",
    linkLabel: "View Docs",
    href: "#",
    color: "text-blue-400",
    bg: "bg-blue-400/10",
  },
  {
    icon: Headphones,
    title: "Contact Support",
    description: "Get help from our team. Average response time: 2 hours",
    linkLabel: "Submit Ticket",
    href: "#",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
  {
    icon: Users,
    title: "Community Forum",
    description: "Connect with other DataBuks users and share best practices",
    linkLabel: "Join Community",
    href: "#",
    color: "text-purple-400",
    bg: "bg-purple-400/10",
  },
  {
    icon: PlayCircle,
    title: "Video Tutorials",
    description: "Watch step-by-step tutorials to master DataBuks",
    linkLabel: "Watch Now",
    href: "#",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
  },
];

const faqItems = [
  {
    question: "How does AI lead scoring work?",
    answer:
      "Our AI Lead Scoring Engine evaluates each lead across 40+ data points including engagement history, firmographic fit, behavioral signals, and conversation intent. Leads receive a score from 0-100 updated in real-time as new interactions occur, helping you prioritize your outreach efforts.",
  },
  {
    question: "Can I connect multiple social accounts?",
    answer:
      "Yes, DataBuks supports all major social platforms including Instagram, Facebook, LinkedIn, WhatsApp, and Telegram. You can connect multiple accounts per platform and manage them all from a single dashboard.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "We offer a 14-day free trial on all plans, including DataBuks Pro. No credit card required to get started. Explore all features and see the impact on your outreach before committing.",
  },
  {
    question: "How does the approval workflow work?",
    answer:
      "Our AI drafts content, messages, and replies based on your brand voice and guidelines. These are then routed to designated team members for review. You can approve, request changes, or reject with one click. Once approved, content is automatically published or sent.",
  },
  {
    question: "Can I export my data?",
    answer:
      "Absolutely. You can export your leads, analytics, conversations, and content data in CSV or JSON formats. Enterprise plans also include API access for programmatic data export and integration with your data warehouse.",
  },
  {
    question: "What integrations are supported?",
    answer:
      "DataBuks integrates natively with HubSpot, Salesforce, Zapier, Slack, Google Analytics, Calendly, Stripe, and Mailchimp. Our REST API and webhook system allow you to build custom integrations with any platform.",
  },
  {
    question: "How secure is my data?",
    answer:
      "DataBuks is SOC 2 Type II certified and GDPR compliant. All data is encrypted at rest using AES-256 and in transit using TLS 1.3. We perform regular security audits and penetration testing to ensure your data stays safe.",
  },
  {
    question: "Do you offer custom AI training?",
    answer:
      "Yes, our Enterprise tier includes custom AI model training tailored to your industry, audience, and brand voice. Our team works with you to fine-tune intent detection, lead scoring, and content generation models for your specific use case.",
  },
];

const ticketCategories = ["Account", "Billing", "Technical", "Feature Request", "Other"];
const ticketPriorities = ["Low", "Medium", "High", "Urgent"];

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [ticket, setTicket] = useState({
    subject: "",
    category: "",
    priority: "",
    description: "",
  });

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const handleSubmitTicket = () => {};

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-2xl font-semibold">Help Center</h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="max-w-2xl mx-auto"
      >
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30" />
          <Input
            placeholder="Search for help articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 text-base rounded-xl"
          />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {quickActions.map((action, i) => (
          <Card key={action.title} className="p-5 hover:border-white/[0.12] transition-all duration-200">
            <div className={`w-10 h-10 rounded-xl ${action.bg} flex items-center justify-center mb-4`}>
              <action.icon className={`h-5 w-5 ${action.color}`} />
            </div>
            <h3 className="font-semibold mb-1">{action.title}</h3>
            <p className="text-sm text-white/50 mb-4 line-clamp-2">{action.description}</p>
            <a
              href={action.href}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
            >
              {action.linkLabel}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Card>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-white/[0.06] -mx-2">
              {faqItems.map((faq, index) => {
                const isOpen = openFaq === index;
                return (
                  <div key={index} className="px-2">
                    <button
                      onClick={() => toggleFaq(index)}
                      className="flex items-center justify-between w-full py-4 text-left group"
                    >
                      <span className="text-sm font-medium pr-4 group-hover:text-white/90 transition-colors">
                        {faq.question}
                      </span>
                      <motion.div
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="shrink-0"
                      >
                        <ChevronDown className="h-4 w-4 text-white/40" />
                      </motion.div>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <p className="text-sm text-white/50 pb-4 leading-relaxed">
                            {faq.answer}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Submit a Support Ticket</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ticketSubject">Subject</Label>
                <Input
                  id="ticketSubject"
                  placeholder="Brief description of your issue"
                  value={ticket.subject}
                  onChange={(e) => setTicket({ ...ticket, subject: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ticketCategory">Category</Label>
                  <Select
                    value={ticket.category}
                    onValueChange={(v) => setTicket({ ...ticket, category: v })}
                  >
                    <SelectTrigger id="ticketCategory">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {ticketCategories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ticketPriority">Priority</Label>
                  <Select
                    value={ticket.priority}
                    onValueChange={(v) => setTicket({ ...ticket, priority: v })}
                  >
                    <SelectTrigger id="ticketPriority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      {ticketPriorities.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ticketDescription">Description</Label>
                <textarea
                  id="ticketDescription"
                  rows={4}
                  placeholder="Describe your issue in detail..."
                  className="flex w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 resize-none"
                  value={ticket.description}
                  onChange={(e) => setTicket({ ...ticket, description: e.target.value })}
                />
              </div>

              <Button onClick={handleSubmitTicket} className="gap-2">
                <Send className="h-4 w-4" />
                Submit Ticket
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
