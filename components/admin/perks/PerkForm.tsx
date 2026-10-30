"use client";

// The discount and door card's form (r2b 18): Name, Area, Category (or a new one) or Type of access, Headline,
// Badge and Logo (discounts), a preview drawn as the members' row ("Updates as you type"), Order with Move up
// and Move down (B-D19), Save changes, and Delete behind a confirm (B-D17).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import { createPerk, deletePerk, movePerk, removePerkLogo, updatePerk, uploadPerkLogo, type PerkField } from "@/app/admin/discounts-actions";
import { Banner, BusyButton } from "../bits";
import { Dialog } from "../dialog";
import { Icon } from "../icons";
import { ErrorLine, Pill, SavedLine, Section } from "../ui";
import { PerkTile } from "./perk-tile";
import { ACCESS_KIND_WORDS, PERK_WORDS, perkMeta, type AccessKind, type PerkRow, type PerkType } from "./perk-types";

type Values = { name: string; area: string; category: string; access_kind: AccessKind | ""; headline: string; badge: string };

function Field({ id, label, hint, error, span2, children }: { id: string; label: string; hint?: ReactNode; error?: string; span2?: boolean; children: ReactNode }) {
  return (
    <div className={`ad-field${span2 ? " span2" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p className="emsg" role="alert" id={`${id}-msg`}>
          <Icon name="circle-alert" size={16} />
          <span>{error}</span>
        </p>
      ) : (
        hint && (
          <div className="hint" id={`${id}-msg`}>
            {hint}
          </div>
        )
      )}
    </div>
  );
}

export function PerkForm({
  type,
  perk,
  categories = [],
  position,
  total,
}: {
  type: PerkType;
  /** Absent for a new one. */
  perk?: PerkRow;
  categories?: string[];
  position?: number;
  total?: number;
}) {
  const router = useRouter();
  const words = PERK_WORDS[type];
  const isNew = !perk;
  const [values, setValues] = useState<Values>({
    name: perk?.name ?? "",
    area: perk?.area ?? "",
    category: perk?.category ?? "",
    access_kind: perk?.access_kind ?? "",
    headline: perk?.headline ?? "",
    badge: perk?.badge ?? "",
  });
  const [newCategory, setNewCategory] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<PerkField | "form", string>>>({});
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, startLogo] = useTransition();
  const [logoError, setLogoError] = useState<string | null>(null);
  const [moving, startMoving] = useTransition();
  const [moveError, setMoveError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const idp = perk?.id ?? `new-${type}`;

  useEffect(() => () => {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
  }, [logoUrl]);

  const set = (key: keyof Values) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    if (key === "category" && value === "__new__") {
      setNewCategory(true);
      setValues((v) => ({ ...v, category: "" }));
      return;
    }
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  };
  const props = (name: PerkField | "badge") => ({
    id: `${idp}-${name}`,
    className: `ad-input${errors[name as PerkField] ? " is-error" : ""}`,
    "aria-invalid": errors[name as PerkField] ? true : undefined,
    "aria-describedby": `${idp}-${name}-msg`,
  });

  function check(): typeof errors {
    const e: typeof errors = {};
    if (!values.name.trim()) e.name = "Add a name.";
    if (!values.area.trim()) e.area = "Add the area.";
    if (type === "discount" && !values.category.trim()) e.category = newCategory ? "Name the new category." : "Choose a category.";
    if (type === "access" && !values.access_kind) e.access_kind = "Choose the type of access.";
    if (!values.headline.trim()) e.headline = "Add a headline.";
    return e;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = check();
    setErrors(found);
    setSaved(false);
    if (Object.keys(found).length) {
      document.getElementById(`${idp}-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    const fd = new FormData();
    if (perk) fd.set("id", perk.id);
    fd.set("type", type);
    fd.set("name", values.name);
    fd.set("area", values.area);
    fd.set("category", values.category);
    fd.set("access_kind", values.access_kind);
    fd.set("headline", values.headline);
    fd.set("badge", values.badge);
    if (isNew && logo && type === "discount") fd.set("logo", logo);
    startSaving(async () => {
      if (isNew) {
        const result = await createPerk(fd).catch(() => ({ success: false, error: "", field: undefined, id: undefined }));
        if (!result.success || !result.id) {
          setErrors(result.field ? { [result.field]: result.error } : { form: result.error || "We couldn’t add it. Try again in a moment." });
          return;
        }
        router.push(`${words.base}/${result.id}?created=1`, { scroll: false });
        router.refresh();
        return;
      }
      const result = await updatePerk(fd).catch(() => ({ success: false, error: "", field: undefined }));
      if (!result.success) {
        setErrors(result.field ? { [result.field]: result.error } : { form: result.error || "We couldn’t save that. Try again in a moment." });
        return;
      }
      setSaved(true);
      setNewCategory(false);
      router.refresh();
    });
  }

  function chooseLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setLogoError(null);
    if (isNew) {
      setLogo(file);
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return file ? URL.createObjectURL(file) : null;
      });
      return;
    }
    if (!file || !perk) return;
    const fd = new FormData();
    fd.set("id", perk.id);
    fd.set("logo", file);
    startLogo(async () => {
      const result = await uploadPerkLogo(fd).catch(() => ({ success: false, error: "" }));
      if (fileRef.current) fileRef.current.value = "";
      if (!result.success) setLogoError(result.error || "We couldn’t upload the logo. Try again in a moment.");
      else router.refresh();
    });
  }

  function removeLogo() {
    setLogoError(null);
    if (isNew) {
      setLogo(null);
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (!perk) return;
    startLogo(async () => {
      const result = await removePerkLogo(perk.id).catch(() => ({ success: false, error: "" }));
      if (!result.success) setLogoError(result.error || "We couldn’t remove the logo. Try again in a moment.");
      else router.refresh();
    });
  }

  function move(direction: "up" | "down") {
    if (!perk) return;
    setMoveError(null);
    startMoving(async () => {
      const result = await movePerk(perk.id, direction).catch(() => ({ success: false as const, error: "" }));
      if (!result.success) setMoveError(result.error || "We couldn’t save that order. Try again in a moment.");
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!perk) return;
    const fd = new FormData();
    fd.set("id", perk.id);
    startDeleting(async () => {
      const result = await deletePerk(fd).catch(() => ({ success: false, error: "" }));
      setDeleteOpen(false);
      if (!result.success) {
        setDeleteError(result.error || "We couldn’t delete it. Try again in a moment.");
        return;
      }
      router.push(words.base, { scroll: false });
      router.refresh();
    });
  }

  const shownLogo = isNew ? logoUrl : perk?.logo_url ?? null;
  const preview: PerkRow = {
    id: perk?.id ?? "preview",
    display_order: perk?.display_order ?? 0,
    name: values.name.trim() || (type === "discount" ? "Venue name" : "Door name"),
    category: values.category.trim() || (type === "discount" ? "Category" : null),
    area: values.area.trim() || "Area",
    type,
    access_kind: (values.access_kind || null) as AccessKind | null,
    headline: values.headline.trim() || "What members get",
    badge: values.badge.trim() || null,
    logo_url: shownLogo,
  };
  const categoryOptions = Array.from(new Set([...categories, ...(perk?.category ? [perk.category] : [])])).sort((a, b) => a.localeCompare(b));

  return (
    <form onSubmit={onSubmit} noValidate aria-label={isNew ? `New ${words.one}` : `${words.one} details`}>
      {errors.form && <Banner title="We couldn’t save that.">{errors.form}</Banner>}
      <div className="ad-form c2">
        <Field id={`${idp}-name`} label="Name" error={errors.name} span2>
          <input {...props("name")} value={values.name} onChange={set("name")} placeholder={isNew ? (type === "discount" ? "Bellina Trattoria" : "Petra Rooftop Bar") : undefined} autoComplete="off" />
        </Field>
        <Field id={`${idp}-area`} label="Area" error={errors.area}>
          <input {...props("area")} value={values.area} onChange={set("area")} placeholder={isNew ? "Northgate" : undefined} autoComplete="off" />
        </Field>
        {type === "access" ? (
          <Field id={`${idp}-access_kind`} label="Type of access" hint="Decides which group it sits in on the Access page." error={errors.access_kind}>
            <span className="ad-select">
              <select {...props("access_kind")} value={values.access_kind} onChange={set("access_kind")}>
                <option value="" disabled>
                  Choose one
                </option>
                {(Object.keys(ACCESS_KIND_WORDS) as AccessKind[]).map((k) => (
                  <option key={k} value={k}>
                    {ACCESS_KIND_WORDS[k]}
                  </option>
                ))}
              </select>
              <Icon name="chevron-down" size={20} />
            </span>
          </Field>
        ) : newCategory ? (
          <Field
            id={`${idp}-category`}
            label="New category"
            error={errors.category}
            hint={
              <>
                Members see it as a new filter on the Discounts page. It can’t be removed here once added.{" "}
                <button
                  type="button"
                  className="ad-link"
                  onClick={() => {
                    setNewCategory(false);
                    setValues((v) => ({ ...v, category: perk?.category ?? "" }));
                  }}
                >
                  Choose from the list instead
                </button>
              </>
            }
          >
            <input {...props("category")} value={values.category} onChange={set("category")} placeholder="Beauty" autoComplete="off" />
          </Field>
        ) : (
          <Field
            id={`${idp}-category`}
            label="Category"
            error={errors.category}
            hint={
              <button
                type="button"
                className="ad-link"
                onClick={() => {
                  setNewCategory(true);
                  setValues((v) => ({ ...v, category: "" }));
                }}
              >
                Add a new category
              </button>
            }
          >
            <span className="ad-select">
              <select {...props("category")} value={values.category} onChange={set("category")}>
                <option value="" disabled>
                  Choose a category
                </option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Icon name="chevron-down" size={20} />
            </span>
          </Field>
        )}
        <Field id={`${idp}-headline`} label="Headline" hint="What members read. One line." error={errors.headline} span2>
          <input {...props("headline")} value={values.headline} onChange={set("headline")} placeholder={isNew ? "20% off supper, Monday to Thursday" : undefined} autoComplete="off" />
        </Field>
        {type === "discount" && (
          <>
            <Field id={`${idp}-badge`} label="Badge" hint="Optional. Short, like 20% or 2-for-1.">
              <input {...props("badge")} value={values.badge} onChange={set("badge")} placeholder="20%" autoComplete="off" maxLength={12} />
            </Field>
            <div className="ad-field">
              <span className="lb">Logo</span>
              <div className="ad-logo">
                <PerkTile perk={preview} logoUrl={shownLogo} />
                <input ref={fileRef} className="ad-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={chooseLogo} tabIndex={-1} aria-label="Choose a logo" />
                <BusyButton type="button" className="sm secondary" busy={logoBusy} busyLabel="Uploading…" onClick={() => fileRef.current?.click()}>
                  {shownLogo ? "Replace logo" : "Upload logo"}
                </BusyButton>
                {shownLogo && (
                  <button type="button" className="ad-btn sm secondary" disabled={logoBusy} onClick={removeLogo}>
                    Remove
                  </button>
                )}
              </div>
              <p className="hint">Optional. Square, at least 96 pixels. Without one, members see the first letter.</p>
              {logoError && <ErrorLine>{logoError}</ErrorLine>}
            </div>
          </>
        )}
      </div>

      <Section title="How members see it" hint="Updates as you type.">
        <div className="ad-well">
          <div className="ad-dcrow">
            <PerkTile perk={preview} logoUrl={shownLogo} />
            <span className="nm">{preview.name}</span>
            {preview.badge && (
              <span className="pl">
                <Pill kind="ink">{preview.badge}</Pill>
              </span>
            )}
            <span className="of">{preview.headline}</span>
            <span className="mt">{perkMeta(preview)}</span>
          </div>
        </div>
      </Section>

      {!isNew && position !== undefined && total !== undefined && (
        <Section title="Order">
          <p className="ad-hint">
            Position {position} of {total}. You can also drag it in the list.
          </p>
          <div className="ad-acts" style={{ marginTop: 12 }}>
            <button type="button" className="ad-btn sm secondary" disabled={moving || position <= 1} onClick={() => move("up")}>
              Move up
            </button>
            <button type="button" className="ad-btn sm secondary" disabled={moving || position >= total} onClick={() => move("down")}>
              Move down
            </button>
          </div>
          {moveError && <ErrorLine>{moveError}</ErrorLine>}
        </Section>
      )}

      {saved && (
        <div style={{ marginTop: 22 }}>
          <SavedLine>Saved. Members see it now.</SavedLine>
        </div>
      )}
      {deleteError && <Banner title={`The ${words.one} wasn’t deleted.`}>{deleteError}</Banner>}
      <div className="ad-acts" style={{ marginTop: 26 }}>
        <BusyButton type="submit" className="sm" busy={saving} busyLabel={isNew ? "Adding…" : "Saving…"}>
          {isNew ? `Add ${words.one}` : "Save changes"}
        </BusyButton>
        {isNew ? (
          <Link className="ad-btn sm secondary" href={words.base}>
            Cancel
          </Link>
        ) : (
          <button type="button" className="ad-btn sm danger" onClick={() => setDeleteOpen(true)}>
            Delete {words.one}
          </button>
        )}
      </div>

      {perk && (
        <Dialog
          open={deleteOpen}
          title={`Delete ${perk.name}?`}
          onClose={() => setDeleteOpen(false)}
          busy={deleting}
          testId="dialog-delete-perk"
          actions={
            <>
              <BusyButton type="button" className="danger solid" busy={deleting} busyLabel="Deleting…" onClick={confirmDelete}>
                Delete {words.one}
              </BusyButton>
              <button type="button" className="ad-btn secondary" disabled={deleting} onClick={() => setDeleteOpen(false)}>
                Keep it
              </button>
            </>
          }
        >
          <p className="ad-p">Members stop seeing this {words.one} straight away. It can’t be undone.</p>
        </Dialog>
      )}
    </form>
  );
}
