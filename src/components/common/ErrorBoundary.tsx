import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode; inline?: boolean }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[Project Hub] UI error:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={this.props.inline ? "page" : "grid min-h-screen place-items-center p-6"}>
        <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
          <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-rose-500/10">
            <AlertTriangle className="size-5 text-rose-400" />
          </div>
          <p className="font-semibold">Something broke on this screen</p>
          <p className="mt-1 text-sm text-muted-foreground">Your data is safe — it's stored in this browser. Try again, or reload the app.</p>
          <pre className="mt-4 max-h-28 overflow-auto rounded-md bg-muted p-2 text-left font-mono text-[11px] text-muted-foreground">{this.state.error.message}</pre>
          <div className="mt-4 flex justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
              <RotateCcw /> Try again
            </Button>
            <Button size="sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
