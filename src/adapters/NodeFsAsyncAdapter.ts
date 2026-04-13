import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as nodeFs from 'node:fs';
import * as crypto from 'node:crypto';
import {Readable} from 'node:stream';
import type {AsyncFilesystemInterface, CopyOptions} from '../interfaces';
import {
    FileAlreadyExistsException,
    FileNotFoundException,
    PermissionDeniedException,
    SymbolicLinkException,
    TempFileCreationException,
} from '../exceptions';
import {mapError, pipeToFile} from '../internal';

/**
 * Asynchronous filesystem adapter using Node.js `node:fs/promises` module.
 *
 * Provides non-blocking filesystem operations that mirror the behaviour of
 * Symfony's Filesystem component. Every method maps raw Node.js errors
 * to library-specific exceptions for consistent error handling.
 *
 * @example
 * ```typescript
 * const adapter = new NodeFsAsyncAdapter();
 * await adapter.mkdir('/tmp/my-project');
 * await adapter.dumpFile('/tmp/my-project/hello.txt', 'Hello, world!');
 * console.log(await adapter.readFile('/tmp/my-project/hello.txt'));
 * ```
 */
export class NodeFsAsyncAdapter implements AsyncFilesystemInterface {

    // --- Directory operations ---

    /**
     * Creates one or more directories recursively.
     *
     * If a directory already exists the call is silently skipped (idempotent).
     * If a **file** exists at the target path, a {@link DirectoryAlreadyExistsException}
     * is thrown. Parent directories are created automatically.
     *
     * @param paths - A single path or an array of paths to create.
     * @param mode - The file mode (permissions) for created directories. Defaults to `0o777`.
     *
     * @throws {DirectoryAlreadyExistsException} If a file (not a directory) already exists at a target path.
     * @throws {PermissionDeniedException} If the process lacks write permissions on the parent directory.
     *
     * @sideeffect Creates directories on the physical filesystem.
     */
    async mkdir(paths: string | string[], mode: number = 0o777): Promise<void> {
        const normalized = this.normalizePaths(paths);
        for (const filePath of normalized) {
            try {
                await fs.mkdir(filePath, { recursive: true, mode });
            } catch (error) {
                mapError(error, filePath, 'directory');
            }
        }
    }

    /**
     * Checks whether all given paths exist on the filesystem.
     *
     * Uses `fs.access` internally, so the check verifies that the
     * current process has at least **read** access to every path.
     * All paths are checked in parallel.
     *
     * @param paths - A single path or an array of paths to check.
     * @returns A promise that resolves to `true` if every path exists and is accessible.
     */
    async exists(paths: string | string[]): Promise<boolean> {
        const normalized = this.normalizePaths(paths);
        const results = await Promise.all(
            normalized.map(async (filePath) => {
                try {
                    await fs.access(filePath);
                    return true;
                } catch {
                    return false;
                }
            }),
        );
        return results.every(Boolean);
    }

    /**
     * Returns whether the given path points to a directory.
     *
     * Returns `false` (instead of throwing) if the path does not exist
     * or is not accessible.
     *
     * @param path - The path to check.
     * @returns A promise that resolves to `true` if the path exists and is a directory.
     */
    async isDirectory(path: string): Promise<boolean> {
        try {
            const stat = await fs.stat(path);
            return stat.isDirectory();
        } catch {
            return false;
        }
    }

    /**
     * Returns whether the given path points to a regular file.
     *
     * Returns `false` (instead of throwing) if the path does not exist
     * or is not accessible.
     *
     * @param path - The path to check.
     * @returns A promise that resolves to `true` if the path exists and is a regular file.
     */
    async isFile(path: string): Promise<boolean> {
        try {
            const stat = await fs.stat(path);
            return stat.isFile();
        } catch {
            return false;
        }
    }

    // --- File operations ---

