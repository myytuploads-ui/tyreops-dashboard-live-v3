/** Browser clipboard helper with Clipboard API + textarea/execCommand fallback (HTTP LAN). */
export type CopyTextResult = { ok: true } | { ok: false; error: string };

function fallbackCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.padding = '0';
  textarea.style.border = 'none';
  textarea.style.outline = 'none';
  textarea.style.boxShadow = 'none';
  textarea.style.background = 'transparent';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  document.body.removeChild(textarea);
  return copied;
}

export async function copyTextToClipboard(text: string): Promise<CopyTextResult> {
  const value = String(text ?? '');
  if (!value) return { ok: false, error: 'Nothing to copy.' };

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return { ok: true };
    } catch {
      // Non-secure context (http://LAN), denied permission, or transient failure — try fallback.
    }
  }

  if (fallbackCopy(value)) return { ok: true };
  return { ok: false, error: 'Copy failed. Select the message and copy manually.' };
}
