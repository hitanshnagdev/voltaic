"use client";

import { useEffect, useState } from "react";

type Ev = {
  id: string;
  title: string;
  start: string | null;
  attendees: string[];
  hangoutLink: string | null;
};

export function UpcomingMeetings() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [events, setEvents] = useState<Ev[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/integrations/google/events")
      .then((r) => r.json())
      .then((d: { events?: Ev[] }) => {
        if (!alive) return;
        setEvents(d.events ?? []);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <p className="mt-3 text-[12px] text-[var(--color-muted-soft)]">
        Loading your upcoming meetings…
      </p>
    );
  }
  if (state === "error") {
    return (
      <p className="mt-3 text-[12px] text-[var(--color-clay)]">
        Couldn&apos;t load calendar events.
      </p>
    );
  }
  if (events.length === 0) {
    return (
      <p className="mt-3 text-[12px] text-[var(--color-muted-soft)]">
        No upcoming meetings on your calendar.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-1.5">
      {events.map((e) => (
        <div
          key={e.id}
          className="flex items-center justify-between rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
        >
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-[var(--color-ink)]">
              {e.title}
            </div>
            <div className="text-[11px] text-[var(--color-muted-soft)]">
              {e.start
                ? new Date(e.start).toLocaleString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "—"}
              {e.attendees.length > 0 ? ` · ${e.attendees.length} invitees` : ""}
            </div>
          </div>
          {e.hangoutLink && (
            <span className="shrink-0 rounded-full bg-[var(--color-sage-tint)] px-2 py-0.5 text-[10px] font-medium text-[#3a5844]">
              Meet
            </span>
          )}
        </div>
      ))}
      <p className="pt-1 text-[11px] text-[var(--color-muted-soft)]">
        Paste a transcript below when you have one — Voltaic checks it against
        your specs.
      </p>
    </div>
  );
}
