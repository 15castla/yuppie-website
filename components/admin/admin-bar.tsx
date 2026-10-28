"use client";

// The admin bar (r2b 12): the wordmark, the nav with counts and Account (its menu has your email and Log out).
// Below 1100px the links fold into one Menu button and a panel of ruled 56px rows over a cream wash (B-D5);
// the page underneath does not move. Reports, Photos and Payments are Phase B (B-D22): not in the nav yet.

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { signOut } from "@/app/admin/actions";
import { Icon } from "./icons";

export type AdminNavCounts = { applications: number };

const NAV: { href: string; label: string; count?: keyof AdminNavCounts }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/applications", label: "Applications", count: "applications" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/discounts", label: "Discounts" },
  { href: "/admin/access", label: "Access" },
];

function isCurrent(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

function LogOutButton({ className, children }: { className: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending || undefined} role="menuitem">
      {children}
    </button>
  );
}

export function AdminBar({ email, counts }: { email: string; counts: AdminNavCounts }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const acctButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [openedOn, setOpenedOn] = useState(pathname);

  // A new page closes both.
  if (openedOn !== pathname) {
    setOpenedOn(pathname);
    setMenuOpen(false);
    setAcctOpen(false);
  }

  useEffect(() => {
    if (!menuOpen && !acctOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Escape closes what is open and puts the keyboard back on the button that opened it (QA2-11).
        if (menuOpen) menuButtonRef.current?.focus();
        else if (acctOpen) acctButtonRef.current?.focus();
        setMenuOpen(false);
        setAcctOpen(false);
        return;
      }
      // While the Menu panel is open the keyboard stays in it: Close, the rows, Log out, then round again,
      // never the page behind the wash (QA2-11).
      if (event.key === "Tab" && menuOpen && panelRef.current && menuButtonRef.current) {
        const items = [menuButtonRef.current, ...Array.from(panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)"))];
        const at = items.indexOf(document.activeElement as HTMLElement);
        if (at === -1 || (event.shiftKey && at === 0) || (!event.shiftKey && at === items.length - 1)) {
          event.preventDefault();
          items[event.shiftKey ? items.length - 1 : 0].focus();
        }
      }
    }
    function onDown(event: PointerEvent) {
      if (acctOpen && acctRef.current && !acctRef.current.contains(event.target as Node)) setAcctOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [menuOpen, acctOpen]);

  const countOf = (key?: keyof AdminNavCounts) => (key && counts[key] > 0 ? counts[key] : null);

  return (
    <>
      <div className="ad-band">
        <div className="ad-wrap">
          <span className="l">Admin</span>
          <span className="r">Logged in as {email}</span>
        </div>
      </div>
      <div className="ad-bar">
        <div className="ad-wrap">
          <Link className="ad-wm-link" href="/admin" aria-label="Club Yuppie admin, dashboard">
            <Image src="/yuppie_logo_forte_forward.png" alt="Club Yuppie" width={1942} height={641} sizes="92px" priority className="ad-wm" />
          </Link>
          <nav className="ad-nav" aria-label="Admin">
            {NAV.map((item) => {
              const n = countOf(item.count);
              return (
                <Link key={item.href} href={item.href} aria-current={isCurrent(pathname, item.href) ? "page" : undefined}>
                  {item.label}
                  {n !== null && (
                    <span className="n">
                      <span className="ad-sr"> (</span>
                      {n}
                      <span className="ad-sr"> waiting)</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="ad-acct" ref={acctRef}>
            <button
              ref={menuButtonRef}
              type="button"
              className="ad-bare menu-b"
              aria-expanded={menuOpen}
              aria-controls="ad-menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Icon name={menuOpen ? "x" : "menu"} size={22} />
              <span>{menuOpen ? "Close" : "Menu"}</span>
            </button>
            <button
              ref={acctButtonRef}
              type="button"
              className="ad-bare acct"
              aria-haspopup="menu"
              aria-expanded={acctOpen}
              onClick={() => setAcctOpen((v) => !v)}
            >
              Account
              <Icon name="chevron-down" size={18} className="flip" />
            </button>
            {acctOpen && (
              <div className="ad-pop" role="menu" aria-label="Account">
                <div className="who">
                  <b>Logged in as</b>
                  <span>{email}</span>
                </div>
                <hr />
                <form action={signOut}>
                  <LogOutButton className="it">
                    <Icon name="log-out" size={20} />
                    <span>Log out</span>
                  </LogOutButton>
                </form>
              </div>
            )}
          </div>
        </div>
        {menuOpen && (
          <>
            <div className="ad-menu" id="ad-menu" ref={panelRef}>
              <div className="ad-wrap">
                <nav aria-label="Admin">
                  {NAV.map((item) => {
                    const n = countOf(item.count);
                    const current = isCurrent(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        className="ad-mrow"
                        href={item.href}
                        aria-current={current ? "page" : undefined}
                        onClick={() => setMenuOpen(false)}
                      >
                        <span className="lb">
                          <span className="mk" />
                          {item.label}
                        </span>
                        {n !== null && <span className="n">{n}</span>}
                      </Link>
                    );
                  })}
                </nav>
                <div className="ad-mfoot">
                  <p>Logged in as {email}</p>
                  <form action={signOut}>
                    <button type="submit" className="ad-link">
                      Log out
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      {menuOpen && <button type="button" className="ad-menu-scrim" aria-label="Close the menu" tabIndex={-1} onClick={() => setMenuOpen(false)} />}
    </>
  );
}
