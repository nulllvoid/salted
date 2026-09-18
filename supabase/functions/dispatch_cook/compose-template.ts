import type { DishLine } from './compose-payload.ts';

// Variables for the approved `cook_menu` UTILITY template (hi/kn/en):
//   1 cook name · 2 dish list · 3 flat note
//
// The cook knows how to cook; ingredients are the flatmates' concern (that is
// what the grocery screen is for) and a professional making Paneer Kurma does
// not need the method. So the message carries what to make, how much of each,
// and anything the flat specifically wants — which also keeps it far inside
// Meta's 1024-character limit, where the full payload (580–3783 chars,
// measured) never fit.
//
// Meta refuses a variable containing a newline or a run of more than four
// spaces, and applies the 1024 limit to the RENDERED message, so both are
// enforced here rather than discovered at send time.

const NOTE_MAX = 600;
const EMPTY_NOTE = '—';

// Newline-free and no run of >4 spaces, per Meta's variable rules.
function flatten(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function composeTemplateVariables(params: {
  cookName: string;
  dishes: DishLine[];
  note: string | null;
}): [string, string, string] {
  const { cookName, dishes, note } = params;
  if (dishes.length === 0) {
    throw new Error('Cannot compose a cook message with no dishes');
  }

  // Leading count, because recipe names carry their own brackets — "Akki
  // Rotti (Rice Flatbread) (for 2)" is ambiguous about which number counts.
  // A bare number also reads correctly for both portions and pieces.
  const dishList = flatten(
    dishes.map((dish) => `${dish.quantity} × ${dish.name}`).join(', '),
  );

  const flatNote = flatten(note ?? '');
  const trimmedNote = flatNote.length > NOTE_MAX
    ? `${flatNote.slice(0, NOTE_MAX - 1).trimEnd()}…`
    : flatNote;

  return [flatten(cookName), dishList, trimmedNote || EMPTY_NOTE];
}
