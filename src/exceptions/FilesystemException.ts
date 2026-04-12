/**
 * Base exception for all filesystem errors.
 */
export class FilesystemException extends Error {
    public readonly path?: string;
    public readonly cause?: Error;

    constructor(message: string, path?: string, cause?: Error) {
        super(message);
        this.name = 'FilesystemException';
        this.path = path;
        this.cause = cause;

        // Maintain proper stack trace in V8 environments
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
