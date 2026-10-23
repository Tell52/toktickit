// The current upload API records metadata under /uploads but does not serve
// those bytes. Keep that limitation explicit instead of navigating to a 404.
export default function AttachmentReference({ fileName, fileUrl }: { fileName: string; fileUrl?: string }) {
  let href: string | null = null;
  try {
    if (fileUrl && !/^\/?uploads\//i.test(fileUrl)) {
      const url = new URL(fileUrl, window.location.origin);
      if (['http:', 'https:'].includes(url.protocol)) href = url.href;
    }
  } catch { /* Unusable references retain their visible filename. */ }
  if (!href) return <span><strong><span aria-hidden="true">📎 </span><span>{fileName}</span></strong><span className="d-block small text-muted">File details recorded. Download unavailable; contact IT Staff for this file.</span></span>;
  return <a href={href} target="_blank" rel="noopener noreferrer"><span aria-hidden="true">📎 </span><span>{fileName}</span> <span className="visually-hidden">(opens in a new tab)</span></a>;
}
