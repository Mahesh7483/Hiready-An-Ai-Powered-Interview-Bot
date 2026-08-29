import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Terminal, ChevronDown, ChevronUp, Copy, Check, X, Trash2, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";

export interface TestCaseResult {
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
  executionTime?: number;
  memoryUsed?: number;
  error?: string;
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
  onCopy,
  onRetry,
  maximized = false,
  onMaximizeToggle,
}) => {
  const [stdoutExpanded, setStdoutExpanded] = useState(true);
  const [stderrExpanded, setStderrExpanded] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const formatOutput = (text: string) => {
    return text
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/\n/g, "<br/>")
      .replace(/ /g, "&nbsp;");
  };

  if (!result) {
    return (
      <Card className="border-border h-full flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-muted-foreground" />
              <span>Execution Output</span>
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              Ready
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground py-12">
            <p className="text-sm">No execution yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Run code to see output here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { success, stdout, stderr, exitCode, executionTime, timedOut, testResults } = result;
  const hasTests = testResults && testResults.length > 0;
  const passedTests = testResults?.filter(t => t.passed).length || 0;
  const totalTests = testResults?.length || 0;

  return (
    <Card className="border-border h-full flex flex-col" style={maximized ? { position: 'fixed', top: 20, right: 20, left: 20, bottom: 20, zIndex: 50, borderRadius: '8px' } : {}}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-muted-foreground" />
            <span>Execution Output</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {result && (
              <Badge 
                variant={result.success ? "success" : "destructive"} 
                className="text-xs"
              >
                {result.success ? "Passed" : "Failed"}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onClear}
              className="h-7 px-2"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onMaximizeToggle}
              className="h-7 px-2"
            >
              {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </CardHeader>

        <CardContent className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Status Bar */}
          <div className="flex items-center gap-4 p-2 bg-muted/30 border-b border-border text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="font-mono">{result.executionTime}ms</span>
              <span className="text-muted-foreground/50">|</span>
              <span className="font-mono">{result.exitCode === 0 ? "Exit 0" : `Exit ${result.exitCode}`}</span>
              {result.timedOut && (
                <Badge variant="destructive" className="ml-2 text-[10px]">
                  Timed Out
                </Badge>
              )}
            </div>
            {result.testResults && (
              <div className="flex items-center gap-2 ml-auto">
                <Badge variant={result.success ? "success" : "destructive"} className="text-[10px]">
                  {result.testResults.filter(t => t.passed).length}/{result.testResults.length}
                </Badge>
              </div>
            )}
          </div>

          {/* Test Results */}
          {result.testResults && result.testResults.length > 0 && (
            <div className="border-t border-border p-2 max-h-[200px] overflow-y-auto bg-muted/20">
              <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground border-b border-border">
                <span>Test Results ({passedTests}/{result.testResults.length})</span>
                <Badge variant={passedTests === result.testResults.length ? "success" : "warning"} className="text-[10px]">
                  {passedTests}/{totalTests}
                </Badge>
              </div>
              <div className="max-h-[150px] overflow-y-auto">
                {result.testResults.map((test, index) => (
                  <div key={index} className="px-2 py-1.5 border-b border-border/50 hover:bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-muted-foreground">Test {index + 1}</span>
                      <Badge variant={test.passed ? "success" : "destructive"} className="text-[10px]">
                        {test.passed ? "Passed" : "Failed"}
                      </Badge>
                    </div>
                    {!test.passed && test.error && (
                      <div className="px-2 py-1 text-xs text-destructive/80 font-mono bg-destructive/5 rounded">
                        {test.error}
                      </div>
                    )}
                    {test.executionTime && (
                      <div className="px-2 pb-1 text-[10px] text-muted-foreground font-mono">
                        {test.executionTime}ms {test.memoryUsed ? `· ${test.memoryUsed}MB` : ""}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stdout */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1 border-b border-border">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                  <span className="text-[10px]">STDOUT</span>
                </Badge>
                <span className="text-[10px] text-muted-foreground">{stdout.split('\n').filter(Boolean).length} lines</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStdoutExpanded(!stdoutExpanded)}
                  className="h-6 px-2 text-xs"
                >
                  {stdoutExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(stdout)}
                  className="h-6 px-2"
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div className={stdoutExpanded ? "flex-1 min-h-0 overflow-auto" : "hidden"}>
              <pre className="p-3 font-mono text-xs text-foreground font-mono whitespace-pre-wrap break-all text-foreground">
                {stdout || <span className="text-muted-foreground/50 text-center py-8">No output</span>}
              </pre>
            </div>
          </div>

          {/* Stderr */}
          {stderr && (
            <div className="border-t border-border">
              <div className="flex items-center justify-between px-2 py-1 border-b border-border">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                  <span className="text-[10px]">STDERR</span>
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStderrExpanded(!stderrExpanded)}
                  className="h-6 px-2 text-xs"
                >
                  {stderrExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(stderr)}
                  className="h-6 px-2"
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className={stderrExpanded ? "p-3 font-mono text-xs text-destructive whitespace-pre-wrap break-all text-destructive" : "hidden"}>
                {stderr}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 p-2 border-t border-border bg-muted/30">
            {onRetry && (
              <Button size="sm" onClick={onRetry} disabled={isRunning}>
                <Loader2 className="w-3.5 h-3.5 mr-1" />
                Retry
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClear}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(result.stdout + (result.stderr ? '\n--- STDERR ---\n' + result.stderr : ''))}
            >
              <Copy className="w-3.5 h-3.5 mr-1" /> Copy All
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

export default ExecutionOutput;