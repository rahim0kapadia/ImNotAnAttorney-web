"use client";
/**
 * FTA Savings Calculator, shows partners the financial impact
 * of court reminders on their FTA rate.
 *
 * Based on research: court reminders reduce FTA by ~7%.
 * A single FTA costs the bondsman the full bail amount.
 */

import { useState } from "react";
import { tierPriceNum } from "@/lib/tiers";

export function FtaCalculator() {
  const [monthlyClients, setMonthlyClients] = useState(20);
  const [avgBail, setAvgBail] = useState(10000);

  // Industry average FTA rate: ~15% without reminders
  // With reminders: reduces by ~7 percentage points → ~8%
  const FTA_RATE_WITHOUT = 0.15;
  const FTA_REDUCTION = 0.07;
  const FTA_RATE_WITH = FTA_RATE_WITHOUT - FTA_REDUCTION;

  const annualClients = monthlyClients * 12;
  const ftaWithout = Math.round(annualClients * FTA_RATE_WITHOUT);
  const ftaWith = Math.round(annualClients * FTA_RATE_WITH);
  const ftaPrevented = ftaWithout - ftaWith;
  const savedAmount = ftaPrevented * avgBail;

  // Commission estimate (5% conversion at avg Case Decoder price)
  const commissionEstimate = Math.round(annualClients * 0.05 * tierPriceNum("case-decoder") * 0.1);

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <h2 className="text-xl font-bold mb-2">FTA Savings Calculator</h2>
      <p className="text-sm text-zinc-400 mb-6">
        See how court reminders protect your bottom line.
      </p>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div>
          <label htmlFor="monthlyClients" className="block text-sm text-zinc-300 mb-1">
            Clients per month
          </label>
          <input
            id="monthlyClients"
            type="number"
            min={1}
            max={500}
            value={monthlyClients}
            onChange={(e) => setMonthlyClients(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="avgBail" className="block text-sm text-zinc-300 mb-1">
            Average bail amount ($)
          </label>
          <input
            id="avgBail"
            type="number"
            min={500}
            max={500000}
            step={500}
            value={avgBail}
            onChange={(e) => setAvgBail(Math.max(500, parseInt(e.target.value) || 500))}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:border-amber-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-800 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-red-400">{ftaWithout}</p>
          <p className="text-xs text-zinc-400 mt-1">FTAs/year without reminders</p>
        </div>
        <div className="bg-zinc-800 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-green-400">{ftaPrevented}</p>
          <p className="text-xs text-zinc-400 mt-1">FTAs prevented</p>
        </div>
        <div className="bg-zinc-800 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-amber-400">${savedAmount.toLocaleString()}</p>
          <p className="text-xs text-zinc-400 mt-1">Estimated savings/year</p>
        </div>
      </div>

      <div className="mt-4 bg-zinc-800 rounded-lg p-4">
        <p className="text-sm text-zinc-300">
          <span className="text-amber-400 font-bold">Plus:</span> ~${commissionEstimate.toLocaleString()}/year in commission from clients who upgrade to case analysis.
        </p>
      </div>

      <p className="text-xs text-zinc-400 mt-3">
        Based on industry average 15% FTA rate and research showing court reminders reduce FTA by ~7 percentage points.
      </p>
    </section>
  );
}
