import type {AsyncFilesystemInterface, FilesystemAdapterInterface, SyncFilesystemInterface} from '../../interfaces';
import type {InMemoryNode} from './InMemoryNode.js';
import {createDirectoryNode, createFileNode} from './InMemoryNode.js';
import {InMemorySyncAdapter} from './InMemorySyncAdapter.js';
import {InMemoryAsyncAdapter} from './InMemoryAsyncAdapter.js';

/**
 * In-memory filesystem adapter for testing purposes.
 *
 * Provides a virtual filesystem that operates entirely in memory,
 * ideal for unit tests without disk I/O.
 *
 * @example
 * ```typescript
 * const adapter = new InMemoryFilesystemAdapter();
 * const fs = new Filesystem({}, adapter);
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

    get sync(): SyncFilesystemInterface {
        return this.syncImpl;
    }

    get async(): AsyncFilesystemInterface {
        return this.asyncImpl;
    }

    /**
     * Returns a snapshot of all files and their content as strings.
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
     */
    clear(): void {
        this.store.clear();
        this.symlinks.clear();
    }

    /**
     * Checks if a path exists in the virtual filesystem.
     */
    has(path: string): boolean {
        return this.store.has(path) || this.symlinks.has(path);
    }

    /**
     * Seeds the virtual filesystem with a set of files.
     */
    seed(files: Record<string, string | Buffer>): void {
        for (const [filePath, content] of Object.entries(files)) {
            // Ensure parent directories exist
            const parts = filePath.split('/').filter(Boolean);
            let current = '';
            for (let i = 0; i < parts.length - 1; i++) {
                current += '/' + parts[i];
                if (!this.store.has(current)) {
                    this.store.set(current, createDirectoryNode());
                }
            }
            // Create the file
            this.store.set(filePath, createFileNode(content));
        }
    }
}
