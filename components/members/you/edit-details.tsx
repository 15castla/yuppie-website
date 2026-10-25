"use client";

// Edit details: Name, Email and Phone in place; an email change goes through
// a code (EmailChangeVerify). Drawn from the approved "you-edit" design.
// Employer and role are no longer edited here, but they ARE still sent on
// save: updateProfile() writes both columns, so leaving them out would blank
// them. The photo row appears only while the photo gate flag is off (it is
// today's upload and remove; with the flag on, photos change from You).
//
// A view with its actions passed in (the real ones from ProfileEditView, stubs
// from the preview), and `demo` to draw a state on the first render.

import "./you.css";

import { forwardRef, useRef, useState, useTransition, type ChangeEvent, type ComponentProps, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isValidPhoneNumber, parsePhoneNumberFromString } from "libphonenumber-js";
import PhoneInput, { type FlagProps } from "react-phone-number-input";
import "react-phone-number-input/style.css";

import { Avatar, Button, Card, FormField, Icon, Main } from "@/components/members/kit";
import { EmailChangeVerify, type EmailChangeDemo } from "@/components/members/email-change-verify";
import type * as ProfileActions from "@/app/members/profile/actions";
import { ROUTES } from "@/lib/members/routes";
import { cn } from "@/lib/utils";
import { SubPageHead } from "./you-parts";

export type EditActions = {
  updateProfile: typeof ProfileActions.updateProfile;
  updateAvatar: typeof ProfileActions.updateAvatar;
  removeAvatar: typeof ProfileActions.removeAvatar;
  requestEmailChange: typeof ProfileActions.requestEmailChange;
  verifyEmailChange: typeof ProfileActions.verifyEmailChange;
};

export type EditMember = {
  full_name: string | null;
  email: string;
  phone: string | null;
  employer: string | null;
  role_title: string | null;
  avatar_url: string | null;
};

export type EditDemo = {
  step?: "form" | "code" | "updated";
  /** The address the code step is confirming. */
  newEmail?: string;
  values?: { name?: string; email?: string; phone?: string };
  errors?: { name?: string; email?: string; phone?: string; form?: string };
  status?: "saving" | "saved";
  /** The Name field has focus on the first draw. */
  focusName?: boolean;
  code?: EmailChangeDemo;
  photoError?: string;
};

const NAME_ERROR = "Enter your name.";
const PHONE_ERROR = "Enter a mobile number, like 07700 900123.";
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

// The phone number's text input, drawn as the inside of a kit input (the
// .yu-phone wrapper in you.css draws the box around the country picker and it).
const PhoneTextInput = forwardRef<HTMLInputElement, ComponentProps<"input">>((props, ref) => (
  <input {...props} ref={ref} className="PhoneInputInput" />
));
PhoneTextInput.displayName = "PhoneTextInput";

// The picker's flag, as the library draws it, except that a UK number (the picker is hidden for it, see yu-phone-gb
// in you.css) never fetches one.
function PhoneFlag({ country, countryName, flagUrl }: FlagProps) {
  if (country === "GB" || !flagUrl) return <span />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="PhoneInputCountryIconImg" alt={countryName} src={flagUrl.replace("{XX}", country)} />;
}

function errorLine(message: string | null | undefined) {
  if (!message) return null;
  return (
    <>
      <Icon name="circle-alert" size={14} />
      <span>{message}</span>
    </>
  );
}

