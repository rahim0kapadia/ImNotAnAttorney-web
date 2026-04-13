"use client";
/**
 * CheckInButton — Defendant daily check-in with optional geolocation.
 *
 * Requests location permission on click, then POSTs to /api/check-in.
 * Falls back to check-in without coordinates if permission is denied.
 * Rate-limited to one check-in per 12 hours (server-enforced).
 */

import { useState, useEffect } from "react";

interface CheckInButtonProps {
  token: string;
  lastCheckIn: string | null;
}

type CheckInState = "idle" | "requesting-location" | "submitting" | "success" | "already-checked-in" | "error";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function CheckInButton({ token, lastCheckIn }: CheckInButtonProps) {
  const [state, setState] = useState<CheckInState>("idle");
  const [displayTime, setDisplayTime] = useState<string | null>(null);

  useEffect(() => {
    if (lastCheckIn) {
      const elapsed = Date.now() - new Date(lastCheckIn).getTime();
      if (elapsed < TWELVE_HOURS_MS) {
        setState("already-checked-in");
        setDisplayTime(formatTime(lastCheckIn));
      }
    }
  }, [lastCheckIn]);

  async function submitCheckIn(coords?: { latitude: number; longitude: number; accuracy_meters: number }) {
    setState("submitting");
    try {
      const res = await fetch("/api/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...coords }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setState("already-checked-in");
        setDisplayTime(data.lastCheckIn ? formatTime(data.lastCheckIn) : null);
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setState("success");
      setDisplayTime(data.checkedInAt ? formatTime(data.checkedInAt) : null);
    } catch {
      setState("error");
    }
  }

  function handleClick() {
    if (state === "submitting" || state === "requesting-location") return;

    setState("requesting-location");
    if (!navigator.geolocation) {
      submitCheckIn();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        submitCheckIn({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_meters: Math.round(pos.coords.accuracy),
        });
      },
      () => {
        // Permission denied or error — check in without location
        submitCheckIn();
      },
      { timeout: 8000, enableHighAccuracy: false },
    );
  }

  const disabled = state === "submitting" || state === "requesting-location" || state === "success" || state === "already-checked-in";

  return (
    <div className="text-center mb-8 print:hidden">
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`w-full max-w-sm px-6 py-4 font-bold rounded-lg text-lg transition-colors ${
          disabled
            ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
            : "bg-amber-500 text-black hover:bg-amber-400 cursor-pointer"
        }`}
      >
        {state === "requesting-location" && "Requesting location..."}
        {state === "submitting" && "Checking in..."}
        {state === "idle" && "Check In Today"}
        {state === "error" && "Check-in failed — try again"}
        {state === "success" && "Checked In"}
        {state === "already-checked-in" && "Checked In"}
      </button>
      {(state === "success" || state === "already-checked-in") && displayTime && (
        <p className="text-green-400 text-sm mt-2">Checked in at {displayTime}</p>
      )}
    </div>
  );
}
