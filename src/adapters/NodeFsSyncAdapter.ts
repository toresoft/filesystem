import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {Readable} from 'node:stream';
import type {CopyOptions, SyncFilesystemInterface} from '../interfaces';
import {
    FileAlreadyExistsException,
    FileNotFoundException,
    InvalidArgumentException,
    PermissionDeniedException,
    SymbolicLinkException,
    TempFileCreationException,
} from '../exceptions';
import {mapError} from '../internal';

/**
 * Synchronous filesystem adapter using Node.js `node:fs` module.
 */
export class NodeFsSyncAdapter implements SyncFilesystemInterface {

    // --- Directory operations ---

    mkdir(paths: string | string[], mode: number = 0o777): void {
        const normalized = this.normalizePaths(paths);
        for (const p of normalized) {
            try {
                fs.mkdirSync(p, { recursive: true, mode });
            } catch (error) {
                mapError(error, p, 'directory');
            }
        }
    }

    exists(paths: string | string[]): boolean {
        const normalized = this.normalizePaths(paths);
        return normalized.every((p) => {
            try {
                fs.accessSync(p);
                return true;
            } catch {
                return false;
            }
        });
    }

    isDirectory(path: string): boolean {
        try {
            const stat = fs.statSync(path);
            return stat.isDirectory();
        } catch {
            return false;
        }
    }

    isFile(path: string): boolean {
        try {
            const stat = fs.statSync(path);
            return stat.isFile();
        } catch {
            return false;
        }
    }

    // --- File operations ---

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
                return;
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

    rename(origin: string, target: string, overwrite: boolean = true): void {
        try {
            // Verify the source is readable (mirrors Symfony's is_readable check)
            if (!this.isReadable(origin)) {
                // Distinguish between "not found" and "not readable"
                if (!this.exists(origin)) {
                    throw new FileNotFoundException(
                        `File not found: ${origin}`,
                        origin,
                    );
                }
                throw new PermissionDeniedException(
                    `Source is not readable: ${origin}`,
                    origin,
                );
            }

            if (!overwrite && this.exists(target)) {
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
                error instanceof FileAlreadyExistsException ||
                error instanceof PermissionDeniedException
            ) {
                throw error;
            }
            mapError(error, origin);
        }
    }

    remove(paths: string | string[]): void {
        const normalized = this.normalizePaths(paths);
        const errors: Error[] = [];

        for (const p of normalized) {
            try {
                if (!fs.existsSync(p)) {
                    throw new FileNotFoundException(
                        `Path not found: ${p}`,
                        p,
                    );
                }

                const stat = fs.statSync(p);
                if (stat.isDirectory()) {
                    fs.rmSync(p, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(p);
                }
            } catch (error) {
                if (error instanceof FileNotFoundException) {
                    errors.push(error);
                } else {
                    try {
                        mapError(error, p);
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

    touch(paths: string | string[], time?: Date, atime?: Date): void {
        const normalized = this.normalizePaths(paths);
        const mtime = time ?? new Date();
        const atimeVal = atime ?? mtime;

        for (const p of normalized) {
            try {
                // Ensure directory exists
                const dir = path.dirname(p);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                fs.utimesSync(p, atimeVal, mtime);
            } catch (error) {
                const nodeError = error as NodeJS.ErrnoException;
                if (nodeError.code === 'ENOENT') {
                    // File doesn't exist — create it, then set timestamps
                    try {
                        fs.writeFileSync(p, '');
                        fs.utimesSync(p, atimeVal, mtime);
                    } catch (writeError) {
                        mapError(writeError, p, 'file');
                    }
                } else {
                    mapError(error, p, 'file');
                }
            }
        }
    }

    // --- Read/Write ---

    readFile(filename: string, encoding: BufferEncoding = 'utf8'): string {
        try {
            return fs.readFileSync(filename, encoding);
        } catch (error) {
            return mapError(error, filename, 'file');
        }
    }

    readFileAsBuffer(filename: string): Buffer {
        try {
            return fs.readFileSync(filename);
        } catch (error) {
            return mapError(error, filename, 'file');
        }
    }

    dumpFile(filename: string, content: string | Buffer | Readable): void {
        if (content instanceof Readable) {
            throw new InvalidArgumentException(
                'Readable streams are not supported in synchronous mode. Use the async API instead.',
            );
        }

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

    appendToFile(filename: string, content: string | Buffer | Readable): void {
        if (content instanceof Readable) {
            throw new InvalidArgumentException(
                'Readable streams are not supported in synchronous mode. Use the async API instead.',
            );
        }

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

    chmod(paths: string | string[], mode: number): void {
        const normalized = this.normalizePaths(paths);
        for (const p of normalized) {
            try {
                fs.chmodSync(p, mode);
            } catch (error) {
                mapError(error, p);
            }
        }
    }

    chown(paths: string | string[], uid: number, gid: number): void {
        const normalized = this.normalizePaths(paths);
        for (const p of normalized) {
            try {
                fs.chownSync(p, uid, gid);
            } catch (error) {
                mapError(error, p);
            }
        }
    }

    // --- Symlinks ---

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

    isReadable(path: string): boolean {
        try {
            fs.accessSync(path, fs.constants.R_OK);
            return true;
        } catch {
            return false;
        }
    }

    isWritable(path: string): boolean {
        try {
            fs.accessSync(path, fs.constants.W_OK);
            return true;
        } catch {
            return false;
        }
    }

    // --- Temp ---

    tempnam(dir: string, prefix: string): string {
        try {
            // Ensure directory exists
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const tmpDir = fs.mkdtempSync(path.join(dir, prefix));
            const tmpFile = path.join(tmpDir, prefix + Date.now());
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

    private normalizePaths(paths: string | string[]): string[] {
        if (typeof paths === 'string') {
            return [paths];
        }
        return paths;
    }
}
