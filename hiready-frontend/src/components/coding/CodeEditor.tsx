import { useEffect, useRef, useState, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, FileText } from "lucide-react";

type LanguageKey = "python" | "javascript" | "typescript" | "java" | "go" | "cpp" | "rust";

const LANGUAGE_CONFIG: Record<LanguageKey, { label: string; monaco: string; icon: string }> = {
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
  theme: propTheme = "vs-dark",
  height = "100%",
  showToolbar = true,
  onRun,
  onFormat,
  onCursorChange,
  running = false,
}) => {
  const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
  const cursorDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState(language);
  const [fontSize, setFontSize] = useState(14);
  const [themeState, setThemeState] = useState(propTheme);

  useEffect(() => { setCurrentLanguage(language); }, [language]);
  useEffect(() => { setThemeState(propTheme); }, [propTheme]);
  useEffect(() => {
    setMounted(true);
    return () => {
      if (cursorDisposableRef.current) {
        cursorDisposableRef.current.dispose();
        cursorDisposableRef.current = null;
      }
    };
  }, []);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) onChange(value);
  }, [onChange]);

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

  const config =
    (LANGUAGE_CONFIG as Record<string, { label: string; monaco: string; icon: string }>)[currentLanguage] ||
    LANGUAGE_CONFIG.javascript;

  return (
    <div className="flex flex-col h-full w-full bg-background border border-border rounded-lg overflow-hidden">
      {showToolbar && (
        <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30 px-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{config.icon} {config.label}</span>
            <Badge variant="outline" className="text-xs">{language}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleFontSizeChange(-1)} aria-label="Decrease font size"><span className="text-xs">A-</span></Button>
            <span className="text-xs text-muted-foreground w-10 text-center">{fontSize}px</span>
            <Button variant="outline" size="sm" onClick={() => handleFontSizeChange(1)} aria-label="Increase font size"><span className="text-xs">A+</span></Button>
            <Select value={themeState} onValueChange={(v) => setThemeState(v as typeof themeState)}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Theme" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vs-dark">Dark (VS)</SelectItem>
                <SelectItem value="vs">Light (VS)</SelectItem>
                <SelectItem value="hc-black">High Contrast</SelectItem>
              </SelectContent>
            </Select>
            {onFormat && (
              <Button variant="outline" size="sm" onClick={onFormat} disabled={readOnly} title="Format code"><FileText className="w-4 h-4 mr-1" /> Format</Button>
            )}
            {onRun && (
              <Button variant={running ? "destructive" : "default"} size="sm" onClick={running ? undefined : onRun} disabled={running} className="gap-1">
                {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Running...</> : <><Play className="w-4 h-4" /> Run</>}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 relative min-h-0">
        <Editor
          onMount={(editor) => {
            editorRef.current = editor;
            if (cursorDisposableRef.current) cursorDisposableRef.current.dispose();
            if (onCursorChange) {
              cursorDisposableRef.current = editor.onDidChangeCursorPosition((e) => {
                onCursorChange({ line: e.position.lineNumber, column: e.position.column });
              });
            }
          }}
          height={height}
          language={config.monaco}
          theme={themeState}
          value={code}
          onChange={handleEditorChange}
          options={{
            readOnly,
            domReadOnly: readOnly,
            fontSize,
            lineNumbers: "on",
            minimap: { enabled: false },
            automaticLayout: true,
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: currentLanguage === "python" ? 4 : 2,
            insertSpaces: true,
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true },
            renderLineHighlight: "all",
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            contextmenu: false,
            quickSuggestions: { other: true, comments: false, strings: false },
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: "on",
            tabCompletion: "on",
            parameterHints: { enabled: true },
            formatOnPaste: false,
            formatOnType: false,
          }}
        />
        {readOnly && <div className="absolute inset-0 bg-background/10 pointer-events-none" aria-hidden />}
      </div>
    </div>
  );
};

export default CodeEditor;
