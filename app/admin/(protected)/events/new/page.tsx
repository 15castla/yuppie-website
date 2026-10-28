import { requireAdmin } from "@/app/admin/require-admin";
import { Card } from "@/components/admin/ui";
import { EventForm } from "../EventForm";

// Add an event (r2b 17): the same card with empty fields; it appears in the Events list as soon as it is made.
export default async function NewEventPage() {
  await requireAdmin();
  return (
    <Card labelledBy="new-event">
      <div className="ad-dh">
        <div className="tt">
          <h2 id="new-event" className="ad-h2">
            New event
          </h2>
          <p className="sub">It appears in the Events list as soon as you create it.</p>
        </div>
      </div>
      <EventForm
        mode="new"
        linkHost="clubyuppie.com"
        initial={{ title: "", category: "", location: "", address: "", start: "", end: "", price: "0", capacity: "", description: "" }}
      />
    </Card>
  );
}
