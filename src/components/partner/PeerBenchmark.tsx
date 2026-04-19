/**
 * PeerBenchmark, dashboard peer-comparison block for bondsman partners.
 *
 * Pulled from partner_peer_benchmark() RPC. API guards on peer_count >= 10
 * before passing data in, so we don't show comparisons against a handful
 * of peers. When a partner is below median, we frame as "room to capture"
 * (Firestone retention voice), never as underperforming.
 *
 * Voice: bondsman-native, conversational. "Reminders delivered" not
 * "engagement metrics". "Clients on watch" not "active users".
 */

export interface PeerBenchmarkData {
  my_reminders_30d: number;
  my_active_clients: number;
  peer_median_reminders_30d: number;
  peer_median_active_clients: number;
  my_rank_percentile: number | null;
  peer_count: number;
}

interface PeerBenchmarkProps {
  data: PeerBenchmarkData;
}

function formatPercentile(p: number | null): string {
  if (p === null) return "\u2014";
  if (p >= 95) return "top 5%";
  if (p >= 75) return "top 25%";
  if (p >= 50) return "above the middle";
  if (p >= 25) return "with room to climb";
  return "plenty of room to capture";
}

export function PeerBenchmark({ data }: PeerBenchmarkProps) {
  const {
    my_reminders_30d,
    my_active_clients,
    peer_median_reminders_30d,
    peer_median_active_clients,
    my_rank_percentile,
    peer_count,
  } = data;

  const remindersDeltaPct =
    peer_median_reminders_30d > 0
      ? Math.round(
          ((my_reminders_30d - peer_median_reminders_30d) / peer_median_reminders_30d) * 100,
        )
      : null;

  return (
    <section
      aria-labelledby="peer-benchmark-heading"
      className="bg-zinc-900 rounded-xl border border-zinc-700 p-6"
    >
      <h2 id="peer-benchmark-heading" className="text-xl font-bold mb-1">
        You vs peer bondsmen
      </h2>
      <p className="text-xs text-zinc-400 mb-5">
        Compared against {peer_count} bondsmen who delivered at least three
        reminders in the last 30 days.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="bg-zinc-800 rounded-lg p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-400 mb-1">
            Reminders delivered (30d)
          </p>
          <p className="text-2xl font-bold text-white">{my_reminders_30d}</p>
          <p className="text-xs text-zinc-400 mt-1">
            Peer median: {Math.round(peer_median_reminders_30d)}
            {remindersDeltaPct !== null && remindersDeltaPct !== 0 && (
              <span
                className={
                  remindersDeltaPct > 0 ? "text-amber-400 ml-2" : "text-zinc-400 ml-2"
                }
              >
                {remindersDeltaPct > 0 ? "+" : ""}
                {remindersDeltaPct}%
              </span>
            )}
          </p>
        </div>

        <div className="bg-zinc-800 rounded-lg p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-400 mb-1">
            Clients on watch
          </p>
          <p className="text-2xl font-bold text-white">{my_active_clients}</p>
          <p className="text-xs text-zinc-400 mt-1">
            Peer median: {Math.round(peer_median_active_clients)}
          </p>
        </div>

        <div className="bg-zinc-800 rounded-lg p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-400 mb-1">
            Your rank
          </p>
          <p className="text-2xl font-bold text-white">
            {formatPercentile(my_rank_percentile)}
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            On reminder delivery volume
          </p>
        </div>
      </div>

      {my_rank_percentile !== null && my_rank_percentile < 50 && (
        <p className="mt-4 text-sm text-zinc-300">
          <span className="text-amber-400 font-semibold">Room to capture:</span>{" "}
          The bondsmen above the median send the partner link to every client
          they bond out. The Toolkit section below has your text snippets.
        </p>
      )}
    </section>
  );
}