    /**
     * Copies a single file from `originFile` to `targetFile`.
     *
     * The target directory is created automatically if it does not exist.
     * By default the copy overwrites an existing target (mirroring `cp` behaviour).
     * Uses `fs.copyFile` internally for optimal performance.
     *
     * @param originFile - Absolute path of the source file.
     * @param targetFile - Absolute path of the destination file.
     * @param options - Optional copy behaviour:
     *   - `overwrite` — Whether to overwrite an existing target. Defaults to `true`.
     *   - `preservePermissions` — Whether to copy the source file's mode to the target. Defaults to `false`.
     *
     * @throws {FileNotFoundException} If the source file does not exist.
     * @throws {PermissionDeniedException} If the source file is not readable (Linux `EACCES`).
     * @throws {FileAlreadyExistsException} If the target exists and `overwrite` is `false`.
     *
     * @sideeffect Creates the target directory tree and writes the target file to disk.
     */
    async copy(originFile: string, targetFile: string, options?: CopyOptions): Promise<void> {
        const overwrite = options?.overwrite ?? true;
        const preservePermissions = options?.preservePermissions ?? false;

        try {
            // Verify source exists and is accessible
            try {
                await fs.access(originFile, nodeFs.constants.R_OK);
            } catch (error) {
                const nodeError = error as NodeJS.ErrnoException;
                if (nodeError.code === 'ENOENT') {
                    throw new FileNotFoundException(
                        `File not found: ${originFile}`,
                        originFile,
                    );
                }
                if (nodeError.code === 'EACCES') {
                    throw new PermissionDeniedException(
                        `Source file is not readable: ${originFile}`,
                        originFile,
                    );
                }
                mapError(error, originFile, 'file');
            }

            if (!overwrite && await this.exists(targetFile)) {
                throw new FileAlreadyExistsException(
                    `File already exists: ${targetFile}`,
                    targetFile,
                );
            }

            // Ensure target directory exists
            const targetDir = path.dirname(targetFile);
            await fs.mkdir(targetDir, { recursive: true });

            await fs.copyFile(originFile, targetFile);

            if (preservePermissions) {
                const stat = await fs.stat(originFile);
                await fs.chmod(targetFile, stat.mode);
            }
        } catch (error) {
            if (
                error instanceof FileNotFoundException ||
                error instanceof FileAlreadyExistsException ||
                error instanceof PermissionDeniedException
            ) {
                throw error;
            }
            mapError(error, originFile, 'file');
        }
    }

    /**
     * Renames or moves a file or directory.
     *
     * Note: This method only checks for source existence, not readability.
     * On Linux, rename(2) does not require read permissions on the source,
     * only write permissions on the parent directory.
     *
     * The target directory is created automatically if it does not exist.
     *
     * @param origin - Absolute path of the source file or directory.
     * @param target - Absolute path of the destination.
     * @param overwrite - Whether to overwrite an existing target. Defaults to `true`.
     *
     * @throws {FileNotFoundException} If the source does not exist.
     * @throws {FileAlreadyExistsException} If the target exists and `overwrite` is `false`.
     *
     * @sideeffect Creates the target directory tree and moves the filesystem entry.
     */
    async rename(origin: string, target: string, overwrite: boolean = true): Promise<void> {
        try {
            try {
                await fs.access(origin);
            } catch {
                throw new FileNotFoundException(
                    `File not found: ${origin}`,
                    origin,
                );
            }

            if (!overwrite) {
                try {
                    await fs.access(target);
                    throw new FileAlreadyExistsException(
                        `File already exists: ${target}`,
                        target,
                    );
                } catch (error) {
                    if (error instanceof FileAlreadyExistsException) {
                        throw error;
                    }
                }
            }

            // Ensure target directory exists
            const targetDir = path.dirname(target);
            await fs.mkdir(targetDir, { recursive: true });

            await fs.rename(origin, target);
        } catch (error) {
            if (
                error instanceof FileNotFoundException ||
                error instanceof FileAlreadyExistsException
            ) {
                throw error;
            }
            mapError(error, origin);
        }
    }

