import {createReadStream, createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import type {Readable, Writable} from 'node:stream';
import {FileNotFoundException, IOException} from '../exceptions';

/**
 * Pipes a Readable stream to a file using Node.js pipeline.
 */
export async function pipeToFile(
    source: Readable,
    targetPath: string,
    flags: string = 'w',
): Promise<void> {
    try {
        const destination = createWriteStream(targetPath, { flags });
        await pipeline(source, destination);
    } catch (error) {
        throw new IOException(
            `Failed to pipe stream to file "${targetPath}": ${error instanceof Error ? error.message : String(error)}`,
            targetPath,
            error instanceof Error ? error : undefined,
        );
    }
}

/**
 * Pipes a file to a Writable stream using Node.js pipeline.
 */
export async function pipeFromFile(
    sourcePath: string,
    destination: Writable,
): Promise<void> {
    try {
        const source = createReadStream(sourcePath);
        await pipeline(source, destination);
    } catch (error) {
        if (error instanceof Error) {
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError.code === 'ENOENT') {
                throw new FileNotFoundException(
                    `File not found: ${sourcePath}`,
                    sourcePath,
                    error,
                );
            }
        }
        throw new IOException(
            `Failed to pipe file "${sourcePath}" to stream: ${error instanceof Error ? error.message : String(error)}`,
            sourcePath,
            error instanceof Error ? error : undefined,
        );
    }
}
