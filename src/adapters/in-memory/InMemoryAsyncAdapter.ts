import {Readable} from 'node:stream';
import type {AsyncFilesystemInterface, CopyOptions} from '../../interfaces';
import {InMemorySyncAdapter} from './InMemorySyncAdapter.js';

/**
 * Asynchronous in-memory filesystem adapter for testing.
 * Delegates to the sync adapter since all operations are in-memory.
 */
export class InMemoryAsyncAdapter implements AsyncFilesystemInterface {
    private readonly syncAdapter: InMemorySyncAdapter;

    constructor(syncAdapter: InMemorySyncAdapter) {
        this.syncAdapter = syncAdapter;
    }

    async mkdir(paths: string | string[], mode?: number): Promise<void> {
        this.syncAdapter.mkdir(paths, mode);
    }

    async exists(paths: string | string[]): Promise<boolean> {
        return this.syncAdapter.exists(paths);
    }

    async isDirectory(path: string): Promise<boolean> {
        return this.syncAdapter.isDirectory(path);
    }

    async isFile(path: string): Promise<boolean> {
        return this.syncAdapter.isFile(path);
    }

    async copy(originFile: string, targetFile: string, options?: CopyOptions): Promise<void> {
        this.syncAdapter.copy(originFile, targetFile, options);
    }

    async rename(origin: string, target: string, overwrite?: boolean): Promise<void> {
        this.syncAdapter.rename(origin, target, overwrite);
    }

    async remove(paths: string | string[]): Promise<void> {
        this.syncAdapter.remove(paths);
    }

    async touch(paths: string | string[], time?: Date, atime?: Date): Promise<void> {
        this.syncAdapter.touch(paths, time, atime);
    }

    async readFile(filename: string, encoding?: BufferEncoding): Promise<string> {
        return this.syncAdapter.readFile(filename, encoding);
    }

    async readFileAsBuffer(filename: string): Promise<Buffer> {
        return this.syncAdapter.readFileAsBuffer(filename);
    }

    async dumpFile(filename: string, content: string | Buffer | Readable): Promise<void> {
        if (content instanceof Readable) {
            // For in-memory, we can consume the stream
            const chunks: Buffer[] = [];
            for await (const chunk of content) {
                chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const buffer = Buffer.concat(chunks);
            this.syncAdapter.dumpFile(filename, buffer);
        } else {
            this.syncAdapter.dumpFile(filename, content);
        }
    }

    async appendToFile(filename: string, content: string | Buffer | Readable): Promise<void> {
        if (content instanceof Readable) {
            const chunks: Buffer[] = [];
            for await (const chunk of content) {
                chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const buffer = Buffer.concat(chunks);
            this.syncAdapter.appendToFile(filename, buffer);
        } else {
            this.syncAdapter.appendToFile(filename, content);
        }
    }

    async chmod(paths: string | string[], mode: number): Promise<void> {
        this.syncAdapter.chmod(paths, mode);
    }

    async chown(paths: string | string[], uid: number, gid: number): Promise<void> {
        this.syncAdapter.chown(paths, uid, gid);
    }

    async symlink(origin: string, target: string): Promise<void> {
        this.syncAdapter.symlink(origin, target);
    }

    async readlink(linkPath: string, canonicalize?: boolean): Promise<string> {
        return this.syncAdapter.readlink(linkPath, canonicalize);
    }

    async isReadable(path: string): Promise<boolean> {
        return this.syncAdapter.isReadable(path);
    }

    async isWritable(path: string): Promise<boolean> {
        return this.syncAdapter.isWritable(path);
    }

    async tempnam(dir: string, prefix: string): Promise<string> {
        return this.syncAdapter.tempnam(dir, prefix);
    }
}
