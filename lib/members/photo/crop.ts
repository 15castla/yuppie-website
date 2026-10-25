// The crop maths for "Move and zoom". A square stage shows the photo under a
// circle that is 80% of the stage's width. At zoom 1 the photo's short side
// is exactly the circle's diameter, so the circle is always covered. The
// photo is moved by (x, y), in units of the circle's diameter from the
// centred position, and zoomed up to MAX_ZOOM. Because everything is a
// fraction of the circle, the picture on screen and the file that is saved
// come from the same numbers, whatever size the stage is drawn at.

export const CIRCLE_RATIO = 0.8;
export const MIN_ZOOM = 1;
// 2.4 puts the design's example crop (zoom 1.555) at the 40% mark on the slider, as drawn.
export const MAX_ZOOM = 2.4;
const OUTPUT_MAX = 800;

export type CropState = { zoom: number; x: number; y: number };
export type CropImage = { width: number; height: number };

export const START_CROP: CropState = { zoom: MIN_ZOOM, x: 0, y: 0 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// The furthest the photo can move, in circle diameters, before the circle
// would show empty stage.
function limits(image: CropImage, zoom: number) {
  const short = Math.min(image.width, image.height);
  return {
    x: Math.max(0, ((image.width / short) * zoom - 1) / 2),
    y: Math.max(0, ((image.height / short) * zoom - 1) / 2),
  };
}

export function clampCrop(image: CropImage, crop: CropState): CropState {
  const zoom = clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM);
  const max = limits(image, zoom);
  return { zoom, x: clamp(crop.x, -max.x, max.x), y: clamp(crop.y, -max.y, max.y) };
}

// Where the <img> goes inside the stage, as percentages of the stage's side,
// so the markup needs no measuring.
export function imageBox(image: CropImage, crop: CropState) {
  const short = Math.min(image.width, image.height);
  const width = CIRCLE_RATIO * 100 * (image.width / short) * crop.zoom;
  const height = CIRCLE_RATIO * 100 * (image.height / short) * crop.zoom;
  return {
    width,
    height,
    left: 50 + CIRCLE_RATIO * 100 * crop.x - width / 2,
    top: 50 + CIRCLE_RATIO * 100 * crop.y - height / 2,
  };
}

// The part of the photo the circle shows, in the photo's own pixels.
export function sourceSquare(image: CropImage, crop: CropState) {
  const short = Math.min(image.width, image.height);
  const side = short / crop.zoom;
  return {
    side,
    left: image.width / 2 - (crop.x * short) / crop.zoom - side / 2,
    top: image.height / 2 - (crop.y * short) / crop.zoom - side / 2,
  };
}

// Draw the circle's square into a JPEG. Re-drawing drops everything else in
// the file, including its location data (the design lists that as a need).
// Never enlarges: a small crop stays its own size.
export async function exportCrop(imageUrl: string, image: CropImage, crop: CropState): Promise<Blob | null> {
  const img = new Image();
  img.src = imageUrl;
  await img.decode();
  const square = sourceSquare(image, crop);
  const size = Math.max(1, Math.min(OUTPUT_MAX, Math.round(square.side)));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#F5F3E7";
  context.fillRect(0, 0, size, size);
  context.imageSmoothingQuality = "high";
  context.drawImage(img, square.left, square.top, square.side, square.side, 0, 0, size, size);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9));
}
