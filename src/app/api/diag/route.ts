import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-operator-secret');
  if (!process.env.OPERATOR_SECRET || secret !== process.env.OPERATOR_SECRET) {
    return NextResponse.json({ error: 'Unauthorized', op_len: process.env.OPERATOR_SECRET?.length }, { status: 401 });
  }
  const results: Record<string, string> = {};
  const keys = ['STRIPE_SECRET_KEY','STRIPE_SECRET_KEY_LIVE','STRIPE_WEBHOOK_SECRET','STRIPE_WEBHOOK_SECRET_LIVE','SUPABASE_SERVICE_ROLE_KEY','INTERNAL_QA_COUPON_ID','INTERNAL_QA_EMAIL'];
  for (const k of keys) {
    const v = process.env[k];
    if (v === undefined) { results['env_' + k] = 'UNDEFINED'; }
    else if (v === '') { results['env_' + k] = 'EMPTY_STRING'; }
    else { results['env_' + k] = 'set (' + v.substring(0, 8) + '... ' + v.length + ' chars, ends=' + JSON.stringify(v.slice(-3)) + ')'; }
  }
  const liveKey = process.env.STRIPE_SECRET_KEY_LIVE;
  if (liveKey) {
    try {
      const stripe = new Stripe(liveKey.trim(), { typescript: true });
      const balance = await stripe.balance.retrieve();
      results.stripe_live = 'OK (' + balance.available.length + ' currencies)';
    } catch (e: unknown) {
      results.stripe_live = 'FAIL: ' + (e instanceof Error ? e.message : String(e));
    }
  }
  return NextResponse.json(results);
}