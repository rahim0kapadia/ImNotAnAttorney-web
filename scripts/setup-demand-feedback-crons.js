/**
 * Register demand feedback cron jobs with cron-job.org.
 * Run once: node scripts/setup-demand-feedback-crons.js
 */
const CRONJOB_API_KEY = "qmy3F+k6DrUgKCz/Jp8fEnpViJrE3pgaUfOoO8yAQn4=";
const SITE_URL = "https://imnotanattorney.com";
const CRON_AUTH_TOKEN = process.env.CRON_AUTH_TOKEN;

if (!CRON_AUTH_TOKEN) {
  console.error("CRON_AUTH_TOKEN env var required. Set it from .env.local:");
  console.error("  export CRON_AUTH_TOKEN=$(grep CRON_AUTH_TOKEN .env.local | cut -d= -f2)");
  process.exit(1);
}

const JOBS = [
  {
    title: "INAA demand-feedback-score",
    url: `${SITE_URL}/api/cron/demand-feedback-score`,
    schedule: { minutes: [0], hours: [11], mdays: [-1], months: [-1], wdays: [0] },
  },
  {
    title: "INAA demand-feedback-patterns",
    url: `${SITE_URL}/api/cron/demand-feedback-patterns`,
    schedule: { minutes: [0], hours: [12], mdays: [-1], months: [-1], wdays: [0] },
  },
  {
    title: "INAA demand-feedback-revise",
    url: `${SITE_URL}/api/cron/demand-feedback-revise`,
    schedule: { minutes: [0], hours: [13], mdays: [-1], months: [-1], wdays: [0] },
  },
];

async function register() {
  const listRes = await fetch("https://api.cron-job.org/jobs", {
    headers: { Authorization: `Bearer ${CRONJOB_API_KEY}` },
  });
  const { jobs } = await listRes.json();

  for (const job of JOBS) {
    const existing = jobs?.find((j) => j.title === job.title);
    if (existing) {
      console.log(`[skip] ${job.title} already exists (ID: ${existing.jobId})`);
      continue;
    }

    const res = await fetch("https://api.cron-job.org/jobs", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${CRONJOB_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        job: {
          title: job.title,
          url: job.url,
          enabled: true,
          saveResponses: true,
          schedule: job.schedule,
          requestTimeout: 300,
          requestMethod: 0,
          extendedData: {
            headers: { Authorization: `Bearer ${CRON_AUTH_TOKEN}` },
          },
        },
      }),
    });

    const data = await res.json();
    console.log(`[registered] ${job.title} -> ID: ${data.jobId}`);
  }
}

register().catch(console.error);
