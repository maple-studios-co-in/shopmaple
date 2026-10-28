/**
 * Shape of a staff draft-preview token: base64url payload, a dot, then a 32-byte HMAC-SHA256
 * signature in base64url (43 characters). The API signs and verifies; the web app only checks
 * the shape before placing a token in a URL.
 */
export const previewTokenPattern = /^[A-Za-z0-9_-]{1,400}\.[A-Za-z0-9_-]{43}$/;
