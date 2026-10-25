"use client";

// Open Invite > post a plan. Kit counterpart: pages_oi.post_page() and
// done_main(). One column on a phone with the action in a docked bar (the tab
// bar's slot); on a computer the form (640px at most) sits left and a live
// preview of the card right. Real inputs throughout: 16px text so iOS never
// zooms, labels, counters, errors announced with role="alert".
//
// The errors are written in the form: what is wrong, and what to do. The Post
// button stays a normal full-ink button in every error state (RULE-38): tapping
// it with an error moves focus to the first one. "Posted." is its own page
// (/members/open-invite/new/done) so the tab bar comes back.
//
// LOCAL DEMO STATE: posting keeps the new plan in this tab's sessionStorage
// and shows it on the "Posted." page (demo-posted.ts). Nothing is sent.

import "./invite.css";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { BackRow, Button, Icon, Main, Shape } from "@/components/members/kit";
import { GetPaidHandOff, type GetPaidMode } from "@/components/members/payments/get-paid";
import { EMPTY_COST, usablePence, validateCost, type CostValues } from "@/lib/members/invite/cost";
import { formatDateInput, isPaid, londonLocalToIso } from "@/lib/members/invite/format";
import {
  INVITE_TYPES,
  type GetPaidStatus,
  type InviteMember,
  type InviteType,
  type NewOpenInviteContext,
  type NewOpenInviteField,
  type OpenInvite,
} from "@/lib/members/invite/types";
import { ROUTES } from "@/lib/members/routes";
import { cn } from "@/lib/utils";
import { CostBlock } from "./cost-block";
import { DEMO_POSTED_ID, savePosted } from "./demo-posted";
import { CheckRow, FieldError, Lab } from "./form-parts";
import { InkDrawing } from "./ink-drawing";
import { InviteCard } from "./invite-card";

export type PostValues = {
  title: string;
  type: InviteType | "";
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  where: string;
  places: number;
  hostGoing: boolean;
  note: string;
  /** "Add a cost" (only drawn when paid plans are on). */
  cost: CostValues;
};

export type PostErrors = Partial<Record<NewOpenInviteField, string>>;

export const EMPTY_POST: PostValues = {
  title: "",
  type: "",
  date: "",
  time: "",
  where: "",
  places: 4,
  hostGoing: true,
  note: "",
  cost: EMPTY_COST,
};

export const TITLE_MAX = 50;
export const NOTE_MAX = 280;
export const PLACES_MIN = 2;
export const PLACES_MAX = 12;

const ERROR_TEXT = {
  title: "Add a title, a few words is fine.",
  type: "Pick a type so people can find it.",
  date: "Pick a date from today.",
  time: "Add a time.",
  past: "Pick a time from now.",
  where: "Say where you’re meeting.",
} as const;

/** The same rules the server checks again. Returns the errors, empty when the form can be posted. */
export function validatePost(values: PostValues, today: string, nowIso: string, getPaid: GetPaidStatus): PostErrors {
  const errors: PostErrors = {};
  if (values.title.trim() === "") errors.title = ERROR_TEXT.title;
  if (values.type === "") errors.type = ERROR_TEXT.type;
  if (values.date === "" || values.date < today) errors.date = ERROR_TEXT.date;
  else if (values.time === "") errors.time = ERROR_TEXT.time;
  else {
    const at = londonLocalToIso(values.date, values.time);
    if (at === null || new Date(at).getTime() < new Date(nowIso).getTime()) errors.time = ERROR_TEXT.past;
  }
  if (values.where.trim() === "") errors.where = ERROR_TEXT.where;
  const cost = validateCost(values.cost, getPaid);
  if (cost.price) errors.price = cost.price;
  if (cost.faceValue) errors.faceValue = cost.faceValue;
  if (cost.getPaid) errors.getPaid = cost.getPaid;
  return errors;
}

// ---------------------------------------------------------------- small controls