    /**
     * Removes one or more files or directories recursively.
     *
     * When multiple paths are provided, all removal attempts are executed
     * even if some fail. If more than one error occurs an
     * {@link AggregateError} is thrown containing all individual errors.
     *
     * @param paths - A single path or an array of paths to remove.
     *
     * @throws {FileNotFoundException} If a path does not exist.
     * @throws {AggregateError} If multiple paths fail to be removed.
     *
     * @sideeffect Deletes files and directory trees from the physical filesystem.
     */
    async remove(paths: string | string[]): Promise<void> {
        const normalized = this.normalizePaths(paths);
        const errors: Error[] = [];

        for (const filePath of normalized) {
            try {
                const stat = await fs.stat(filePath);
                if (stat.isDirectory()) {
                    await fs.rm(filePath, { recursive: true, force: true });
                } else {
                    await fs.unlink(filePath);
                }
            } catch (error) {
                const nodeError = error as NodeJS.ErrnoException;
                if (nodeError.code === 'ENOENT') {
                    errors.push(
                        new FileNotFoundException(
                            `Path not found: ${filePath}`,
                            filePath,
                            error instanceof Error ? error : undefined,
                        ),
                    );
                } else {
                    try {
                        mapError(error, filePath);
                    } catch (mapped) {
                        errors.push(mapped instanceof Error ? mapped : new Error(String(mapped)));
                    }
                }
            }
        }

        if (errors.length === 1) {
            throw errors[0];
        }
        if (errors.length > 1) {
            throw new AggregateError(errors, `Failed to remove ${errors.length} path(s)`);
        }
    }

    /**
     * Sets the access and modification times of the given paths.
     *
     * If a file does not exist it is **created** as an empty file,
     * mirroring the behaviour of the POSIX `touch` command.
     * Parent directories are created automatically when a new file needs
     * to be created.
     *
     * @param paths - A single path or an array of paths to touch.
     * @param time - The modification time to set. Defaults to `new Date()`.
     * @param atime - The access time to set. Defaults to the value of `time`.
     *
     * @throws {IOException} If the times cannot be set on an existing file.
     *
     * @sideeffect May create empty files and directories on disk.
     */
    async touch(paths: string | string[], time?: Date, atime?: Date): Promise<void> {
        const normalized = this.normalizePaths(paths);
        const mtime = time ?? new Date();
        const atimeVal = atime ?? mtime;

        for (const filePath of normalized) {
            try {
                // Ensure directory exists
                const dir = path.dirname(filePath);
                await fs.mkdir(dir, { recursive: true });

                await fs.utimes(filePath, atimeVal, mtime);
            } catch (error) {
                const nodeError = error as NodeJS.ErrnoException;
                if (nodeError.code === 'ENOENT') {
                    // File doesn't exist — create it, then set timestamps
                    try {
                        await fs.writeFile(filePath, '');
                        await fs.utimes(filePath, atimeVal, mtime);
                    } catch (writeError) {
                        mapError(writeError, filePath, 'file');
                    }
                } else {
                    mapError(error, filePath, 'file');
                }
            }
        }
    }

    // --- Read/Write ---

    /**
     * Reads a file and returns its content as a string.
     *
     * @param filename - Absolute path of the file to read.
     * @param encoding - The text encoding to use. Defaults to `'utf8'`.
     * @returns A promise that resolves to the file content decoded with the specified encoding.
     *
     * @throws {FileNotFoundException} If the file does not exist.
     * @throws {PermissionDeniedException} If the file is not readable.
     */
    async readFile(filename: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
        try {
            return await fs.readFile(filename, encoding);
        } catch (error) {
            return mapError(error, filename, 'file');
        }
    }

    /**
     * Reads a file and returns its raw content as a {@link Buffer}.
     *
     * @param filename - Absolute path of the file to read.
     * @returns A promise that resolves to the raw file content.
     *
     * @throws {FileNotFoundException} If the file does not exist.
     * @throws {PermissionDeniedException} If the file is not readable.
     */
    async readFileAsBuffer(filename: string): Promise<Buffer> {
        try {
            return await fs.readFile(filename);
        } catch (error) {
            return mapError(error, filename, 'file');
        }
    }

