import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * 将一组已渲染的页面 DOM 节点导出为 PDF
 * @param pageEls 页面 DOM 节点数组（每个对应一页）
 * @param orientation 'p' 纵向 | 'l' 横向
 * @param autoPrint 是否打开后自动调用打印
 */
export async function exportPagesToPdf(
  pageEls: HTMLElement[],
  orientation: "p" | "l" = "p",
  autoPrint = false,
  fileName = "居所图鉴.pdf"
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
    const el = pageEls[i];
    // 等待图片加载
    await waitForImages(el);
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#FBF8F2",
      logging: false,
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
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

  if (autoPrint) {
    pdf.autoPrint();
    const blobUrl = pdf.output("bloburl");
    window.open(blobUrl, "_blank");
  } else {
    pdf.save(fileName);
  }
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
