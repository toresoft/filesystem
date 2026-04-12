import {IOException} from './IOException.js';

/**
 * Exception thrown when a symbolic link operation fails.
 */
export class SymbolicLinkException extends IOException {
    public readonly target?: string;

    constructor(message: string, path?: string, target?: string, cause?: Error) {
        super(message, path, cause);
        this.name = 'SymbolicLinkException';
        this.target = target;
    }
}
