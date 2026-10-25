"use client";

// The Concierge's pieces: the compact header, the member's bubble, the
// concierge's reply, a place it recommends, the "Remembered" chip, the
// composer, the memory sheet and its confirm. Markup and measurements are the
// approved design's (v3 pages_conc.py, cyp.css section 2) with the booking
// language corrected: the concierge recommends and never books.

import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { Button, Icon, Pill } from "@/components/members/kit";
import { TopActions } from "@/components/members/shell/top-actions";
import type {
  ConciergeMemberMessage,
  ConciergeMemoryItem,
  ConciergeRecommendation,
  ConciergeReply,
} from "@/lib/members/concierge/types";
import { cn } from "@/lib/utils";
import { useDialog } from "./use-dialog";
import { useKeyboardOffset } from "./use-keyboard-offset";

/** "Remembered: likes quiet places." The chip reads as a sentence, so the item's first letter drops to lower case. */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Keeps the end of a suggestion together so a tile never ends on a lone word
 * or a lone "&": a non-breaking space joins the last two words (three, when
 * the middle one is "&").
 */
export function bindTail(text: string): string {
  const words = text.split(" ");
  if (words.length < 3) return text;
  const glue = words[words.length - 2] === "&" ? 3 : 2;
  const head = words.slice(0, words.length - glue).join(" ");
  const tail = words.slice(words.length - glue).join("\u00a0");
  return `${head} ${tail}`;
}

// ---------------------------------------------------------------- header

