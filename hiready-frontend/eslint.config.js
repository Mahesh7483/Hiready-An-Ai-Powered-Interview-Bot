import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Was "off", which is how thirty-one dead bindings accumulated — among
      // them API_BASE_URL and getAuthHeaders left behind by the migration to
      // apiFetch, the same migration that dropped the Authorization header
      // from the aptitude runner. Unused function arguments and caught errors
      // stay allowed; they are a signature, not a leftover.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Every call to the backend goes through apiFetch (src/lib/api.ts), which
    // attaches the session token and handles an expired one. A raw fetch skips
    // both: the aptitude runner shipped with one and every quiz request came
    // back 401. This rule sees what a text search cannot — an aliased fetch,
    // window.fetch, XMLHttpRequest — so it, not a grep, is the enforcement.
    //
    // A legitimate exception (a call made before any token exists, or to a
    // third party) is marked at the call site, with the reason:
    //   // eslint-disable-next-line no-restricted-globals -- <why>
    // tests/frontend/apiClient.test.ts reads that same marker and rejects one
    // that gives no reason.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/api.ts"], // the client itself
    rules: {
      "no-restricted-globals": [
        "error",
        ...["fetch", "XMLHttpRequest", "EventSource"].map((name) => ({
          name,
          message: "Use apiFetch/apiJson from @/lib/api — it attaches the token and handles a 401.",
        })),
        {
          name: "WebSocket",
          message:
            "A browser WebSocket cannot send an Authorization header. Mint a short-lived scoped token through apiFetch first (see lib/deepgram.ts) and mark the call with a reason.",
        },
      ],
      "no-restricted-properties": [
        "error",
        ...["window", "globalThis", "self"].map((object) => ({
          object,
          property: "fetch",
          message: "Use apiFetch/apiJson from @/lib/api — it attaches the token and handles a 401.",
        })),
        {
          object: "navigator",
          property: "sendBeacon",
          message: "sendBeacon cannot carry an Authorization header; use apiFetch with keepalive.",
        },
      ],
    },
  },
  {
    // shadcn/ui components legitimately export variant helpers alongside components
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);
