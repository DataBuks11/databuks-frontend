"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Globe,
  RefreshCw,
  PaintBucket,
  Users,
  BookOpen,
  Shield,
  Package,
  Wrench,
  Check,
  ExternalLink,
  ChevronRight,
  ArrowUpRight,
  Palette,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { websiteData } from "@/lib/data";

const brandColors = [
  { name: "Blue", hex: "#3b82f6" },
  { name: "Indigo", hex: "#6366f1" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Cyan", hex: "#06b6d4" },
];

const tabVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function WebsiteIntelligencePage() {
  const [activeTab, setActiveTab] = useState("summary");

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Website Intelligence
            </h1>
            <Badge variant="success">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
              Connected
            </Badge>
          </div>
          <p className="text-sm text-white/40">
            Last synced: January 22, 2025 at 10:45 AM
          </p>
        </div>
        <Button variant="glass" size="sm" className="shrink-0 gap-2">
          <RefreshCw className="h-4 w-4" />
          Re-scan Website
        </Button>
      </motion.div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="summary" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            Business Summary
          </TabsTrigger>
          <TabsTrigger value="brand" className="gap-1.5">
            <PaintBucket className="h-3.5 w-3.5" />
            Brand Voice
          </TabsTrigger>
          <TabsTrigger value="audience" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Target Audience
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Knowledge Base
          </TabsTrigger>
          <TabsTrigger value="competitors" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Competitors
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Products &amp; Services
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <motion.div
            variants={tabVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6 mt-6"
          >
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {websiteData.businessName}
                </CardTitle>
                <CardDescription className="text-base text-white/60 font-medium">
                  {websiteData.tagline}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-white/70 leading-relaxed">
                  {websiteData.summary}
                </p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {
                  label: "Products",
                  value: websiteData.products.length,
                  icon: Package,
                },
                {
                  label: "Services",
                  value: websiteData.services.length,
                  icon: Wrench,
                },
                {
                  label: "Competitors",
                  value: websiteData.competitors.length,
                  icon: Shield,
                },
                {
                  label: "KB Articles",
                  value: websiteData.knowledgeBase.length,
                  icon: BookOpen,
                },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 * i, duration: 0.3 }}
                >
                  <Card className="glass-card flex flex-col items-center justify-center py-5 gap-2">
                    <stat.icon className="h-5 w-5 text-white/40" />
                    <span className="text-2xl font-bold">{stat.value}</span>
                    <span className="text-xs text-white/40">{stat.label}</span>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="brand">
          <motion.div
            variants={tabVariants}
            initial="hidden"
            animate="visible"
            className="space-y-4 mt-6"
          >
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Brand Voice Traits</CardTitle>
                <CardDescription>
                  How your brand communicates and positions itself
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {websiteData.brandVoice.map((trait, i) => (
                  <div
                    key={trait}
                    className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-sm font-bold text-white/60">
                      {i + 1}
                    </span>
                    <span className="text-sm text-white/80">{trait}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Color Palette
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  {brandColors.map((color) => (
                    <div key={color.name} className="flex flex-col items-center gap-2">
                      <div
                        className="h-10 w-10 rounded-full border-2 border-white/10"
                        style={{ backgroundColor: color.hex }}
                      />
                      <span className="text-xs text-white/50">{color.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="audience">
          <motion.div
            variants={tabVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6 mt-6"
          >
            <div className="grid grid-cols-1 gap-6">
              {websiteData.targetAudience.map((audience, i) => (
                <motion.div
                  key={audience.segment}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.3 }}
                >
                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-xs font-bold text-white/60">
                          {i + 1}
                        </span>
                        {audience.segment}
                      </CardTitle>
                      <CardDescription>{audience.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {audience.painPoints.map((point) => (
                          <div
                            key={point}
                            className="flex items-start gap-3 text-sm text-white/70"
                          >
                            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/10">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                            </div>
                            {point}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="knowledge">
          <motion.div
            variants={tabVariants}
            initial="hidden"
            animate="visible"
            className="mt-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {websiteData.knowledgeBase.map((article, i) => (
                <motion.div
                  key={article.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.3 }}
                >
                  <Card className="glass-card h-full flex flex-col">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base leading-snug pr-2">
                          {article.title}
                        </CardTitle>
                        <Badge variant="info" className="shrink-0">
                          {article.category}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col justify-between gap-3">
                      <p className="text-sm text-white/50 line-clamp-2 leading-relaxed">
                        {article.content}
                      </p>
                      <button className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors self-start">
                        Read More
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="competitors">
          <motion.div
            variants={tabVariants}
            initial="hidden"
            animate="visible"
            className="mt-6"
          >
            <Card className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Website</TableHead>
                      <TableHead>Strengths</TableHead>
                      <TableHead>Weaknesses</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {websiteData.competitors.map((competitor, i) => (
                      <motion.tr
                        key={competitor.name}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1, duration: 0.3 }}
                        className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                      >
                        <TableCell className="font-medium text-white">
                          {competitor.name}
                        </TableCell>
                        <TableCell>
                          <a
                            href={competitor.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors"
                          >
                            {competitor.url.replace("https://", "")}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {competitor.strengths.map((s) => (
                              <Badge
                                key={s}
                                variant="success"
                                className="text-[10px]"
                              >
                                {s}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {competitor.weaknesses.map((w) => (
                              <Badge
                                key={w}
                                variant="destructive"
                                className="text-[10px]"
                              >
                                {w}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="products">
          <motion.div
            variants={tabVariants}
            initial="hidden"
            animate="visible"
            className="space-y-8 mt-6"
          >
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Package className="h-4 w-4 text-sky-400" />
                Products
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {websiteData.products.map((product, i) => (
                  <motion.div
                    key={product.name}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1, duration: 0.3 }}
                  >
                    <Card className="glass-card h-full flex flex-col">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">
                          {product.name}
                        </CardTitle>
                        <CardDescription>{product.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1 flex flex-col gap-4">
                        <span className="text-3xl font-bold tracking-tight">
                          {product.price}
                        </span>
                        <Separator className="bg-white/[0.06]" />
                        <div className="space-y-2.5">
                          {product.features.map((f) => (
                            <div
                              key={f}
                              className="flex items-start gap-2.5 text-sm text-white/60"
                            >
                              <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                              {f}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Wrench className="h-4 w-4 text-violet-400" />
                Services
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {websiteData.services.map((service, i) => (
                  <motion.div
                    key={service.name}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 + 0.2, duration: 0.3 }}
                  >
                    <Card className="glass-card h-full flex flex-col">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">
                          {service.name}
                        </CardTitle>
                        <CardDescription>
                          {service.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1 flex flex-col gap-4">
                        <span className="text-3xl font-bold tracking-tight">
                          {service.price}
                        </span>
                        <Separator className="bg-white/[0.06]" />
                        <div className="space-y-2.5">
                          {service.features.map((f) => (
                            <div
                              key={f}
                              className="flex items-start gap-2.5 text-sm text-white/60"
                            >
                              <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                              {f}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