    /**
     * Writes content to a file atomically.
     *
     * Accepts `string`, `Buffer`, or a Node.js `Readable` stream.
     * When a `Readable` is passed, it is piped to the target file
     * using Node.js `pipeline` for automatic backpressure handling.
     *
     * For `string`/`Buffer` content, the write is performed by first
     * writing to a hidden temporary file (`.~<uuid>.tmp`) in the same
     * directory, then renaming it to the target path. This reduces the
     * risk of partial writes on crash.
     *
     * Parent directories are created automatically.
     *
     * @param filename - Absolute path of the target file.
     * @param content - The content to write. Can be a `string`, `Buffer`, or `Readable` stream.
     *
     * @throws {PermissionDeniedException} If the target directory or file is not writable.
     * @throws {IOException} If the stream cannot be piped to the file.
     *
     * @sideeffect Creates the target directory tree and writes the file to disk.
     *   A temporary file may briefly exist in the same directory during the operation.
     */
    async dumpFile(filename: string, content: string | Buffer | Readable): Promise<void> {
        // Ensure directory exists
        const dir = path.dirname(filename);
        await fs.mkdir(dir, { recursive: true });

        if (content instanceof Readable) {
            // Use streaming for Readable content
            await pipeToFile(content, filename, 'w');
        } else {
            // Write atomically: write to temp file then rename.
            // Use a hidden prefix with random UUID to reduce predictability and
            // avoid race conditions on shared filesystems.
            const tmpFile = path.join(path.dirname(filename), `.~${crypto.randomUUID()}.tmp`);
            try {
                await fs.writeFile(tmpFile, content);
                await fs.rename(tmpFile, filename);
            } catch (error) {
                try { await fs.unlink(tmpFile); } catch { /* ignore cleanup errors */ }
                mapError(error, filename, 'file');
            }
        }
    }

    /**
     * Appends content to an existing file.
     *
     * Accepts `string`, `Buffer`, or a Node.js `Readable` stream.
     * When a `Readable` is passed, it is piped to the file in append mode.
     * If the file does not exist it is created automatically.
     * Parent directories are created automatically.
     *
     * @param filename - Absolute path of the target file.
     * @param content - The content to append. Can be a `string`, `Buffer`, or `Readable` stream.
     *
     * @throws {PermissionDeniedException} If the file is not writable.
     * @throws {IOException} If the stream cannot be piped to the file.
     *
     * @sideeffect Creates the target directory tree and appends to (or creates) the file.
     */
    async appendToFile(filename: string, content: string | Buffer | Readable): Promise<void> {
        try {
            // Ensure directory exists
            const dir = path.dirname(filename);
            await fs.mkdir(dir, { recursive: true });

            if (content instanceof Readable) {
                // Use streaming for Readable content
                await pipeToFile(content, filename, 'a');
            } else {
                await fs.appendFile(filename, content);
            }
        } catch (error) {
            mapError(error, filename, 'file');
        }
    }

    // --- Permissions ---

    /**
     * Changes the file mode (permissions) of one or more paths.
     *
     * @param paths - A single path or an array of paths.
     * @param mode - The numeric file mode (e.g. `0o755`).
     *
     * @throws {FileNotFoundException} If a path does not exist.
     * @throws {PermissionDeniedException} If the process lacks permission to change mode.
     *
     * @sideeffect Modifies filesystem permissions.
     */
    async chmod(paths: string | string[], mode: number): Promise<void> {
        const normalized = this.normalizePaths(paths);
        for (const filePath of normalized) {
            try {
                await fs.chmod(filePath, mode);
            } catch (error) {
                mapError(error, filePath);
            }
        }
    }

    /**
     * Changes the owner (uid and gid) of one or more paths.
     *
     * On Linux, this requires the process to run as root or to be the
     * current owner of the file.
     *
     * @param paths - A single path or an array of paths.
     * @param uid - The numeric user ID.
     * @param gid - The numeric group ID.
     *
     * @throws {FileNotFoundException} If a path does not exist.
     * @throws {PermissionDeniedException} If the process lacks permission to change ownership.
     *
     * @sideeffect Modifies file ownership on the filesystem.
     *
     * @platform Linux / macOS — has no effect or throws on Windows.
     */
    async chown(paths: string | string[], uid: number, gid: number): Promise<void> {
        const normalized = this.normalizePaths(paths);
        for (const filePath of normalized) {
            try {
                await fs.chown(filePath, uid, gid);
            } catch (error) {
                mapError(error, filePath);
            }
        }
    }

    // --- Symlinks ---

