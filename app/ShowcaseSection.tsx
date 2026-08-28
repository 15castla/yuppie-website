import {
  PhoneFrame,
  HomeScreenMockup,
  EventsScreenMockup,
  MembershipScreenMockup,
} from "./PhoneMockups";

const SCREENS = [
  { label: "Home", content: <HomeScreenMockup /> },
  { label: "Events", content: <EventsScreenMockup /> },
  { label: "Membership", content: <MembershipScreenMockup /> },
];

// Plain, normal-flow content — no pinning, no scrim, nothing scroll-linked.
// The only pinned/scroll-linked stage on the page is the hero (logo → scrim
// → headline, in app/page.tsx); everything from here on is a completely
// ordinary scrolling page.
export function ShowcaseSection() {
  return (
    <section className="bg-background px-6 pb-24 pt-5">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          The App
        </h2>

        <div className="mt-12 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
          {SCREENS.map((screen) => (
            <PhoneFrame key={screen.label} label={screen.label}>
              {screen.content}
            </PhoneFrame>
          ))}
        </div>
      </div>
    </section>
  );
}
