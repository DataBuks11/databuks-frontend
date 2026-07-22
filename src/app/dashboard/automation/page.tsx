"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Plus,
  Play,
  StopCircle,
  RotateCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  X,
  Zap,
  Activity,
  Timer,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { automationTasks } from "@/lib/data";
import { cn } from "@/lib/utils";
import type { AutomationTask } from "@/types";

const statusConfig: Record<
  AutomationTask["status"],
  {
    label: string;
    color: string;
    bg: string;
    barColor: string;
    badgeVariant: "success" | "info" | "warning" | "destructive";
  }
> = {
  running: {
    label: "Running",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    barColor: "bg-emerald-500",
    badgeVariant: "success",
  },
  completed: {
    label: "Completed",
    color: "text-sky-400",
    bg: "bg-sky-400/10",
    barColor: "bg-sky-500",
    badgeVariant: "info",
  },
  queued: {
    label: "Queued",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    barColor: "bg-amber-500",
    badgeVariant: "warning",
  },
  failed: {
    label: "Failed",
    color: "text-red-400",
    bg: "bg-red-400/10",
    barColor: "bg-red-500",
    badgeVariant: "destructive",
  },
};

const agents = [
  "LeadGen Agent v2",
  "Content Agent",
  "Scoring Engine v3",
  "Sequence Agent",
  "Reply Agent",
  "Moderation Agent",
  "Analytics Agent",
  "Sync Agent",
];

const triggers = [
  "Manual",
  "Schedule (Daily)",
  "Schedule (Weekly)",
  "Event-based",
  "Webhook",
  "New Lead Detected",
  "Post Published",
];

const summaryCards = [
  {
    title: "Running Agents",
    icon: Zap,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    filter: (t: AutomationTask) => t.status === "running",
  },
  {
    title: "Completed Today",
    icon: CheckCircle2,
    color: "text-sky-400",
    bg: "bg-sky-400/10",
    filter: (t: AutomationTask) => t.status === "completed",
  },
  {
    title: "Queued",
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    filter: (t: AutomationTask) => t.status === "queued",
  },
  {
    title: "Failed",
    icon: AlertTriangle,
    color: "text-red-400",
    bg: "bg-red-400/10",
    filter: (t: AutomationTask) => t.status === "failed",
  },
];

