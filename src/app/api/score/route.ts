import { NextRequest, NextResponse } from "next/server";

type ScoreInput = {
  chargeType: string;
  timeSinceArrest: string;
  hasAttorney: string;
  motionsFiled: string;
  hasDiscovery: string;
  communicationFrequency: string;
  strategyDiscussed: string;
};

type ScoreResult = {
  score: number;
  band: string;
  observations: string[];
};

function calculateScore(input: ScoreInput): ScoreResult {
  let score = 50; // Start at midpoint
  const observations: string[] = [];

  // --- Time since arrest vs milestones (30% weight) ---
  const timeMap: Record<string, number> = {
    "less-than-1-month": 0,
    "1-3-months": 1,
    "3-6-months": 2,
    "6-12-months": 3,
    "12-plus-months": 4,
  };
  const timeIndex = timeMap[input.timeSinceArrest] ?? 0;

  // --- Attorney type modifier (10% weight) ---
  if (input.hasAttorney === "private") {
    score += 5;
  } else if (input.hasAttorney === "public-defender") {
    score += 0; // neutral — PDs are overloaded, not bad
  } else if (input.hasAttorney === "no") {
    score -= 15;
    observations.push(
      "You don't have an attorney yet. This is urgent — most motion deadlines run from arrest date, not from when you hire counsel."
    );
  }

  // --- Motions filed (20% weight) ---
  if (input.motionsFiled === "yes") {
    score += 15;
    if (timeIndex >= 2) {
      observations.push(
        "Your attorney has filed motions — that's a positive sign of active case management."
      );
    }
  } else if (input.motionsFiled === "no") {
    if (timeIndex >= 2) {
      score -= 20;
      observations.push(
        `At ${getTimeLabel(input.timeSinceArrest)} post-arrest with no motions filed, your attorney may be behind on standard defense milestones. Key suppression and discovery motions typically need to be filed early.`
      );
    } else {
      score -= 5;
    }
  } else {
    // "dont-know"
    score -= 10;
    observations.push(
      "You don't know whether motions have been filed. Your attorney should be telling you this proactively — ask them at your next meeting."
    );
  }

  // --- Discovery received (15% weight) ---
  if (input.hasDiscovery === "yes") {
    score += 10;
  } else if (input.hasDiscovery === "no") {
    if (timeIndex >= 2) {
      score -= 15;
      observations.push(
        "You should have received discovery by now. If your attorney hasn't provided it or explained the delay, this is a red flag."
      );
    } else {
      score -= 3;
    }
  } else {
    // "dont-know"
    score -= 10;
    observations.push(
      "You're not sure what discovery is. Discovery is the evidence the prosecution must share with your defense — police reports, lab results, witness statements. Ask your attorney: \"Have we received all discovery?\""
    );
  }

  // --- Communication frequency (15% weight) ---
  if (input.communicationFrequency === "weekly") {
    score += 10;
  } else if (input.communicationFrequency === "monthly") {
    score += 0;
    if (timeIndex >= 2) {
      observations.push(
        "Monthly communication may be acceptable early on, but as your case progresses, you should expect more frequent updates — especially around hearings and deadlines."
      );
    }
  } else if (input.communicationFrequency === "rarely") {
    score -= 10;
    observations.push(
      "Rare communication from your attorney is concerning. You're paying for representation — that includes keeping you informed about your own case."
    );
  } else if (input.communicationFrequency === "never") {
    score -= 20;
    observations.push(
      "No communication from your attorney is a serious red flag. You have a right to know what's happening in your case. Consider sending a written request for a case status update."
    );
  }

  // --- Strategy discussion (10% weight) ---
  if (input.strategyDiscussed === "yes-detail") {
    score += 10;
  } else if (input.strategyDiscussed === "briefly") {
    score += 2;
    observations.push(
      "A brief strategy discussion isn't enough. Your attorney should be able to explain their theory of defense, which motions they plan to file, and why."
    );
  } else if (input.strategyDiscussed === "no") {
    score -= 12;
    observations.push(
      "Your attorney hasn't discussed case strategy with you. This is a fundamental part of representation — you should understand the defense approach, not just show up to court dates."
    );
  }

  // --- Time-based expectations ---
  if (timeIndex >= 3 && input.motionsFiled !== "yes" && input.hasDiscovery !== "yes") {
    score -= 10;
    observations.push(
      `At ${getTimeLabel(input.timeSinceArrest)} since arrest with no motions and no discovery, your case may be significantly behind schedule. Multiple defense milestones are likely overdue.`
    );
  }

  // Clamp score 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine band
  let band: string;
  if (score <= 30) band = "Critical";
  else if (score <= 50) band = "Concerning";
  else if (score <= 70) band = "Average";
  else if (score <= 85) band = "Adequate";
  else band = "Excellent";

  // Ensure we have at least 3 observations
  if (observations.length < 3) {
    if (score >= 70) {
      observations.push(
        "Based on your answers, your attorney appears to be meeting basic accountability benchmarks. A detailed Case Decoder report can verify this with 10-15 case-specific questions."
      );
    }
    if (observations.length < 3 && input.chargeType) {
      observations.push(
        `For ${getChargeLabel(input.chargeType)} cases, make sure your attorney has explained the specific elements the prosecution must prove and which ones are weakest.`
      );
    }
    if (observations.length < 3) {
      observations.push(
        "Every case has defense opportunities. The question is whether your attorney is finding them. Our Case Decoder identifies 10-15 specific questions for your situation."
      );
    }
  }

  return { score, band, observations: observations.slice(0, 5) };
}

function getTimeLabel(time: string): string {
  const labels: Record<string, string> = {
    "less-than-1-month": "less than 1 month",
    "1-3-months": "1-3 months",
    "3-6-months": "3-6 months",
    "6-12-months": "6-12 months",
    "12-plus-months": "12+ months",
  };
  return labels[time] ?? time;
}

function getChargeLabel(charge: string): string {
  const labels: Record<string, string> = {
    drug: "drug offense",
    dui: "DUI/DWI",
    "white-collar": "white collar",
    "other-felony": "felony",
    "other-misdemeanor": "misdemeanor",
  };
  return labels[charge] ?? charge;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const required = [
      "chargeType",
      "timeSinceArrest",
      "hasAttorney",
      "motionsFiled",
      "hasDiscovery",
      "communicationFrequency",
      "strategyDiscussed",
    ];

    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    const result = calculateScore(body as ScoreInput);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
