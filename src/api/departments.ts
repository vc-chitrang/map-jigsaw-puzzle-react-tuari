/**
 * The six MAP departments, as offered on the "Select The Collection" screen.
 *
 * **Ids are real, not invented.** Verified against the live API on 2026-08-04 with
 * `npm run check:api` (which now prints `id -> dept` for exactly this purpose).
 * Note they are NOT sequential — 28, 5, 4, 6, 29, 13 — so they cannot be derived
 * from the display order and must be carried explicitly.
 *
 * `id` is what `collection_fetch` receives as `department`. `dept` is the label the
 * API returns for that id, kept here so a stale id is caught by eye: the Browse
 * screen's Department dropdown renders the label for whatever id is selected, so if
 * MAP ever renumbers a department the dropdown will show a name that disagrees with
 * the button that was pressed.
 *
 * `tile` is the client-supplied artwork, already tinted; the label is drawn over it
 * in the app's own font rather than baked into the image.
 */

export interface CollectionDepartment {
  /** `filters.department[].id` — sent as the `department` query parameter. */
  readonly id: number;
  /** `filters.department[].dept` — the API's own label. */
  readonly dept: string;
  /** Label as shown on the button, with the line break the design uses. */
  readonly label: string;
  readonly tile: string;
}

/**
 * Display order follows the reference design: three across, two down, reading
 * left-to-right then top-to-bottom.
 */
export const COLLECTION_DEPARTMENTS: readonly CollectionDepartment[] = [
  {
    id: 28,
    dept: 'Living Traditions',
    label: 'Living Traditions',
    tile: '/assets/collection/living-traditions.jpg',
  },
  {
    id: 5,
    dept: 'Modern & Contemporary Art',
    label: 'Modern &\nContemporary Art',
    tile: '/assets/collection/modern-contemporary-art.jpg',
  },
  {
    id: 4,
    dept: 'Photography',
    label: 'Photography',
    tile: '/assets/collection/photography.jpg',
  },
  {
    id: 6,
    dept: 'Popular Culture',
    label: 'Popular Culture',
    tile: '/assets/collection/popular-culture.jpg',
  },
  {
    id: 29,
    dept: 'Pre-Modern Art',
    label: 'Pre-Modern Art',
    tile: '/assets/collection/pre-modern-art.jpg',
  },
  {
    id: 13,
    dept: 'Textiles, Craft & Design',
    label: 'Textiles, Craft &\nDesign',
    tile: '/assets/collection/textiles-craft-design.jpg',
  },
] as const;
