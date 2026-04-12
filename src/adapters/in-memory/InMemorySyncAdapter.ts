import * as path from 'node:path';
import {Readable} from 'node:stream';
import type {CopyOptions, SyncFilesystemInterface} from '../../interfaces';
import {
    DirectoryAlreadyExistsException,
    FileAlreadyExistsException,
    FileNotFoundException,
    InvalidArgumentException,
    IOException,
    SymbolicLinkException,
    TempFileCreationException,
} from '../../exceptions';
import type {InMemoryNode} from './InMemoryNode.js';
import {createDirectoryNode, createFileNode} from './InMemoryNode.js';

/**
 * Synchronous in-memory filesystem adapter for testing.
 */
export class InMemorySyncAdapter implements SyncFilesystemInterface {
    private readonly store: Map<string, InMemoryNode>;
    private readonly symlinks: Map<string, string>; // target -> origin

    constructor(store: Map<string, InMemoryNode>, symlinks: Map<string, string>) {
        this.store = store;
        this.symlinks = symlinks;
    }

    // --- Directory operations ---

    mkdir(paths: string | string[], mode: number = 0o777): void {
        const normalized = this.normalizePaths(paths);
        for (const p of normalized) {
            const resolved = this.resolve(p);
            const existing = this.store.get(resolved);
            if (existing && existing.type === 'file') {
                throw new DirectoryAlreadyExistsException(
                    `A file already exists at path: ${p}`,
                    p,
                );
            }
            if (!existing) {
                this.ensureParentDirectory(resolved);
                this.store.set(resolved, createDirectoryNode(mode));
            }
        }
    }

    exists(paths: string | string[]): boolean {
        const normalized = this.normalizePaths(paths);
        return normalized.every((p) => {
            const resolved = this.resolve(p);
            return this.store.has(resolved) || this.symlinks.has(resolved);
        });
    }

    isDirectory(path: string): boolean {
        const resolved = this.resolve(path);
        const node = this.getNode(resolved);
        return node?.type === 'directory';
    }

    isFile(path: string): boolean {
        const resolved = this.resolve(path);
        const node = this.getNode(resolved);
        return node?.type === 'file';
    }

    // --- File operations ---

    copy(originFile: string, targetFile: string, options?: CopyOptions): void {
        const overwrite = options?.overwrite ?? true;
        const preservePermissions = options?.preservePermissions ?? false;
        const originResolved = this.resolve(originFile);
        const targetResolved = this.resolve(targetFile);

        const sourceNode = this.getNode(originResolved);
        if (!sourceNode) {
            throw new FileNotFoundException(
                `File not found: ${originFile}`,
                originFile,
            );
        }
        if (sourceNode.type !== 'file') {
            throw new IOException(
                `Source is not a file: ${originFile}`,
                originFile,
            );
        }

        const existingTarget = this.getNode(targetResolved);
        if (!overwrite && existingTarget) {
            throw new FileAlreadyExistsException(
                `File already exists: ${targetFile}`,
                targetFile,
            );
        }

        this.ensureParentDirectory(targetResolved);

        const permissions = preservePermissions ? sourceNode.permissions : 0o644;
        this.store.set(targetResolved, createFileNode(Buffer.from(sourceNode.content), permissions));
    }

    rename(origin: string, target: string, overwrite: boolean = true): void {
        const originResolved = this.resolve(origin);
        const targetResolved = this.resolve(target);

        const node = this.store.get(originResolved);
        const isSymlink = this.symlinks.has(originResolved);
        if (!node && !isSymlink) {
            throw new FileNotFoundException(
                `Path not found: ${origin}`,
                origin,
            );
        }

        if (!overwrite && this.store.has(targetResolved)) {
            throw new FileAlreadyExistsException(
                `File already exists: ${target}`,
                target,
            );
        }

        this.ensureParentDirectory(targetResolved);

        // Move the node
        const existingNode = this.store.get(originResolved);
        if (existingNode) {
            this.store.set(targetResolved, existingNode);
            this.store.delete(originResolved);
        }

        // Move symlink if applicable
        const symlinkTarget = this.symlinks.get(originResolved);
        if (symlinkTarget) {
            this.symlinks.set(targetResolved, symlinkTarget);
            this.symlinks.delete(originResolved);
        }
    }

    remove(paths: string | string[]): void {
        const normalized = this.normalizePaths(paths);
        for (const p of normalized) {
            const resolved = this.resolve(p);
            if (!this.store.has(resolved) && !this.symlinks.has(resolved)) {
                throw new FileNotFoundException(
                    `Path not found: ${p}`,
                    p,
                );
            }

            // Remove the node and all children
            const keysToDelete: string[] = [];
            for (const key of this.store.keys()) {
                if (key === resolved || key.startsWith(resolved + '/')) {
                    keysToDelete.push(key);
                }
            }
            for (const key of keysToDelete) {
                this.store.delete(key);
            }
            this.symlinks.delete(resolved);
        }
    }

    touch(paths: string | string[], time?: Date, atime?: Date): void {
        const normalized = this.normalizePaths(paths);
        const mtime = time ?? new Date();
        const atimeVal = atime ?? mtime;

        for (const p of normalized) {
            const resolved = this.resolve(p);
            const node = this.getNode(resolved);
            if (node) {
                node.modifiedAt = mtime;
                node.accessedAt = atimeVal;
            } else {
                this.ensureParentDirectory(resolved);
                const newNode = createFileNode('');
                newNode.modifiedAt = mtime;
                newNode.accessedAt = atimeVal;
                this.store.set(resolved, newNode);
            }
        }
    }

    // --- Read/Write ---

