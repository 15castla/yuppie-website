"use client";

// An iframe that grows to the email's height once it loads (same origin), so
// a whole email shows at its real width with no inner scroll bar.
import { useEffect, useRef } from "react";

export function AutoFrame({ src, width, title }: { src: string; width: number; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const fit = () => {
    const frame = ref.current;
    const doc = frame?.contentDocument;
    if (frame && doc?.documentElement) frame.style.height = `${doc.documentElement.scrollHeight}px`;
  };
  // The frame may finish loading before React hydrates and attaches onLoad.
  useEffect(() => {
    if (ref.current?.contentDocument?.readyState === "complete") fit();
  });
  return (
    <iframe
      ref={ref}
      src={src}
      title={title}
      width={width}
      height={1200}
      onLoad={fit}
      className="pve-frame"
      style={{ width, height: 1200 }}
    />
  );
}
