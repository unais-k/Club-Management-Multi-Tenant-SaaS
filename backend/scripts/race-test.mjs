// Usage (from /backend):
// node scripts/race-test.mjs <baseUrl> <clubSlug> <email> <password> <courtId> <date> <startTime> <duration> [count]
const [base, clubSlug, email, password, courtId, date, startTime, duration, count = '10'] =
  process.argv.slice(2);

if (!base || !clubSlug || !email || !password || !courtId || !date || !startTime || !duration) {
  console.log(
    'Usage: node scripts/race-test.mjs <baseUrl> <clubSlug> <email> <password> <courtId> <date> <startTime> <duration> [count]',
  );
  process.exit(1);
}

const post = (path, body, token) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });

const login = await post('/auth/login', { clubSlug, email, password });
if (!login.ok) {
  console.error('Login failed:', login.status, await login.text());
  process.exit(1);
}
const { accessToken } = await login.json();

const results = await Promise.all(
  Array.from({ length: Number(count) }, async () => {
    const res = await post(
      '/bookings',
      { courtId, date, startTime, durationMinutes: Number(duration) },
      accessToken,
    );
    return { status: res.status, body: await res.json().catch(() => null) };
  }),
);

const tally = {};
for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;

console.log(`Sent ${count} identical requests at once`);
console.log('Status counts:', tally);
console.log('Other messages:', [
  ...new Set(results.filter((r) => r.status !== 201).map((r) => r.body?.message)),
]);