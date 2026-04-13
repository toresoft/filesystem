import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type {CopyOptions, SyncFilesystemInterface} from '../interfaces';
import {
    FileAlreadyExistsException,
    FileNotFoundException,
    PermissionDeniedException,
    SymbolicLinkException,
    TempFileCreationException,
} from '../exceptions';
import {mapError} from '../internal';

/**
 * Synchronous filesystem adapter using Node.js `node:fs` module.
 *
 * Provides blocking filesystem operations that mirror the behaviour of
 * Symfony's Filesystem component. Every method maps raw Node.js errors
 * to library-specific exceptions for consistent error handling.
 *
 * @example
 * ```typescript
 * const adapter = new NodeFsSyncAdapter();
 * adapter.mkdir('/tmp/my-project');
 * adapter.dumpFile('/tmp/my-project/hello.txt', 'Hello, world!');
 * console.log(adapter.readFile('/tmp/my-project/hello.txt'));
 * ```
 */
export class NodeFsSyncAdapter implements SyncFilesystemInterface {

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
    mkdir(paths: string | string[], mode: number = 0o777): void {
        const normalized = this.normalizePaths(paths);
        for (const filePath of normalized) {
            try {
                fs.mkdirSync(filePath, { recursive: true, mode });
            } catch (error) {
                mapError(error, filePath, 'directory');
            }
        }
    }

    /**
     * Checks whether all given paths exist on the filesystem.
     *
     * Uses `fs.accessSync` internally, so the check verifies that the
     * current process has at least **read** access to every path.
     *
     * @param paths - A single path or an array of paths to check.
     * @returns `true` if every path exists and is accessible, `false` otherwise.
     */
    exists(paths: string | string[]): boolean {
        const normalized = this.normalizePaths(paths);
        return normalized.every((filePath) => {
            try {
                fs.accessSync(filePath);
                return true;
            } catch {
                return false;
            }
        });
    }

