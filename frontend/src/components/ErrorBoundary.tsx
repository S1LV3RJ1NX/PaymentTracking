import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-surface flex min-h-screen items-center justify-center px-4">
          <div className="border-thin border-border bg-surface-card w-full max-w-sm rounded-xl px-6 py-8 text-center">
            <h2 className="text-accent-red mb-2 text-lg font-medium">Something went wrong</h2>
            <p className="text-text-secondary mb-4 text-sm">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-text text-surface-card rounded-lg px-4 py-2 text-sm font-medium"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
