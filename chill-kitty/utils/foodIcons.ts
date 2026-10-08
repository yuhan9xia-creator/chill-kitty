/**
 * Centralised food icon utilities.
 * All PNG icons live in /public/assets/food/*.png and are served at /assets/food/*.png.
 */

// Map food ids that differ from their filename (special cases)
const ICON_FILENAME_MAP: Record<string, string> = {
  bell_pepper: 'Bell pepper',
  sweet_potato: 'Sweet potato',
  chicken_breast: 'Chicken breast',
  red_cabbage: 'Red cabbage',
  rye_bread: 'Rye bread',
  grape: 'Grapes',
  cabbage: 'White cabbage',
};

/**
 * Returns the /assets URL for a food id.
 * Falls back gracefully: if the icon doesn't exist the <img> just shows nothing.
 */
export function getFoodIconUrl(id: string): string {
  const filename = ICON_FILENAME_MAP[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
  return `/assets/food/${filename}.png`;
}
