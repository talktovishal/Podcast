export type RuleResult<T> =
  | { ok: true; data: T; notes?: string[] }
  | { ok: false; reason: string; notes?: string[] };

export interface FilterRule<T> {
  id: string;
  description: string;
  run(input: T): Promise<RuleResult<T>>;
}

export interface TransformRule<T> {
  id: string;
  description: string;
  run(input: T): Promise<RuleResult<T>>;
}

export interface ScoreRule<T> {
  id: string;
  description: string;
  score(input: T): Promise<number>;
}
