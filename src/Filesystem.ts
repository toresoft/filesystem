import type {
    AsyncFilesystemInterface,
    FilesystemAdapterInterface,
    SyncFilesystemInterface
} from './interfaces';
import {NodeFsAsyncAdapter, NodeFsSyncAdapter} from './adapters';
import {InMemoryFilesystemAdapter} from './adapters/in-memory';

/**
 * Main entry point for the filesystem library.
 *
 * Provides a unified API that exposes both synchronous (`sync`) and
 * asynchronous (`async`) filesystem interfaces through a single object.
 * By default, operations are backed by the real Node.js filesystem.
 *
 * An optional {@link FilesystemAdapterInterface} can be provided to
 * customise the underlying implementation (e.g. in-memory for testing).
 *
 * @example
 * ```typescript
 * // Using the real filesystem
 * const fs = new Filesystem();
 * fs.sync.dumpFile('/tmp/hello.txt', 'Hello, world!');
 * console.log(fs.sync.readFile('/tmp/hello.txt'));
 *
 * // Using an in-memory adapter for tests
 * const memFs = Filesystem.createInMemory();
 * memFs.sync.dumpFile('/test.txt', 'in-memory');
 * console.log(memFs.adapter.snapshot()); // { '/test.txt': 'in-memory' }
 * ```
 */
export class Filesystem {
    /**
     * Synchronous filesystem interface.
     *
     * All methods perform blocking I/O and return their results directly.
     */
    public readonly sync: SyncFilesystemInterface;

    /**
     * Asynchronous filesystem interface.
     *
     * All methods return Promises and perform non-blocking I/O.
     */
    public readonly async: AsyncFilesystemInterface;

    /**
     * Creates a new Filesystem instance.
     *
     * @param adapter - Optional adapter that provides the sync and async
     *   implementations. If omitted, the default Node.js filesystem adapter
     *   is used.
     */
    constructor(adapter?: FilesystemAdapterInterface) {
        if (adapter) {
            this.sync = adapter.sync;
            this.async = adapter.async;
        } else {
            this.sync = new NodeFsSyncAdapter();
            this.async = new NodeFsAsyncAdapter();
        }
    }

    /**
     * Creates a new Filesystem instance backed by an in-memory adapter.
     *
     * The returned object includes an `adapter` property that gives direct
     * access to the {@link InMemoryFilesystemAdapter}, useful for inspecting
     * state in tests (e.g. `adapter.snapshot()`, `adapter.clear()`).
     *
     * @returns A Filesystem with an attached in-memory adapter.
     *
     * @example
     * ```typescript
     * const fs = Filesystem.createInMemory();
     * fs.sync.dumpFile('/test.txt', 'hello');
     * console.log(fs.adapter.snapshot()); // { '/test.txt': 'hello' }
     * fs.adapter.clear();
     * ```
     */
    static createInMemory(): Filesystem & { adapter: InMemoryFilesystemAdapter } {
        const adapter = new InMemoryFilesystemAdapter();
        const fs = new Filesystem(adapter);
        return Object.assign(fs, { adapter });
    }
}
