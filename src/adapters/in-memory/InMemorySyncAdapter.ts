import type {CopyOptions, SyncFilesystemInterface} from '../../interfaces';
import {
    DirectoryAlreadyExistsException,
    FileAlreadyExistsException,
    FileNotFoundException,
    IOException,
    PermissionDeniedException,
    SymbolicLinkException,
    TempFileCreationException,
} from '../../exceptions';
import type {InMemoryNode} from './InMemoryNode.js';
import {createDirectoryNode, createFileNode} from './InMemoryNode.js';

/**
 * Synchronous in-memory filesystem adapter for testing.
 *
 * Operates entirely in memory using a `Map<string, InMemoryNode>` as the
 * backing store. No disk I/O is performed, making it ideal for unit tests.
 *
 * All paths are normalised to absolute POSIX-style paths (forward slashes,
 * no trailing slashes, `..` segments resolved). Relative paths are prefixed
 * with `/` automatically.
 *
 * @example
 * ```typescript
 * const store = new Map<string, InMemoryNode>();
 * const symlinks = new Map<string, string>();
 * const adapter = new InMemorySyncAdapter(store, symlinks);
 * adapter.dumpFile('/test.txt', 'Hello');
 * console.log(adapter.readFile('/test.txt')); // "Hello"
 * ```
 */
export class InMemorySyncAdapter implements SyncFilesystemInterface {
    private readonly store: Map<string, InMemoryNode>;
    private readonly symlinks: Map<string, string>; // target -> origin

    /**
     * @param store - Shared node store (files and directories).
     * @param symlinks - Shared symlink map (link path → target path).
     */
    constructor(store: Map<string, InMemoryNode>, symlinks: Map<string, string>) {
        this.store = store;
        this.symlinks = symlinks;
    }

    // --- Directory operations ---

    /**
     * Creates one or more directories recursively in the virtual filesystem.
     *
     * If a directory already exists the call is silently skipped (idempotent).
     * If a **file** exists at the target path, a {@link DirectoryAlreadyExistsException}
     * is thrown. Parent directories are created automatically.
     *
     * @param paths - A single path or an array of paths to create.
     * @param mode - The file mode (permissions) for created directories. Defaults to `0o777`.
     *
     * @throws {DirectoryAlreadyExistsException} If a file already exists at a target path.
     */
    mkdir(paths: string | string[], mode: number = 0o777): void {
        const normalized = this.normalizePaths(paths);
        for (const filePath of normalized) {
            const resolved = this.resolve(filePath);
            const existing = this.store.get(resolved);
            if (existing && existing.type === 'file') {
                throw new DirectoryAlreadyExistsException(
                    `A file already exists at path: ${filePath}`,
                    filePath,
                );
            }
            if (!existing) {
                this.ensureParentDirectory(resolved);
                this.store.set(resolved, createDirectoryNode(mode));
            }
        }
    }

    /**
     * Checks whether all given paths exist in the virtual filesystem.
     *
     * A path is considered to exist if it is present in the node store
     * **or** in the symlink map.
     *
     * @param paths - A single path or an array of paths to check.
     * @returns `true` if every path exists.
     */
    exists(paths: string | string[]): boolean {
        const normalized = this.normalizePaths(paths);
        return normalized.every((filePath) => {
            const resolved = this.resolve(filePath);
            return this.store.has(resolved) || this.symlinks.has(resolved);
        });
    }

    /**
     * Returns whether the given path points to a directory.
     *
     * @param path - The path to check.
     * @returns `true` if the path exists and is a directory, `false` otherwise.
     */
    isDirectory(path: string): boolean {
        const resolved = this.resolve(path);
        const node = this.getNode(resolved);
        return node?.type === 'directory';
    }

    /**
     * Returns whether the given path points to a regular file.
     *
     * @param path - The path to check.
     * @returns `true` if the path exists and is a file, `false` otherwise.
     */
    isFile(path: string): boolean {
        const resolved = this.resolve(path);
        const node = this.getNode(resolved);
        return node?.type === 'file';
    }

