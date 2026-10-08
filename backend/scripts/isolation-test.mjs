// Usage (from /backend, API running, demo data seeded):
//   npm run test:isolation            or            node scripts/isolation-test.mjs http://localhost:3000
const base = process.argv[2] ?? 'http://localhost:3000';
const DEMO_PASSWORD = 'Demo@12345';

async function call(method, path, token, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body (204) */
  }
  return { status: res.status, body: json };
}

async function login(clubSlug, email, password = DEMO_PASSWORD) {
  const r = await call('POST', '/auth/login', null, { clubSlug, email, password });
  if (r.status !== 200) {
    throw new Error(`Login failed for ${email}: ${r.status} ${r.body?.message} (429 = wait a minute; did you run "npm run seed"?)`);
  }
  return r.body.accessToken;
}

let passed = 0;
let failed = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  ok ? passed++ : failed++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}  ->  ${actual}${ok ? '' : `  (expected ${expected})`}`);
}

// ---- Log in as people from both clubs (A = Downtown, B = Lakeside) ----
const adminA = await login('downtown-sports', 'admin@downtown.com');
const consumerA = await login('downtown-sports', 'aisha@downtown.com');
const adminB = await login('lakeside-racquet', 'admin@lakeside.com');
const consumerB = await login('lakeside-racquet', 'lena@lakeside.com');
const platform = await login(
  undefined,
  process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@platform.com',
  process.env.PLATFORM_ADMIN_PASSWORD ?? 'Admin@12345',
);

// ---- Collect ids that belong to each club ----
const locA = (await call('GET', '/locations', adminA)).body.data[0];
const courtA = (await call('GET', `/locations/${locA.id}/courts`, adminA)).body[0];
const bookingsA = (await call('GET', '/bookings', adminA)).body.data;
const bookingA = bookingsA.find((b) => b.status === 'CONFIRMED');
const locB = (await call('GET', '/locations', adminB)).body.data[0];
const planB = (await call('GET', '/memberships', adminB)).body[0];
const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

if (!locA || !courtA || !bookingA || !locB || !planB) {
  console.error('Demo data is missing. Run: npm run seed:reset');
  process.exit(1);
}

console.log('\nClub B users trying to reach club A data (all must be 404):');
for (const [who, token] of [['B admin', adminB], ['B consumer', consumerB]]) {
  check(`${who}: GET location`, (await call('GET', `/locations/${locA.id}`, token)).status, 404);
  check(`${who}: GET courts of location`, (await call('GET', `/locations/${locA.id}/courts`, token)).status, 404);
  check(`${who}: GET court`, (await call('GET', `/courts/${courtA.id}`, token)).status, 404);
  check(`${who}: GET court prices`, (await call('GET', `/pricing/courts/${courtA.id}`, token)).status, 404);
  check(`${who}: GET location shifts`, (await call('GET', `/pricing/locations/${locA.id}/shifts`, token)).status, 404);
  check(
    `${who}: GET quote`,
    (await call('GET', `/pricing/quote?courtId=${courtA.id}&startTime=10:00&durationMinutes=60`, token)).status,
    404,
  );
  check(
    `${who}: GET availability`,
    (await call('GET', `/availability?locationId=${locA.id}&date=${date}&durationMinutes=60`, token)).status,
    404,
  );
  check(`${who}: GET booking`, (await call('GET', `/bookings/${bookingA.id}`, token)).status, 404);
}

console.log('\nClub B admin trying to change club A data (must be 404):');
check('PUT location', (await call('PUT', `/locations/${locA.id}`, adminB, { address: 'hacked' })).status, 404);
check('POST court', (await call('POST', `/locations/${locA.id}/courts`, adminB, { name: 'Hack' })).status, 404);
check('PUT court', (await call('PUT', `/courts/${courtA.id}`, adminB, { description: 'hacked' })).status, 404);
check('PATCH cancel booking', (await call('PATCH', `/bookings/${bookingA.id}/cancel`, adminB)).status, 404);

console.log('\nClub B consumer trying to book in club A (must be 404):');
check(
  'POST booking',
  (await call('POST', '/bookings', consumerB, { courtId: courtA.id, date, startTime: '10:00', durationMinutes: 60 })).status,
  404,
);

console.log('\nClub A users trying to reach club B memberships (must be 404):');
check('A admin: GET membership', (await call('GET', `/memberships/${planB.id}`, adminA)).status, 404);
check('A admin: PUT membership', (await call('PUT', `/memberships/${planB.id}`, adminA, { description: 'hacked' })).status, 404);
check('A consumer: GET membership', (await call('GET', `/memberships/${planB.id}`, consumerA)).status, 404);

console.log('\nLists must never contain the other club\'s rows:');
const listB = (await call('GET', '/locations', adminB)).body.data.map((l) => l.id);
check('B location list excludes A locations', listB.includes(locA.id), false);
const bookingsBIds = (await call('GET', '/bookings', adminB)).body.data.map((b) => b.id);
check('B booking list excludes A bookings', bookingsA.some((b) => bookingsBIds.includes(b.id)), false);

console.log('\nAuthentication and roles:');
check('no token: GET /locations', (await call('GET', '/locations')).status, 401);
check('consumer: POST /locations', (await call('POST', '/locations', consumerA, { name: 'x' })).status, 403);
check('consumer: GET /tenants', (await call('GET', '/tenants', consumerA)).status, 403);
check('club admin: GET /tenants', (await call('GET', '/tenants', adminA)).status, 403);
check('club admin: POST /bookings', (await call('POST', '/bookings', adminA, {})).status, 403);
check('platform admin: GET /locations', (await call('GET', '/locations', platform)).status, 403);
check('platform admin: GET /tenants', (await call('GET', '/tenants', platform)).status, 200);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);