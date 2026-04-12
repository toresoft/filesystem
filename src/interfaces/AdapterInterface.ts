import type {SyncFilesystemInterface} from './SyncFilesystemInterface.js';
import type {AsyncFilesystemInterface} from './AsyncFilesystemInterface.js';

/**
 * Adapter interface for filesystem implementations.
 * Allows swapping the underlying filesystem (e.g., in-memory for testing).
 */
export interface FilesystemAdapterInterface {
    sync: SyncFilesystemInterface;
    async: AsyncFilesystemInterface;
}