    /**
     * Creates a symbolic link.
     *
     * The parent directory of `target` is created automatically if it
     * does not exist.
     *
     * @param origin - The existing file or directory that the link points to.
     * @param target - The path where the symbolic link will be created.
     *
     * @throws {SymbolicLinkException} If the link cannot be created (e.g. target already exists).
     *
     * @sideeffect Creates a symbolic link on the filesystem and may create parent directories.
     */
    async symlink(origin: string, target: string): Promise<void> {
        try {
            // Ensure target directory exists
            const targetDir = path.dirname(target);
            await fs.mkdir(targetDir, { recursive: true });

            await fs.symlink(origin, target);
        } catch (error) {
            throw new SymbolicLinkException(
                `Failed to create symbolic link from "${origin}" to "${target}": ${error instanceof Error ? error.message : String(error)}`,
                target,
                origin,
                error instanceof Error ? error : undefined,
            );
        }
    }

    /**
     * Reads the target of a symbolic link.
     *
     * @param linkPath - The path of the symbolic link.
     * @param canonicalize - If `true`, resolves the link target to its
     *   full canonical (absolute) path using `fs.realpath`.
     *   Defaults to `false`.
     * @returns A promise that resolves to the link target path.
     *
     * @throws {SymbolicLinkException} If the path is not a symbolic link or cannot be read.
     */
    async readlink(linkPath: string, canonicalize: boolean = false): Promise<string> {
        try {
            let target = await fs.readlink(linkPath);

            if (canonicalize) {
                const linkDir = path.dirname(linkPath);
                target = path.resolve(linkDir, target);
                // Resolve to canonical path
                target = await fs.realpath(target);
            }

            return target;
        } catch (error) {
            throw new SymbolicLinkException(
                `Failed to read symbolic link "${linkPath}": ${error instanceof Error ? error.message : String(error)}`,
                linkPath,
                undefined,
                error instanceof Error ? error : undefined,
            );
        }
    }

    // --- Checks ---

    /**
     * Checks whether a path is readable by the current process.
     *
     * Uses `fs.access` with `R_OK` to verify read access.
     *
     * @param path - The path to check.
     * @returns A promise that resolves to `true` if the path exists and is readable.
     */
    async isReadable(path: string): Promise<boolean> {
        try {
            await fs.access(path, nodeFs.constants.R_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Checks whether a path is writable by the current process.
     *
     * Uses `fs.access` with `W_OK` to verify write access.
     *
     * @param path - The path to check.
     * @returns A promise that resolves to `true` if the path exists and is writable.
     */
    async isWritable(path: string): Promise<boolean> {
        try {
            await fs.access(path, nodeFs.constants.W_OK);
            return true;
        } catch {
            return false;
        }
    }

    // --- Temp ---

    /**
     * Creates a temporary file with a unique name in the specified directory.
     *
     * The file name is composed of the given `prefix` followed by a
     * cryptographically random UUID (via `crypto.randomUUID()`).
     * The directory is created automatically if it does not exist.
     *
     * @param dir - The directory in which to create the temporary file.
     * @param prefix - A prefix for the generated file name (e.g. `'tmp-'`).
     * @returns A promise that resolves to the absolute path of the newly created temporary file.
     *
     * @throws {TempFileCreationException} If the temporary file cannot be created.
     *
     * @sideeffect Creates the directory (if missing) and an empty file on disk.
     */
    async tempnam(dir: string, prefix: string): Promise<string> {
        try {
            // Ensure directory exists
            await fs.mkdir(dir, { recursive: true });
            const tmpFile = path.join(dir, prefix + crypto.randomUUID());
            await fs.writeFile(tmpFile, '');
            return tmpFile;
        } catch (error) {
            throw new TempFileCreationException(
                `Failed to create temporary file in "${dir}"`,
                dir,
                error instanceof Error ? error : undefined,
            );
        }
    }

    // --- Helpers ---

    /**
     * Normalises the `paths` argument into an array of strings.
     *
     * @param paths - A single path string or an array of path strings.
     * @returns An array containing the provided path(s).
     */
    private normalizePaths(paths: string | string[]): string[] {
        if (typeof paths === 'string') {
            return [paths];
        }
        return paths;
    }
}
