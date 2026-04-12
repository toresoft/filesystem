import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as nodeFs from 'node:fs';
import * as crypto from 'node:crypto';
import {Readable} from 'node:stream';
import type {AsyncFilesystemInterface, CopyOptions} from '../interfaces';
import {
    FileAlreadyExistsException,
    FileNotFoundException,
    SymbolicLinkException,
    TempFileCreationException,
} from '../exceptions';
import {copyWithStreams, DEFAULT_STREAM_THRESHOLD, mapError, pipeToFile} from '../internal';

/**
 * Asynchronous filesystem adapter using Node.js `node:fs/promises` module.
 */
export class NodeFsAsyncAdapter implements AsyncFilesystemInterface {
    private readonly streamThreshold: number;

    constructor(streamThreshold: number = DEFAULT_STREAM_THRESHOLD) {
        this.streamThreshold = streamThreshold;
    }

    // --- Directory operations ---

    async mkdir(paths: string | string[], mode: number = 0o777): Promise<void> {
        const normalized = this.normalizePaths(paths);
        for (const p of normalized) {
            try {
                await fs.mkdir(p, { recursive: true, mode });
            } catch (error) {
                mapError(error, p, 'directory');
            }
        }
    }

    async exists(paths: string | string[]): Promise<boolean> {
        const normalized = this.normalizePaths(paths);
        const results = await Promise.all(
            normalized.map(async (p) => {
                try {
                    await fs.access(p);
                    return true;
                } catch {
                    return false;
                }
            }),
        );
        return results.every(Boolean);
    }

    async isDirectory(path: string): Promise<boolean> {
        try {
            const stat = await fs.stat(path);
            return stat.isDirectory();
        } catch {
            return false;
        }
    }

    async isFile(path: string): Promise<boolean> {
        try {
            const stat = await fs.stat(path);
            return stat.isFile();
        } catch {
            return false;
        }
    }

    // --- File operations ---

    async copy(originFile: string, targetFile: string, options?: CopyOptions): Promise<void> {
        const overwrite = options?.overwrite ?? true;
        const preservePermissions = options?.preservePermissions ?? false;

        try {
            let stat: nodeFs.Stats;
            try {
                stat = await fs.stat(originFile);
            } catch {
                throw new FileNotFoundException(
                    `File not found: ${originFile}`,
                    originFile,
                );
            }

            if (!overwrite) {
                try {
                    await fs.access(targetFile);
                    throw new FileAlreadyExistsException(
                        `File already exists: ${targetFile}`,
                        targetFile,
                    );
                } catch (error) {
                    if (error instanceof FileAlreadyExistsException) {
                        throw error;
                    }
                    // File doesn't exist — proceed
                }
            }

            // Ensure target directory exists
            const targetDir = path.dirname(targetFile);
            await fs.mkdir(targetDir, { recursive: true });

            // Use streams for large files
            if (stat.size >= this.streamThreshold) {
                await copyWithStreams(originFile, targetFile);
            } else {
                await fs.copyFile(originFile, targetFile);
            }

            if (preservePermissions) {
                await fs.chmod(targetFile, stat.mode);
            }
        } catch (error) {
            if (
                error instanceof FileNotFoundException ||
                error instanceof FileAlreadyExistsException
            ) {
                throw error;
            }
            mapError(error, originFile, 'file');
        }
    }

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

    async remove(paths: string | string[]): Promise<void> {
        const normalized = this.normalizePaths(paths);
        const errors: Error[] = [];

        for (const p of normalized) {
            try {
                const stat = await fs.stat(p);
                if (stat.isDirectory()) {
                    await fs.rm(p, { recursive: true, force: true });
                } else {
                    await fs.unlink(p);
                }
            } catch (error) {
                const nodeError = error as NodeJS.ErrnoException;
                if (nodeError.code === 'ENOENT') {
                    errors.push(
                        new FileNotFoundException(
                            `Path not found: ${p}`,
                            p,
                            error instanceof Error ? error : undefined,
                        ),
                    );
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

    async touch(paths: string | string[], time?: Date, atime?: Date): Promise<void> {
        const normalized = this.normalizePaths(paths);
        const mtime = time ?? new Date();
        const atimeVal = atime ?? mtime;

        for (const p of normalized) {
            try {
                // Ensure directory exists
                const dir = path.dirname(p);
                await fs.mkdir(dir, { recursive: true });

                await fs.utimes(p, atimeVal, mtime);
            } catch (error) {
                const nodeError = error as NodeJS.ErrnoException;
                if (nodeError.code === 'ENOENT') {
                    // File doesn't exist — create it, then set timestamps
                    try {
                        await fs.writeFile(p, '');
                        await fs.utimes(p, atimeVal, mtime);
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

    async readFile(filename: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
        try {
            return await fs.readFile(filename, encoding);
        } catch (error) {
            return mapError(error, filename, 'file');
        }
    }

    async readFileAsBuffer(filename: string): Promise<Buffer> {
        try {
            return await fs.readFile(filename);
        } catch (error) {
            return mapError(error, filename, 'file');
        }
    }

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

    async chmod(paths: string | string[], mode: number): Promise<void> {
        const normalized = this.normalizePaths(paths);
        for (const p of normalized) {
            try {
                await fs.chmod(p, mode);
            } catch (error) {
                mapError(error, p);
            }
        }
    }

    async chown(paths: string | string[], uid: number, gid: number): Promise<void> {
        const normalized = this.normalizePaths(paths);
        for (const p of normalized) {
            try {
                await fs.chown(p, uid, gid);
            } catch (error) {
                mapError(error, p);
            }
        }
    }

    // --- Symlinks ---

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

    async isReadable(path: string): Promise<boolean> {
        try {
            await fs.access(path, nodeFs.constants.R_OK);
            return true;
        } catch {
            return false;
        }
    }

    async isWritable(path: string): Promise<boolean> {
        try {
            await fs.access(path, nodeFs.constants.W_OK);
            return true;
        } catch {
            return false;
        }
    }

    // --- Temp ---

    async tempnam(dir: string, prefix: string): Promise<string> {
        try {
            // Ensure directory exists
            await fs.mkdir(dir, { recursive: true });
            const tmpDir = await fs.mkdtemp(path.join(dir, prefix));
            const tmpFile = path.join(tmpDir, prefix + Date.now());
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

    private normalizePaths(paths: string | string[]): string[] {
        if (typeof paths === 'string') {
            return [paths];
        }
        return paths;
    }
}
