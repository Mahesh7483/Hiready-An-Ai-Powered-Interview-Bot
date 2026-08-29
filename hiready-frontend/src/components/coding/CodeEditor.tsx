import { useEffect, useRef, useState, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Pause, Square, ChevronDown, Copy, FilePlus, FileText, Terminal, X } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_CODE = {
  python: `def solve():\n    # Write your solution here\n    pass\n\nif __name__ == "__main__":\n    solve()`,
  javascript: `function solve() {\n  // Write your solution here\n}\n\nsolve();`,
  typescript: `function solve(): void {\n  // Write your solution here\n}\n\nsolve();`,
  java: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}`,
  go: `package main\n\nimport "fmt"\n\nfunc main() {\n    // Write your solution here\n}`,
  cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Write your solution here\n    return 0;\n}`,
  rust: `fn main() {\n    // Write your solution here\n}`,
};

const LANGUAGE_CONFIG = {
  python: { label: "Python", monaco: "python", icon: "🐍" },
  javascript: { label: "JavaScript", monaco: "javascript", icon: "🟨" },
  typescript: { label: "TypeScript", monaco: "typescript", icon: "🔷" },
  java: { label: "Java", monaco: "java", icon: "☕" },
  go: { label: "Go", monaco: "go", icon: "🐹" },
  cpp: { label: "C++", monaco: "cpp", icon: "🔷" },
  rust: { label: "Rust", monaco: "rust", icon: "🦀" },
};

interface CodeEditorProps {
  language: string;
  code: string;
  onChange: (code: string) => void;
  readOnly?: boolean;
  theme?: "vs-dark" | "vs" | "hc-black";
  height?: string;
  showToolbar?: boolean;
  onRun?: () => void;
  onFormat?: () => void;
  onCursorChange?: (position: { line: number; column: number }) => void;
  running?: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  language,
  code,
  onChange,
  readOnly = false,
  height = "400px",
  showToolbar = true,
  onRun,
  onFormat,
  onCursorChange,
  running = false,
}) => {
  const editorRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState(language);
  const [fontSize, setFontSize] = useState(14);
  const [theme, setTheme] = useState("vs-dark");

  useEffect(() => {
    setCurrentLanguage(language);
  }, [language]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      onChange(value);
    }
  }, [onChange]);

  const handleRun = () => {
    if (onRun && !running) onRun();
  };

  const handleFormat = () => {
    if (onFormat) onFormat();
  };

  const handleFontSizeChange = (delta: number) => {
    setFontSize(prev => Math.max(10, Math.min(24, prev + delta)));
  };

  if (!mounted) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted/50 rounded-lg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const config = LANGUAGE_CONFIG[currentLanguage] || LANGUAGE_CONFIG.javascript;

  return (
    <div className="flex flex-col h-full w-full bg-background border border-border rounded-lg overflow-hidden">
      {showToolbar && (
        <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30 px-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{config.icon} {config.label}</span>
            <Badge variant="outline" className="text-xs">{language}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFontSizeChange(-1)}
              title="Decrease font size"
              aria-label="Decrease font size"
            >
              <span className="text-xs">A-</span>
            </Button>
            <span className="text-xs text-muted-foreground w-10 text-center">{fontSize}px</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFontSizeChange(1)}
              title="Increase font size"
              aria-label="Increase font size"
            >
              <span className="text-xs">A+</span>
            </Button>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vs-dark">Dark (VS)</SelectItem>
                <SelectItem value="vs">Light (VS)</SelectItem>
                <SelectItem value="hc-black">High Contrast</SelectItem>
              </SelectContent>
            </Select>
            {onFormat && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleFormat}
                disabled={readOnly}
                title="Format code"
              >
                <FileText className="w-4 h-4 mr-1" /> Format
              </Button>
            )}
            <Button
              variant={running ? "destructive" : "default"}
              size="sm"
              onClick={running ? undefined : handleRun}
              disabled={running}
              className="gap-1"
            >
              {running ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 relative min-h-0">
        <Editor
          onMount={(editor) => {
            editorRef.current = editor;
            if (onCursorChange) {
              editor.onDidChangeCursorPosition((e) => {
                onCursorChange({ line: e.position.lineNumber, column: e.position.column });
              });
            }
          }}
          height={height}
          language={config.monaco}
          theme={theme}
          value={code}
          onChange={handleEditorChange}
          options={{
            fontSize,
            lineNumbers: "on",
            minimap: { enabled: true },
            automaticLayout: true,
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: language === "python" ? 4 : 2,
            insertSpaces: true,
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true },
            renderLineHighlight: "all",
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            renderWhitespace: "selection",
            renderControlCharacters: true,
            renderLineHighlightOnlyWhenFocus: false,
            showFoldingControls: "always",
            codeLens: false,
            quickSuggestions: {
              other: true,
              comments: true,
              strings: true,
            },
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: "on",
            tabCompletion: "on",
            parameterHints: { enabled: true },
            hover: { enabled: "on" },
            formatOnPaste: true,
            formatOnType: true,
          }}
        />
      </div>
    </div>
  );
};

export default CodeEditor;