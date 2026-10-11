// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { DownloadedFile } from '../http/api-client.js';

const REVOKE_DELAY_MILLISECONDS = 30_000;

// O navegador começa o download depois do clique: liberar a URL na hora pode cortá-lo, então espera um pouco.
export function saveDownloadedFile(file: DownloadedFile): void {
  saveAndRevokeLater(file, REVOKE_DELAY_MILLISECONDS);
}

export function saveAndRevokeLater(file: DownloadedFile, revokeDelayMilliseconds: number): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), revokeDelayMilliseconds);
}
