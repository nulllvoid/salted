// Offset/index arithmetic for the horizontal paging ScrollView in
// components/pager.tsx.
//
// Split out here because it is the pager's only non-obvious maths and it has
// one genuinely dangerous input: the pager measures its own width via
// onLayout, which fires after the first render, so every helper is called at
// least once with width 0. Dividing by that yields Infinity (or NaN), and
// Math.round leaves it there — which would index past the end of the pages
// array and render a blank pager.

export function pageIndexFromOffset(
  offsetX: number,
  width: number,
  count: number,
): number {
  // Pre-measurement, or a degenerate pager: page 0 is the only honest answer.
  if (width <= 0 || count <= 0) return 0;

  // Round, not floor: a drag settling more than halfway toward the next page
  // belongs to that page, which is what makes the header indicator agree with
  // where the scroll actually came to rest.
  const index = Math.round(offsetX / width);

  // Clamp both ends. The left edge matters on iOS, where rubber-band
  // overscroll reports a negative offset; the right edge guards against a
  // settled offset past the final page.
  return Math.min(Math.max(index, 0), count - 1);
}

export function offsetForIndex(index: number, width: number): number {
  // index * 0 is already 0, but being explicit keeps the "safe before
  // onLayout" contract in one place rather than relying on the arithmetic.
  if (width <= 0) return 0;
  return index * width;
}
