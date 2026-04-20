"use client";
/**
 * RemindersOnYourBehalf, "carbon-copy" feed of reminders delivered on a
 * partner's behalf over the last 7 days.
 *
 * Pulls from sms_log (joined to court_reminders by court_reminder_id)
 * rather than from the court_reminders.reminders_sent[] array, because
 * that array only stores key names (reminder_14d, reminder_7d, ...) with
 * no timestamps. sms_log has created_at + category, which is what the
 * bondsman actually wants to see.
 *
 * Privacy: first name + last initial only. Never full name here.
 */

interface ReminderFeedItem {
  /** ISO timestamp of the send. */
  sentAt: string;
  /** e.g. "Maria R." */
  clientLabel: string;
  /** Human-readable description, e.g. "48-hr court reminder delivered". */
  action: string;
}

interface RemindersOnYourBehalfProps {
  items: ReminderFeedItem[];
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} ${time}`;
}

export function RemindersOnYourBehalf({ items }: RemindersOnYourBehalfProps) {
  return (
    <section
      aria-labelledby="reminders-feed-heading"
      className="bg-zinc-900 rounded-xl border border-zinc-700 p-6"
    >
      <h2 id="reminders-feed-heading" className="text-xl font-bold mb-1">
        This week on your behalf
      </h2>
      <p className="text-xs text-zinc-400 mb-4">
        Reminders we delivered to clients using your link in the last 7 days.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-400">
          No reminders sent yet this week. Text your link to the next client
          you bond out &ndash; we start delivering on the next daily cron (9&nbsp;AM&nbsp;EST).
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li
              key={`${item.sentAt}-${i}`}
              className="flex items-start gap-3 text-sm border-b border-zinc-800 pb-2 last:border-b-0 last:pb-0"
            >
              <span className="text-amber-400 mt-0.5" aria-hidden="true">
                &bull;
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-zinc-400 mr-2">{formatWhen(item.sentAt)}</span>
                <span className="text-white font-medium">{item.clientLabel}</span>
                <span className="text-zinc-300"> &mdash; {item.action}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export type { ReminderFeedItem };
