import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { Filesystem } from '../src';
import {
    FileNotFoundException,
    FileAlreadyExistsException,
    PermissionDeniedException,
    SymbolicLinkException,
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

        it('should throw PermissionDeniedException when source is not readable', () => {
            const src = path.join(tmpDir, 'secret.txt');
            const dst = path.join(tmpDir, 'dest.txt');
            fs.sync.dumpFile(src, 'secret data');
            fs.sync.chmod(src, 0o000);
            try {
                expect(() => fs.sync.copy(src, dst)).toThrow(PermissionDeniedException);
            } finally {
                // Restore permissions for cleanup
                try { fs.sync.chmod(src, 0o644); } catch { /* ignore */ }
            }
        });

        it('should copy to a nested target directory that does not exist', () => {
            const src = path.join(tmpDir, 'source.txt');
            const dst = path.join(tmpDir, 'nested', 'dir', 'dest.txt');
            fs.sync.dumpFile(src, 'nested copy');
            fs.sync.copy(src, dst);
            expect(fs.sync.readFile(dst)).toBe('nested copy');
        });

        it('should preserve permissions when option is set', () => {
            const src = path.join(tmpDir, 'source.txt');
            const dst = path.join(tmpDir, 'dest.txt');
            fs.sync.dumpFile(src, 'data');
            fs.sync.chmod(src, 0o755);
            fs.sync.copy(src, dst, { preservePermissions: true });
            const stat = require('node:fs').statSync(dst);
            expect(stat.mode & 0o777).toBe(0o755);
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

        it('should throw FileNotFoundException for missing source', () => {
            const newPath = path.join(tmpDir, 'new.txt');
            expect(() => fs.sync.rename(path.join(tmpDir, 'missing.txt'), newPath)).toThrow(FileNotFoundException);
        });

        it('should throw FileAlreadyExistsException when overwrite is false', () => {
            const oldPath = path.join(tmpDir, 'old.txt');
            const newPath = path.join(tmpDir, 'new.txt');
            fs.sync.dumpFile(oldPath, 'old');
            fs.sync.dumpFile(newPath, 'new');
            expect(() => fs.sync.rename(oldPath, newPath, false)).toThrow(FileAlreadyExistsException);
        });

        it('should rename to a nested target directory that does not exist', () => {
            const oldPath = path.join(tmpDir, 'old.txt');
            const newPath = path.join(tmpDir, 'nested', 'dir', 'new.txt');
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

        it('should throw FileNotFoundException for missing path', () => {
            expect(() => fs.sync.remove(path.join(tmpDir, 'missing.txt'))).toThrow(FileNotFoundException);
        });

        it('should remove multiple paths', () => {
            const file1 = path.join(tmpDir, 'a.txt');
            const file2 = path.join(tmpDir, 'b.txt');
            fs.sync.dumpFile(file1, 'a');
            fs.sync.dumpFile(file2, 'b');
            fs.sync.remove([file1, file2]);
            expect(fs.sync.exists(file1)).toBe(false);
            expect(fs.sync.exists(file2)).toBe(false);
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

        it('should return false for non-existing paths', () => {
            expect(fs.sync.isReadable('/nonexistent/path')).toBe(false);
            expect(fs.sync.isWritable('/nonexistent/path')).toBe(false);
        });

        it('should return false for writable when write permission is removed', () => {
            const file = path.join(tmpDir, 'readonly.txt');
            fs.sync.dumpFile(file, 'data');
            fs.sync.chmod(file, 0o444);
            try {
                expect(fs.sync.isReadable(file)).toBe(true);
                expect(fs.sync.isWritable(file)).toBe(false);
            } finally {
                try { fs.sync.chmod(file, 0o644); } catch { /* ignore */ }
            }
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

        it('should canonicalize a symbolic link', () => {
            const target = path.join(tmpDir, 'target.txt');
            const link = path.join(tmpDir, 'link.txt');
            fs.sync.dumpFile(target, 'data');
            fs.sync.symlink(target, link);
            const canonical = fs.sync.readlink(link, true);
            expect(canonical).toBe(target);
        });

        it('should throw SymbolicLinkException when reading non-symlink', () => {
            const file = path.join(tmpDir, 'file.txt');
            fs.sync.dumpFile(file, 'data');
            expect(() => fs.sync.readlink(file)).toThrow(SymbolicLinkException);
        });
    });

    describe('tempnam', () => {
        it('should create a temporary file', () => {
            const tmpFile = fs.sync.tempnam(tmpDir, 'prefix-');
            expect(fs.sync.exists(tmpFile)).toBe(true);
        });
    });
});
