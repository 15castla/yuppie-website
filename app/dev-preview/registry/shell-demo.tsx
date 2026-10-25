// The harness's own demo, owned by the foundation. It proves the harness (a
// screen inside the real shell, no login, no database) and the kit: the
// default state is the approved Events page rebuilt from the kit primitives,
// so it can be laid beside v3/shots/events-*; "kit" is a sampler of every
// primitive; "loading", "empty" and "long" show the other page states.
// EXAMPLE CONTENT: the people, places and plans are the mockups' fictional ones.

import {
  Avatar,
  AvatarStack,
  Button,
  Card,
  Chip,
  ChipRow,
  ClosingBand,
  EmptyState,
  FormField,
  Icon,
  LoadingShapes,
  Main,
  Pill,
  Row,
  Rows,
  SectionHead,
  SectionTitle,
  Segmented,
  Serif,
  Status,
  TitleBlock,
  TrainerDrawing,
} from "@/components/members/kit";
import { BareChrome } from "@/components/members/shell/bare-chrome";
import { ROUTES } from "@/lib/members/routes";
import { examplePhoto } from "@/lib/members/mock/example-photos";
import type { PreviewScreen } from "./types";

type DemoEvent = {
  month: string;
  weekday: string;
  day: string;
  title: string;
  time: string;
  place: string;
  price: string | null;
  booked: boolean;
};

const EVENTS: DemoEvent[] = [
  { month: "October", weekday: "Thu", day: "29", title: "Padel & Pints", time: "18:30", place: "Northgate Courts", price: "£25pp", booked: true },
  { month: "October", weekday: "Fri", day: "30", title: "Rooftop Social", time: "19:00", place: "The Mews Terrace", price: null, booked: false },
  { month: "November", weekday: "Sat", day: "7", title: "Polo Lesson", time: "09:00", place: "Hartley Polo Grounds", price: "£95pp", booked: false },
  { month: "November", weekday: "Thu", day: "12", title: "Supper Club: Wine & Charcuterie", time: "19:30", place: "Marlow Wine Room", price: "£48pp", booked: false },
  { month: "November", weekday: "Sun", day: "15", title: "Sunrise Wellness Retreat", time: "07:00", place: "Calder Park", price: null, booked: true },
];

function eventPill(event: DemoEvent) {
  if (event.booked) return <Pill kind="ink">Booked</Pill>;
  return <Pill>{event.price ?? "Included"}</Pill>;
}

function eventRow(event: DemoEvent) {
  return (
    <Row
      key={event.title}
      href={ROUTES.events}
      date={{ weekday: event.weekday, day: event.day }}
      title={event.title}
      meta={`${event.time} · ${event.place}`}
      end={eventPill(event)}
    />
  );
}

function PlansRows() {
  return (
    <Rows>
      {EVENTS.filter((event) => event.booked).map(eventRow)}
    </Rows>
  );
}

function monthGroups(events: DemoEvent[]) {
  const groups = new Map<string, DemoEvent[]>();
  for (const event of events) groups.set(event.month, [...(groups.get(event.month) ?? []), event]);
  return [...groups.entries()];
}

