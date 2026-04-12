import type {Readable} from 'node:stream';
import type {CopyOptions} from './CopyOptions.js';

/**
 * Asynchronous filesystem interface.
 * All methods return Promises and perform non-blocking I/O.
 */
export interface AsyncFilesystemInterface {
    // --- Directory operations ---

    /**
     * Creates directories recursively.
     * If the directory already exists, no error is thrown (idempotent).
     * @throws {DirectoryAlreadyExistsException} if a *file* already exists at the path
     * @throws {PermissionDeniedException} if permissions are insufficient
     */
    mkdir(paths: string | string[], mode?: number): Promise<void>;

    /**
     * Checks if files or directories exist.
     * Returns true if ALL paths exist.
     */
    exists(paths: string | string[]): Promise<boolean>;

    /**
     * Checks if the given path is a directory.
     */
    isDirectory(path: string): Promise<boolean>;

    /**
     * Checks if the given path is a file.
     */
    isFile(path: string): Promise<boolean>;

    // --- File operations ---

    /**
     * Copies a file. Uses streams internally for large files.
     * @throws {FileNotFoundException} if the source file does not exist
     * @throws {FileAlreadyExistsException} if target exists and overwrite is false
     */
    copy(originFile: string, targetFile: string, options?: CopyOptions): Promise<void>;

    /**
     * Renames or moves a file or directory.
     * @throws {FileNotFoundException} if the source does not exist
     * @throws {FileAlreadyExistsException} if target exists and overwrite is false
     */
    rename(origin: string, target: string, overwrite?: boolean): Promise<void>;

    /**
     * Removes files or directories recursively.
     * @throws {FileNotFoundException} if the path does not exist
     */
    remove(paths: string | string[]): Promise<void>;

    /**
     * Sets access and modification times of files.
     * Creates the file if it does not exist.
     */
    touch(paths: string | string[], time?: Date, atime?: Date): Promise<void>;

    // --- Read/Write ---

    /**
     * Reads a file as a string.
     * @throws {FileNotFoundException} if the file does not exist
     */
    readFile(filename: string, encoding?: BufferEncoding): Promise<string>;

    /**
     * Reads a file as a Buffer.
     * @throws {FileNotFoundException} if the file does not exist
     */
    readFileAsBuffer(filename: string): Promise<Buffer>;

    /**
     * Writes content to a file atomically.
     * Accepts string, Buffer, or Readable stream.
     * When a Readable is passed, it is piped to the file automatically.
     */
    dumpFile(filename: string, content: string | Buffer | Readable): Promise<void>;

    /**
     * Appends content to an existing file.
     * When a Readable is passed, it is piped to the file in append mode.
     */
    appendToFile(filename: string, content: string | Buffer | Readable): Promise<void>;

    // --- Permissions ---

    /**
     * Changes file permissions.
     */
    chmod(paths: string | string[], mode: number): Promise<void>;

    /**
     * Changes file owner (uid and gid).
     */
    chown(paths: string | string[], uid: number, gid: number): Promise<void>;

    // --- Symlinks ---

    /**
     * Creates a symbolic link.
     * @throws {SymbolicLinkException} if the link cannot be created
     */
    symlink(origin: string, target: string): Promise<void>;

    /**
     * Reads a symbolic link target.
     * If canonicalize is true, resolves the full canonical path.
     */
    readlink(path: string, canonicalize?: boolean): Promise<string>;

    // --- Checks ---

    /**
     * Checks if a path is readable.
     */
    isReadable(path: string): Promise<boolean>;

    /**
     * Checks if a path is writable.
     */
    isWritable(path: string): Promise<boolean>;

    // --- Temp ---

    /**
     * Creates a temporary file with a unique name.
     * @throws {TempFileCreationException} if the temp file cannot be created
     */
    tempnam(dir: string, prefix: string): Promise<string>;
}
