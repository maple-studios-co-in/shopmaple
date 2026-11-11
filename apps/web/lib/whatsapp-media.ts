/**
 * Development only: the handle that makes the WhatsApp header-image route (app/whatsapp/order-media) draw the Figma frames'
 * own Nola photograph, so the preview page (app/previews/whatsapp) shows the designed image even when the local catalogue
 * lacks or cannot reach the chair. In production it is an ordinary handle that no product has: a 404.
 */
export const previewSampleHandle = "preview-sample";
