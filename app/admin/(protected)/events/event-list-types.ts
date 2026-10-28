// Shared by the events server pages and the client list.

export type EventListRow = {
  id: string;
  slug: string;
  title: string;
  startTime: string;
  location: string | null;
  capacity: number | null;
  pricePence: number;
  cancelled: boolean;
  past: boolean;
  booked: number;
};

export type EventListTab = "coming" | "past";

export function currentListTab(value: string | null | undefined): EventListTab {
  return value === "past" ? "past" : "coming";
}

/** Coming up: soonest first (cancelled ones stay, marked). Past: the latest first. */
export function eventsIn(rows: EventListRow[], tab: EventListTab): EventListRow[] {
  return tab === "coming" ? rows.filter((r) => !r.past) : rows.filter((r) => r.past).reverse();
}
