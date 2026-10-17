const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the application's calculation functions without browser storage or Supabase.
const source = fs.readFileSync(path.join(__dirname, '../app-family-v29.js'), 'utf8');
function section(start, end) {
  const a = source.indexOf(`function ${start}(`);
  const b = source.indexOf(`function ${end}(`, a);
  assert.ok(a >= 0 && b > a, `Missing calculation section: ${start}`);
  return source.slice(a, b);
}
function fixture() {
  const context = vm.createContext({
    benefitUsageRecords: {}, benefitStates: {}, benefitModeRecords: {}, tierSettings: {},
    month: () => '2026-10',
    canonicalMonth: value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null,
    stats: (id, month) => ({ eligible: context.performance[`${id}|${month}`] || 0 }),
    performance: {},
  });
  vm.runInContext([
    section('benefitUsageMonth', 'readBenefitStates'),
    section('benefitMode', 'qualifyingMonths'),
    section('balanceLedger', 'benefitPanel'),
    section('tierFor', 'parseTierRows'),
  ].join('\n'), context);
  const card = { id: 'card-a', target: 700000, benefitLimit: 40000, benefitMode: 'balance' };
  context.tierSettings[card.id] = { goal: 700000, tiers: [
    { threshold: 300000, benefit: 10000 },
    { threshold: 500000, benefit: 20000 },
    { threshold: 700000, benefit: 40000 },
  ] };
  return { context, card };
}

test('August 700,000 grants 40,000 in October; usage 13,000 leaves 27,000', () => {
  const { context: c, card } = fixture();
  c.performance['card-a|2026-08'] = 700000;
  c.benefitUsageRecords['card-a|2026-10'] = { amount: 13000 };
  assert.equal(c.balanceLedger(card).credited, 40000);
  assert.equal(c.balanceLedger(card).remaining, 27000);
  assert.equal(c.balanceLedger(card, '2026-09').credited, 0);
});

test('expired benefits and other months or cards do not affect this month', () => {
  const { context: c, card } = fixture();
  c.performance['card-a|2026-07'] = 700000;
  c.performance['card-a|2026-08'] = 700000;
  c.benefitStates['card-a|2026-07'] = { amount: 40000, used: 1000 };
  c.benefitUsageRecords['card-a|2026-09'] = { amount: 2000 };
  c.benefitUsageRecords['card-a|2026-10'] = { amount: 13000 };
  c.benefitUsageRecords['card-b|2026-10'] = { amount: 40000 };
  const before = JSON.stringify([c.benefitStates, c.benefitUsageRecords]);
  assert.equal(c.balanceLedger(card).remaining, 27000);
  assert.equal(c.balanceLedger(card, '2026-11').remaining, 0);
  assert.equal(JSON.stringify([c.benefitStates, c.benefitUsageRecords]), before);
});

test('highest achieved tier and per-card settings determine payment, not personal goal', () => {
  const { context: c, card } = fixture();
  for (const [eligible, expected] of [[299999, 0], [300000, 10000], [499999, 10000], [500000, 20000], [699999, 20000], [700000, 40000]]) {
    c.performance['card-a|2026-08'] = eligible;
    assert.equal(c.balanceLedger(card).credited, expected);
  }
  const other = { id: 'card-b', target: 100000, benefitLimit: 5000 };
  c.performance['card-b|2026-08'] = 100000;
  assert.equal(c.balanceLedger(other).credited, 5000);
});

test('legacy usage fallback is preserved and newer monthly usage is not double-counted', () => {
  const { context: c, card } = fixture();
  c.performance['card-a|2026-08'] = 700000;
  c.benefitStates['card-a|2026-08'] = { amount: 40000, used: 13000 };
  assert.equal(c.balanceLedger(card).remaining, 27000);
  c.benefitUsageRecords['card-a|2026-10'] = { amount: 15000 };
  assert.equal(c.balanceLedger(card).remaining, 25000);
  c.benefitUsageRecords['card-a|2026-10'] = { amount: 0 };
  assert.equal(c.balanceLedger(card).remaining, 40000);
  c.benefitUsageRecords['card-a|2026-10'] = { amount: 50000 };
  assert.equal(c.balanceLedger(card).remaining, 0);
});

test('future awards are not spendable, including across a year boundary', () => {
  const { context: c, card } = fixture();
  c.performance['card-a|2026-09'] = 700000;
  assert.equal(c.benefitPayment(card, '2026-11').amount, 40000);
  assert.equal(c.balanceLedger(card, '2026-11').credited, 0);
  c.performance['card-a|2025-11'] = 700000;
  assert.equal(c.balanceLedger(card, '2026-01').credited, 40000);
});

test('billing-discount behavior still requires selected goal and uses achieved tier', () => {
  const { context: c, card } = fixture();
  assert.equal(c.automaticDiscount(card, '2026-10', c.tierStatus(card, 500000)), 0);
  assert.equal(c.automaticDiscount(card, '2026-10', c.tierStatus(card, 700000)), 40000);
  c.tierSettings[card.id].goal = 300000;
  assert.equal(c.automaticDiscount(card, '2026-10', c.tierStatus(card, 500000)), 20000);
});
