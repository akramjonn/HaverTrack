import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Longest edge we send to the analyzer. A full-resolution frame base64-encodes to
 * several megabytes, which blows past the Edge Function request limit and makes the
 * scan feel broken on campus wifi.
 */
export const MAX_ANALYSIS_EDGE = 1024;

export interface PreparedImage {
  uri: string;
  base64: string;
}

/** Downscales and re-encodes a captured photo so it can be sent to `analyze-photo`. */
export async function prepareImageForAnalysis(uri: string): Promise<PreparedImage> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: MAX_ANALYSIS_EDGE });

  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.6,
    base64: true,
  });

  if (!result.base64) throw new Error('Image encoding failed');

  // Web returns a full data URI; the Edge Function wants raw base64.
  const base64 = result.base64.includes(',') ? result.base64.split(',')[1] : result.base64;

  return { uri: result.uri, base64 };
}