/** Once a chat is open the title block gives way to this compact row: identity, name, memory, your photo. */
export function CompactBar({
  onOpenMemory,
  memoryRef,
  inert,
}: {
  onOpenMemory: () => void;
  /** The memory button, so focus can go back to it when the sheet closes. */
  memoryRef: RefObject<HTMLButtonElement | null>;
  inert?: boolean;
}) {
  return (
    <header className="mk-subbar cn-bar" data-needs-device-check="true" inert={inert}>
      <span className="cn-id" aria-hidden="true">
        <Icon name="concierge" size={22} />
      </span>
      <div className="mk-mid">
        <b role="heading" aria-level={1}>
          Concierge
        </b>
        <span>AI concierge</span>
      </div>
      <div className="cn-r">
        <button
          ref={memoryRef}
          type="button"
          className="mk-icon-btn mk-bare"
          aria-label="What the concierge remembers"
          aria-haspopup="dialog"
          onClick={onOpenMemory}
        >
          <Icon name="book-open" size={22} />
        </button>
        <TopActions />
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- thread

function Who() {
  return (
    <span className="cn-who" aria-hidden="true">
      <Icon name="concierge" size={14} />
      Concierge
    </span>
  );
}

export function MemberBubble({ message }: { message: ConciergeMemberMessage }) {
  return (
    <div className="mk-msg mk-me">
      <div className="mk-b">{message.text}</div>
      <span className="mk-t">{message.at}</span>
    </div>
  );
}

/** Sent, and nothing came back: said once, with the way to try again. */
export function NotSent({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="cn-fail">
      <span className="cn-e">
        <Icon name="wifi-off" size={16} />
        Not sent. No connection.
      </span>
      <Button variant="outline" size="sm" icon={<Icon name="refresh-cw" size={18} />} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** While the reply is on its way: static words, no spinner. */
export function Waiting() {
  return (
    <div className="mk-msg mk-them cn-wait">
      <Who />
      <div className="mk-b">Looking for places…</div>
    </div>
  );
}

export function RecommendationCard({ place }: { place: ConciergeRecommendation }) {
  return (
    <article className="cn-rec" aria-label={place.name}>
      <div className="cn-bd">
        <h3>{place.name}</h3>
        <p className="cn-why">{place.why}</p>
        {place.facts.length > 0 ? (
          <div className="cn-facts">
            {place.facts.slice(0, 2).map((fact) => (
              <Pill key={fact}>{fact}</Pill>
            ))}
          </div>
        ) : null}
      </div>
      <div className="cn-ft">
        <span className="cn-addr">
          <Icon name="map-pin" size={16} />
          <span>{place.address}</span>
        </span>
        <a
          className="mk-link cn-maps"
          href={place.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open in Maps, ${place.name}`}
        >
          Open in Maps
          <Icon name="arrow-up-right" size={16} />
        </a>
      </div>
    </article>
  );
}

function RememberedChip({
  item,
  remembered,
  onUndo,
}: {
  item: ConciergeMemoryItem;
  /** Still in memory: Undo is on offer. Else it has been forgotten. */
  remembered: boolean;
  onUndo: () => void;
}) {
  return (
    <div className="cn-learn">
      <Icon name="book-open" size={14} />
      <span>
        {remembered ? "Remembered" : "Forgotten"}: {lowerFirst(item.text)}.
      </span>
      {remembered ? (
        <button type="button" className="mk-link" onClick={onUndo}>
          Undo
        </button>
      ) : null}
    </div>
  );
}

/** One reply: the bubble, the places it recommends, and what it learned. */
export function ReplyBlock({
  reply,
  domId,
  inMemory,
  onUndo,
}: {
  reply: ConciergeReply;
  domId: string;
  /** Ids of everything it remembers now (the chip offers Undo only while its item is still there). */
  inMemory: ReadonlySet<string>;
  onUndo: (itemId: string) => void;
}) {
  const advice = (reply.steps?.length ?? 0) > 0 || Boolean(reply.closing);
  const places = reply.recommendations ?? [];
  const learned = reply.remembered;
  return (
    <div className="cn-reply" id={domId}>
      <div className="mk-msg mk-them">
        <Who />
        <div className={cn("mk-b", advice && "cn-long")}>
          {advice ? (
            <>
              <p>{reply.text}</p>
              {reply.steps?.length ? (
                <ol>
                  {reply.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              ) : null}
              {reply.closing ? <p>{reply.closing}</p> : null}
            </>
          ) : (
            reply.text
          )}
        </div>
        {places.length === 0 ? <span className="mk-t">{reply.at}</span> : null}
      </div>
      {places.map((place) => (
        <RecommendationCard key={place.id} place={place} />
      ))}
      {learned ? (
        <RememberedChip item={learned} remembered={inMemory.has(learned.id)} onUndo={() => onUndo(learned.id)} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- composer

/**
 * Above the tab bar, solid yellow, 16px type so iOS never zooms. While the
 * input has focus the page hides the tab bar (see concierge.css) and this
 * rides the keyboard (useKeyboardOffset). needs_device_check.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  canSend,
  placeholder,
  onTypingChange,
  autoFocus,
  inert,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  canSend: boolean;
  placeholder: string;
  onTypingChange: (typing: boolean) => void;
  autoFocus?: boolean;
  inert?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  useKeyboardOffset(formRef);

  return (
    <form
      ref={formRef}
      className="cn-composer"
      data-needs-device-check="true"
      inert={inert}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <input
        className="mk-input"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => onTypingChange(true)}
        onBlur={() => onTypingChange(false)}
        aria-label="Ask the concierge"
        placeholder={placeholder}
        enterKeyHint="send"
        autoComplete="off"
        maxLength={500}
        autoFocus={autoFocus}
      />
      <button
        type="submit"
        className={cn("mk-send", !canSend && "mk-off")}
        aria-label="Send"
        disabled={!canSend}
        // keep the keyboard up: a tap on Send must not blur the input
        onMouseDown={(event) => event.preventDefault()}
      >
        <Icon name="arrow-up" size={22} />
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- memory

function ForgetAlert({ onForget, onKeep }: { onForget: () => void; onKeep: () => void }) {
  const titleId = useId();
  const { ref, onKeyDown } = useDialog<HTMLDivElement>({ onClose: onKeep, initialFocus: "[data-keep]" });
  return (
    <>
      <div className="mk-scrim cn-scrim2" aria-hidden="true" onClick={onKeep} />
      <div
        ref={ref}
        className="cn-alert"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-needs-device-check="true"
      >
        <h2 id={titleId} className="mk-h2">
          Forget everything?
        </h2>
        <p className="cn-p">The concierge starts again from scratch. This can’t be undone.</p>
        <div className="cn-acts">
          <Button className="cn-danger" onClick={onForget}>
            Forget everything
          </Button>
          <Button variant="outline" onClick={onKeep} data-keep="">
            Keep it
          </Button>
        </div>
      </div>
    </>
  );
}

/** "What the concierge remembers": every item with a way to remove it, Forget everything at the foot, then Done. */
export function MemorySheet({
  memory,
  onRemove,
  onForgetAll,
  onClose,
  startConfirming = false,
}: {
  memory: ConciergeMemoryItem[];
  onRemove: (itemId: string) => void;
  onForgetAll: () => void;
  onClose: () => void;
  /** Preview harness only: open with the confirm already showing. */
  startConfirming?: boolean;
}) {
  const titleId = useId();
  const [confirming, setConfirming] = useState(startConfirming);
  const { ref, onKeyDown } = useDialog<HTMLDivElement>({ onClose, lockScroll: true });
  const forgetLink = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(startConfirming);

  // The confirm closed: focus goes back to the link that opened it, or to the sheet when that link is gone
  // (after Forget everything the list, and the link, are replaced by "Nothing yet").
  useEffect(() => {
    if (wasConfirming.current && !confirming) (forgetLink.current ?? ref.current)?.focus({ preventScroll: true });
    wasConfirming.current = confirming;
  }, [confirming, ref]);

  function forgetAll() {
    onForgetAll();
    setConfirming(false);
  }

  return (
    <>
      <div className="mk-scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={ref}
        className="mk-sheet cn-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        inert={confirming}
        onKeyDown={onKeyDown}
        data-needs-device-check="true"
      >
        <div className="mk-grab" aria-hidden="true" />
        <h2 id={titleId} className="mk-h2">
          What the concierge remembers
        </h2>
        <p className="cn-p" style={{ marginTop: 4 }}>
          It uses this to pick places for you. Only you can see it.
        </p>
        {memory.length > 0 ? (
          <>
            <ul className="cn-memlist">
              {memory.map((item) => (
                <li key={item.id} className="cn-memrow">
                  <span>{item.text}</span>
                  <button
                    type="button"
                    className="cn-x"
                    aria-label={`Remove: ${item.text}`}
                    onClick={() => onRemove(item.id)}
                  >
                    <Icon name="x" size={20} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="cn-memfoot">
              <button ref={forgetLink} type="button" className="mk-link mk-danger" onClick={() => setConfirming(true)}>
                Forget everything
              </button>
            </div>
          </>
        ) : (
          <p className="cn-p" style={{ marginTop: 16 }}>
            <b>Nothing yet.</b> Ask where to go and it starts to learn what you like.
          </p>
        )}
        <div className="cn-acts">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
      {confirming ? <ForgetAlert onForget={forgetAll} onKeep={() => setConfirming(false)} /> : null}
    </>
  );
}
