import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTrainingBars, trainingSnapshot, trainingSnapshots } from '../src/services/training-market.js';
import { cleanSymbol, findInstruments } from '../src/data/universe.js';

test('training candles are deterministic and internally valid', () => {
  const first = generateTrainingBars('AAPL', 35);
  const second = generateTrainingBars('AAPL', 35);
  assert.deepEqual(first, second);
  assert.equal(first.length, 35);
  for (const bar of first) {
    assert.ok(bar.high >= Math.max(bar.open, bar.close));
    assert.ok(bar.low <= Math.min(bar.open, bar.close));
    assert.ok(bar.volume > 0);
  }
});

test('intraday training ranges produce intraday timestamps', () => {
  const daily = generateTrainingBars('SPY', 78, '5Min');
  assert.equal(daily.length, 78);
  assert.ok(daily.at(-1).time - daily[0].time < 86_400);
});

test('training snapshots identify themselves as synthetic', () => {
  const quote = trainingSnapshot('NVDA');
  assert.equal(quote.feed, 'training-sim');
  assert.ok(quote.price > 0);
  assert.equal(trainingSnapshots(['SPY', 'QQQ']).SPY.feed, 'training-sim');
});

test('universe searches by ticker or company and symbol input is normalized', () => {
  assert.equal(findInstruments('nvda')[0].symbol, 'NVDA');
  assert.equal(findInstruments('apple')[0].symbol, 'AAPL');
  assert.equal(cleanSymbol(' brk.b '), 'BRK.B');
  assert.throws(() => cleanSymbol(''), /valid ticker/i);
});
