import {FilesystemException} from './FilesystemException.js';

/**
 * Exception thrown when an invalid argument is passed to a method.
 */
export class InvalidArgumentException extends FilesystemException {
    constructor(message: string, cause?: Error) {
        super(message, undefined, cause);
        this.name = 'InvalidArgumentException';
    }
}
