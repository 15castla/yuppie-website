"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

import { cn } from "@/lib/utils";
import { PhoneNumberField } from "@/components/PhoneNumberField";
import type { Member } from "@/app/members/require-member";
import { updateProfile } from "@/app/members/profile/actions";
import { CARD_CLASS, EYEBROW_CLASS, initialsFor } from "./ui";

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

const inputClasses =
  "w-full rounded-xl border-2 border-foreground/20 bg-cream px-4 py-3.5 text-base text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground";

const labelClasses =
  "text-left text-xs font-semibold uppercase tracking-wider text-foreground/60";

export function ProfileEditView({ member }: { member: Member }) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const fade = (delay: number) => ({
    initial: reduce ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.8, delay, ease: EASE_OUT_EXPO },
  });

  const [phone, setPhone] = useState<string | undefined>(member.phone ?? undefined);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [showPhotoNote, setShowPhotoNote] = useState(false);

  function handleSave(formData: FormData) {
    setSaveError(null);
    startSaving(async () => {
      formData.set("phone", phone ?? "");
      const result = await updateProfile(formData);
      if (!result.success) {
        setSaveError(result.error ?? "Something went wrong.");
        return;
      }
      router.push("/members/profile");
    });
  }

  return (
    <main className="relative z-10 flex flex-1 flex-col px-4 pt-28 pb-[130px] sm:px-6 sm:pt-32 md:pb-20">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <motion.div {...fade(0.1)}>
          <Link
            href="/members/profile"
            className="flex w-fit items-center gap-1 text-sm font-medium text-foreground/50 outline-none transition-colors hover:text-foreground hover:underline"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to profile
          </Link>
        </motion.div>

        <motion.div {...fade(0.15)} className="flex flex-col gap-2">
          <span className={EYEBROW_CLASS}>EDIT PROFILE</span>
          <h1 className="text-2xl font-extrabold text-foreground sm:text-3xl optical-trim">
            Edit your profile.
          </h1>
        </motion.div>

        <motion.form
          {...fade(0.25)}
          action={handleSave}
          className={cn(CARD_CLASS, "flex flex-col gap-6 p-5 sm:p-6")}
        >
          <div className="flex items-center gap-4">
            {member.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.avatar_url}
                alt={member.full_name ?? member.email}
                className="h-16 w-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-foreground text-lg font-bold text-background">
                {initialsFor(member.full_name)}
              </div>
            )}
            <div className="flex flex-col items-start gap-1">
              <button
                type="button"
                onClick={() => setShowPhotoNote(true)}
                className="text-sm font-bold text-foreground underline underline-offset-2 hover:text-foreground/70"
              >
                Change photo
              </button>
              {showPhotoNote && (
                <p className="text-xs text-foreground-muted">
                  Photo uploads aren&apos;t set up yet.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="full_name" className={labelClasses}>
              Full name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              defaultValue={member.full_name ?? ""}
              className={inputClasses}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="employer" className={labelClasses}>
              Employer / job title
            </label>
            <input
              id="employer"
              name="employer"
              type="text"
              placeholder="e.g. Product Designer, Monzo"
              defaultValue={member.employer ?? ""}
              className={inputClasses}
            />
            <p className="text-xs text-foreground-muted">
              Shown to other members on event guest lists.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="phone" className={labelClasses}>
              Phone
            </label>
            <PhoneInput
              id="phone"
              name="phone"
              value={phone}
              onChange={setPhone}
              defaultCountry="GB"
              international
              inputComponent={PhoneNumberField}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="bio" className={labelClasses}>
              Bio
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={4}
              defaultValue={member.bio ?? ""}
              className={cn(inputClasses, "resize-none")}
            />
          </div>

          {saveError && (
            <p className="text-sm font-medium text-red-700">{saveError}</p>
          )}

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-full bg-foreground px-6 py-2.5 text-sm font-bold text-background disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Save changes"}
            </button>
            <Link
              href="/members/profile"
              className="text-sm font-medium text-foreground/50 hover:text-foreground hover:underline"
            >
              Cancel
            </Link>
          </div>
        </motion.form>
      </div>
    </main>
  );
}