function EventsDemo({ events = EVENTS }: { events?: DemoEvent[] }) {
  return (
    <Main>
      <TitleBlock title="Events." sub="Run by us, at cost." />
      <div className="mk-wrap">
        <div className="mk-cols">
          <div>
            <section className="mk-section mk-first mk-show-phone">
              <SectionTitle title="Your plans" linkLabel="All plans" linkHref={ROUTES.plans} />
              <PlansRows />
            </section>
            <section className="mk-section">
              <SectionTitle title="What’s on" />
              <div style={{ margin: "4px 0 28px" }}>
                <ChipRow label="Filter events">
                  {["All", "This week", "Included", "Sport", "Entertainment", "Personal progression"].map((label, index) => (
                    <Chip key={label} active={index === 0}>
                      {label}
                    </Chip>
                  ))}
                </ChipRow>
              </div>
              {monthGroups(events).map(([month, items], index) => (
                <section key={month} className={index === 0 ? "" : "mk-mt-section"}>
                  <SectionHead title={month} meta={`${items.length} event${items.length === 1 ? "" : "s"}`} />
                  <Rows>{items.map(eventRow)}</Rows>
                </section>
              ))}
            </section>
          </div>
          <aside className="mk-rail mk-show-desk">
            <Card className="mk-plans-card">
              <SectionTitle title="Your plans" linkLabel="All plans" linkHref={ROUTES.plans} />
              <PlansRows />
            </Card>
          </aside>
        </div>
      </div>
      <section className="mk-band" style={{ marginTop: 56 }}>
        <div className="mk-wrap">
          <div className="mk-inner mk-band-grid">
            <div className="mk-band-words">
              <h2 className="mk-display-serif">Open Invite</h2>
              <p className="mk-lead">Fancy company for something that isn’t on the list? Post your own plan and see who’s in.</p>
              <div className="mk-band-actions">
                <Button href={ROUTES.events} blockPhone>
                  See Open Invites
                </Button>
              </div>
            </div>
            <div className="mk-band-card">
              <div className="mk-invite-wrap">
                <TrainerDrawing />
                <figure className="mk-invite" aria-label="Example Open Invite">
                  <Pill kind="ink">Open Invite</Pill>
                  <h3>Saturday morning class + brunch</h3>
                  <dl>
                    <dt>When</dt>
                    <dd>Sat 24 Oct, 10:00</dd>
                    <dt>Where</dt>
                    <dd>
                      <span className="mk-nb">Psycle,</span> <span className="mk-nb">Oxford Circus</span>
                    </dd>
                    <dt>Posted by</dt>
                    <dd>Jasmin</dd>
                  </dl>
                  <Button href={ROUTES.events} size="sm">
                    I’m in
                  </Button>
                </figure>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Main>
  );
}

function KitSampler() {
  const people = ["S", "J", "P", "T"] as const;
  return (
    <Main>
      <TitleBlock title={<>Kit <Serif>sampler.</Serif></>} sub="Every primitive, once." lead="Example content only. This page exists to check the kit against the approved designs." />
      <div className="mk-wrap">
        <section className="mk-section mk-first">
          <SectionTitle title="Buttons and links" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <Button href="#">Primary</Button>
            <Button href="#" variant="outline">Outline</Button>
            <Button href="#" size="sm">Small</Button>
            <Button disabled>Full</Button>
            <Button pending>Saving…</Button>
            <Button variant="quiet" href="#">Quiet link</Button>
            <Button variant="quiet" danger>Delete my account</Button>
            <Button icon={<Icon name="camera" size={20} />}>Take a photo</Button>
          </div>
        </section>
        <section className="mk-section">
          <SectionTitle title="Pills and status" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <Pill kind="ink">Booked</Pill>
            <Pill>£25pp</Pill>
            <Pill>Included</Pill>
            <Pill kind="muted">Past</Pill>
            <Status>Active</Status>
            <Status tone="warn">Ends 12 Nov</Status>
            <Status tone="off">Paused</Status>
          </div>
        </section>
        <section className="mk-section">
          <SectionTitle title="Chips and switch" />
          <ChipRow label="Filter">
            {["Any day", "This week", "Weekend", "Sport", "Food and drink", "Wellness", "Culture"].map((label, index) => (
              <Chip key={label} active={index === 1}>{label}</Chip>
            ))}
          </ChipRow>
          <div style={{ marginTop: 16 }}>
            <Segmented
              label="Open Invite"
              items={[
                { label: "Browse", href: "#", current: true },
                { label: "Yours", href: "#" },
              ]}
            />
          </div>
        </section>
        <section className="mk-section">
          <SectionTitle title="Photos" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
            <Avatar photoUrl={examplePhoto("S")} size={64} />
            <Avatar photoUrl={examplePhoto("J")} size={44} />
            <Avatar photoUrl={examplePhoto("P")} size={28} />
            <Avatar name="Sam" size={44} />
            <Avatar name="Jasmin" size={44} tone="cream" />
            <Avatar blank size={44} />
            <AvatarStack
              people={people.map((letter) => ({ photoUrl: examplePhoto(letter) }))}
              more="3 of 4 going"
            />
          </div>
        </section>
        <section className="mk-section">
          <SectionTitle title="Rows" />
          <Rows>
            <Row href="#" leading={<span className="mk-logo-tile">B</span>} title="Bellina Trattoria" meta="Food and drink · Northgate" end={<Pill kind="ink">20%</Pill>} />
            <Row href="#" date={{ weekday: "Sat", day: "7" }} title="A very long event title that has to wrap onto a second line at 320" meta="09:00 · Hartley Polo Grounds" end={<Pill>£95pp</Pill>} />
          </Rows>
        </section>
        <section className="mk-section">
          <SectionHead title="All offers" meta="5 offers" />
          <div className="mk-card">
            <h3 className="mk-h3">A pale card</h3>
            <p className="mk-meta-line">Two-pixel ink border, hard shadow, 20px radius.</p>
          </div>
        </section>
        <section className="mk-section">
          <SectionTitle title="Form" />
          <div style={{ display: "grid", gap: 16, maxWidth: 440 }}>
            <FormField label="First name" defaultValue="Sam" />
            <FormField label="Phone" placeholder="07700 900123" help="We only use it for reminders." />
            <FormField label="Email" defaultValue="sam@example.com" error="That doesn’t look like an email address. Check it and try again." />
          </div>
        </section>
      </div>
      <div style={{ height: 40 }} />
      <ClosingBand
        label="Suggest a place"
        title="Know a place we should add?"
        accent="Tell us."
        lead="Send us a name and we’ll ask them."
        action={<Button href="#" blockPhone>Suggest a place</Button>}
        drawing="tag"
      />
    </Main>
  );
}

