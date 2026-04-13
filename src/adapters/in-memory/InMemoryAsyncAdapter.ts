import {Readable} from 'node:stream';
import type {AsyncFilesystemInterface, CopyOptions} from '../../interfaces';
import {IOException} from '../../exceptions';
import {InMemorySyncAdapter} from './InMemorySyncAdapter.js';

/**
 * Asynchronous in-memory filesystem adapter for testing.
 *
 * Delegates every operation to the {@link InMemorySyncAdapter} since
 * all data is held in memory and no actual I/O is performed. The `async`
 * signatures exist solely to satisfy the {@link AsyncFilesystemInterface}.
 *
 * The only methods with additional logic are {@link dumpFile} and
 * {@link appendToFile}, which consume `Readable` streams into a `Buffer`
 * before delegating to the sync adapter.
 */
export class InMemoryAsyncAdapter implements AsyncFilesystemInterface {
    private readonly syncAdapter: InMemorySyncAdapter;

    /**
     * @param syncAdapter - The underlying sync adapter to delegate to.
     */
    constructor(syncAdapter: InMemorySyncAdapter) {
        this.syncAdapter = syncAdapter;
    }

    /**
     * Creates one or more directories recursively.
     *
     * @param paths - A single path or an array of paths to create.
     * @param mode - The file mode (permissions). Defaults to `0o777`.
     *
     * @throws {DirectoryAlreadyExistsException} If a file already exists at a target path.
     */
    async mkdir(paths: string | string[], mode?: number): Promise<void> {
        this.syncAdapter.mkdir(paths, mode);
    }

    /**
     * Checks whether all given paths exist.
     *
     * @param paths - A single path or an array of paths.
     * @returns `true` if every path exists.
     */
    async exists(paths: string | string[]): Promise<boolean> {
        return this.syncAdapter.exists(paths);
    }

    /**
     * Returns whether the given path points to a directory.
     *
     * @param path - The path to check.
     * @returns `true` if the path is a directory.
     */
    async isDirectory(path: string): Promise<boolean> {
        return this.syncAdapter.isDirectory(path);
    }

    /**
     * Returns whether the given path points to a regular file.
     *
     * @param path - The path to check.
     * @returns `true` if the path is a file.
     */
    async isFile(path: string): Promise<boolean> {
        return this.syncAdapter.isFile(path);
    }

    /**
     * Copies a single file.
     *
     * @param originFile - Path of the source file.
     * @param targetFile - Path of the destination file.
     * @param options - Optional copy behaviour (overwrite, preservePermissions).
     *
     * @throws {FileNotFoundException} If the source does not exist.
     * @throws {PermissionDeniedException} If the source is not readable.
     * @throws {FileAlreadyExistsException} If the target exists and overwrite is false.
     */
    async copy(originFile: string, targetFile: string, options?: CopyOptions): Promise<void> {
        this.syncAdapter.copy(originFile, targetFile, options);
    }

    /**
     * Renames or moves a file, directory, or symbolic link.
     *
     * @param origin - Path of the source entry.
     * @param target - Path of the destination.
     * @param overwrite - Whether to overwrite an existing target. Defaults to `true`.
     *
     * @throws {FileNotFoundException} If the source does not exist.
     * @throws {FileAlreadyExistsException} If the target exists and overwrite is false.
     */
    async rename(origin: string, target: string, overwrite?: boolean): Promise<void> {
        this.syncAdapter.rename(origin, target, overwrite);
    }

    /**
     * Removes one or more files, directories, or symbolic links.
     *
     * @param paths - A single path or an array of paths.
     *
     * @throws {FileNotFoundException} If a path does not exist.
     */
    async remove(paths: string | string[]): Promise<void> {
        this.syncAdapter.remove(paths);
    }

    /**
     * Sets access and modification times. Creates the file if it does not exist.
     *
     * @param paths - A single path or an array of paths.
     * @param time - The modification time. Defaults to `new Date()`.
     * @param atime - The access time. Defaults to `time`.
     */
    async touch(paths: string | string[], time?: Date, atime?: Date): Promise<void> {
        this.syncAdapter.touch(paths, time, atime);
    }

    /**
     * Reads a file as a string.
     *
     * @param filename - Path of the file.
     * @param encoding - Text encoding. Defaults to `'utf8'`.
     * @returns The file content as a string.
     *
     * @throws {FileNotFoundException} If the file does not exist.
     */
    async readFile(filename: string, encoding?: BufferEncoding): Promise<string> {
        return this.syncAdapter.readFile(filename, encoding);
    }

    /**
     * Reads a file as a Buffer.
     *
     * @param filename - Path of the file.
     * @returns The raw file content.
     *
     * @throws {FileNotFoundException} If the file does not exist.
     */
    async readFileAsBuffer(filename: string): Promise<Buffer> {
        return this.syncAdapter.readFileAsBuffer(filename);
    }

