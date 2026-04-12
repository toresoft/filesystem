import {IOException} from './IOException.js';

/**
 * Exception thrown when a directory is not found.
 */
export class DirectoryNotFoundException extends IOException {
    constructor(message: string, path?: string, cause?: Error) {
        super(message, path, cause);
        this.name = 'DirectoryNotFoundException';
    }
}
