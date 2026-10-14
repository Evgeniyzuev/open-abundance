// Builds a vertical MP4 slideshow (1080x1920, H.264) from day card images, entirely in the browser.
// Each day is shown for SLIDE_SECONDS with a slow zoom, crossfading into the next. Nothing is uploaded.

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
const FPS = 30;
const SLIDE_SECONDS = 2.6;
const FADE_SECONDS = 0.5;
const ZOOM = 0.05;

export class VideoUnsupportedError extends Error {}

/** Frame plan as pure numbers, so timing can be tested without a browser. */
export function slideshowPlan(slideCount: number): { totalFrames: number; frameAt: (frame: number) => { index: number; progress: number; fade: number } } {
  const framesPerSlide = Math.round(SLIDE_SECONDS * FPS);
  const fadeFrames = Math.round(FADE_SECONDS * FPS);
  const totalFrames = Math.max(1, slideCount) * framesPerSlide;
  return {
    totalFrames,
    frameAt(frame: number) {
      const index = Math.min(slideCount - 1, Math.floor(frame / framesPerSlide));
      const local = frame - index * framesPerSlide;
      const progress = local / framesPerSlide;
      // Crossfade into the next slide during the last FADE_SECONDS of every slide but the last.
      const fade = index < slideCount - 1 && local >= framesPerSlide - fadeFrames ? (local - (framesPerSlide - fadeFrames)) / fadeFrames : 0;
      return { index, progress, fade };
    }
  };
}

export async function renderRealityVideo(imageUrls: string[], onProgress?: (share: number) => void): Promise<Blob> {
  if (!imageUrls.length) throw new Error("No days to show.");
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeVideo } = await import("mediabunny");
  if (typeof VideoEncoder === "undefined" || !(await canEncodeVideo("avc", { width: VIDEO_WIDTH, height: VIDEO_HEIGHT }))) {
    throw new VideoUnsupportedError("This browser cannot encode MP4 video.");
  }

  const images = await Promise.all(imageUrls.map(async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Image ${response.status}`);
    return createImageBitmap(await response.blob());
  }));

  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new VideoUnsupportedError("Canvas is unavailable.");

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: "avc", quality: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();

  const plan = slideshowPlan(images.length);
  const draw = (image: ImageBitmap, scale: number, alpha: number) => {
    const width = VIDEO_WIDTH * scale;
    const height = VIDEO_HEIGHT * scale;
    context.globalAlpha = alpha;
    context.drawImage(image, (VIDEO_WIDTH - width) / 2, (VIDEO_HEIGHT - height) / 2, width, height);
  };

  for (let frame = 0; frame < plan.totalFrames; frame += 1) {
    const { index, progress, fade } = plan.frameAt(frame);
    context.globalAlpha = 1;
    context.fillStyle = "#000";
    context.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
    draw(images[index], 1 + ZOOM * progress, 1);
    if (fade > 0) draw(images[index + 1], 1, fade);
    await source.add(frame / FPS, 1 / FPS);
    if (frame % 15 === 0) onProgress?.(frame / plan.totalFrames);
  }

  await output.finalize();
  images.forEach((image) => image.close());
  onProgress?.(1);
  const buffer = (output.target as InstanceType<typeof BufferTarget>).buffer;
  if (!buffer) throw new Error("Video was not produced.");
  return new Blob([buffer], { type: "video/mp4" });
}
