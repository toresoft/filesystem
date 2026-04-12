/**
 * Base exception for all filesystem errors.
 */
export class FilesystemException extends Error {
    public readonly path?: string;

    constructor(message: string, path?: string, cause?: Error) {
        super(message);
        this.name = 'FilesystemException';
        this.path = path;
        this.cause = cause;

        // Maintain proper stack trace in V8 environments
        // @ts-ignore
        if (Error.captureStackTrace) {
            // @ts-ignore
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
