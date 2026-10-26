// Kit counterparts: k2.btn(text, cls, tag, state) and the .link class.
//   primary  black pill, yellow text, 56px (sm: 44px)        .mk-btn
//   outline  the same pill, transparent with an ink border   .mk-btn.mk-secondary
//   quiet    underlined 15px/700 text, 44px tall              .mk-link
// With an href it is a link (next/link for /paths), else a <button>.
// Disabled is outlined and quiet, never a faded ink button (RULE-38);
// pending ("Saving…") stays the full ink button, with aria-busy.

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { KitLink } from "./link";

export type ButtonVariant = "primary" | "outline" | "quiet";

type Common = {
  variant?: ButtonVariant;
  /** 44px instead of 56px (primary and outline). */
  size?: "md" | "sm";
  /** Full width. */
  block?: boolean;
  /** Full width on a phone, natural width from 768px (a page's one primary action). */
  blockPhone?: boolean;
  /** Quiet only: error red ("Delete my account"). */
  danger?: boolean;
  /** Quiet only: no underline. */
  plain?: boolean;
  /** Cannot be used yet: outlined and quiet. */
  disabled?: boolean;
  /** Working: stays the full ink button, aria-busy. */
  pending?: boolean;
  icon?: ReactNode;
  children: ReactNode;
};

export type ButtonProps = Common &
  (
    | ({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children">)
    | ({ href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "disabled">)
  );

export function buttonClass({
  variant = "primary",
  size = "md",
  block,
  blockPhone,
  danger,
  plain,
  disabled,
  className,
}: Pick<Common, "variant" | "size" | "block" | "blockPhone" | "danger" | "plain" | "disabled"> & {
  className?: string;
}) {
  if (variant === "quiet") {
    return cn("mk-link", danger && "mk-danger", plain && "mk-plain", className);
  }
  return cn(
    "mk-btn",
    variant === "outline" && "mk-secondary",
    size === "sm" && "mk-sm",
    block && "mk-block",
    blockPhone && "mk-block-phone",
    disabled && "mk-secondary mk-is-off",
    className,
  );
}

export function Button(props: ButtonProps) {
  const {
    variant,
    size,
    block,
    blockPhone,
    danger,
    plain,
    disabled,
    pending,
    icon,
    children,
    className,
    ...rest
  } = props;
  const classes = buttonClass({ variant, size, block, blockPhone, danger, plain, disabled, className });
  const inner = (
    <>
      {icon}
      {children}
    </>
  );

  if ("href" in rest && typeof rest.href === "string") {
    const { href, ...anchor } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
    return (
      <KitLink
        href={href}
        className={cn(classes, pending && "mk-is-pending")}
        aria-disabled={disabled || undefined}
        aria-busy={pending || undefined}
        {...anchor}
      >
        {inner}
      </KitLink>
    );
  }

  const { type = "button", ...button } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      type={type}
      className={cn(classes, pending && "mk-is-pending")}
      aria-disabled={disabled || undefined}
      aria-busy={pending || undefined}
      {...button}
      onClick={disabled ? undefined : button.onClick}
    >
      {inner}
    </button>
  );
}