    /**
     * Returns whether the given path points to a directory.
     *
     * Returns `false` (instead of throwing) if the path does not exist
     * or is not accessible.
     *
     * @param path - The path to check.
     * @returns `true` if the path exists and is a directory, `false` otherwise.
     */
    isDirectory(path: string): boolean {
        try {
            const stat = fs.statSync(path);
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
     * @returns `true` if the path exists and is a regular file, `false` otherwise.
     */
    isFile(path: string): boolean {
        try {
            const stat = fs.statSync(path);
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
     * Uses `fs.copyFileSync` internally — no streaming overhead.
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
    copy(originFile: string, targetFile: string, options?: CopyOptions): void {
        const overwrite = options?.overwrite ?? true;
        const preservePermissions = options?.preservePermissions ?? false;

        try {
            // Single statSync() call to verify existence + readability (reduces TOCTOU window)
            let stat: fs.Stats;
            try {
                stat = fs.statSync(originFile);
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

            if (!overwrite && this.exists(targetFile)) {
                throw new FileAlreadyExistsException(
                    `File already exists: ${targetFile}`,
                    targetFile,
                );
            }

            // Ensure target directory exists
            const targetDir = path.dirname(targetFile);
            fs.mkdirSync(targetDir, { recursive: true });

            // copyFileSync is always the most efficient option in sync mode
            // (streaming is async-only)
            fs.copyFileSync(originFile, targetFile);

            if (preservePermissions) {
                fs.chmodSync(targetFile, stat.mode);
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
     * only write permissions on the parent directory. This differs from the
     * previous implementation which also checked source readability.
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
    rename(origin: string, target: string, overwrite: boolean = true): void {
        try {
            if (!fs.existsSync(origin)) {
                throw new FileNotFoundException(
                    `File not found: ${origin}`,
                    origin,
                );
            }

            if (!overwrite && fs.existsSync(target)) {
                throw new FileAlreadyExistsException(
                    `File already exists: ${target}`,
                    target,
                );
            }

            // Ensure target directory exists
            const targetDir = path.dirname(target);
            fs.mkdirSync(targetDir, { recursive: true });

            fs.renameSync(origin, target);
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
    remove(paths: string | string[]): void {
        const normalized = this.normalizePaths(paths);
        const errors: Error[] = [];

        for (const filePath of normalized) {
            try {
                if (!fs.existsSync(filePath)) {
                    throw new FileNotFoundException(
                        `Path not found: ${filePath}`,
                        filePath,
                    );
                }

                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(filePath);
                }
            } catch (error) {
                if (error instanceof FileNotFoundException) {
                    errors.push(error);
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
    touch(paths: string | string[], time?: Date, atime?: Date): void {
        const normalized = this.normalizePaths(paths);
        const mtime = time ?? new Date();
        const atimeVal = atime ?? mtime;

        for (const filePath of normalized) {
            try {
                // Ensure directory exists
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                fs.utimesSync(filePath, atimeVal, mtime);
            } catch (error) {
                const nodeError = error as NodeJS.ErrnoException;
                if (nodeError.code === 'ENOENT') {
                    // File doesn't exist — create it, then set timestamps
                    try {
                        fs.writeFileSync(filePath, '');
                        fs.utimesSync(filePath, atimeVal, mtime);
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
     * @returns The file content decoded with the specified encoding.
     *
     * @throws {FileNotFoundException} If the file does not exist.
     * @throws {PermissionDeniedException} If the file is not readable.
     */
    readFile(filename: string, encoding: BufferEncoding = 'utf8'): string {
        try {
            return fs.readFileSync(filename, encoding);
        } catch (error) {
            return mapError(error, filename, 'file');
        }
    }

    /**
     * Reads a file and returns its raw content as a {@link Buffer}.
     *
     * @param filename - Absolute path of the file to read.
     * @returns The raw file content.
     *
     * @throws {FileNotFoundException} If the file does not exist.
     * @throws {PermissionDeniedException} If the file is not readable.
     */
    readFileAsBuffer(filename: string): Buffer {
        try {
            return fs.readFileSync(filename);
        } catch (error) {
            return mapError(error, filename, 'file');
        }
    }

    /**
     * Writes content to a file atomically.
     *
     * The write is performed by first writing to a hidden temporary file
     * (`.~<uuid>.tmp`) in the same directory, then renaming it to the
     * target path. This reduces the risk of partial writes on crash.
     * Parent directories are created automatically.
     *
     * @param filename - Absolute path of the target file.
     * @param content - The content to write. Must be a `string` or `Buffer`.
     *
     * @throws {PermissionDeniedException} If the target directory or file is not writable.
     *
     * @sideeffect Creates the target directory tree and writes the file to disk.
     *   A temporary file may briefly exist in the same directory during the operation.
     */
    dumpFile(filename: string, content: string | Buffer): void {
        // Ensure directory exists
        const dir = path.dirname(filename);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write atomically: write to temp file then rename.
        // Use a hidden prefix with random UUID to reduce predictability and
        // avoid race conditions on shared filesystems.
        const tmpFile = path.join(dir, `.~${crypto.randomUUID()}.tmp`);
        try {
            fs.writeFileSync(tmpFile, content);
            fs.renameSync(tmpFile, filename);
        } catch (error) {
            try { fs.unlinkSync(tmpFile); } catch { /* ignore cleanup errors */ }
            mapError(error, filename, 'file');
        }
    }

    /**
     * Appends content to an existing file.
     *
     * If the file does not exist it is created automatically.
     * Parent directories are created automatically.
     *
     * @param filename - Absolute path of the target file.
     * @param content - The content to append. Must be a `string` or `Buffer`.
     *
     * @throws {PermissionDeniedException} If the file is not writable.
     *
     * @sideeffect Creates the target directory tree and appends to (or creates) the file.
     */
    appendToFile(filename: string, content: string | Buffer): void {
        try {
            // Ensure directory exists
            const dir = path.dirname(filename);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.appendFileSync(filename, content);
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
    chmod(paths: string | string[], mode: number): void {
        const normalized = this.normalizePaths(paths);
        for (const filePath of normalized) {
            try {
                fs.chmodSync(filePath, mode);
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
    chown(paths: string | string[], uid: number, gid: number): void {
        const normalized = this.normalizePaths(paths);
        for (const filePath of normalized) {
            try {
                fs.chownSync(filePath, uid, gid);
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
    symlink(origin: string, target: string): void {
        try {
            // Ensure target directory exists
            const targetDir = path.dirname(target);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            fs.symlinkSync(origin, target);
        } catch (error) {
            if (error instanceof Error) {
                throw new SymbolicLinkException(
                    `Failed to create symbolic link from "${origin}" to "${target}": ${error.message}`,
                    target,
                    origin,
                    error,
                );
            }
            throw new SymbolicLinkException(
                `Failed to create symbolic link from "${origin}" to "${target}"`,
                target,
                origin,
            );
        }
    }

    /**
     * Reads the target of a symbolic link.
     *
     * @param linkPath - The path of the symbolic link.
     * @param canonicalize - If `true`, resolves the link target to its
     *   full canonical (absolute) path using `fs.realpathSync.native`.
     *   Defaults to `false`.
     * @returns The link target path (relative or canonical depending on `canonicalize`).
     *
     * @throws {SymbolicLinkException} If the path is not a symbolic link or cannot be read.
     */
    readlink(linkPath: string, canonicalize: boolean = false): string {
        try {
            let target = fs.readlinkSync(linkPath);

            if (canonicalize) {
                const linkDir = path.dirname(linkPath);
                target = path.resolve(linkDir, target);
                // Resolve to canonical path
                target = fs.realpathSync.native(target);
            }

            return target;
        } catch (error) {
            if (error instanceof Error) {
                throw new SymbolicLinkException(
                    `Failed to read symbolic link "${linkPath}": ${error.message}`,
                    linkPath,
                    undefined,
                    error,
                );
            }
            throw new SymbolicLinkException(
                `Failed to read symbolic link "${linkPath}"`,
                linkPath,
            );
        }
    }

    // --- Checks ---

    /**
     * Checks whether a path is readable by the current process.
     *
     * Uses `fs.accessSync` with `R_OK` to verify read access.
     *
     * @param path - The path to check.
     * @returns `true` if the path exists and is readable, `false` otherwise.
     */
    isReadable(path: string): boolean {
        try {
            fs.accessSync(path, fs.constants.R_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Checks whether a path is writable by the current process.
     *
     * Uses `fs.accessSync` with `W_OK` to verify write access.
     *
     * @param path - The path to check.
     * @returns `true` if the path exists and is writable, `false` otherwise.
     */
    isWritable(path: string): boolean {
        try {
            fs.accessSync(path, fs.constants.W_OK);
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
     * @returns The absolute path of the newly created temporary file.
     *
     * @throws {TempFileCreationException} If the temporary file cannot be created.
     *
     * @sideeffect Creates the directory (if missing) and an empty file on disk.
     */
    tempnam(dir: string, prefix: string): string {
        try {
            // Ensure directory exists
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const tmpFile = path.join(dir, prefix + crypto.randomUUID());
            fs.writeFileSync(tmpFile, '');
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
