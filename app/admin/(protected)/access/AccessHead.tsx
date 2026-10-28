"use client";

// The Access page head (r2b 18): the title, Add a door (on the Doors tab) and the tabs Doors | Feature card.

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

import { PageHead, Tabs } from "@/components/admin/ui";

export function AccessHead({ doors }: { doors: number | null }) {
  const feature = useSelectedLayoutSegment() === "feature";
  return (
    <>
      <PageHead
        title="Access"
        lead="The doors that open for members, and the card at the top of their Access page."
        right={
          feature ? undefined : (
            <Link className="ad-btn" href="/admin/access/new">
              Add a door
            </Link>
          )
        }
      />
      <Tabs
        label="Access"
        items={[
          { href: "/admin/access", label: "Doors", count: doors, current: !feature },
          { href: "/admin/access/feature", label: "Feature card", current: feature },
        ]}
      />
    </>
  );
}
