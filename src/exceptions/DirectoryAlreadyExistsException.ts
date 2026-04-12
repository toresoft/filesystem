import {IOException} from './IOException.js';

/**
 * Exception thrown when a directory already exists and overwrite is not allowed.
 */
export class DirectoryAlreadyExistsException extends IOException {
    constructor(message: string, path?: string, cause?: Error) {
        super(message, path, cause);
        this.name = 'DirectoryAlreadyExistsException';
    }
}
