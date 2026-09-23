export function cn(
  ...inputs: Array<string | undefined | null | false>
): string {
  return inputs.filter(Boolean).join(" ");
}

// Used by admin forms that edit a stored UTC timestamp (e.g. events.start_time)
// with an <input type="datetime-local">. That input's value is always a
// timezone-naive "YYYY-MM-DDTHH:mm" wall-clock string, with no offset info,
// so it has to be explicitly paired with the zone the admin is thinking in
// (Europe/London, same zone components/members/ui.tsx displays event times
// in) on both the way in and the way back out, rather than trusting
// whatever timezone the server or the admin's OS happens to be set to.

// ISO (UTC) -> the wall-clock string a datetime-local input should show for
// that instant in `timeZone`.
export function isoToDateTimeLocal(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

// The reverse: a datetime-local input's wall-clock string, understood as a
// time in `timeZone`, -> a real UTC ISO instant. There's no direct API for
// "what UTC instant is this wall-clock time in this zone", so this finds it
// by an initial guess-and-correct: treat the string as if it were already
// UTC, check what wall-clock time that guess actually renders as in the
// target zone, and shift by the difference (handles GMT/BST automatically).
export function dateTimeLocalToISO(localValue: string, timeZone: string): string {
  const guessUTC = new Date(`${localValue}:00.000Z`);

  const partsInZone = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(guessUTC);

  const get = (type: string) => partsInZone.find((part) => part.type === type)?.value ?? "00";
  // Intl can render midnight as "24:00" for some locales/zones, so normalize.
  const hour = get("hour") === "24" ? "00" : get("hour");
  const renderedAsUTC = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(hour),
    Number(get("minute")),
    Number(get("second")),
  );

  const offsetMs = renderedAsUTC - guessUTC.getTime();
  return new Date(guessUTC.getTime() - offsetMs).toISOString();
}
