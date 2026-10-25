"use client";

import { useEffect } from "react";

import { OpenInviteError } from "@/components/members/invite/browse-view";

// The shell stays around it. redirect() and notFound() never land here.
export default function OpenInviteRouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Open Invite error:", error, error.digest ? `(digest ${error.digest})` : "");
  }, [error]);
  return <OpenInviteError onRetry={retry} />;
}
