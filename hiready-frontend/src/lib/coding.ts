/**
 * Shared constants and pure helpers for the coding workspace.
 *
 * Kept out of the component files so fast refresh keeps working — a module that
 * exports both a component and a constant loses it.
 */

export interface LanguageOption {
  value: string;
  label: string;
}

/**
 * Must stay in step with CODING_LANGUAGES in hiready-backend/utils/constants.js.
 * Offering a language the sandbox cannot run produces a 400 the candidate
 * reads as "my code is wrong".
 */
export const LANGUAGES: LanguageOption[] = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
  { value: "cpp", label: "C++" },
  { value: "rust", label: "Rust" },
];

/** Seconds → mm:ss, clamped at zero. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Default minutes to solve, by difficulty — a starting point, not a rule. */
export const DEFAULT_MINUTES: Record<string, number> = { easy: 20, medium: 35, hard: 50 };

export const DURATION_CHOICES = [10, 15, 20, 30, 45, 60, 90];

export const DEFAULT_CODE: Record<string, string> = {
  python: 'def solve():\n    # Write your solution here\n    pass\n\n\nif __name__ == "__main__":\n    solve()\n',
  javascript: "function solve() {\n  // Write your solution here\n}\n\nsolve();\n",
  typescript: "function solve(): void {\n  // Write your solution here\n}\n\nsolve();\n",
  java: "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n",
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n    _ = fmt.Sprint\n    // Write your solution here\n}\n',
  cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Write your solution here\n    return 0;\n}\n",
  rust: "fn main() {\n    // Write your solution here\n}\n",
};

/** localStorage key for a per-question, per-language draft. */
export const codeKey = (questionId: string, language: string) =>
  `hiready:code:${questionId}:${language}`;
