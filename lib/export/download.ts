/** 把 Blob 交给浏览器下载。 */
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** SVG 转 PNG：走 canvas 光栅化，2 倍图，不引第三方库。
 *  注意：<img> 加载 SVG 时不会去拉网页字体，拉丁字母会退到系统字体，
 *  中文走 PingFang 所以看不出差别。要完全一致得把字体内嵌进 SVG（约 +50KB/字重）。 */
export async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('SVG 光栅化失败'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob(b => (b ? res(b) : rej(new Error('canvas 转 PNG 失败'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const slug = (title: string) =>
  title.replace(/[\s/\\:*?"<>|]+/g, '-').replace(/^-|-$/g, '') || 'flowchart';
