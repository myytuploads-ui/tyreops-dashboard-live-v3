/**
 * Soft media field helpers for inbox messages.
 * Columns may be absent from older rows / schemas — never throw.
 *
 * Persistence note (2026-09-10): live messages with body "[Photo]" have media_url=null
 * and the public `job-media` bucket is empty. WF-01 "Store Inbound Message" currently
 * inserts only job_id/customer_id/channel/direction/sender/message_text/provider_message_id
 * — it does not upload binaries or set media_url/message_type. Inbox correctly shows the
 * honest missing-media fallback until WF persists a stored URL/path.
 */

export type MediaFields = {
  mediaUrl: string;
  mediaId: string;
  messageType: string;
  mimeType: string;
  caption: string;
  storagePath: string;
};

const PHOTO_PLACEHOLDER_RE = /^\[(photo|image|img|media|picture)\]$/i;
const PHOTO_PREFIX_RE = /^\[(photo|image|img|media|picture)\](?:\s*[\r\n]+\s*|\s+)/i;

export function firstMediaValue(row: Record<string, unknown> | undefined, keys: string[]) {
  if (!row) return '';
  for (const key of keys) {
    try {
      const value = row[key];
      if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
    } catch {
      // Column absent or unreadable — fail soft.
    }
  }
  return '';
}

/**
 * Turn a stored media reference into an <img>-usable URL.
 * - Absolute http(s) URLs pass through
 * - `job-media/...` or bare storage paths become public Supabase object URLs
 * Never invents a URL when the input is empty.
 */
export function resolveStoredMediaUrl(
  raw: string,
  supabaseUrl = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL || '' : ''
) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('data:image/')) return value;

  const base = String(supabaseUrl || '').replace(/\/$/, '');
  if (!base) return value;

  let path = value.replace(/^\/+/, '');
  if (/^storage\/v1\/object\/(?:public|sign)\//i.test(path)) {
    return `${base}/${path}`;
  }
  if (/^job-media\//i.test(path)) {
    return `${base}/storage/v1/object/public/${path}`;
  }
  // Treat remaining relative paths as objects inside the public job-media bucket.
  return `${base}/storage/v1/object/public/job-media/${path}`;
}

export function extractMediaFields(row: Record<string, unknown> | undefined): MediaFields {
  const storagePath = firstMediaValue(row, [
    'storage_path',
    'storagePath',
    'media_path',
    'file_path',
  ]);
  const rawUrl = firstMediaValue(row, [
    'media_url',
    'mediaUrl',
    'public_url',
    'signed_url',
    'storage_url',
    'image_url',
    'file_url',
  ]);
  return {
    mediaUrl: resolveStoredMediaUrl(rawUrl || storagePath),
    mediaId: firstMediaValue(row, ['media_id', 'mediaId', 'whatsapp_media_id']),
    messageType: firstMediaValue(row, ['message_type', 'messageType', 'msg_type']),
    mimeType: firstMediaValue(row, ['mime_type', 'mimeType', 'content_type', 'contentType']),
    caption: firstMediaValue(row, ['caption', 'media_caption']),
    storagePath,
  };
}

export function isPhotoPlaceholderText(text: string) {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed === 'Empty message') return false;
  if (PHOTO_PLACEHOLDER_RE.test(trimmed)) return true;
  if (PHOTO_PREFIX_RE.test(trimmed)) return true;
  return false;
}

export function captionFromPlaceholderText(text: string) {
  const trimmed = String(text || '').trim();
  if (PHOTO_PLACEHOLDER_RE.test(trimmed)) return '';
  const match = trimmed.match(PHOTO_PREFIX_RE);
  if (match) return trimmed.slice(match[0].length).trim();
  return '';
}

export function isImageLikeType(messageType: string, mimeType: string) {
  const combined = `${messageType} ${mimeType}`.toLowerCase();
  return /\b(image|photo|sticker|img)\b/.test(combined) || mimeType.toLowerCase().startsWith('image/');
}

/**
 * Classify media for display. Never invent a picture URL.
 * - image: media_url present → render bubble
 * - missing_image: photo marker / image type / media_id without URL → honest placeholder
 * - text: normal message
 */
export function classifyMessageMedia(input: {
  text: string;
  mediaUrl?: string;
  mediaId?: string;
  messageType?: string;
  mimeType?: string;
  caption?: string;
}): {
  kind: 'image' | 'missing_image' | 'text';
  displayCaption: string;
  previewText: string;
} {
  const mediaUrl = String(input.mediaUrl || '').trim();
  const mediaId = String(input.mediaId || '').trim();
  const captionField = String(input.caption || '').trim();
  const text = String(input.text || '').trim();
  const placeholder = isPhotoPlaceholderText(text);
  const imageTyped = isImageLikeType(input.messageType || '', input.mimeType || '');
  const placeholderCaption = captionFromPlaceholderText(text);

  const displayCaption =
    captionField ||
    placeholderCaption ||
    (mediaUrl && text && !placeholder ? text : '');

  if (mediaUrl) {
    return {
      kind: 'image',
      displayCaption,
      previewText: displayCaption || 'Photo',
    };
  }

  // Honest missing state: placeholder text, image-typed row, or media_id without a stored URL
  if (placeholder || imageTyped || (mediaId && (placeholder || imageTyped || !text || text === 'Empty message'))) {
    return {
      kind: 'missing_image',
      displayCaption: displayCaption || placeholderCaption || captionField,
      previewText: 'Photo',
    };
  }

  return {
    kind: 'text',
    displayCaption: '',
    previewText: text || 'Empty message',
  };
}
