import { forwardRef, type ComponentProps } from "react";

// Keeps the phone field's actual text input looking identical to every
// other field on the site's forms — react-phone-number-input renders this
// in place of its own default input, but doesn't get a say in its styling.
// Shared between app/apply/apply-form.tsx and the members profile editor
// rather than duplicated, so both stay in sync automatically.
export const PhoneNumberField = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  (props, ref) => (
    <input
      {...props}
      ref={ref}
      className="w-full rounded-xl border-2 border-foreground/20 bg-[#F5F3E7] px-4 py-3.5 text-base text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground"
    />
  ),
);
PhoneNumberField.displayName = "PhoneNumberField";
