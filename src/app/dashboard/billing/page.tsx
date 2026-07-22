"use client";

import { motion } from "framer-motion";
import {
  CreditCard,
  Download,
  Check,
  Plus,
  Crown,
  ArrowRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { billingData } from "@/lib/data";
import { formatCurrency, cn } from "@/lib/utils";

const usageItems = [
  {
    key: "leads" as const,
    label: "Lead Storage",
    color: "bg-blue-500",
    textColor: "text-blue-400",
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: "content" as const,
    label: "Content Published",
    color: "bg-purple-500",
    textColor: "text-purple-400",
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: "automations" as const,
    label: "Active Automations",
    color: "bg-amber-500",
    textColor: "text-amber-400",
    format: (v: number) => v.toString(),
  },
  {
    key: "storage" as const,
    label: "File Storage",
    color: "bg-emerald-500",
    textColor: "text-emerald-400",
    format: (v: number) => `${v} GB`,
  },
];

const cardBrands: Record<string, { label: string; emoji: string }> = {
  visa: { label: "Visa", emoji: "💳" },
  mastercard: { label: "Mastercard", emoji: "💳" },
  amex: { label: "Amex", emoji: "💳" },
};

export default function BillingPage() {
  const { plan, invoices, paymentMethods } = billingData;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-2xl font-semibold">Billing & Subscription</h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <Card className="relative overflow-hidden border-l-4 border-l-blue-500">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
          <CardContent className="relative p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <Crown className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">{plan.name}</h2>
                    <p className="text-sm text-white/50">Current Plan</p>
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-3xl font-bold">
                    {formatCurrency(plan.price)}
                    <span className="text-lg font-normal text-white/50">/month</span>
                  </span>
                  <p className="text-sm text-white/40 mt-1">
                    {plan.billingCycle === "monthly" ? "Billed monthly" : "Billed annually"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button className="gap-2">
                  Change Plan
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="ghost" className="text-white/50 hover:text-white/80">
                  Cancel Subscription
                </Button>
              </div>
            </div>

            <Separator className="my-5 bg-white/[0.06]" />

            <div>
              <p className="text-sm font-medium mb-3 text-white/60">Plan includes:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {plan.features.map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-white/70">
                    <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {usageItems.map((item) => {
                const usage = plan.usage[item.key];
                const pct = (usage.used / usage.limit) * 100;
                return (
                  <div
                    key={item.key}
                    className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.01]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-white/60">{item.label}</span>
                      <span className={`text-sm font-medium ${item.textColor}`}>
                        {item.format(usage.used)} / {item.format(usage.limit)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        className={cn("h-full rounded-full", item.color)}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(pct, 100)}%` }}
                        transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
                      />
                    </div>
                    <p className={`text-xs mt-1.5 ${item.textColor}`}>{pct.toFixed(1)}%</p>
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
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {paymentMethods.map((pm) => {
                const brand = cardBrands[pm.type] ?? { label: pm.type, emoji: "💳" };
                return (
                  <div
                    key={pm.id}
                    className="flex items-center justify-between p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-xl">
                        {brand.emoji}
                      </div>
                      <div>
                        <p className="text-sm font-medium flex items-center gap-2">
                          {brand.label} ending in {pm.lastFour}
                          {pm.isDefault && (
                            <Badge variant="info" className="text-[10px] px-1.5 py-0">
                              Default
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-white/40">Expires {pm.expiry}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <button className="flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.02] transition-all duration-200 text-sm text-white/50 hover:text-white/70 min-h-[72px]">
                <Plus className="h-4 w-4" />
                Add Payment Method
              </button>
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
            <CardTitle>Billing History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono text-sm">{invoice.id}</TableCell>
                    <TableCell className="text-white/60">
                      {new Date(invoice.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-white/70">{invoice.description}</TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(invoice.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={invoice.status === "paid" ? "success" : "warning"}
                      >
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-white/80">
                        <Download className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
