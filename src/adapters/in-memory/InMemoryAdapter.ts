import type {AsyncFilesystemInterface, FilesystemAdapterInterface, SyncFilesystemInterface} from '../../interfaces';
import type {InMemoryNode} from './InMemoryNode.js';
import {createDirectoryNode, createFileNode} from './InMemoryNode.js';
import {InMemorySyncAdapter} from './InMemorySyncAdapter.js';
import {InMemoryAsyncAdapter} from './InMemoryAsyncAdapter.js';

/**
 * In-memory filesystem adapter for testing purposes.
 *
 * Provides a virtual filesystem that operates entirely in memory,
 * ideal for unit tests without disk I/O. Implements the
 * {@link FilesystemAdapterInterface} so it can be passed directly
 * to the {@link Filesystem} constructor.
 *
 * All paths are normalised to absolute POSIX-style paths internally.
 *
 * @example
 * ```typescript
 * const adapter = new InMemoryFilesystemAdapter();
 * const fs = new Filesystem(adapter);
 *
 * fs.sync.dumpFile('/test/file.txt', 'Hello');
 * const content = fs.sync.readFile('/test/file.txt');
 *
 * // Inspect state for assertions
 * const snapshot = adapter.snapshot();
 * adapter.clear(); // Reset between tests
 * ```
 */
export class InMemoryFilesystemAdapter implements FilesystemAdapterInterface {
    private readonly store: Map<string, InMemoryNode>;
    private readonly symlinks: Map<string, string>;
    private readonly syncImpl: InMemorySyncAdapter;
    private readonly asyncImpl: InMemoryAsyncAdapter;

    constructor() {
        this.store = new Map();
        this.symlinks = new Map();
        this.syncImpl = new InMemorySyncAdapter(this.store, this.symlinks);
        this.asyncImpl = new InMemoryAsyncAdapter(this.syncImpl);
    }

    /**
     * Returns the synchronous filesystem interface.
     */
    get sync(): SyncFilesystemInterface {
        return this.syncImpl;
    }

    /**
     * Returns the asynchronous filesystem interface.
     *
     * **Note:** All async operations delegate to the sync implementation
     * since everything is in-memory. No actual asynchronous I/O is performed.
     */
    get async(): AsyncFilesystemInterface {
        return this.asyncImpl;
    }

    /**
     * Returns a snapshot of all files and their content as strings.
     *
     * Directories are excluded from the snapshot. Only files with
     * UTF-8 decodable content are included.
     *
     * @returns A record mapping absolute file paths to their string content.
     *
     * @example
     * ```typescript
     * adapter.seed({ '/a.txt': 'hello', '/b.txt': 'world' });
     * const snap = adapter.snapshot();
     * // { '/a.txt': 'hello', '/b.txt': 'world' }
     * ```
     */
    snapshot(): Record<string, string> {
        const result: Record<string, string> = {};
        for (const [path, node] of this.store.entries()) {
            if (node.type === 'file') {
                result[path] = node.content.toString('utf8');
            }
        }
        return result;
    }

    /**
     * Clears the entire virtual filesystem.
     *
     * Removes all files, directories, and symbolic links.
     * Useful for resetting state between tests.
     */
    clear(): void {
        this.store.clear();
        this.symlinks.clear();
    }

    /**
     * Checks if a path exists in the virtual filesystem.
     *
     * The path is normalised before lookup (handles `..`, `.`,
     * backslashes, and relative paths).
     *
     * @param path - The path to check.
     * @returns `true` if the path exists as a file, directory, or symlink.
     */
    has(path: string): boolean {
        const resolved = this.resolve(path);
        return this.store.has(resolved) || this.symlinks.has(resolved);
    }

    /**
     * Seeds the virtual filesystem with a set of files.
     *
     * Parent directories are created automatically. If a file already
     * exists at a given path it is overwritten.
     *
     * @param files - A record mapping file paths to their content.
     *
     * @example
     * ```typescript
     * adapter.seed({
     *     '/config/app.json': '{"debug": true}',
     *     '/data/binary.bin': Buffer.from([0x00, 0xFF]),
     * });
     * ```
     */
    seed(files: Record<string, string | Buffer>): void {
        for (const [filePath, content] of Object.entries(files)) {
            const resolved = this.resolve(filePath);
            // Ensure parent directories exist
            const parts = resolved.split('/').filter(Boolean);
            let current = '';
            for (let i = 0; i < parts.length - 1; i++) {
                current += '/' + parts[i];
                if (!this.store.has(current)) {
                    this.store.set(current, createDirectoryNode());
                }
            }
            // Create the file
            this.store.set(resolved, createFileNode(content));
        }
    }

    /**
     * Normalises a path to a canonical absolute POSIX form.
     *
     * - Backslashes are converted to forward slashes.
     * - Trailing slashes are removed.
     * - Relative paths are prefixed with `/`.
     * - `.` segments are removed.
     * - `..` segments are resolved (cannot traverse beyond root).
     *
     * @param p - The path to resolve.
     * @returns The normalised absolute path.
     */
    private resolve(p: string): string {
        let resolved = p.replace(/\\/g, '/').replace(/\/+$/, '');
        if (!resolved.startsWith('/')) {
            resolved = '/' + resolved;
        }
        const parts = resolved.split('/').filter(Boolean);
        const stack: string[] = [];
        for (const part of parts) {
            if (part === '.') continue;
            if (part === '..') {
                stack.pop();
            } else {
                stack.push(part);
            }
        }
        return '/' + stack.join('/');
    }
}