    // --- File operations ---

    /**
     * Copies a single file from `originFile` to `targetFile`.
     *
     * The target directory is created automatically if it does not exist.
     * By default the copy overwrites an existing target.
     * The source file's read permission bit (`0o400`) is checked before
     * copying, mirroring the behaviour of the real filesystem adapter.
     *
     * @param originFile - Path of the source file.
     * @param targetFile - Path of the destination file.
     * @param options - Optional copy behaviour:
     *   - `overwrite` — Whether to overwrite an existing target. Defaults to `true`.
     *   - `preservePermissions` — Whether to copy the source file's permissions. Defaults to `false`.
     *
     * @throws {FileNotFoundException} If the source file does not exist.
     * @throws {IOException} If the source is not a file (e.g. a directory).
     * @throws {PermissionDeniedException} If the source file is not readable (permissions `0o400` absent).
     * @throws {FileAlreadyExistsException} If the target exists and `overwrite` is `false`.
     */
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

        // Verify the source file is readable (mirrors Symfony's is_readable check)
        if ((sourceNode.permissions & 0o400) === 0) {
            throw new PermissionDeniedException(
                `Source file is not readable: ${originFile}`,
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

    /**
     * Renames or moves a file, directory, or symbolic link.
     *
     * The target directory is created automatically if it does not exist.
     * Symbolic links at the origin path are moved together with their target.
     *
     * @param origin - Path of the source entry.
     * @param target - Path of the destination.
     * @param overwrite - Whether to overwrite an existing target. Defaults to `true`.
     *
     * @throws {FileNotFoundException} If the source does not exist.
     * @throws {FileAlreadyExistsException} If the target exists and `overwrite` is `false`.
     */
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

    /**
     * Removes one or more files, directories, or symbolic links.
     *
     * Directories are removed recursively. Symbolic links **within** the
     * removed path and links that **point to** the removed path are also
     * cleaned up.
     *
     * Unlike the real-filesystem adapter, this method throws immediately
     * on the first missing path (no {@link AggregateError}).
     *
     * @param paths - A single path or an array of paths to remove.
     *
     * @throws {FileNotFoundException} If a path does not exist.
     */
    remove(paths: string | string[]): void {
        const normalized = this.normalizePaths(paths);
        for (const filePath of normalized) {
            const resolved = this.resolve(filePath);
            if (!this.store.has(resolved) && !this.symlinks.has(resolved)) {
                throw new FileNotFoundException(
                    `Path not found: ${filePath}`,
                    filePath,
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

            // Remove symlinks at and within the removed path,
            // and symlinks pointing to removed paths
            const symlinksToDelete: string[] = [];
            for (const [linkPath, linkTarget] of this.symlinks.entries()) {
                if (
                    linkPath === resolved || linkPath.startsWith(resolved + '/') ||
                    linkTarget === resolved || linkTarget.startsWith(resolved + '/')
                ) {
                    symlinksToDelete.push(linkPath);
                }
            }
            for (const key of symlinksToDelete) {
                this.symlinks.delete(key);
            }
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
     */
    touch(paths: string | string[], time?: Date, atime?: Date): void {
        const normalized = this.normalizePaths(paths);
        const mtime = time ?? new Date();
        const atimeVal = atime ?? mtime;

        for (const filePath of normalized) {
            const resolved = this.resolve(filePath);
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

    /**
     * Reads a file and returns its content as a string.
     *
     * @param filename - Path of the file to read.
     * @param encoding - The text encoding to use. Defaults to `'utf8'`.
     * @returns The file content decoded with the specified encoding.
     *
     * @throws {FileNotFoundException} If the file does not exist.
     * @throws {IOException} If the path points to a directory.
     */
    readFile(filename: string, encoding: BufferEncoding = 'utf8'): string {
        const resolved = this.resolve(filename);
        const node = this.getNode(resolved);
        if (!node) {
            throw new FileNotFoundException(`File not found: ${filename}`, filename);
        }
        if (node.type !== 'file') {
            throw new IOException(`Path is a directory: ${filename}`, filename);
        }
        return node.content.toString(encoding);
    }

    /**
     * Reads a file and returns its raw content as a {@link Buffer}.
     *
     * @param filename - Path of the file to read.
     * @returns A copy of the raw file content as a `Buffer`.
     *
     * @throws {FileNotFoundException} If the file does not exist.
     * @throws {IOException} If the path points to a directory.
     */
    readFileAsBuffer(filename: string): Buffer {
        const resolved = this.resolve(filename);
        const node = this.getNode(resolved);
        if (!node) {
            throw new FileNotFoundException(`File not found: ${filename}`, filename);
        }
        if (node.type !== 'file') {
            throw new IOException(`Path is a directory: ${filename}`, filename);
        }
        return Buffer.from(node.content);
    }

    /**
     * Writes content to a file, replacing any existing content.
     *
     * Parent directories are created automatically.
     *
     * @param filename - Path of the target file.
     * @param content - The content to write. Must be a `string` or `Buffer`.
     */
    dumpFile(filename: string, content: string | Buffer): void {
        const resolved = this.resolve(filename);
        this.ensureParentDirectory(resolved);
        this.store.set(resolved, createFileNode(content));
    }

    /**
     * Appends content to an existing file.
     *
     * If the file does not exist it is created automatically.
     * Parent directories are created automatically.
     *
     * @param filename - Path of the target file.
     * @param content - The content to append. Must be a `string` or `Buffer`.
     *
     * @throws {IOException} If the path points to a directory.
     */
    appendToFile(filename: string, content: string | Buffer): void {
        const resolved = this.resolve(filename);
        const node = this.getNode(resolved);

        if (node && node.type === 'directory') {
            throw new IOException(`Cannot append to a directory: ${filename}`, filename);
        }

        if (node && node.type === 'file') {
            const existing = Buffer.isBuffer(node.content) ? node.content : Buffer.from(node.content);
            const toAppend = Buffer.isBuffer(content) ? content : Buffer.from(content);
            node.content = Buffer.concat([existing, toAppend]);
        } else {
            this.ensureParentDirectory(resolved);
            this.store.set(resolved, createFileNode(content));
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
     */
    chmod(paths: string | string[], mode: number): void {
        const normalized = this.normalizePaths(paths);
        for (const filePath of normalized) {
            const resolved = this.resolve(filePath);
            const node = this.getNode(resolved);
            if (!node) {
                throw new FileNotFoundException(`Path not found: ${filePath}`, filePath);
            }
            node.permissions = mode;
        }
    }

    /**
     * Changes the owner (uid and gid) of one or more paths.
     *
     * In the in-memory filesystem this simply stores the uid/gid values
     * on the node. No real permission checks are performed.
     *
     * @param paths - A single path or an array of paths.
     * @param uid - The numeric user ID.
     * @param gid - The numeric group ID.
     *
     * @throws {FileNotFoundException} If a path does not exist.
     */
    chown(paths: string | string[], uid: number, gid: number): void {
        const normalized = this.normalizePaths(paths);
        for (const filePath of normalized) {
            const resolved = this.resolve(filePath);
            const node = this.getNode(resolved);
            if (!node) {
                throw new FileNotFoundException(`Path not found: ${filePath}`, filePath);
            }
            node.uid = uid;
            node.gid = gid;
        }
    }

    // --- Symlinks ---

    /**
     * Creates a symbolic link in the virtual filesystem.
     *
     * @param origin - The target that the link points to.
     * @param target - The path where the symbolic link will be created.
     *
     * @throws {SymbolicLinkException} If a circular link is detected.
     */
    symlink(origin: string, target: string): void {
        const originResolved = this.resolve(origin);
        const targetResolved = this.resolve(target);

        // Detect circular symlinks
        if (originResolved === targetResolved) {
            throw new SymbolicLinkException(
                `Circular symbolic link detected: ${origin} -> ${target}`,
                target,
                origin,
            );
        }

        this.symlinks.set(targetResolved, originResolved);
    }

    /**
     * Reads the target of a symbolic link.
     *
     * @param linkPath - The path of the symbolic link.
     * @param canonicalize - If `true`, resolves the link target to its
     *   full canonical path. Defaults to `false`.
     * @returns The link target path.
     *
     * @throws {SymbolicLinkException} If the path is not a symbolic link or a circular link is detected.
     */
    readlink(linkPath: string, canonicalize: boolean = false): string {
        const resolved = this.resolve(linkPath);
        if (!this.symlinks.has(resolved)) {
            throw new SymbolicLinkException(
                `Not a symbolic link: ${linkPath}`,
                linkPath,
            );
        }

        let target = this.symlinks.get(resolved)!;

        if (canonicalize) {
            // Follow the chain of symlinks
            const seen = new Set<string>();
            let current = target;
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

    /**
     * Checks whether a path is readable based on its permission bits.
     *
     * Returns `false` if the path does not exist or if the read permission
     * bit (`0o400`) is not set.
     *
     * @param path - The path to check.
     * @returns `true` if the path exists and has the read bit set.
     */
    isReadable(path: string): boolean {
        const resolved = this.resolve(path);
        const node = this.getNode(resolved);
        if (!node) return false;
        return (node.permissions & 0o400) !== 0;
    }

    /**
     * Checks whether a path is writable based on its permission bits.
     *
     * Returns `false` if the path does not exist or if the write permission
     * bit (`0o200`) is not set.
     *
     * @param path - The path to check.
     * @returns `true` if the path exists and has the write bit set.
     */
    isWritable(path: string): boolean {
        const resolved = this.resolve(path);
        const node = this.getNode(resolved);
        if (!node) return false;
        return (node.permissions & 0o200) !== 0;
    }

    // --- Temp ---

    /**
     * Creates a temporary file with a unique name in the specified directory.
     *
     * The file name is composed of the given `prefix` followed by a
     * cryptographically random UUID (via `crypto.randomUUID()`).
     *
     * @param dir - The parent directory. Must exist and be a directory.
     * @param prefix - A prefix for the generated file name (e.g. `'tmp-'`).
     * @returns The path of the newly created temporary file.
     *
     * @throws {TempFileCreationException} If the directory does not exist or is not a directory.
     */
    tempnam(dir: string, prefix: string): string {
        const dirResolved = this.resolve(dir);
        const dirNode = this.getNode(dirResolved);
        if (!dirNode || dirNode.type !== 'directory') {
            throw new TempFileCreationException(
                `Directory does not exist: ${dir}`,
                dir,
            );
        }

        const tmpFileName = `${dirResolved}/${prefix}${crypto.randomUUID()}`;
        this.store.set(tmpFileName, createFileNode(''));
        return tmpFileName;
    }

    // --- Helpers ---

    /**
     * Retrieves a node from the store, following one level of symlink
     * resolution if the path is a symbolic link.
     *
     * @param resolved - The normalised absolute path.
     * @returns The node at the given path, or `undefined` if not found.
     */
    private getNode(resolved: string): InMemoryNode | undefined {
        if (this.store.has(resolved)) {
            return this.store.get(resolved);
        }
        // Follow symlink
        const linkTarget = this.symlinks.get(resolved);
        if (linkTarget) {
            return this.store.get(linkTarget);
        }
        return undefined;
    }

    /**
     * Ensures that all parent directories exist for the given path,
     * creating them with default permissions if necessary.
     *
     * @param resolved - The normalised absolute path.
     */
    private ensureParentDirectory(resolved: string): void {
        const parts = resolved.split('/').filter(Boolean);
        let current = '';
        for (let i = 0; i < parts.length - 1; i++) {
            current += '/' + parts[i];
            if (!this.store.has(current)) {
                this.store.set(current, createDirectoryNode());
            }
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
