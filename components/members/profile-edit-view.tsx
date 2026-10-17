"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

import { cn } from "@/lib/utils";
import { PhoneNumberField } from "@/components/PhoneNumberField";
import type { Member } from "@/app/members/require-member";
import {
  updateProfile,
  updateAvatar,
  removeAvatar,
  requestEmailChange,
  verifyEmailChange,
} from "@/app/members/profile/actions";
import { CARD_CLASS, MEMBERS_MAIN_CLASS, initialsFor } from "./ui";
import { EmailChangeVerify } from "./email-change-verify";

const inputClasses =
  "w-full rounded-xl border-2 border-foreground/20 bg-cream px-4 py-3.5 text-base text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground";

const labelClasses =
  "text-left text-xs font-semibold uppercase tracking-wider text-foreground/60";

export function ProfileEditView({ member }: { member: Member }) {
  const router = useRouter();

  const [phone, setPhone] = useState<string | undefined>(member.phone ?? undefined);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  // A changed email isn't saved with the other fields: it starts Supabase
  // Auth's email-change flow, and the card switches to code entry
  // (EmailChangeVerify) until the change is confirmed. The field is
  // controlled because a form action resets uncontrolled inputs once it
  // finishes, which would wipe a typed new address when it's rejected.
  const [email, setEmail] = useState(member.email);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [changedEmail, setChangedEmail] = useState<string | null>(null);

  const [avatarUrl, setAvatarUrl] = useState(member.avatar_url);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isUploadingPhoto, startPhotoUpload] = useTransition();

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setPhotoError(null);
    startPhotoUpload(async () => {
      const formData = new FormData();
      formData.set("photo", file);
      const result = await updateAvatar(formData);
      if (!result.success) {
        setPhotoError(result.error ?? "Something went wrong.");
        return;
      }
      setAvatarUrl(result.url ?? null);
      router.refresh();
    });
  }

  function handleRemovePhoto() {
    if (!window.confirm("Remove your profile photo and go back to your initials?")) return;

    setPhotoError(null);
    startPhotoUpload(async () => {
      const result = await removeAvatar();
      if (!result.success) {
        setPhotoError(result.error ?? "Something went wrong.");
        return;
      }
      setAvatarUrl(null);
      router.refresh();
    });
  }

  function handleSave(formData: FormData) {
    setSaveError(null);
    setEmailError(null);
    startSaving(async () => {
      formData.set("phone", phone ?? "");
      const result = await updateProfile(formData);
      if (!result.success) {
        setSaveError(result.error ?? "Something went wrong.");
        return;
      }

      const newEmail = email.trim().toLowerCase();
      if (newEmail && newEmail !== member.email.toLowerCase()) {
        const emailResult = await requestEmailChange(newEmail);
        if (!emailResult.success) {
          // The other fields are saved; refresh so the reset form shows
          // them rather than their old values.
          router.refresh();
          setEmailError(
            `${emailResult.error ?? "Something went wrong."} Your other changes are saved.`,
          );
          return;
        }
        setPendingEmail(newEmail);
        return;
      }

      router.push("/members/profile");
    });
  }

  if (pendingEmail || changedEmail) {
    return (
      <main className={MEMBERS_MAIN_CLASS}>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <h1 className="text-2xl font-extrabold text-foreground sm:text-3xl optical-trim">
            Edit your profile.
          </h1>
          <div className={cn(CARD_CLASS, "flex flex-col gap-4 p-5 sm:p-6")}>
            {changedEmail ? (
              <>
                <h2 className="text-base font-bold text-foreground">Email updated</h2>
                <p className="text-sm text-foreground-muted">
                  You&apos;ll sign in with {changedEmail} from now on. Your other
                  changes are saved too.
                </p>
                <Link
                  href="/members/profile"
                  className="w-fit rounded-full bg-foreground px-6 py-2.5 text-sm font-bold text-background"
                >
                  Back to profile
                </Link>
              </>
            ) : (
              <EmailChangeVerify
                currentEmail={member.email}
                newEmail={pendingEmail!}
                verify={verifyEmailChange}
                resend={() => requestEmailChange(pendingEmail!)}
                onDone={(email) => {
                  setPendingEmail(null);
                  setChangedEmail(email);
                  router.refresh();
                }}
                onCancel={() => router.push("/members/profile")}
              />
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={MEMBERS_MAIN_CLASS}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div>
          <Link
            href="/members/profile"
            className="flex w-fit items-center gap-1 text-sm font-medium text-foreground/50 outline-none transition-colors hover:text-foreground hover:underline"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to profile
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-extrabold text-foreground sm:text-3xl optical-trim">
            Edit your profile.
          </h1>
        </div>

        <form
          action={handleSave}
          // Errors show inline (e.g. under the email field), not as the
          // browser's own validation popups.
          noValidate
          className={cn(CARD_CLASS, "flex flex-col gap-6 p-5 sm:p-6")}
        >
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={member.full_name ?? member.email}
                className="h-16 w-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-foreground text-lg font-bold text-background">
                {initialsFor(member.full_name)}
              </div>
            )}
            <div className="flex flex-col items-start gap-1">
              <label
                className={cn(
                  "text-sm font-bold underline underline-offset-2",
                  isUploadingPhoto
                    ? "cursor-wait text-foreground/50"
                    : "cursor-pointer text-foreground hover:text-foreground/70",
                )}
              >
                {isUploadingPhoto ? "Uploading…" : "Change photo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handlePhotoChange}
                  disabled={isUploadingPhoto}
                  className="hidden"
                />
              </label>
              {avatarUrl && !isUploadingPhoto && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="text-xs font-medium text-foreground/40 underline underline-offset-2 hover:text-red-700"
                >
                  Remove photo
                </button>
              )}
              {photoError && (
                <p className="text-xs font-medium text-red-700">{photoError}</p>
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
            <label htmlFor="email" className={labelClasses}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "email-error" : undefined}
              className={cn(inputClasses, emailError && "border-red-700!")}
            />
            {emailError && (
              <p id="email-error" className="text-sm font-medium text-red-700">
                {emailError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="employer" className={labelClasses}>
              Employer
            </label>
            <input
              id="employer"
              name="employer"
              type="text"
              placeholder="e.g. ABC LLP"
              defaultValue={member.employer ?? ""}
              className={inputClasses}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="role_title" className={labelClasses}>
              Role / job title
            </label>
            <input
              id="role_title"
              name="role_title"
              type="text"
              placeholder="e.g. Associate"
              defaultValue={member.role_title ?? ""}
              className={inputClasses}
            />
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
        </form>
      </div>
    </main>
  );
}