function showPicker(event: { currentTarget: HTMLInputElement }) {
  try {
    event.currentTarget.showPicker();
  } catch {
    // Not every browser opens a picker from a script; the native control still works.
  }
}

// ---------------------------------------------------------------- the live preview

function previewInvite(values: PostValues, me: InviteMember): OpenInvite {
  const at = londonLocalToIso(values.date, values.time);
  const pence = usablePence(values.cost);
  return {
    id: "preview",
    title: values.title.trim(),
    type: values.type === "" ? "Something else" : values.type,
    startsAt: at ?? "2000-01-01T00:00:00Z",
    where: values.where.trim(),
    note: values.note.trim() === "" ? null : values.note.trim(),
    places: values.places,
    hostGoing: values.hostGoing,
    host: me,
    going: values.hostGoing ? [me] : [],
    status: "scheduled",
    cost: pence === null ? null : { pricePence: pence, faceValueConfirmed: values.cost.tick },
    you: {
      role: "guest",
      chatId: null,
      unreadInChat: 0,
      chatPreview: null,
      askThreadId: "ask-preview",
      hostReply: null,
      questions: [],
      payment: null,
      hostMoney: null,
    },
  };
}

function previewWords(values: PostValues) {
  const at = londonLocalToIso(values.date, values.time);
  return {
    title: values.title.trim() === "" ? "Your plan in a few words" : undefined,
    when: at === null ? "Pick a date and time" : undefined,
    where: values.where.trim() === "" ? "Add a place" : undefined,
  };
}

function RulesLine() {
  return (
    <div className="oi-rules">
      <Icon name="shield" size={20} />
      <span>
        <b>Plans first.</b> Keep it friendly, meet somewhere public, and keep payments inside Club Yuppie.
      </span>
    </div>
  );
}

function MessageNote({ paid }: { paid: boolean }) {
  return (
    <div className="oi-rules oi-rules-2">
      <Icon name="message" size={20} />
      <span>We’ll message you when someone asks a question or {paid ? "pays" : "says they’re in"}.</span>
    </div>
  );
}

// ---------------------------------------------------------------- the form

