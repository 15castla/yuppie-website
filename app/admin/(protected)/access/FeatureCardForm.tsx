"use client";

// The Feature card form (r2b 18), in the admin look. What it features works as today: one event, discount or
// door picked by name (the design's "first one in that list" would change the members' page, which is not
// this phase's), with an optional label for the pill.

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { setFeatureCard } from "@/app/admin/feature-card-actions";
import { Banner, BusyButton } from "@/components/admin/bits";
import { Icon } from "@/components/admin/icons";
import { Pill, SavedLine, Section } from "@/components/admin/ui";

type Kind = "event" | "discount" | "access";
type Option = { id: string; label: string };

const STANDARD: Record<Kind, string> = { event: "Featured event", discount: "Featured discount", access: "Featured access" };
const GROUP: Record<Kind, string> = { event: "Events", discount: "Discounts", access: "Access" };

export function FeatureCardForm({
  options,
  current,
}: {
  options: Record<Kind, Option[]>;
  current: { type: Kind; id: string; label: string | null } | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(current ? `${current.type}:${current.id}` : "");
  const [label, setLabel] = useState(current?.label ?? "");
  const [saving, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = (selected.split(":")[0] || null) as Kind | null;
  const all = { ...options };
  if (current && !all[current.type].some((o) => o.id === current.id)) {
    all[current.type] = [{ id: current.id, label: "The one featured now (no longer listed)" }, ...all[current.type]];
  }
  const chosen = kind ? all[kind].find((o) => `${kind}:${o.id}` === selected) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const [contentType, contentId] = selected.split(":");
    const fd = new FormData();
    fd.set("content_type", contentType ?? "");
    fd.set("content_id", contentId ?? "");
    fd.set("label", label);
    start(async () => {
      const result = await setFeatureCard(fd).catch(() => ({ success: false, error: "" }));
      if (!result.success) {
        setError(result.error || "We couldn’t save the feature card. Try again in a moment.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Feature card">
      {error && <Banner title="We couldn’t save that.">{error}</Banner>}
      <div className="ad-form c2">
        <div className="ad-field">
          <label htmlFor="feature-pick">Feature</label>
          <span className="ad-select">
            <select
              id="feature-pick"
              className="ad-input"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setSaved(false);
              }}
            >
              <option value="">Nothing</option>
              {(Object.keys(GROUP) as Kind[]).map((k) =>
                all[k].length ? (
                  <optgroup key={k} label={GROUP[k]}>
                    {all[k].map((o) => (
                      <option key={o.id} value={`${k}:${o.id}`}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null,
              )}
            </select>
            <Icon name="chevron-down" size={20} />
          </span>
          <p className="hint">Pick Nothing to hide the card.</p>
        </div>
        <div className="ad-field">
          <label htmlFor="feature-label">Label (optional)</label>
          <input
            id="feature-label"
            className="ad-input"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setSaved(false);
            }}
            disabled={!kind}
            placeholder={kind ? STANDARD[kind] : ""}
            autoComplete="off"
            maxLength={40}
          />
          <p className="hint">The words on the pill. Leave it empty for the standard ones.</p>
        </div>
      </div>
      <Section title="How members see it" hint={kind ? "Updates as you choose." : undefined}>
        {kind && chosen ? (
          <div className="ad-well" style={{ padding: "16px 14px" }}>
            <Pill kind="ink">{label.trim() || STANDARD[kind]}</Pill>
            <p style={{ marginTop: 10, font: "800 20px/1.2 var(--font-body)" }}>{chosen.label}</p>
          </div>
        ) : (
          <p className="ad-hint">No card. The Access page opens straight on the list.</p>
        )}
      </Section>
      {saved && (
        <div style={{ marginTop: 22 }}>
          <SavedLine>{kind ? "Saved. Members see the new card now." : "Saved. Members see no card now."}</SavedLine>
        </div>
      )}
      <div className="ad-acts" style={{ marginTop: 26 }}>
        <BusyButton type="submit" className="sm" busy={saving} busyLabel="Saving…">
          Save feature card
        </BusyButton>
      </div>
    </form>
  );
}
