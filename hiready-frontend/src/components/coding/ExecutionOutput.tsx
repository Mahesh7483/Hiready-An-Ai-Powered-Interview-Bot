import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Terminal, ChevronDown, ChevronUp, Copy, X, Trash2, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";

export interface TestCaseResult {
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
  executionTime?: number;
  memoryUsed?: number;
  error?: string;
  isHidden?: boolean;
}

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  timedOut: boolean;
  testResults?: TestCaseResult[];
}

interface ExecutionOutputProps {
  result: ExecutionResult | null;
  isRunning: boolean;
  onClear: () => void;
  onCopy?: () => void;
  onRetry?: () => void;
  maximized?: boolean;
  onMaximizeToggle?: () => void;
}

export const ExecutionOutput: React.FC<ExecutionOutputProps> = ({
  result,
  isRunning,
  onClear,
  onRetry,
  maximized = false,
  onMaximizeToggle,
}) => {
  const [stdoutExpanded, setStdoutExpanded] = useState(true);
  const [stderrExpanded, setStderrExpanded] = useState(true);

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
      }
      toast.success("Copied to clipboard");
    } catch { toast.error("Failed to copy"); }
  };

  if (!result) {
    return (
      <Card className="border-border h-full flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Terminal className="w-4 h-4 text-muted-foreground" /><span>Execution Output</span></CardTitle>
            <Badge variant="outline" className="text-xs">{isRunning ? "Running..." : "Ready"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          {isRunning ? (
            <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" /><p className="text-sm text-muted-foreground">Executing code...</p></div>
          ) : (
            <div className="text-center text-muted-foreground py-8"><p className="text-sm">No execution yet</p><p className="text-xs text-muted-foreground/60 mt-1">Run code to see output here</p></div>
          )}
        </CardContent>
      </Card>
    );
  }

  const { stdout, stderr, testResults } = result;
  const passedTests = testResults?.filter(t => t.passed).length || 0;
  const totalTests = testResults?.length || 0;
  const lines = stdout ? stdout.split('\n').length : 0;

  return (
    <Card className="border-border h-full flex flex-col" style={maximized ? { position: 'fixed', top: 20, right: 20, left: 20, bottom: 20, zIndex: 50, borderRadius: '8px', background: 'hsl(var(--background))' } : {}}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Terminal className="w-4 h-4 text-muted-foreground" /><span>Execution Output</span></CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={result.success ? "default" : "destructive"} className="text-xs">{result.success ? "Passed" : "Failed"}</Badge>
            <Button variant="outline" size="sm" onClick={onClear} className="h-7 px-2"><X className="w-3.5 h-3.5 mr-1" />Clear</Button>
            <Button variant="outline" size="sm" onClick={onMaximizeToggle} className="h-7 px-2">{maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center gap-4 p-2 bg-muted/30 border-b border-border text-xs text-muted-foreground">
          <span className="font-mono">{result.executionTime}ms</span><span className="text-muted-foreground/50">|</span><span className="font-mono">{result.exitCode === 0 ? "Exit 0" : `Exit ${result.exitCode}`}</span>
          {result.timedOut && <Badge variant="destructive" className="ml-2 text-[10px]">Timed Out</Badge>}
          {totalTests > 0 && <Badge variant={result.success ? "default" : "destructive"} className="text-[10px] ml-auto">{passedTests}/{totalTests} tests</Badge>}
        </div>

        {testResults && testResults.length > 0 && (
          <div className="border-b border-border p-2 max-h-[200px] overflow-y-auto bg-muted/20">
            <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground border-b border-border">
              <span>Test Results ({passedTests}/{totalTests})</span>
              <Badge variant={passedTests === totalTests ? "default" : "destructive"} className="text-[10px]">{passedTests}/{totalTests}</Badge>
            </div>
            <div className="space-y-1 mt-1">
              {testResults.map((test, index) => (
                <div key={index} className="px-2 py-1.5 border border-border/50 rounded bg-background hover:bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono">Test {index + 1} {test.isHidden && <span className="text-muted-foreground">(hidden)</span>}</span>
                    <Badge variant={test.passed ? "default" : "destructive"} className="text-[10px]">{test.passed ? "Passed" : "Failed"}</Badge>
                  </div>
                  {!test.passed && !test.isHidden && (
                    <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <div><span className="text-muted-foreground">Expected:</span><pre className="whitespace-pre-wrap break-all bg-muted p-1 rounded">{test.expected || "(empty)"}</pre></div>
                      <div><span className="text-muted-foreground">Actual:</span><pre className="whitespace-pre-wrap break-all bg-muted p-1 rounded">{test.actual || "(empty)"}</pre></div>
                    </div>
                  )}
                  {test.isHidden && !test.passed && <p className="text-[11px] text-muted-foreground mt-1">Hidden test — output not shown</p>}
                  {test.error && <div className="mt-1 px-2 py-1 text-xs text-destructive/80 font-mono bg-destructive/5 rounded">{test.error}</div>}
                  {test.executionTime !== undefined && <div className="text-[10px] text-muted-foreground font-mono mt-1">{test.executionTime}ms</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden border-t border-border">
          <div className="flex items-center justify-between px-2 py-1 border-b border-border">
            <div className="flex items-center gap-2"><Badge variant="outline" className="text-[10px]">STDOUT</Badge><span className="text-[10px] text-muted-foreground">{lines} lines</span></div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setStdoutExpanded(!stdoutExpanded)} className="h-6 px-2 text-xs">{stdoutExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</Button>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(stdout)} className="h-6 px-2"><Copy className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
          <div className={stdoutExpanded ? "flex-1 min-h-0 overflow-auto p-3" : "hidden"}>
            <pre className="font-mono text-xs whitespace-pre-wrap break-all">{stdout || <span className="text-muted-foreground/50">No output</span>}</pre>
          </div>
        </div>

        {stderr && (
          <div className="border-t border-border">
            <div className="flex items-center justify-between px-2 py-1 border-b border-border">
              <Badge variant="outline" className="text-[10px]">STDERR</Badge>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setStderrExpanded(!stderrExpanded)} className="h-6 px-2">{stderrExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</Button>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(stderr)} className="h-6 px-2"><Copy className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
            <div className={stderrExpanded ? "p-3 font-mono text-xs text-destructive whitespace-pre-wrap break-all" : "hidden"}>{stderr}</div>
          </div>
        )}

        <div className="flex items-center gap-2 p-2 border-t border-border bg-muted/30">
          {onRetry && <Button size="sm" onClick={onRetry} disabled={isRunning}><Loader2 className="w-3.5 h-3.5 mr-1" />Retry</Button>}
          <Button variant="outline" size="sm" onClick={onClear}><Trash2 className="w-3.5 h-3.5 mr-1" />Clear</Button>
          <Button variant="outline" size="sm" onClick={() => copyToClipboard(result.stdout + (result.stderr ? '\n--- STDERR ---\n' + result.stderr : ''))}><Copy className="w-3.5 h-3.5 mr-1" />Copy All</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExecutionOutput;