export function PostView({
  context,
  paidPlans = false,
  initial,
  initialErrors,
  initialPosting = false,
  initialMode = null,
}: {
  context: NewOpenInviteContext;
  /** `flags.paidPlans`: draws "Add a cost". Off, the form is exactly the free one. */
  paidPlans?: boolean;
  /** The harness opens the form already filled in. */
  initial?: Partial<PostValues>;
  /** ...or with errors showing. */
  initialErrors?: PostErrors;
  /** ...or while "Posting…". */
  initialPosting?: boolean;
  /** ...or with the Get paid hand-off open. */
  initialMode?: GetPaidMode;
}) {
  const router = useRouter();
  const uid = useId();
  const ids = {
    title: `${uid}-title`,
    date: `${uid}-date`,
    time: `${uid}-time`,
    where: `${uid}-where`,
    note: `${uid}-note`,
    type: `${uid}-type`,
  };
  const costIds = { switch: `${uid}-cost`, price: `${uid}-price`, tick: `${uid}-tick`, getPaid: `${uid}-getpaid` };
  const [values, setValues] = useState<PostValues>({ ...EMPTY_POST, ...initial });
  const [errors, setErrors] = useState<PostErrors>(initialErrors ?? {});
  const [posting, setPosting] = useState(initialPosting);
  // LOCAL DEMO STATE: Get paid starts as the context says and turns ready when "Done" is tapped on Stripe's outline screen.
  const [getPaid, setGetPaid] = useState<GetPaidStatus>(context.getPaid.status);
  const [mode, setMode] = useState<GetPaidMode>(initialMode);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function set<K extends keyof PostValues>(key: K, value: PostValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      if (key === "date" || key === "time") {
        delete next.date;
        delete next.time;
      } else delete (next as Record<string, string | undefined>)[key];
      return next;
    });
  }

  function changeCost(patch: Partial<CostValues>) {
    setValues((current) => ({ ...current, cost: { ...current.cost, ...patch } }));
    setErrors((current) => {
      const next = { ...current };
      if ("on" in patch) {
        delete next.price;
        delete next.faceValue;
        delete next.getPaid;
      }
      if ("price" in patch) delete next.price;
      if ("tick" in patch) delete next.faceValue;
      return next;
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (posting) return;
    const found = validatePost(values, context.today, context.now, getPaid);
    setErrors(found);
    const order: [keyof PostErrors, string][] = [
      ["title", ids.title],
      ["type", `${ids.type}-0`],
      ["date", ids.date],
      ["time", ids.time],
      ["where", ids.where],
      ["price", costIds.price],
      ["faceValue", costIds.tick],
      ["getPaid", costIds.getPaid],
    ];
    const first = order.find(([key]) => found[key]);
    if (first) {
      const target = document.getElementById(first[1]);
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
      return;
    }
    setPosting(true);
    timer.current = setTimeout(() => {
      const draft = previewInvite(values, context.me);
      savePosted({
        ...draft,
        id: DEMO_POSTED_ID,
        you: { ...draft.you, role: "host", chatId: `chat-${DEMO_POSTED_ID}`, askThreadId: null },
      });
      router.push(ROUTES.openInviteDone);
    }, 900);
  }

  const titleLeft = TITLE_MAX - values.title.length;
  const whenError = errors.date ?? errors.time;
  const others = values.places - 1;
  const placesText = values.hostGoing
    ? `You and ${others} other${others === 1 ? "" : "s"}`
    : `${values.places} places, all for others`;

  const fields: ReactNode[] = [
    // What
    <div key="what">
      <Lab htmlFor={ids.title} text="What" count={`${values.title.length}/${TITLE_MAX}`} near={titleLeft <= 5} />
      <div className={cn("oi-in", errors.title && "is-error", posting && "is-off")}>
        <input
          id={ids.title}
          type="text"
          value={values.title}
          maxLength={TITLE_MAX}
          placeholder="Saturday morning class + brunch"
          autoComplete="off"
          enterKeyHint="next"
          disabled={posting}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? `${ids.title}-e` : undefined}
          onChange={(event) => set("title", event.target.value)}
        />
      </div>
      <FieldError id={`${ids.title}-e`} message={errors.title} />
    </div>,
    // Type
    <div key="type">
      <Lab text="Type" />
      <div className="oi-types" role="group" aria-label="Type" aria-describedby={errors.type ? `${ids.type}-e` : undefined}>
        {INVITE_TYPES.map((type, index) => (
          <button
            key={type}
            id={`${ids.type}-${index}`}
            type="button"
            className={cn("mk-chip", values.type === type && "mk-is-active", posting && "is-off")}
            aria-pressed={values.type === type}
            disabled={posting}
            onClick={() => set("type", values.type === type ? "" : type)}
          >
            {type}
          </button>
        ))}
      </div>
      <FieldError id={`${ids.type}-e`} message={errors.type} />
    </div>,
    // When
    <div key="when">
      <Lab htmlFor={ids.date} text="When" />
      <div className="oi-two">
        <div className={cn("oi-in oi-pick", values.date === "" && "mk-ph", errors.date && "is-error", posting && "is-off")}>
          <span className="v">{values.date === "" ? "Pick a date" : formatDateInput(values.date)}</span>
          <Icon name="calendar-days" size={20} />
          <input
            id={ids.date}
            className="oi-native"
            type="date"
            min={context.today}
            value={values.date}
            disabled={posting}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={whenError ? `${uid}-when-e` : undefined}
            onClick={showPicker}
            onChange={(event) => set("date", event.target.value)}
          />
        </div>
        <div className={cn("oi-in oi-pick", values.time === "" && "mk-ph", errors.time && "is-error", posting && "is-off")}>
          <span className="v">{values.time === "" ? "Time" : values.time}</span>
          <Icon name="clock" size={20} />
          <input
            id={ids.time}
            className="oi-native"
            type="time"
            step={300}
            value={values.time}
            disabled={posting}
            aria-label="Time"
            aria-invalid={errors.time ? true : undefined}
            aria-describedby={whenError ? `${uid}-when-e` : undefined}
            onClick={showPicker}
            onChange={(event) => set("time", event.target.value)}
          />
        </div>
      </div>
      <FieldError id={`${uid}-when-e`} message={whenError} />
    </div>,
    // Where
    <div key="where">
      <Lab htmlFor={ids.where} text="Where" />
      <div className={cn("oi-in", errors.where && "is-error", posting && "is-off")}>
        <input
          id={ids.where}
          type="text"
          value={values.where}
          placeholder="A venue or a meeting point"
          autoComplete="off"
          enterKeyHint="next"
          disabled={posting}
          aria-invalid={errors.where ? true : undefined}
          aria-describedby={errors.where ? `${ids.where}-e` : `${ids.where}-h`}
          onChange={(event) => set("where", event.target.value)}
        />
        <Icon name="map-pin" size={20} />
      </div>
      <FieldError id={`${ids.where}-e`} message={errors.where} />
      {!errors.where && values.where === "" ? (
        <div className="oi-help" id={`${ids.where}-h`}>
          A venue or a meeting point, not a home address.
        </div>
      ) : null}
    </div>,
    // Places
    <div key="places">
      <Lab text="Places" />
      <div className="oi-step">
        <div className="stp" role="group" aria-label="Places">
          <button
            type="button"
            className={cn("mk-b", values.places <= PLACES_MIN && "is-dis")}
            aria-label="Fewer places"
            disabled={posting || values.places <= PLACES_MIN}
            onClick={() => set("places", Math.max(PLACES_MIN, values.places - 1))}
          >
            <Icon name="minus" size={22} />
          </button>
          <span className="n" role="status" aria-label={`${values.places} places`}>
            {values.places}
          </span>
          <button
            type="button"
            className={cn("mk-b", values.places >= PLACES_MAX && "is-dis")}
            aria-label="More places"
            disabled={posting || values.places >= PLACES_MAX}
            onClick={() => set("places", Math.min(PLACES_MAX, values.places + 1))}
          >
            <Icon name="plus" size={22} />
          </button>
        </div>
        <span className="t2">{placesText}</span>
      </div>
      <CheckRow checked={values.hostGoing} disabled={posting} onChange={(next) => set("hostGoing", next)} label="I’m going too" />
    </div>,
    // Note
    <div key="note">
      <Lab
        htmlFor={ids.note}
        text="Note"
        optional
        count={`${values.note.length}/${NOTE_MAX}`}
        near={NOTE_MAX - values.note.length <= 20}
      />
      <div className={cn("oi-in oi-ta", posting && "is-off")}>
        <textarea
          id={ids.note}
          value={values.note}
          maxLength={NOTE_MAX}
          rows={3}
          placeholder="Level, what to bring, what happens after"
          disabled={posting}
          onChange={(event) => set("note", event.target.value)}
        />
      </div>
    </div>,
  ];
  if (paidPlans) {
    fields.push(
      <div key="cost">
        <CostBlock
          ids={costIds}
          cost={values.cost}
          errors={errors}
          getPaid={getPaid}
          disabled={posting}
          onChange={changeCost}
          onMode={setMode}
        />
      </div>,
    );
  }
  const paid = usablePence(values.cost) !== null;

  return (
    <Main pad={false} className="oi-postmain">
      <BackRow href={ROUTES.openInvite} label="Cancel" />
      <div className="mk-wrap">
        <div className="oi-form-head">
          <h1 className="mk-h1">Got a plan?</h1>
          <p className="mk-sub-serif">See who’s in.</p>
        </div>
        <div className="oi-form-grid">
          <div>
            <form id={`${uid}-form`} className="oi-form" onSubmit={submit} noValidate>
              {fields}
            </form>
            <div className="mk-show-phone">
              <RulesLine />
            </div>
            <div className="oi-formact">
              <Button type="submit" form={`${uid}-form`} pending={posting}>
                {posting ? "Posting…" : "Post Open Invite"}
              </Button>
            </div>
          </div>
          <div>
            <div className="oi-prev">
              <span className="mk-term">How it will look</span>
              <div className="oi-card-wrap" inert aria-hidden="true">
                <div className="oi-prev-art">
                  <InkDrawing name="trainer" w={152} line={2.5} />
                </div>
                <InviteCard invite={previewInvite(values, context.me)} me={context.me} placeholders={previewWords(values)} />
              </div>
              <div className="mk-show-desk">
                <RulesLine />
                <MessageNote paid={paid} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mk-dock-spacer" aria-hidden="true" />
      <div className="mk-dock" data-needs-device-check="true">
        <div className="mk-tabbar oi-bar oi-bar-one">
          <Button type="submit" form={`${uid}-form`} pending={posting}>
            {posting ? "Posting…" : "Post Open Invite"}
          </Button>
        </div>
      </div>
      <GetPaidHandOff mode={mode} onMode={setMode} onDone={() => setGetPaid("ready")} />
    </Main>
  );
}