export function EditDetailsView({
  member,
  actions,
  showPhotoUpload,
  demo,
}: {
  member: EditMember;
  actions: EditActions;
  /** True while the photo gate flag is off. */
  showPhotoUpload: boolean;
  demo?: EditDemo;
}) {
  const router = useRouter();

  const [name, setName] = useState(demo?.values?.name ?? member.full_name ?? "");
  const [phone, setPhone] = useState<string | undefined>(demo?.values?.phone ?? member.phone ?? undefined);
  // The picker is for members who are not on a UK number. A UK number (the usual case) reads as the design's plain
  // "07700 900123" field; typing a "+" and another country's number brings the picker back.
  const [country, setCountry] = useState<string | undefined>(() => {
    const saved = demo?.values?.phone ?? member.phone;
    return (saved && parsePhoneNumberFromString(saved)?.country) || "GB";
  });
  // Controlled, because a form action resets uncontrolled inputs once it
  // finishes, which would wipe a typed new address when it is rejected.
  const [email, setEmail] = useState(demo?.values?.email ?? member.email);
  const [nameError, setNameError] = useState<string | null>(demo?.errors?.name ?? null);
  const [phoneError, setPhoneError] = useState<string | null>(demo?.errors?.phone ?? null);
  const [emailError, setEmailError] = useState<string | null>(demo?.errors?.email ?? null);
  const [saveError, setSaveError] = useState<string | null>(demo?.errors?.form ?? null);
  const [saved, setSaved] = useState(demo?.status === "saved");
  const [isSaving, startSaving] = useTransition();
  const busy = isSaving || demo?.status === "saving";

  // A changed email is not saved with the other fields: it starts Supabase
  // Auth's email-change flow, and the card switches to code entry until the
  // change is confirmed.
  const [pendingEmail, setPendingEmail] = useState<string | null>(demo?.step === "code" ? (demo.newEmail ?? "sam.taylor@example.com") : null);
  const [changedEmail, setChangedEmail] = useState<string | null>(demo?.step === "updated" ? (demo.newEmail ?? "sam.taylor@example.com") : null);

  const [avatarUrl, setAvatarUrl] = useState(member.avatar_url);
  const [photoError, setPhotoError] = useState<string | null>(demo?.photoError ?? null);
  const [isUploadingPhoto, startPhotoUpload] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoError(null);
    if (!PHOTO_TYPES.includes(file.type)) {
      setPhotoError("That file isn’t a photo. Choose a JPG, PNG or WebP.");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setPhotoError("That file is too big. Choose one under 5 MB.");
      return;
    }
    startPhotoUpload(async () => {
      const formData = new FormData();
      formData.set("photo", file);
      const result = await actions.updateAvatar(formData);
      if (!result.success) {
        setPhotoError("Your photo didn’t upload. Check your connection and try again.");
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
      const result = await actions.removeAvatar();
      if (!result.success) {
        setPhotoError(result.error ?? "Your photo wasn’t removed. Try again.");
        return;
      }
      setAvatarUrl(null);
      router.refresh();
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setSaveError(null);
    setEmailError(null);

    const trimmedName = name.trim();
    const nameProblem = trimmedName ? null : NAME_ERROR;
    const phoneProblem = phone && isValidPhoneNumber(phone) ? null : PHONE_ERROR;
    setNameError(nameProblem);
    setPhoneError(phoneProblem);
    if (nameProblem || phoneProblem) return;

    startSaving(async () => {
      const formData = new FormData();
      formData.set("full_name", trimmedName);
      formData.set("phone", phone ?? "");
      formData.set("employer", member.employer ?? "");
      formData.set("role_title", member.role_title ?? "");
      const result = await actions.updateProfile(formData);
      if (!result.success) {
        setSaveError(result.error ?? "Your details didn’t save. Try again.");
        return;
      }

      const newEmail = email.trim().toLowerCase();
      if (newEmail && newEmail !== member.email.toLowerCase()) {
        const emailResult = await actions.requestEmailChange(newEmail);
        if (!emailResult.success) {
          // The other fields are saved; refresh so the form shows them rather than their old values.
          router.refresh();
          setEmailError(`${emailResult.error ?? "We couldn’t send the code. Try again."} Your other changes are saved.`);
          return;
        }
        setPendingEmail(newEmail);
        return;
      }

      setSaved(true);
      if (!demo) router.push(ROUTES.you);
    });
  }

  if (pendingEmail || changedEmail) {
    return (
      <Main className="yu-main yu-subpage">
        <SubPageHead title="Your details." sub="Keep them up to date." />
        <div className="mk-wrap">
          <div className="yu-formwrap">
            <Card className="yu-formcard yu-form yu-formcard-code">
              {changedEmail ? (
                <>
                  <div>
                    <h2 className="mk-h2">Email updated</h2>
                    <p className="yu-p" style={{ marginTop: 8 }} aria-live="polite">
                      You’ll log in with {changedEmail} from now on. Your other changes are saved too.
                    </p>
                  </div>
                  <Button block className="yu-save" href={ROUTES.you}>
                    Done
                  </Button>
                </>
              ) : (
                <EmailChangeVerify
                  currentEmail={member.email}
                  newEmail={pendingEmail!}
                  verify={actions.verifyEmailChange}
                  resend={() => actions.requestEmailChange(pendingEmail!)}
                  onDone={(confirmed) => {
                    setPendingEmail(null);
                    setChangedEmail(confirmed);
                    router.refresh();
                  }}
                  onCancel={() => {
                    if (!demo) router.push(ROUTES.you);
                  }}
                  demo={demo?.code}
                />
              )}
            </Card>
          </div>
        </div>
      </Main>
    );
  }

  return (
    <Main className="yu-main yu-subpage">
      <SubPageHead title="Your details." sub="Keep them up to date." />
      <div className="mk-wrap">
        <div className="yu-formwrap">
          <Card className="yu-formcard">
            <form className="yu-form" onSubmit={handleSubmit} noValidate>
              {showPhotoUpload ? (
                <div className="yu-photo-edit">
                  <Avatar photoUrl={avatarUrl} name={name || member.email} size={64} />
                  <div className="yu-photo-btns">
                    <Button variant="quiet" pending={isUploadingPhoto} onClick={() => fileInput.current?.click()}>
                      {isUploadingPhoto ? "Uploading…" : "Change photo"}
                    </Button>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      hidden
                      aria-label="Choose a photo"
                      onChange={handlePhotoChange}
                      disabled={isUploadingPhoto}
                    />
                    {avatarUrl && !isUploadingPhoto ? (
                      <Button variant="quiet" danger plain onClick={handleRemovePhoto}>
                        Remove photo
                      </Button>
                    ) : null}
                    {photoError ? (
                      <p className="yu-form-err" role="alert">
                        {errorLine(photoError)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="yu-fgrid">
                <FormField
                  className={cn("yu-f-name", busy && "yu-locked")}
                  label="Name"
                  id="full_name"
                  name="full_name"
                  type="text"
                  autoComplete="name"
                  autoFocus={demo?.focusName}
                  placeholder="Your name"
                  value={name}
                  readOnly={busy}
                  onChange={(event) => setName(event.target.value)}
                  error={errorLine(nameError)}
                />
                <FormField
                  className={cn("yu-f-email", busy && "yu-locked")}
                  label="Email"
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  readOnly={busy}
                  onChange={(event) => setEmail(event.target.value)}
                  help={emailError ? undefined : "If you change it, we email a code to the new address."}
                  error={errorLine(emailError)}
                />
                <div className={cn("mk-field yu-f-phone", busy && "yu-locked")}>
                  <label htmlFor="phone">Phone</label>
                  <div className={cn("yu-phone", phoneError && "yu-invalid", (!country || country === "GB") && "yu-phone-gb")}>
                    <PhoneInput
                      id="phone"
                      name="phone"
                      value={phone}
                      onChange={setPhone}
                      defaultCountry="GB"
                      onCountryChange={setCountry}
                      flagComponent={PhoneFlag}
                      inputComponent={PhoneTextInput}
                      aria-invalid={phoneError ? true : undefined}
                      aria-describedby={phoneError ? "phone-error" : undefined}
                    />
                  </div>
                  <p className="mk-error-text" id="phone-error" aria-live="polite">
                    {errorLine(phoneError)}
                  </p>
                </div>
              </div>

              {saveError ? (
                <p className="yu-form-err" role="alert">
                  {errorLine(saveError)}
                </p>
              ) : null}

              <Button type="submit" block className="yu-save" pending={busy && !saved} icon={saved || demo?.status === "saved" ? <Icon name="check" size={20} /> : undefined}>
                {saved || demo?.status === "saved" ? "Saved" : busy ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </Card>
          <div className="yu-below">
            <Button variant="quiet" href={ROUTES.you}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </Main>
  );
}
