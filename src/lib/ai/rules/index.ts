import type { RuleResult } from "../types";
import { RULE_CATALOG, type RuleContext } from "./catalog";

export function evaluateRule(ruleId: string, context: RuleContext): RuleResult["checks"][number] {
  const definition = RULE_CATALOG[ruleId];
  if (!definition) {
    return { ruleId, passed: false, reason: `unknown rule ${ruleId}` };
  }
  const outcome = definition.evaluate(context);
  return { ruleId, ...outcome };
}

export function evaluateRules(ruleIds: string[], context: RuleContext): RuleResult {
  const checks = ruleIds.map((ruleId) => evaluateRule(ruleId, context));
  const failed = checks.find((check) => !check.passed);
  return {
    allowed: !failed,
    ruleId: failed?.ruleId,
    reason: failed ? `${failed.ruleId}: ${failed.reason}` : "all rules passed",
    checks,
  };
}

export { RULE_CATALOG, VALID_CHANNELS } from "./catalog";
export type { RuleContext, ActionType } from "./catalog";
