"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary for the video player.
 * Catches React errors in the player component tree and displays a fallback UI
 * instead of crashing the entire app.
 */
export class PlayerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console in development
    if (process.env.NODE_ENV !== "production") {
      console.error("[PlayerError]", error, errorInfo);
    }
    // In production, you could send to an error tracking service here
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#0a0a0f",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            padding: "24px",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          {/* Error Icon */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>

          {/* Error Message */}
          <div style={{ maxWidth: "400px" }}>
            <h2
              style={{
                color: "#f0f0f5",
                fontSize: "18px",
                fontWeight: 700,
                margin: "0 0 8px",
              }}
            >
              Player Error
            </h2>
            <p
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: "14px",
                lineHeight: "1.5",
                margin: "0 0 20px",
              }}
            >
              The video player encountered an error and couldn&apos;t load.
              Please try refreshing the page.
            </p>

            {/* Reload Button */}
            <button
              onClick={this.handleReload}
              style={{
                padding: "10px 24px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#2563eb";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#3b82f6";
              }}
            >
              Reload Player
            </button>

            {/* Error Details (dev only) */}
            {process.env.NODE_ENV !== "production" && this.state.error && (
              <details
                style={{
                  marginTop: "20px",
                  textAlign: "left",
                  background: "rgba(0,0,0,0.3)",
                  padding: "12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              >
                <summary
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Error Details
                </summary>
                <pre
                  style={{
                    color: "#ef4444",
                    fontSize: "11px",
                    marginTop: "8px",
                    overflow: "auto",
                    maxHeight: "200px",
                  }}
                >
                  {this.state.error.toString()}
                  {"\n"}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
