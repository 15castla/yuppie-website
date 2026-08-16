import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

const baseClasses =
  "inline-flex items-center justify-center rounded-full bg-[#1B1512] px-10 py-4 text-base font-bold text-[#FFD904] transition-all duration-200 ease-out hover:scale-[1.03] hover:bg-[#2A2420] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100";

type ButtonAsButton = ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: undefined;
};

type ButtonAsAnchor = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

export function Button({ className, ...props }: ButtonProps) {
  const classes = [baseClasses, className].filter(Boolean).join(" ");

  if (props.href !== undefined) {
    return (
      <a {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)} className={classes} />
    );
  }

  return (
    <button {...(props as ButtonHTMLAttributes<HTMLButtonElement>)} className={classes} />
  );
}
