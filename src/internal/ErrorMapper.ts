import {
    DirectoryAlreadyExistsException,
    DirectoryNotFoundException,
    FileAlreadyExistsException,
    FileNotFoundException,
    InvalidArgumentException,
    IOException,
    PermissionDeniedException,
} from '../exceptions';

/**
 * Context hints for error mapping to disambiguate between similar error codes.
 */
export type ErrorContext = 'file' | 'directory' | 'symlink' | 'generic';

/**
 * Maps a Node.js filesystem error to the appropriate library exception.
 *
 * Uses the error code (`errno` / `code`) and optional context to determine
 * the most specific exception class to throw.
 */
export function mapError(
    error: unknown,
    path?: string,
    context: ErrorContext = 'generic',
): never {
    if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        const code = nodeError.code;
        const message = nodeError.message || 'Unknown filesystem error';

        switch (code) {
            case 'ENOENT':
                if (context === 'directory') {
                    throw new DirectoryNotFoundException(
                        `Directory not found: ${path ?? message}`,
                        path,
                        error,
                    );
                }
                throw new FileNotFoundException(
                    `File not found: ${path ?? message}`,
                    path,
                    error,
                );

            case 'EEXIST':
                if (context === 'directory') {
                    throw new DirectoryAlreadyExistsException(
                        `Directory already exists: ${path ?? message}`,
                        path,
                        error,
                    );
                }
                throw new FileAlreadyExistsException(
                    `File already exists: ${path ?? message}`,
                    path,
                    error,
                );

            case 'EACCES':
            case 'EPERM':
                throw new PermissionDeniedException(
                    `Permission denied: ${path ?? message}`,
                    path,
                    error,
                );

            case 'EINVAL':
                throw new InvalidArgumentException(
                    `Invalid argument: ${message}`,
                    error,
                );

            case 'EISDIR':
                throw new IOException(
                    `Expected a file but found a directory: ${path ?? message}`,
                    path,
                    error,
                );

            case 'ENOTDIR':
                throw new IOException(
                    `Expected a directory but found a file: ${path ?? message}`,
                    path,
                    error,
                );

            default:
                throw new IOException(
                    `I/O error: ${message}`,
                    path,
                    error,
                );
        }
    }

    // Non-Error thrown — wrap it
    throw new IOException(`Unexpected error: ${String(error)}`, path);
}
