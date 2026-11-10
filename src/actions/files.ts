/** Hand a blob to the browser as a download. */
export function saveBlob(
  data: BlobPart,
  filename: string,
  type = 'application/octet-stream',
): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeName = (s: string) =>
  s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'file';
