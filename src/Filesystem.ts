import type {
    AsyncFilesystemInterface,
    FilesystemAdapterInterface,
    FilesystemOptions,
    SyncFilesystemInterface
} from './interfaces';
import {NodeFsAsyncAdapter, NodeFsSyncAdapter} from './adapters';
import {InMemoryFilesystemAdapter} from './adapters/in-memory';
import {DEFAULT_STREAM_THRESHOLD} from './internal';

/**
 * Main entry point for the filesystem library.
 *
 * Provides both synchronous and asynchronous APIs through a facade pattern.
 *
 * @example
 * ```typescript
 * const fs = new Filesystem();
 *
 * // Sync API
 * fs.sync.mkdir('/tmp/test');
 * fs.sync.dumpFile('/tmp/test/file.txt', 'Hello');
 *
 * // Async API
 * await fs.async.mkdir('/tmp/test');
 * await fs.async.dumpFile('/tmp/test/file.txt', 'Hello');
 * ```
 */
export class Filesystem {
    public readonly sync: SyncFilesystemInterface;
    public readonly async: AsyncFilesystemInterface;

    constructor(
        options?: FilesystemOptions,
        adapter?: FilesystemAdapterInterface,
    ) {
        const streamThreshold = options?.streamThreshold ?? DEFAULT_STREAM_THRESHOLD;

        if (adapter) {
            this.sync = adapter.sync;
            this.async = adapter.async;
        } else {
            this.sync = new NodeFsSyncAdapter();
            this.async = new NodeFsAsyncAdapter(streamThreshold);
        }
    }

    /**
     * Creates a Filesystem instance backed by an in-memory store.
     * Ideal for testing without disk I/O.
     *
     * @example
     * ```typescript
     * const fs = Filesystem.createInMemory();
     * fs.sync.dumpFile('/test/file.txt', 'content');
     * ```
     */
    static createInMemory(): Filesystem & { adapter: InMemoryFilesystemAdapter } {
        const adapter = new InMemoryFilesystemAdapter();
        const fs = new Filesystem({}, adapter);
        return Object.assign(fs, { adapter });
    }
}
