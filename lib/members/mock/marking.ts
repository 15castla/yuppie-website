// Whether the example screens SAY they are examples.
//
// Default: they do. Every example screen carries the dashed "Example screen"
// note, the Pay buttons read "Coming soon", and the You page's Settings rows
// read "Example screen" (kit/example-note.tsx, lib/members/you/settings.ts).
//
// NEXT_PUBLIC_MEMBERS_MARK_EXAMPLES=off takes all of that away, so the screens
// look the way they will once a real backend sits behind them. It only changes
// what is drawn: the example pages themselves still need MEMBERS_SHOW_EXAMPLES=on
// on the live site (guard.ts), and nothing is saved, sent or paid either way.
// Only the exact value "off" counts. It is a build-time value (NEXT_PUBLIC_),
// like the six NEXT_PUBLIC_MEMBERS_* flags: change it, then redeploy.
// Remove the variable and redeploy to put the notes back.
export function marksExamples(): boolean {
  return process.env.NEXT_PUBLIC_MEMBERS_MARK_EXAMPLES !== "off";
}
