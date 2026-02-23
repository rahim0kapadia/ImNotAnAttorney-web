import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  typescript: true,
});

export const TIERS = {
  "case-decoder": {
    name: "Case Decoder",
    price: 19700, // cents
    delivery: "24 hours",
    requiresDiscovery: false,
    priorityPrice: 9700,
    priorityDelivery: "Same-day (4 hours)",
  },
  "intelligence-brief": {
    name: "Case Intelligence Brief",
    price: 79700,
    delivery: "48-72 hours",
    requiresDiscovery: false,
    priorityPrice: 29700,
    priorityDelivery: "24 hours",
  },
  "x-ray": {
    name: "The X-Ray",
    price: 149700,
    delivery: "10 business days",
    requiresDiscovery: true,
    priorityPrice: 49700,
    priorityDelivery: "5 business days",
  },
  "war-room": {
    name: "The War Room",
    price: 349700,
    delivery: "25-28 days + weekly updates",
    requiresDiscovery: true,
    priorityPrice: 99700,
    priorityDelivery: "Expedited 20-day delivery",
  },
  "situation-room": {
    name: "The Situation Room",
    price: 999700,
    delivery: "24-48hr priority turnaround",
    requiresDiscovery: true,
    priorityPrice: null,
    priorityDelivery: null,
  },
  "extra-witness": {
    name: "Extra Witness Intel",
    price: 14900,
    delivery: "Next update cycle",
    requiresDiscovery: false,
    priorityPrice: null,
    priorityDelivery: null,
  },
  "witness-pack": {
    name: "Standalone Witness Pack",
    price: 29700,
    delivery: "3-5 business days",
    requiresDiscovery: true,
    priorityPrice: null,
    priorityDelivery: null,
  },
} as const;

export type TierSlug = keyof typeof TIERS;

export function isValidTier(slug: string): slug is TierSlug {
  return slug in TIERS;
}