    readFile(filename: string, encoding: BufferEncoding = 'utf8'): string {
        const resolved = this.resolve(filename);
        const node = this.getFileNode(resolved);
        return node.content.toString(encoding);
    }

    readFileAsBuffer(filename: string): Buffer {
        const resolved = this.resolve(filename);
        const node = this.getFileNode(resolved);
        return Buffer.from(node.content);
    }

    dumpFile(filename: string, content: string | Buffer | Readable): void {
        if (content instanceof Readable) {
            throw new InvalidArgumentException(
                'Readable streams are not supported in synchronous mode. Use the async API instead.',
            );
        }

        const resolved = this.resolve(filename);
        this.ensureParentDirectory(resolved);
        this.store.set(resolved, createFileNode(content));
    }

    appendToFile(filename: string, content: string | Buffer | Readable): void {
        if (content instanceof Readable) {
            throw new InvalidArgumentException(
                'Readable streams are not supported in synchronous mode. Use the async API instead.',
            );
        }

        const resolved = this.resolve(filename);
        const node = this.getNode(resolved);

        if (node && node.type === 'file') {
            const newContent = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
            node.content = Buffer.concat([node.content, newContent]);
            node.modifiedAt = new Date();
        } else if (!node) {
            this.ensureParentDirectory(resolved);
            this.store.set(resolved, createFileNode(content));
        } else {
            throw new IOException(
                `Cannot append to a directory: ${filename}`,
                filename,
            );
        }
    }

    // --- Permissions ---

    chmod(paths: string | string[], mode: number): void {
        const normalized = this.normalizePaths(paths);
        for (const p of normalized) {
            const resolved = this.resolve(p);
            const node = this.getNode(resolved);
            if (!node) {
                throw new FileNotFoundException(`Path not found: ${p}`, p);
            }
            node.permissions = mode;
        }
    }

    chown(paths: string | string[], uid: number, gid: number): void {
        const normalized = this.normalizePaths(paths);
        for (const p of normalized) {
            const resolved = this.resolve(p);
            const node = this.getNode(resolved);
            if (!node) {
                throw new FileNotFoundException(`Path not found: ${p}`, p);
            }
            node.uid = uid;
            node.gid = gid;
        }
    }

    // --- Symlinks ---

    symlink(origin: string, target: string): void {
        const originResolved = this.resolve(origin);
        const targetResolved = this.resolve(target);

        this.ensureParentDirectory(targetResolved);
        this.symlinks.set(targetResolved, originResolved);
    }

    readlink(linkPath: string, canonicalize: boolean = false): string {
        const resolved = this.resolve(linkPath);
        const target = this.symlinks.get(resolved);
        if (!target) {
            throw new SymbolicLinkException(
                `Not a symbolic link: ${linkPath}`,
                linkPath,
            );
        }

        if (canonicalize) {
            // Follow symlink chains to find the final target
            let current = target;
            const seen = new Set<string>([resolved]);
            while (this.symlinks.has(current)) {
                if (seen.has(current)) {
                    throw new SymbolicLinkException(
                        `Circular symbolic link detected: ${linkPath}`,
                        linkPath,
                    );
                }
                seen.add(current);
                current = this.symlinks.get(current)!;
            }
            return current;
        }
        return target;
    }

    // --- Checks ---

    isReadable(path: string): boolean {
        const resolved = this.resolve(path);
        return this.store.has(resolved) || this.symlinks.has(resolved);
    }

    isWritable(path: string): boolean {
        const resolved = this.resolve(path);
        const node = this.getNode(resolved);
        if (!node) return false;
        return (node.permissions & 0o200) !== 0;
    }

    // --- Temp ---

    tempnam(dir: string, prefix: string): string {
        const dirResolved = this.resolve(dir);
        const dirNode = this.getNode(dirResolved);
        if (!dirNode || dirNode.type !== 'directory') {
            throw new TempFileCreationException(
                `Directory does not exist: ${dir}`,
                dir,
            );
        }

        const name = prefix + Date.now() + Math.random().toString(36).slice(2);
        const fullPath = dirResolved + '/' + name;
        this.store.set(fullPath, createFileNode(''));
        return fullPath;
    }

    // --- Internal helpers ---

    private resolve(p: string): string {
        // Normalize path separators and remove trailing slashes
        let resolved = p.replace(/\\/g, '/').replace(/\/+$/, '');
        if (!resolved.startsWith('/')) {
            resolved = '/' + resolved;
        }
        // Resolve . and ..
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

    private getNode(resolvedPath: string): InMemoryNode | undefined {
        // Direct lookup
        const direct = this.store.get(resolvedPath);
        if (direct) return direct;

        // Follow symlink
        const linkTarget = this.symlinks.get(resolvedPath);
        if (linkTarget) {
            return this.store.get(linkTarget);
        }

        return undefined;
    }

    private getFileNode(resolvedPath: string): InMemoryNode & { type: 'file' } {
        const node = this.getNode(resolvedPath);
        if (!node) {
            throw new FileNotFoundException(
                `File not found: ${resolvedPath}`,
                resolvedPath,
            );
        }
        if (node.type !== 'file') {
            throw new IOException(
                `Expected a file but found a directory: ${resolvedPath}`,
                resolvedPath,
            );
        }
        return node;
    }

    private ensureParentDirectory(resolvedPath: string): void {
        const parent = path.dirname(resolvedPath);
        if (parent === '/' || parent === '') return;

        const parts = parent.split('/').filter(Boolean);
        let current = '';
        for (const part of parts) {
            current += '/' + part;
            if (!this.store.has(current)) {
                this.store.set(current, createDirectoryNode());
            }
        }
    }

    private normalizePaths(paths: string | string[]): string[] {
        return typeof paths === 'string' ? [paths] : paths;
    }
}
