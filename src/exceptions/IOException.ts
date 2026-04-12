import {FilesystemException} from './FilesystemException.js';

/**
 * Exception thrown when a generic I/O error occurs.
 */
export class IOException extends FilesystemException {
    constructor(message: string, path?: string, cause?: Error) {
        super(message, path, cause);
        this.name = 'IOException';
    }
}
