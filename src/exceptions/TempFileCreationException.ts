import {IOException} from './IOException.js';

/**
 * Exception thrown when a temporary file cannot be created.
 */
export class TempFileCreationException extends IOException {
    public readonly dir: string;

    constructor(message: string, dir: string, cause?: Error) {
        super(message, dir, cause);
        this.name = 'TempFileCreationException';
        this.dir = dir;
    }
}
