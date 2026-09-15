/**
 * Shared aptitude configuration.
 *
 * The topic list was duplicated verbatim in AptitudePractice.tsx and
 * AptitudeTestPage.tsx — two configurator pages that offered overlapping
 * subsets of the same options, one of which was unreachable. Both are gone;
 * this is the single source.
 */

export type AptitudeMode = "practice" | "test";

export interface AptitudeConfig {
  mode: AptitudeMode;
  topic: string;
  difficulty: string;
  questionCount: number;
  timerEnabled: boolean;
  timerMinutes: number;
  negativeMarking: boolean;
  adaptive: boolean;
}

export interface TopicOption {
  value: string;
  label: string;
}

export const TOPICS: TopicOption[] = [
  { value: "all", label: "Mixed — all topics" },
  { value: "logical", label: "Logical Reasoning" },
  { value: "quantitative", label: "Quantitative Aptitude" },
  { value: "verbal", label: "Verbal Ability" },
  { value: "data-interpretation", label: "Data Interpretation" },
  { value: "coding-theory", label: "Coding Theory" },
  { value: "blood-relation", label: "Blood Relations" },
  { value: "number-series", label: "Number Series" },
  { value: "puzzles", label: "Puzzles" },
];

/**
 * Difficulty → token classes. Literal strings, because Tailwind's JIT reads
 * source text: a class assembled from fragments at runtime is never generated.
 */
export const DIFFICULTIES = [
  { value: "", label: "Any", cls: "bg-muted text-muted-foreground border-border" },
  { value: "easy", label: "Easy", cls: "bg-success/10 text-success border-success/20" },
  { value: "medium", label: "Medium", cls: "bg-warning/10 text-warning border-warning/20" },
  { value: "hard", label: "Hard", cls: "bg-destructive/10 text-destructive border-destructive/20" },
];

export const QUESTION_COUNTS = [5, 10, 15, 20, 25];

export interface TestPreset {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  timerMinutes: number;
  topic: string;
}

/** Starting points for a timed test. Every value stays editable afterwards. */
export const TEST_PRESETS: TestPreset[] = [
  {
    id: "mock",
    title: "Full mock",
    description: "Mixed topics, the shape of a real placement round.",
    questionCount: 20,
    timerMinutes: 30,
    topic: "all",
  },
  {
    id: "topic",
    title: "Single topic",
    description: "Drill one area you know is weak.",
    questionCount: 10,
    timerMinutes: 15,
    topic: "logical",
  },
  {
    id: "quick",
    title: "Quick sprint",
    description: "Five questions, five minutes.",
    questionCount: 5,
    timerMinutes: 5,
    topic: "all",
  },
];

export const DEFAULT_CONFIG: AptitudeConfig = {
  mode: "practice",
  topic: "logical",
  difficulty: "",
  questionCount: 10,
  timerEnabled: false,
  timerMinutes: 15,
  negativeMarking: false,
  adaptive: false,
};

export const topicLabel = (value: string) =>
  TOPICS.find((t) => t.value === value)?.label ?? value;
