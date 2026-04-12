/**
 * Default threshold in bytes above which stream-based operations are used
 * for file copying. Files larger than this value will be copied using
 * Node.js streams for memory efficiency.
 */
export const DEFAULT_STREAM_THRESHOLD = 16 * 1024 * 1024; // 16 MB
