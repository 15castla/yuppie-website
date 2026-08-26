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

export function ShowcaseSection() {
  return (
    <section className="bg-background px-6 pb-24 pt-2">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-lg text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            The app is coming
          </h2>
          <p className="mt-3 text-base text-foreground/70">
            A first look at what members will get.
          </p>
        </div>

        <div className="mt-2 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
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
