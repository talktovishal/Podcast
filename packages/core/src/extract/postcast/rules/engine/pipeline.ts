import { FilterRule, TransformRule, RuleResult, ScoreRule } from "./ruleTypes";

export async function runFilters<T>(input: T, rules: FilterRule<T>[]) {
  let cur = input;
  const notes: string[] = [];

  for (const rule of rules) {
    const res = await rule.run(cur);
    if (!res.ok) {
      return { ok: false as const, reason: `${rule.id}: ${res.reason}`, notes };
    }
    cur = res.data;
    if (res.notes) notes.push(...res.notes.map((n) => `${rule.id}: ${n}`));
  }

  return { ok: true as const, data: cur, notes };
}

export async function runTransforms<T>(input: T, rules: TransformRule<T>[]) {
  let cur = input;
  const notes: string[] = [];

  for (const rule of rules) {
    const res: RuleResult<T> = await rule.run(cur);
    if (!res.ok) {
      notes.push(`${rule.id}: skipped (${res.reason})`);
      continue;
    }
    cur = res.data;
    if (res.notes) notes.push(...res.notes.map((n) => `${rule.id}: ${n}`));
  }

  return { data: cur, notes };
}

export async function runScoring<T>(input: T, rules: ScoreRule<T>[]) {
  let total = 0;
  const breakdown: { id: string; delta: number }[] = [];
  for (const rule of rules) {
    const delta = await rule.score(input);
    total += delta;
    breakdown.push({ id: rule.id, delta });
  }
  return { total, breakdown };
}
