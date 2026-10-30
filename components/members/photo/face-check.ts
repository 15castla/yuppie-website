// The soft face check (photo spec 1, decision 1 A): look for a face in the cropped photo with the browser's own
// FaceDetector (the Shape Detection API: Chrome on Android and macOS, some others), and where the browser has
// none, skip the check. No new dependency, nothing leaves the browser. It warns and never blocks: "none" shows
// "This doesn’t look like a photo of you." with "Use it anyway", which saves the photo marked "No face found" for
// the admin Photos queue. A detector that throws or takes too long counts as no check at all ("skipped" on the
// server), never as "no face".

export type FaceResult = "found" | "none";

type DetectedFace = { boundingBox: DOMRectReadOnly };
type FaceDetectorLike = { detect(image: ImageBitmapSource): Promise<DetectedFace[]> };
type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorLike;

/** The longest the check may take before the photo goes on without it. */
const CHECK_TIMEOUT_MS = 4000;

function detectorClass(): FaceDetectorConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
  return typeof candidate === "function" ? candidate : null;
}

/** Whether this browser can look for a face at all. */
export function canCheckFaces(): boolean {
  return detectorClass() !== null;
}

/** "found", "none", or null: no detector here, or it failed (then the server records the check as skipped). */
export async function checkFace(photo: Blob): Promise<FaceResult | null> {
  const Detector = detectorClass();
  if (!Detector) return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(photo);
    const detector = new Detector({ fastMode: true, maxDetectedFaces: 1 });
    const faces = await Promise.race([
      detector.detect(bitmap),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), CHECK_TIMEOUT_MS)),
    ]);
    if (faces === null) return null;
    return faces.length > 0 ? "found" : "none";
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}
