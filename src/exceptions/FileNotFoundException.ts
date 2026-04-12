import {IOException} from "./IOException.js";

/**
 * Exception thrown when a file is not found.
 */
export class FileNotFoundException extends IOException {
    constructor(message: string, path?: string, cause?: Error) {
        super(message, path, cause);
        this.name = 'FileNotFoundException';
    }
}