// Photo mode: renders the scene SVG to a PNG with a visible "visualization" caption, then shares or downloads it.
// The profile photo (an external <image>) is left out of the picture so the canvas stays clean and no photo leaves the device.

export async function sceneToPng(svg: SVGSVGElement, options: { color: string; background: string; caption: string }): Promise<Blob | null> {
  const viewBox = svg.viewBox.baseVal;
  const width = viewBox.width || 300;
  const height = viewBox.height || 150;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("image").forEach((node) => node.remove());
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.style.color = options.color;
  const source = new XMLSerializer().serializeToString(clone);

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The picture could not be rendered."));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  });

  const scale = 3;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = options.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.fillStyle = options.color;
  context.globalAlpha = 0.7;
  context.font = `${11 * scale}px sans-serif`;
  context.textAlign = "right";
  context.fillText(options.caption, canvas.width - 8 * scale, canvas.height - 6 * scale);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

export async function shareOrDownload(blob: Blob, fileName: string): Promise<void> {
  const file = new File([blob], fileName, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
