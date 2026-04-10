import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const revalidate = 60; // Cache for 60 seconds

export async function GET() {
  const supabase = createAdminClient();
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const monthKey = `scholarships_${currentMonth}`;

  const { data: rows } = await supabase
    .from('counters')
    .select('id, value')
    .in('id', ['scholarships_total', 'scholarships_fulfilled', monthKey]);

  const counters = Object.fromEntries((rows ?? []).map((r) => [r.id, Number(r.value)]));

  const total = counters['scholarships_total'] ?? 0;
  const fulfilled = counters['scholarships_fulfilled'] ?? 0;

  return NextResponse.json({
    total,
    fulfilled,
    waitlist: Math.max(0, total - fulfilled), // Transparent waitlist — spec sub-task 7
    month: counters[monthKey] ?? 0,
    monthLabel: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
  });
}
