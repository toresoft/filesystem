import {createReadStream, createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import type {Readable, Writable} from 'node:stream';
import {FileNotFoundException, IOException} from '../exceptions';

/**
 * Copies a file using Node.js streams for memory efficiency.
 * Used internally when the file size exceeds the configured threshold.
 */
export async function copyWithStreams(
    originFile: string,
    targetFile: string,
): Promise<void> {
    try {
        const source = createReadStream(originFile);
        const destination = createWriteStream(targetFile);
        await pipeline(source, destination);
    } catch (error) {
        if (error instanceof Error) {
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError.code === 'ENOENT') {
                throw new FileNotFoundException(
                    `File not found: ${originFile}`,
                    originFile,
                    error,
                );
            }
            throw new IOException(
                `Failed to copy file from "${originFile}" to "${targetFile}": ${nodeError.message}`,
                originFile,
                error,
            );
        }
        throw new IOException(
            `Failed to copy file from "${originFile}" to "${targetFile}": ${String(error)}`,
            originFile,
        );
    }
}

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
