/**
 * Shrinks a picked photo before upload. A phone photo is usually 2–6 MB; resized to ~1600 px and
 * re-encoded as JPEG it is a few hundred KB, which on a slow connection turns minutes into seconds.
 *
 * The resize runs on the device through expo-image-manipulator. Installs built before that native
 * module was added cannot load it; they keep uploading the original file, exactly as before.
 */
export type ShrunkPhoto = { uri: string; mimeType: 'image/jpeg'; extension: 'jpg' };

type Manipulator = typeof import('expo-image-manipulator');
let manipulator: Manipulator | null | undefined;
const loadManipulator = (): Manipulator | null => {
  if (manipulator !== undefined) return manipulator;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    manipulator = require('expo-image-manipulator') as Manipulator;
  } catch {
    manipulator = null;
  }
  return manipulator;
};

export async function shrinkPhoto(asset: { uri: string; width?: number; height?: number }, maxSide = 1600, quality = 0.7): Promise<ShrunkPhoto | null> {
  const module = loadManipulator();
  if (!module) return null;
  try {
    const context = module.ImageManipulator.manipulate(asset.uri);
    const width = asset.width ?? 0;
    const height = asset.height ?? 0;
    // Without known dimensions we cannot prove resizing will not enlarge the source image.
    if (width > 0 && height > 0 && Math.max(width, height) > maxSide) {
      context.resize(width >= height ? { width: maxSide } : { height: maxSide });
    }
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: quality, format: module.SaveFormat.JPEG });
    return { uri: saved.uri, mimeType: 'image/jpeg', extension: 'jpg' };
  } catch {
    return null;
  }
}
