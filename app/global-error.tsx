"use client";

// Last-resort screen for when the root layout itself fails. It replaces
// the root layout, so it renders its own <html> and <body> and gets none of
// the global styles or fonts: everything it needs is inlined here.

import { useEffect } from "react";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error:", error, error.digest ? `(digest ${error.digest})` : "");
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          padding: 24,
          boxSizing: "border-box",
          background: "#FFD904",
          color: "#1B1512",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          textAlign: "center",
        }}
      >
        <title>Something went wrong</title>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Something went wrong.</h1>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            border: 0,
            borderRadius: 999,
            padding: "14px 32px",
            background: "#1B1512",
            color: "#FFD904",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
