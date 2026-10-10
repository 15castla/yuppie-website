// The native sign-in form's copy of use-keyboard-reveal.ts, kept separate
// so the app's screen can change independently of the website's.

import { useEffect, type RefObject } from "react";

// On iOS, WebKit normally scrolls a focused field so it's centered in
// the space left above the keyboard. But for the first keyboard shown in
// a fresh WebKit process it can skip that scroll: the keyboard hasn't
// been laid out yet when WebKit decides how far to scroll, so it sees
// nothing covered, and nothing re-checks once the real keyboard arrives.
// The field and the button under it stay behind the keyboard; every later
// focus works. Reproduced in Safari (Simulator, and an iPhone 14 Pro Max:
// first tap no scroll with the button hidden, second tap the input
// centered at (visible height - input height) / 2). The app's WebView
// races the same way but wasn't seen failing.
//
// This reacts to the real keyboard geometry (visualViewport resize), not
// timing: whenever the keyboard changes the visible area while `input` is
// focused and its form (input, button and the row below) is covered, it
// moves the input to that same centered spot. If WebKit has already
// scrolled, the form is clear and this does nothing; if both act, they
// aim at the same spot. Scrolling needs room the page doesn't have (it's
// exactly one screen tall), so `spacer` temporarily gets the height of
// the keyboard's overlap, removed once the keyboard closes. WebKit doesn't
// undo a scroll it didn't make, so when the input loses focus (the
// keyboard starts closing) this scrolls back itself, alongside the
// keyboard, rather than leaving the page up until the spacer goes and it
// snaps down. Desktop browsers and Android Chrome (which shrinks the
// layout viewport instead) never see an overlap, so nothing happens there.
export function useKeyboardReveal(
  input: RefObject<HTMLInputElement | null>,
  spacer: RefObject<HTMLDivElement | null>,
  reduceMotion: boolean,
) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
    // Scroll position before this hook's own reveal; null when WebKit
    // handled it (or nothing needed revealing).
    let revealedFrom: number | null = null;

    const onResize = () => {
      const field = input.current;
      const room = spacer.current;
      if (!field || !room) return;

      const overlap = Math.round(window.innerHeight - viewport.height);
      // Keyboard closed (or the visible area isn't keyboard-shrunk): drop
      // the extra room. Pinch-zoom also shrinks the visual viewport, so
      // leave zoomed states alone.
      if (overlap <= 0 || viewport.scale > 1.01) {
        room.style.height = "0px";
        revealedFrom = null;
        return;
      }
      if (document.activeElement !== field) return;

      const rect = field.getBoundingClientRect();
      const formBottom = field.form?.getBoundingClientRect().bottom ?? rect.bottom;
      // Where WebKit centers a focused field: mid-way down the area left
      // above the keyboard.
      const offset = Math.round(rect.top - (viewport.height - rect.height) / 2);
      const covered = formBottom > viewport.height && offset > 0;
      // Once this hook has scrolled, later resizes (the keyboard growing
      // when Safari adds its AutoFill bar) re-target the same centered
      // spot WebKit aims for, so if WebKit scrolls too they converge
      // instead of pulling in different directions.
      const retarget = revealedFrom !== null && Math.abs(offset) > 1;
      if (!covered && !retarget) return;
      room.style.height = `${overlap}px`;
      revealedFrom ??= window.scrollY;
      window.scrollTo({ top: window.scrollY + offset, behavior });
    };

    const onFocusOut = (event: FocusEvent) => {
      if (event.target !== input.current || revealedFrom === null) return;
      window.scrollTo({ top: revealedFrom, behavior });
    };

    viewport.addEventListener("resize", onResize);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      viewport.removeEventListener("resize", onResize);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [input, spacer, reduceMotion]);
}
