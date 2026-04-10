import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SITUATION_LENGTH = 5000;
const MAX_NAME_LENGTH = 200;

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();

  // Rate limit: 3 applications per hour per IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { limited } = await checkRateLimit(supabase, `idd:${ip}`, 3, 3600);
  if (limited) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const {
    firstName, lastName, email, phone, state, chargeType, situation,
    hasPublicDefender, belowPovertyLevel, incarceratedFamily,
  } = body;

  // Required field presence
  if (!firstName || !lastName || !email || !state || !chargeType || !situation) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Type + format validation
  if (typeof firstName !== 'string' || firstName.trim().length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: 'Invalid first name' }, { status: 400 });
  }
  if (typeof lastName !== 'string' || lastName.trim().length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: 'Invalid last name' }, { status: 400 });
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }
  if (typeof situation !== 'string' || situation.trim().length > MAX_SITUATION_LENGTH) {
    return NextResponse.json({ error: 'Situation description is too long (max 5,000 characters)' }, { status: 400 });
  }
  if (typeof state !== 'string' || typeof chargeType !== 'string') {
    return NextResponse.json({ error: 'Invalid state or charge type' }, { status: 400 });
  }

  // At least one qualifier must be true
  if (!hasPublicDefender && !belowPovertyLevel && !incarceratedFamily) {
    return NextResponse.json(
      { error: 'At least one qualifying condition is required' },
      { status: 400 },
    );
  }

  // Duplicate check — same email, pending/approved within 90 days
  const { data: existing } = await supabase
    .from('idd_applications')
    .select('id, status')
    .eq('email', (email as string).toLowerCase().trim())
    .in('status', ['pending', 'approved'])
    .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: 'An application for this email is already being reviewed' },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from('idd_applications')
    .insert({
      first_name: (firstName as string).trim().slice(0, MAX_NAME_LENGTH),
      last_name: (lastName as string).trim().slice(0, MAX_NAME_LENGTH),
      email: (email as string).toLowerCase().trim(),
      phone: typeof phone === 'string' ? phone.trim() || null : null,
      state: (state as string).trim(),
      charge_type: (chargeType as string).trim(),
      situation: (situation as string).trim().slice(0, MAX_SITUATION_LENGTH),
      has_public_defender: !!hasPublicDefender,
      below_poverty_level: !!belowPovertyLevel,
      incarcerated_family: !!incarceratedFamily,
    })
    .select('id')
    .single();

  if (error) {
    console.error('IDD application insert failed:', error);
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, status: 'pending' }, { status: 201 });
}
