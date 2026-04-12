import {IOException} from './IOException.js';

/**
 * Exception thrown when a file already exists and overwrite is not allowed.
 */
export class FileAlreadyExistsException extends IOException {
    constructor(message: string, path?: string, cause?: Error) {
        super(message, path, cause);
        this.name = 'FileAlreadyExistsException';
    }
}
