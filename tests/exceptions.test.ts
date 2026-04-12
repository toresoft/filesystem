import { describe, it, expect } from 'vitest';
import {
    FilesystemException,
    IOException,
    FileNotFoundException,
    DirectoryNotFoundException,
    FileAlreadyExistsException,
    DirectoryAlreadyExistsException,
    PermissionDeniedException,
    InvalidArgumentException,
    SymbolicLinkException,
    TempFileCreationException,
} from '../src';

describe('Exception Hierarchy', () => {
    it('FilesystemException should be the base for all exceptions', () => {
        const exceptions = [
            new IOException('io error', '/path'),
            new FileNotFoundException('not found', '/file.txt'),
            new DirectoryNotFoundException('dir not found', '/dir'),
            new FileAlreadyExistsException('exists', '/file.txt'),
            new DirectoryAlreadyExistsException('dir exists', '/dir'),
            new PermissionDeniedException('denied', '/file.txt'),
            new InvalidArgumentException('invalid'),
            new SymbolicLinkException('link error', '/link', '/target'),
            new TempFileCreationException('temp error', '/tmp'),
        ];

        for (const ex of exceptions) {
            expect(ex).toBeInstanceOf(FilesystemException);
            expect(ex).toBeInstanceOf(Error);
        }
    });

    it('IOException should be base for I/O-related exceptions', () => {
        const ioExceptions = [
            new FileNotFoundException('not found', '/file.txt'),
            new DirectoryNotFoundException('dir not found', '/dir'),
            new FileAlreadyExistsException('exists', '/file.txt'),
            new DirectoryAlreadyExistsException('dir exists', '/dir'),
            new PermissionDeniedException('denied', '/file.txt'),
            new SymbolicLinkException('link error', '/link', '/target'),
            new TempFileCreationException('temp error', '/tmp'),
        ];

        for (const ex of ioExceptions) {
            expect(ex).toBeInstanceOf(IOException);
        }
    });

    it('InvalidArgumentException should NOT be an IOException', () => {
        const ex = new InvalidArgumentException('invalid');
        expect(ex).toBeInstanceOf(FilesystemException);
        expect(ex).not.toBeInstanceOf(IOException);
    });

    it('should store path property', () => {
        const ex = new FileNotFoundException('not found', '/test/file.txt');
        expect(ex.path).toBe('/test/file.txt');
    });

    it('should store cause property', () => {
        const cause = new Error('original error');
        const ex = new IOException('io error', '/path', cause);
        expect(ex.cause).toBe(cause);
    });

    it('SymbolicLinkException should store target', () => {
        const ex = new SymbolicLinkException('link error', '/link', '/target');
        expect(ex.target).toBe('/target');
    });

    it('TempFileCreationException should store dir', () => {
        const ex = new TempFileCreationException('temp error', '/tmp');
        expect(ex.dir).toBe('/tmp');
    });

    it('should have correct name property', () => {
        expect(new FilesystemException('test').name).toBe('FilesystemException');
        expect(new IOException('test').name).toBe('IOException');
        expect(new FileNotFoundException('test').name).toBe('FileNotFoundException');
        expect(new DirectoryNotFoundException('test').name).toBe('DirectoryNotFoundException');
        expect(new FileAlreadyExistsException('test').name).toBe('FileAlreadyExistsException');
        expect(new DirectoryAlreadyExistsException('test').name).toBe('DirectoryAlreadyExistsException');
        expect(new PermissionDeniedException('test').name).toBe('PermissionDeniedException');
        expect(new InvalidArgumentException('test').name).toBe('InvalidArgumentException');
        expect(new SymbolicLinkException('test').name).toBe('SymbolicLinkException');
        expect(new TempFileCreationException('test').name).toBe('TempFileCreationException');
    });

    it('should have a stack trace', () => {
        const ex = new FileNotFoundException('not found', '/test');
        expect(ex.stack).toBeDefined();
        expect(ex.stack).toContain('FileNotFoundException');
    });
});
