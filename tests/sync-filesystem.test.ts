import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { Filesystem } from '../src';
import {
    FileNotFoundException,
    FileAlreadyExistsException,
    InvalidArgumentException,
} from '../src';

describe('Sync Filesystem API (Node.js fs)', () => {
    const fs = new Filesystem();
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = path.join(os.tmpdir(), `fs-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        fs.sync.mkdir(tmpDir);
    });

    afterEach(() => {
        try {
            fs.sync.remove(tmpDir);
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('mkdir', () => {
        it('should create a directory', () => {
            const dir = path.join(tmpDir, 'test-dir');
            fs.sync.mkdir(dir);
            expect(fs.sync.exists(dir)).toBe(true);
            expect(fs.sync.isDirectory(dir)).toBe(true);
        });

        it('should create nested directories', () => {
            const dir = path.join(tmpDir, 'a', 'b', 'c');
            fs.sync.mkdir(dir);
            expect(fs.sync.exists(dir)).toBe(true);
        });
    });

    describe('dumpFile and readFile', () => {
        it('should write and read a file', () => {
            const file = path.join(tmpDir, 'test.txt');
            fs.sync.dumpFile(file, 'Hello World');
            expect(fs.sync.readFile(file)).toBe('Hello World');
        });

        it('should write and read binary data', () => {
            const file = path.join(tmpDir, 'test.bin');
            const data = Buffer.from([1, 2, 3, 4, 5]);
            fs.sync.dumpFile(file, data);
            expect(fs.sync.readFileAsBuffer(file)).toEqual(data);
        });

        it('should throw InvalidArgumentException for Readable streams', () => {
            const { Readable } = require('node:stream');
            const stream = new Readable({ read() {} });
            const file = path.join(tmpDir, 'test.txt');
            expect(() => fs.sync.dumpFile(file, stream)).toThrow(InvalidArgumentException);
        });
    });

    describe('appendToFile', () => {
        it('should append content to a file', () => {
            const file = path.join(tmpDir, 'test.txt');
            fs.sync.dumpFile(file, 'Hello');
            fs.sync.appendToFile(file, ' World');
            expect(fs.sync.readFile(file)).toBe('Hello World');
        });
    });

    describe('copy', () => {
        it('should copy a file', () => {
            const src = path.join(tmpDir, 'source.txt');
            const dst = path.join(tmpDir, 'dest.txt');
            fs.sync.dumpFile(src, 'copy me');
            fs.sync.copy(src, dst);
            expect(fs.sync.readFile(dst)).toBe('copy me');
        });

        it('should throw FileNotFoundException for missing source', () => {
            const dst = path.join(tmpDir, 'dest.txt');
            expect(() => fs.sync.copy('/nonexistent/file.txt', dst)).toThrow(FileNotFoundException);
        });

        it('should throw FileAlreadyExistsException when overwrite is false', () => {
            const src = path.join(tmpDir, 'source.txt');
            const dst = path.join(tmpDir, 'dest.txt');
            fs.sync.dumpFile(src, 'src');
            fs.sync.dumpFile(dst, 'dst');
            expect(() => fs.sync.copy(src, dst, { overwrite: false })).toThrow(FileAlreadyExistsException);
        });
    });

    describe('rename', () => {
        it('should rename a file', () => {
            const oldPath = path.join(tmpDir, 'old.txt');
            const newPath = path.join(tmpDir, 'new.txt');
            fs.sync.dumpFile(oldPath, 'data');
            fs.sync.rename(oldPath, newPath);
            expect(fs.sync.exists(oldPath)).toBe(false);
            expect(fs.sync.readFile(newPath)).toBe('data');
        });
    });

    describe('remove', () => {
        it('should remove a file', () => {
            const file = path.join(tmpDir, 'test.txt');
            fs.sync.dumpFile(file, 'data');
            fs.sync.remove(file);
            expect(fs.sync.exists(file)).toBe(false);
        });

        it('should remove a directory recursively', () => {
            const dir = path.join(tmpDir, 'subdir');
            const file = path.join(dir, 'file.txt');
            fs.sync.mkdir(dir);
            fs.sync.dumpFile(file, 'data');
            fs.sync.remove(dir);
            expect(fs.sync.exists(dir)).toBe(false);
        });
    });

    describe('touch', () => {
        it('should create a file if it does not exist', () => {
            const file = path.join(tmpDir, 'touched.txt');
            fs.sync.touch(file);
            expect(fs.sync.exists(file)).toBe(true);
        });
    });

    describe('isReadable / isWritable', () => {
        it('should check readability and writability', () => {
            const file = path.join(tmpDir, 'test.txt');
            fs.sync.dumpFile(file, 'data');
            expect(fs.sync.isReadable(file)).toBe(true);
            expect(fs.sync.isWritable(file)).toBe(true);
        });
    });

    describe('symlink / readlink', () => {
        it('should create and read a symbolic link', () => {
            const target = path.join(tmpDir, 'target.txt');
            const link = path.join(tmpDir, 'link.txt');
            fs.sync.dumpFile(target, 'data');
            fs.sync.symlink(target, link);
            const linkTarget = fs.sync.readlink(link);
            expect(linkTarget).toBe(target);
        });
    });

    describe('tempnam', () => {
        it('should create a temporary file', () => {
            const tmpFile = fs.sync.tempnam(tmpDir, 'prefix-');
            expect(fs.sync.exists(tmpFile)).toBe(true);
        });
    });
});
