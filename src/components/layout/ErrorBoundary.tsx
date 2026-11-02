/**
 * Error boundary — the one place React still requires a class component.
 *
 * Without props it renders the full-screen fallback (used around the whole
 * app). With `fallback` it renders that instead, e.g. inline in a single view,
 * and `resetKey` clears the error when it changes (switching views).
 */

import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
  resetKey?: unknown;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError && this.props.fallback && this.state.error) {
      return this.props.fallback(this.state.error);
    }
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-th-base px-8 text-center">
          <h1 className="text-lg font-semibold text-th-fg">Something went wrong.</h1>
          <pre className="max-w-xl overflow-auto rounded border border-th-border bg-th-surface px-4 py-3 text-left font-mono text-xs text-red-600 dark:text-red-400">
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Reload
          </button>
          <p className="text-xs text-th-fg-4">
            Your ontologies are saved in IndexedDB and will be restored on reload.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