// ---------------------------------------------------------------- "Posted."

function DoneNote({ paid }: { paid: boolean }) {
  return (
    <div className="mk-note">
      <Icon name="message" size={20} />
      <span>We’ll message you when someone asks a question or {paid ? "pays" : "says they’re in"}.</span>
    </div>
  );
}

/** The page after posting: the new plan as a card, and what happens next. */
export function PostedView({ invite, me }: { invite: OpenInvite; me: InviteMember }) {
  const card = <InviteCard invite={invite} me={me} mode="posted" />;
  const paid = isPaid(invite);
  return (
    <Main pad={false} fill>
      <BackRow href={ROUTES.openInvite} label="Open Invite" />
      <div className="oi-done-m oi-done-wrap">
        <div className="mk-wrap oi-done">
          <div className="oi-form-head">
            <h1 className="mk-h1">Posted.</h1>
            <p className="mk-sub-serif">Now, see who’s in.</p>
          </div>
          <div className="oi-done-card">{card}</div>
          <DoneNote paid={paid} />
          <div className="art">
            <InkDrawing name="coupes" h={136} line={1.9} />
          </div>
        </div>
      </div>
      <div className="mk-wrap">
        <div className="oi-done-d">
          <div className="oi-done-w">
            <div>
              <h1 className="mk-h1">Posted.</h1>
              <p className="mk-sub-serif">Now, see who’s in.</p>
              <DoneNote paid={paid} />
            </div>
          </div>
          <div className="oi-done-r">
            <div className="oi-card-wrap">
              <div className="oi-prev-art">
                <InkDrawing name="trainer" w={152} line={2.5} />
              </div>
              {card}
            </div>
          </div>
        </div>
      </div>
    </Main>
  );
}

export function PostLoading() {
  return (
    <Main busy pad={false}>
      <span className="mk-sr">Loading</span>
      <BackRow href={ROUTES.openInvite} label="Cancel" />
      <div className="mk-wrap" aria-hidden="true">
        <div className="oi-form-head">
          <h1 className="mk-h1">Got a plan?</h1>
          <p className="mk-sub-serif">See who’s in.</p>
        </div>
        <div className="oi-form-grid">
          <div className="oi-form">
            {[0, 1, 2, 3].map((index) => (
              <div key={index}>
                <Shape width={88} height={16} style={{ marginBottom: 8 }} />
                <Shape height={50} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Main>
  );
}
