// Size limits shared by the API and the SDKs. Plain numbers with no Zod, so the JS SDK can
// import them (as @roost/contracts/limits) without bundling the schema library into games.

/** Events per POST /v1/events. Changing these is a /v1 contract change. */
export const MAX_EVENTS_PER_BATCH = 500;
/** Most crash reports carry this many recent events, so the dashboard can show what led up to it. */
export const MAX_BREADCRUMBS = 100;
/** Per-attachment and per-report limits. Uploads past these are rejected. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
/** A minidump is bigger than other attachments; anything past this is dropped by the SDK. */
export const MAX_MINIDUMP_BYTES = 20 * 1024 * 1024;
