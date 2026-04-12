/**
 * Configuration options for the Filesystem instance.
 */
export interface FilesystemOptions {
    /**
     * Threshold in bytes above which stream-based operations are used
     * for file copying. Files larger than this value will be copied
     * using Node.js streams for memory efficiency.
     *
     * @default 16 * 1024 * 1024 (16 MB)
     */
    streamThreshold?: number;
}
