function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForImage(image: HTMLImageElement, timeoutMs: number) {
  if (image.complete) {
    if (image.naturalWidth === 0) return false;
    try {
      await image.decode?.();
    } catch {
      // The load itself succeeded; some cross-origin images reject decode().
    }
    return true;
  }
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      resolve(loaded);
    };
    const onLoad = () => finish(image.naturalWidth > 0);
    const onError = () => finish(false);
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
  });
}

export async function waitForPrintableAssets(
  root: HTMLElement,
  onProgress?: (loaded: number, total: number) => void,
  timeoutMs = 15_000
) {
  if (document.fonts?.ready) {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
    ]);
  }
  const images = Array.from(root.querySelectorAll("img"));
  let loaded = 0;
  let failed = 0;
  onProgress?.(0, images.length);
  await Promise.all(images.map(async (image) => {
    if (await waitForImage(image, timeoutMs)) loaded += 1;
    else failed += 1;
    onProgress?.(loaded + failed, images.length);
  }));
  return { total: images.length, loaded, failed };
}

export async function settleLayout() {
  await nextFrame();
  await nextFrame();
}