    /**
     * Writes content to a file, replacing any existing content.
     *
     * When a `Readable` stream is provided, it is fully consumed into
     * a `Buffer` before writing, since the in-memory store does not
     * support streaming natively.
     *
     * @param filename - Path of the target file.
     * @param content - The content to write (`string`, `Buffer`, or `Readable`).
     */
    async dumpFile(filename: string, content: string | Buffer | Readable): Promise<void> {
        if (content instanceof Readable) {
            const buffer = await this.consumeStream(content, filename);
            this.syncAdapter.dumpFile(filename, buffer);
        } else {
            this.syncAdapter.dumpFile(filename, content);
        }
    }

    /**
     * Appends content to an existing file.
     *
     * When a `Readable` stream is provided, it is fully consumed into
     * a `Buffer` before appending.
     *
     * @param filename - Path of the target file.
     * @param content - The content to append (`string`, `Buffer`, or `Readable`).
     *
     * @throws {IOException} If the path points to a directory or the stream fails.
     */
    async appendToFile(filename: string, content: string | Buffer | Readable): Promise<void> {
        if (content instanceof Readable) {
            const buffer = await this.consumeStream(content, filename);
            this.syncAdapter.appendToFile(filename, buffer);
        } else {
            this.syncAdapter.appendToFile(filename, content);
        }
    }

    /**
     * Changes file permissions.
     *
     * @param paths - A single path or an array of paths.
     * @param mode - The numeric file mode.
     *
     * @throws {FileNotFoundException} If a path does not exist.
     */
    async chmod(paths: string | string[], mode: number): Promise<void> {
        this.syncAdapter.chmod(paths, mode);
    }

    /**
     * Changes file ownership.
     *
     * @param paths - A single path or an array of paths.
     * @param uid - The numeric user ID.
     * @param gid - The numeric group ID.
     *
     * @throws {FileNotFoundException} If a path does not exist.
     */
    async chown(paths: string | string[], uid: number, gid: number): Promise<void> {
        this.syncAdapter.chown(paths, uid, gid);
    }

    /**
     * Creates a symbolic link.
     *
     * @param origin - The target that the link points to.
     * @param target - The path where the link will be created.
     *
     * @throws {SymbolicLinkException} If a circular link is detected.
     */
    async symlink(origin: string, target: string): Promise<void> {
        this.syncAdapter.symlink(origin, target);
    }

    /**
     * Reads the target of a symbolic link.
     *
     * @param linkPath - The path of the symbolic link.
     * @param canonicalize - If `true`, resolves to the full canonical path.
     * @returns The link target path.
     *
     * @throws {SymbolicLinkException} If the path is not a symbolic link.
     */
    async readlink(linkPath: string, canonicalize?: boolean): Promise<string> {
        return this.syncAdapter.readlink(linkPath, canonicalize);
    }

    /**
     * Checks whether a path is readable.
     *
     * @param path - The path to check.
     * @returns `true` if the path exists and has the read bit set.
     */
    async isReadable(path: string): Promise<boolean> {
        return this.syncAdapter.isReadable(path);
    }

    /**
     * Checks whether a path is writable.
     *
     * @param path - The path to check.
     * @returns `true` if the path exists and has the write bit set.
     */
    async isWritable(path: string): Promise<boolean> {
        return this.syncAdapter.isWritable(path);
    }

    /**
     * Creates a temporary file with a unique name.
     *
     * @param dir - The parent directory. Must exist.
     * @param prefix - A prefix for the generated file name.
     * @returns The path of the newly created temporary file.
     *
     * @throws {TempFileCreationException} If the directory does not exist.
     */
    async tempnam(dir: string, prefix: string): Promise<string> {
        return this.syncAdapter.tempnam(dir, prefix);
    }

    // --- Helpers ---

    /**
     * Fully consumes a `Readable` stream into a `Buffer`.
     *
     * Handles `string`, `Buffer`, and `Uint8Array` chunks.
     * Destroys the stream on error to prevent resource leaks.
     *
     * @param stream - The readable stream to consume.
     * @param filename - The target filename (used in error messages).
     * @returns The concatenated content as a `Buffer`.
     *
     * @throws {IOException} If the stream emits an error.
     */
    private async consumeStream(stream: Readable, filename: string): Promise<Buffer> {
        const chunks: Buffer[] = [];
        try {
            for await (const chunk of stream) {
                chunks.push(Buffer.from(chunk));
            }
            return Buffer.concat(chunks);
        } catch (error) {
            // Destroy the stream to release underlying resources
            if (!stream.destroyed) {
                stream.destroy();
            }
            throw new IOException(
                `Failed to read stream for "${filename}": ${error instanceof Error ? error.message : String(error)}`,
                filename,
                error instanceof Error ? error : undefined,
            );
        }
    }
}
