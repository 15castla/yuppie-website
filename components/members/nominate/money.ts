// Pounds for the Nominate views (client safe): "£10", "£2.50", "−£10" for credit spent.

export function gbp(pence: number): string {
  const whole = Math.round(Math.abs(pence));
  const p = whole % 100;
  return `£${Math.floor(whole / 100)}${p ? `.${String(p).padStart(2, "0")}` : ""}`;
}

/** "+£10" added, "−£10" spent. */
export const signedGbp = (pence: number) => `${pence < 0 ? "−" : "+"}${gbp(pence)}`;
