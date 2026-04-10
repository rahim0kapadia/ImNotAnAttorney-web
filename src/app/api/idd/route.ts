import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const body = await req.json();

  const {
    firstName, lastName, email, phone, state, chargeType, situation,
    hasPublicDefender, belowPovertyLevel, incarceratedFamily,
  } = body;

  // Validation
  if (!firstName || !lastName || !email || !state || !chargeType || !situation) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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
    .eq('email', email.toLowerCase().trim())
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
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim() || null,
      state,
      charge_type: chargeType,
      situation: situation.trim(),
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
