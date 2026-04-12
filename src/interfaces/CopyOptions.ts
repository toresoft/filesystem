/**
 * Options for file copy operations.
 */
export interface CopyOptions {
    /**
     * Whether to overwrite the target file if it already exists.
     * @default true
     */
    overwrite?: boolean;

    /**
     * Whether to preserve file permissions from the source.
     * @default false
     */
    preservePermissions?: boolean;
}