export default function AutomationPage() {
  const [tasks, setTasks] = useState(automationTasks);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newAutomationName, setNewAutomationName] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [selectedTrigger, setSelectedTrigger] = useState<string>("");

  const handleStatusChange = useCallback(
    (id: string, newStatus: AutomationTask["status"]) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          if (newStatus === "running")
            return { ...t, status: "running", progress: 0 };
          if (newStatus === "completed")
            return {
              ...t,
              status: "completed",
              progress: 100,
              lastRun: new Date().toLocaleString(),
              time: "Completed just now",
            };
          if (newStatus === "failed")
            return { ...t, status: "failed", time: "Failed just now" };
          if (newStatus === "queued") return { ...t, status: "queued", progress: 0 };
          return t;
        })
      );
    },
    []
  );

  const runAllQueued = useCallback(() => {
    setTasks((prev) =>
      prev.map((t) =>
        t.status === "queued" ? { ...t, status: "running", progress: 0, time: "Running..." } : t
      )
    );
  }, []);

  const handleCreateAutomation = useCallback(() => {
    if (!newAutomationName.trim() || !selectedAgent) return;
    const newTask: AutomationTask = {
      id: `at-${Date.now()}`,
      name: newAutomationName.trim(),
      agent: selectedAgent,
      status: "queued",
      progress: 0,
      time: "Just created",
      description: `Trigger: ${selectedTrigger || "Manual"}`,
    };
    setTasks((prev) => [newTask, ...prev]);
    setNewAutomationName("");
    setSelectedAgent("");
    setSelectedTrigger("");
    setShowNewDialog(false);
  }, [newAutomationName, selectedAgent, selectedTrigger]);

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status === "running" || t.status === "queued"),
    [tasks]
  );
  const historyTasks = useMemo(
    () => tasks.filter((t) => t.status === "completed" || t.status === "failed"),
    [tasks]
  );

  const hasQueued = useMemo(
    () => tasks.some((t) => t.status === "queued"),
    [tasks]
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Automation Hub
          </h1>
          <p className="text-white/50 mt-1 text-sm">
            Manage and monitor your AI automation agents
          </p>
        </div>

        <div className="flex items-center gap-3">
          {hasQueued && (
            <Button
              variant="outline"
              size="sm"
              onClick={runAllQueued}
              className="gap-2"
            >
              <Play className="w-4 h-4" />
              Run All Queued
            </Button>
          )}
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setShowNewDialog(true)}
          >
            <Plus className="w-4 h-4" />
            New Automation
          </Button>
        </div>
      </motion.div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {summaryCards.map((card, index) => {
          const count = tasks.filter(card.filter).length;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
            >
              <Card className="glass-card p-4 rounded-2xl border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      card.bg
                    )}
                  >
                    <card.icon className={cn("w-5 h-5", card.color)} />
                  </div>
                  <div>
                    <p className="text-xs text-white/50 font-medium">
                      {card.title}
                    </p>
                    <p className="text-xl font-bold text-white tabular-nums">
                      {count}
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Active Agents Section */}
      {activeTasks.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Active Agents</h2>
            <Badge variant="success" className="ml-2">
              {activeTasks.length}
            </Badge>
          </div>

          <div className="space-y-3">
            {activeTasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        </div>
      )}

      {/* History Section */}
      {historyTasks.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Timer className="w-4 h-4 text-white/50" />
            <h2 className="text-lg font-semibold text-white">History</h2>
            <Badge variant="secondary" className="ml-2">
              {historyTasks.length}
            </Badge>
          </div>

          <div className="space-y-3">
            {historyTasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        </div>
      )}

      {/* New Automation Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Automation</DialogTitle>
            <DialogDescription>
              Configure a new automation task for your AI agents.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="automation-name">Automation Name</Label>
              <Input
                id="automation-name"
                placeholder="e.g. Instagram DM Outreach - Q1"
                value={newAutomationName}
                onChange={(e) => setNewAutomationName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-select">Agent</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger id="agent-select">
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent} value={agent}>
                      {agent}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="trigger-select">Trigger</Label>
              <Select
                value={selectedTrigger}
                onValueChange={setSelectedTrigger}
              >
                <SelectTrigger id="trigger-select">
                  <SelectValue placeholder="Select a trigger" />
                </SelectTrigger>
                <SelectContent>
                  {triggers.map((trigger) => (
                    <SelectItem key={trigger} value={trigger}>
                      {trigger}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowNewDialog(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateAutomation}>
                Create Automation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskCard({
  task,
  index,
  onStatusChange,
}: {
  task: AutomationTask;
  index: number;
  onStatusChange: (
    id: string,
    status: AutomationTask["status"]
  ) => void;
}) {
  const config = statusConfig[task.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Card className="glass-card rounded-2xl border-white/[0.08] overflow-hidden">
        <div className="flex">
          <div
            className={cn(
              "w-1 shrink-0",
              task.status === "running" ? "bg-emerald-500 animate-pulse" : "",
              task.status === "completed" ? "bg-sky-500" : "",
              task.status === "queued" ? "bg-amber-500" : "",
              task.status === "failed" ? "bg-red-500" : ""
            )}
          />

          <div className="flex-1 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Bot className="w-4 h-4 text-white/50 shrink-0" />
                  <p className="text-xs text-white/40 font-medium truncate">
                    {task.agent}
                  </p>
                </div>
                <p className="text-sm font-semibold text-white mb-3">
                  {task.name}
                </p>

                <div className="flex items-center gap-3 mb-3">
                  <Badge
                    variant={config.badgeVariant}
                    className={cn(
                      "text-xs",
                      task.status === "running" && "animate-pulse"
                    )}
                  >
                    {config.label}
                  </Badge>
                  <span className="text-xs text-white/40">{task.time}</span>
                </div>

                <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden mb-3">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${task.progress}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className={cn("h-full rounded-full", config.barColor)}
                  />
                </div>

                {task.description && (
                  <p className="text-sm text-white/60">{task.description}</p>
                )}

                {task.lastRun && (
                  <p className="text-xs text-white/30 mt-1">
                    Last run: {task.lastRun}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {task.status === "running" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                    onClick={() => onStatusChange(task.id, "failed")}
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    Stop
                  </Button>
                )}

                {task.status === "queued" && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10"
                      onClick={() => onStatusChange(task.id, "running")}
                    >
                      <Play className="w-3.5 h-3.5" />
                      Start Now
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                      onClick={() => onStatusChange(task.id, "failed")}
                    >
                      <X className="w-3.5 h-3.5" />
                      Cancel
                    </Button>
                  </>
                )}

                {task.status === "failed" && (
                  <>
                    <Badge
                      variant="destructive"
                      className="gap-1 text-xs cursor-pointer hover:bg-red-500/30"
                      onClick={() => onStatusChange(task.id, "queued")}
                    >
                      <RotateCw className="w-3 h-3" />
                      Retry
                    </Badge>
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  </>
                )}

                {task.status === "completed" && (
                  <CheckCircle2 className="w-5 h-5 text-sky-400" />
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
