import { test, expect } from '@playwright/test';
import { offsetForIndex, pageIndexFromOffset } from '../../src/lib/pager';

// The pager measures its own width via onLayout, which fires AFTER the first
// render — so every one of these helpers has to survive being called with a
// width of 0 before that measurement lands.
test('pageIndexFromOffset survives the pre-measurement zero width', () => {
  // The real bug this guards: offset / 0 is Infinity (or NaN for 0/0), and
  // Math.round(Infinity) stays Infinity, which would index past the end of
  // the pages array and render nothing.
  expect(pageIndexFromOffset(0, 0, 4)).toBe(0);
  expect(pageIndexFromOffset(840, 0, 4)).toBe(0);
});

test('pageIndexFromOffset rounds a part-way drag to the nearer page', () => {
  const width = 420;
  // Settled exactly on a page.
  expect(pageIndexFromOffset(0, width, 4)).toBe(0);
  expect(pageIndexFromOffset(420, width, 4)).toBe(1);
  expect(pageIndexFromOffset(1260, width, 4)).toBe(3);

  // Just under half a page over: still the page we came from.
  expect(pageIndexFromOffset(209, width, 4)).toBe(0);
  // Past half: the next one.
  expect(pageIndexFromOffset(211, width, 4)).toBe(1);
});

test('pageIndexFromOffset clamps at both ends', () => {
  const width = 420;
  // iOS rubber-band overscroll reports a negative offset at the left edge.
  expect(pageIndexFromOffset(-80, width, 4)).toBe(0);
  // ...and past the content width at the right edge.
  expect(pageIndexFromOffset(99999, width, 4)).toBe(3);
  // Clamp is to count - 1, so a single-page pager never reports index 1.
  expect(pageIndexFromOffset(99999, width, 1)).toBe(0);
});

test('offsetForIndex is the inverse of pageIndexFromOffset', () => {
  const width = 420;
  expect(offsetForIndex(0, width)).toBe(0);
  expect(offsetForIndex(2, width)).toBe(840);

  // Round-tripping every page must land back on the same index, which is what
  // keeps a header tap and a swipe agreeing about which page is active.
  for (let index = 0; index < 4; index++) {
    expect(pageIndexFromOffset(offsetForIndex(index, width), width, 4)).toBe(index);
  }
});

test('offsetForIndex stays at zero before the width is measured', () => {
  // Scrolling to index * 0 is a no-op rather than NaN, so the effect that
  // re-pins position on resize can run safely on the first pass.
  expect(offsetForIndex(3, 0)).toBe(0);
});
