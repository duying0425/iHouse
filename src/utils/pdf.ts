import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * 将一组已渲染的页面 DOM 节点导出为 PDF
 * @param pageEls 页面 DOM 节点数组（每个对应一页）
 * @param orientation 'p' 纵向 | 'l' 横向
 * @param autoPrint 是否打开后自动调用打印
 * @param fileName 下载文件名
 * @param onProgress 进度回调 (currentPage, totalPages)
 */
export async function exportPagesToPdf(
  pageEls: HTMLElement[],
  orientation: "p" | "l" = "p",
  autoPrint = false,
  fileName = "居所图鉴.pdf",
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (pageEls.length === 0) return;

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pageEls.length; i++) {
    onProgress?.(i + 1, pageEls.length);
    // 让浏览器有机会刷新 UI（更新进度文字）+ 释放上一页内存
    await new Promise((r) => setTimeout(r, 50));

    const el = pageEls[i];
    // 等待图片加载
    await waitForImages(el);

    // 单页超时保护：html2canvas 对大体积 base64 / SVG 可能很慢，
    // 超时则放弃整页（跳过该页继续后续），避免无限转圈
    const canvas = await withTimeout(
      html2canvas(el, {
        scale: 1,
        useCORS: true,
        backgroundColor: "#FBF8F2",
        logging: false,
        imageTimeout: 10000,
        removeContainer: true,
      }),
      60000
    ).catch(() => null);

    if (!canvas) {
      // 该页截图失败，跳过继续
      continue;
    }

    const imgData = canvas.toDataURL("image/jpeg", 0.8);
    // 等比缩放铺满页面
    const imgRatio = canvas.width / canvas.height;
    const pageRatio = pageW / pageH;
    let w = pageW;
    let h = pageH;
    if (imgRatio > pageRatio) {
      h = pageW / imgRatio;
    } else {
      w = pageH * imgRatio;
    }
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", x, y, w, h);
  }

  onProgress?.(pageEls.length, pageEls.length);

  if (autoPrint) {
    pdf.autoPrint();
    const blobUrl = pdf.output("bloburl");
    window.open(blobUrl, "_blank");
  } else {
    pdf.save(fileName);
  }
}

/** 带超时的 Promise 包装 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    ),
  ]);
}

/** 等待容器内所有图片加载完成 */
function waitForImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll("img"));
  return Promise.all(
    imgs.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    })
  ).then(() => undefined);
}
