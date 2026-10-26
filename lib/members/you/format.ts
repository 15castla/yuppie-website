// Small, pure formatters for the You page. No React, no next/*.

import { parsePhoneNumberFromString } from "libphonenumber-js";

import { COMPANY, REGISTERED_OFFICE } from "@/components/site/links";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function firstNameOf(fullName: string | null | undefined): string {
  return fullName?.trim().split(/\s+/)[0] ?? "";
}

// "Sep 2026", in London time, from the row's created_at. A fixed list of
// month names, because Intl spells September "Sept" in en-GB.
export function memberSince(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { month: "numeric", year: "numeric", timeZone: "Europe/London" }).formatToParts(date);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const year = parts.find((part) => part.type === "year")?.value;
  if (!month || !year) return null;
  return `${MONTHS[month - 1]} ${year}`;
}

// getNextBillingDate() gives "12 November 2026"; the card says "12 Nov".
export function shortDate(long: string | null | undefined): string | null {
  if (!long) return null;
  const match = /^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*(?:\s+\d{4})?$/.exec(long.trim());
  return match ? `${match[1]} ${match[2][0].toUpperCase()}${match[2].slice(1).toLowerCase()}` : long;
}

// The line under the giant wordmark. From components/site/links.ts, the one
// place for the company's details, exactly as the public site's footer reads
// it: the registered-company line once the company is set there, else the
// short line. Two parts, so a phone can break between them and never inside.
export function legalLines(year: number): string[] {
  if (COMPANY.name && COMPANY.number) {
    return [
      `© ${year} ${COMPANY.name}. Registered in England and Wales, company no. ${COMPANY.number}.`,
      `Registered office: ${REGISTERED_OFFICE}.`,
    ];
  }
  return [`© ${year} Club Yuppie. All rights reserved.`];
}

// The saved number is stored in full international form (+447700900123). On
// You it reads the way people write it: 07700 900123 for a UK number, the
// international form for any other. Anything that does not parse is shown as
// saved. Display only: the Edit field keeps the stored value.
export function displayPhone(phone: string | null | undefined): string | null {
  const value = phone?.trim();
  if (!value) return null;
  const parsed = parsePhoneNumberFromString(value);
  if (!parsed) return value;
  return parsed.country === "GB" ? parsed.formatNational() : parsed.formatInternational();
}
