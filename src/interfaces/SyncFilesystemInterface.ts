import type {Readable} from 'node:stream';
import type {CopyOptions} from './CopyOptions.js';

/**
 * Synchronous filesystem interface.
 * All methods are blocking and return results directly.
 */
export interface SyncFilesystemInterface {
    // --- Directory operations ---

    /**
     * Creates directories recursively.
     * If the directory already exists, no error is thrown (idempotent).
     * @throws {DirectoryAlreadyExistsException} if a *file* already exists at the path
     * @throws {PermissionDeniedException} if permissions are insufficient
     */
    mkdir(paths: string | string[], mode?: number): void;

    /**
     * Checks if files or directories exist.
     * Returns true if ALL paths exist.
     */
    exists(paths: string | string[]): boolean;

    /**
     * Checks if the given path is a directory.
     */
    isDirectory(path: string): boolean;

    /**
     * Checks if the given path is a file.
     */
    isFile(path: string): boolean;

    // --- File operations ---

    /**
     * Copies a file. Uses streams internally for large files.
     * @throws {FileNotFoundException} if the source file does not exist
     * @throws {FileAlreadyExistsException} if target exists and overwrite is false
     */
    copy(originFile: string, targetFile: string, options?: CopyOptions): void;

    /**
     * Renames or moves a file or directory.
     * @throws {FileNotFoundException} if the source does not exist
     * @throws {FileAlreadyExistsException} if target exists and overwrite is false
     */
    rename(origin: string, target: string, overwrite?: boolean): void;

    /**
     * Removes files or directories recursively.
     * @throws {FileNotFoundException} if the path does not exist
     */
    remove(paths: string | string[]): void;

    /**
     * Sets access and modification times of files.
     * Creates the file if it does not exist.
     */
    touch(paths: string | string[], time?: Date, atime?: Date): void;

    // --- Read/Write ---

    /**
     * Reads a file as a string.
     * @throws {FileNotFoundException} if the file does not exist
     */
    readFile(filename: string, encoding?: BufferEncoding): string;

    /**
     * Reads a file as a Buffer.
     * @throws {FileNotFoundException} if the file does not exist
     */
    readFileAsBuffer(filename: string): Buffer;

    /**
     * Writes content to a file atomically.
     * Accepts string, Buffer, or Readable stream.
     * Note: Readable streams are NOT supported in sync mode and will throw.
     * @throws {InvalidArgumentException} if content is a Readable stream
     */
    dumpFile(filename: string, content: string | Buffer | Readable): void;

    /**
     * Appends content to an existing file.
     * Note: Readable streams are NOT supported in sync mode and will throw.
     * @throws {InvalidArgumentException} if content is a Readable stream
     */
    appendToFile(filename: string, content: string | Buffer | Readable): void;

    // --- Permissions ---

    /**
     * Changes file permissions.
     */
    chmod(paths: string | string[], mode: number): void;

    /**
     * Changes file owner (uid and gid).
     */
    chown(paths: string | string[], uid: number, gid: number): void;

    // --- Symlinks ---

    /**
     * Creates a symbolic link.
     * @throws {SymbolicLinkException} if the link cannot be created
     */
    symlink(origin: string, target: string): void;

    /**
     * Reads a symbolic link target.
     * If canonicalize is true, resolves the full canonical path.
     */
    readlink(path: string, canonicalize?: boolean): string;

    // --- Checks ---

    /**
     * Checks if a path is readable.
     */
    isReadable(path: string): boolean;

    /**
     * Checks if a path is writable.
     */
    isWritable(path: string): boolean;

    // --- Temp ---

    /**
     * Creates a temporary file with a unique name.
     * @throws {TempFileCreationException} if the temp file cannot be created
     */
    tempnam(dir: string, prefix: string): string;
}