function EmptyDemo() {
  return (
    <Main fill pad={false}>
      <TitleBlock title="Discounts." sub="Show your phone, pay less." />
      <div style={{ height: 28 }} />
      <EmptyState
        title="No offers"
        accent="yet."
        lead="We’re lining up the first partners. They’ll appear here."
        action={<Button href={ROUTES.events} blockPhone>See events</Button>}
        drawing="tag"
      />
    </Main>
  );
}

function LongDemo() {
  const longEvents: DemoEvent[] = [
    ...EVENTS,
    { month: "December", weekday: "Wed", day: "2", title: "An evening of unnecessarily long titles and the people who write them", time: "19:00", place: "The Marlow Wine Room and the Terrace Above It, Northgate", price: "£149.50pp", booked: false },
  ];
  return <EventsDemo events={longEvents} />;
}

export const shellDemoScreens: PreviewScreen[] = [
  {
    id: "shell-demo",
    title: "Shell demo: the approved Events page from the kit",
    states: ["default", "kit", "loading", "empty", "long", "bare", "owndock", "invite", "you", "messages", "barepage"],
    tab: "events",
    frame: ({ state }) => {
      switch (state) {
        case "owndock":
          return { dock: "own" };
        // Chrome "bare" is what the route table says for the photo gate: no bar, header or dock, a tint strip.
        case "bare":
          return { chrome: "bare", dock: "own" };
        // The messages icon shows on Open Invite pages only (and is the current page on Messages).
        case "invite":
          return { tab: "invite", showMessages: true };
        case "messages":
          return { tab: null, showMessages: true, messagesCurrent: true };
        // The photo is the current page on You and its sub pages; no tab is lit.
        case "you":
          return { tab: null, youCurrent: true };
        default:
          return {};
      }
    },
    render: ({ state }) => {
      switch (state) {
        case "kit":
          return <KitSampler />;
        case "loading":
          return (
            <Main busy>
              <LoadingShapes chips title={<TitleBlock title="Events." sub="Run by us, at cost." />} />
            </Main>
          );
        case "empty":
          return <EmptyDemo />;
        case "long":
          return <LongDemo />;
        case "bare":
          return (
            <Main>
              <TitleBlock title="Bare." sub="The route table says: no bar, header or tab bar." actions={null} />
            </Main>
          );
        // The same, asked for by the page itself with <BareChrome /> (for a page the route table does not list).
        case "barepage":
          return (
            <Main>
              <BareChrome />
              <TitleBlock title="Bare page." sub="The page asks for no chrome." actions={null} />
            </Main>
          );
        case "owndock":
          return (
            <Main>
              <TitleBlock title="Own dock." sub="The page draws its own bar; the shell draws none." />
            </Main>
          );
        case "invite":
          return (
            <Main>
              <TitleBlock title="Open Invite." sub="The messages icon shows here." />
            </Main>
          );
        case "messages":
          return (
            <Main>
              <TitleBlock title="Messages." sub="The icon is the current page." />
            </Main>
          );
        case "you":
          return (
            <Main>
              <TitleBlock title="You." sub="The photo is the current page." />
            </Main>
          );
        default:
          return <EventsDemo />;
      }
    },
  },
];
