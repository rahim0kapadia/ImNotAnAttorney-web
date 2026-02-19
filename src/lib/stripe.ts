import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  typescript: true,
});

export const TIERS = {
  "case-decoder": {
    name: "Case Decoder",
    price: 9700, // cents
    delivery: "24 hours",
    requiresDiscovery: false,
  },
  "intelligence-brief": {
    name: "Case Intelligence Brief",
    price: 49700,
    delivery: "48-72 hours",
    requiresDiscovery: false,
  },
  "x-ray": {
    name: "The X-Ray",
    price: 99700,
    delivery: "5-7 business days",
    requiresDiscovery: true,
  },
  "war-room": {
    name: "The War Room",
    price: 199700,
    delivery: "25-28 days + weekly updates",
    requiresDiscovery: true,
  },
  "situation-room": {
    name: "The Situation Room",
    price: 499700,
    delivery: "24-48hr priority turnaround",
    requiresDiscovery: true,
  },
  "extra-witness": {
    name: "Extra Witness Intel",
    price: 14900,
    delivery: "Next update cycle",
    requiresDiscovery: false,
  },
  "witness-pack": {
    name: "Standalone Witness Pack",
    price: 29700,
    delivery: "3-5 business days",
    requiresDiscovery: true,
  },
} as const;

export type TierSlug = keyof typeof TIERS;

export function isValidTier(slug: string): slug is TierSlug {
  return slug in TIERS;
}
