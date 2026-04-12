import {IOException} from './IOException.js';

/**
 * Exception thrown when permission is denied for a filesystem operation.
 */
export class PermissionDeniedException extends IOException {
    constructor(message: string, path?: string, cause?: Error) {
        super(message, path, cause);
        this.name = 'PermissionDeniedException';
    }
}
