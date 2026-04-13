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

describe('Async Filesystem API (Node.js fs/promises)', () => {
    const fs = new Filesystem();
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = path.join(os.tmpdir(), `fs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        await fs.async.mkdir(tmpDir);
    });

    afterEach(async () => {
        try {
            await fs.async.remove(tmpDir);
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('mkdir', () => {
        it('should create a directory', async () => {
            const dir = path.join(tmpDir, 'test-dir');
            await fs.async.mkdir(dir);
            expect(await fs.async.exists(dir)).toBe(true);
            expect(await fs.async.isDirectory(dir)).toBe(true);
        });

        it('should create nested directories', async () => {
            const dir = path.join(tmpDir, 'a', 'b', 'c');
            await fs.async.mkdir(dir);
            expect(await fs.async.exists(dir)).toBe(true);
        });
    });

    describe('dumpFile and readFile', () => {
        it('should write and read a file', async () => {
            const file = path.join(tmpDir, 'test.txt');
            await fs.async.dumpFile(file, 'Hello World');
            const content = await fs.async.readFile(file);
            expect(content).toBe('Hello World');
        });

        it('should write and read binary data', async () => {
            const file = path.join(tmpDir, 'test.bin');
            const data = Buffer.from([1, 2, 3, 4, 5]);
            await fs.async.dumpFile(file, data);
            const result = await fs.async.readFileAsBuffer(file);
            expect(result).toEqual(data);
        });

        it('should overwrite existing files', async () => {
            const file = path.join(tmpDir, 'test.txt');
            await fs.async.dumpFile(file, 'first');
            await fs.async.dumpFile(file, 'second');
            expect(await fs.async.readFile(file)).toBe('second');
        });
    });

    describe('appendToFile', () => {
        it('should append content to a file', async () => {
            const file = path.join(tmpDir, 'test.txt');
            await fs.async.dumpFile(file, 'Hello');
            await fs.async.appendToFile(file, ' World');
            expect(await fs.async.readFile(file)).toBe('Hello World');
        });
    });

    describe('copy', () => {
        it('should copy a file', async () => {
            const src = path.join(tmpDir, 'source.txt');
            const dst = path.join(tmpDir, 'dest.txt');
            await fs.async.dumpFile(src, 'copy me');
            await fs.async.copy(src, dst);
            expect(await fs.async.readFile(dst)).toBe('copy me');
        });

        it('should throw FileNotFoundException for missing source', async () => {
            const dst = path.join(tmpDir, 'dest.txt');
            await expect(fs.async.copy('/nonexistent/file.txt', dst)).rejects.toThrow(FileNotFoundException);
        });

        it('should throw FileAlreadyExistsException when overwrite is false', async () => {
            const src = path.join(tmpDir, 'source.txt');
            const dst = path.join(tmpDir, 'dest.txt');
            await fs.async.dumpFile(src, 'src');
            await fs.async.dumpFile(dst, 'dst');
            await expect(fs.async.copy(src, dst, { overwrite: false })).rejects.toThrow(FileAlreadyExistsException);
        });

        it('should throw PermissionDeniedException when source is not readable', async () => {
            const src = path.join(tmpDir, 'secret.txt');
            const dst = path.join(tmpDir, 'dest.txt');
            await fs.async.dumpFile(src, 'secret data');
            await fs.async.chmod(src, 0o000);
            try {
                await expect(fs.async.copy(src, dst)).rejects.toThrow(PermissionDeniedException);
            } finally {
                try { await fs.async.chmod(src, 0o644); } catch { /* ignore */ }
            }
        });

        it('should copy to a nested target directory that does not exist', async () => {
            const src = path.join(tmpDir, 'source.txt');
            const dst = path.join(tmpDir, 'nested', 'dir', 'dest.txt');
            await fs.async.dumpFile(src, 'nested copy');
            await fs.async.copy(src, dst);
            expect(await fs.async.readFile(dst)).toBe('nested copy');
        });

        it('should preserve permissions when option is set', async () => {
            const src = path.join(tmpDir, 'source.txt');
            const dst = path.join(tmpDir, 'dest.txt');
            await fs.async.dumpFile(src, 'data');
            await fs.async.chmod(src, 0o755);
            await fs.async.copy(src, dst, { preservePermissions: true });
            const nodeFs = require('node:fs');
            const stat = nodeFs.statSync(dst);
            expect(stat.mode & 0o777).toBe(0o755);
        });
    });

    describe('rename', () => {
        it('should rename a file', async () => {
            const oldPath = path.join(tmpDir, 'old.txt');
            const newPath = path.join(tmpDir, 'new.txt');
            await fs.async.dumpFile(oldPath, 'data');
            await fs.async.rename(oldPath, newPath);
            expect(await fs.async.exists(oldPath)).toBe(false);
            expect(await fs.async.readFile(newPath)).toBe('data');
        });

        it('should throw FileNotFoundException for missing source', async () => {
            const newPath = path.join(tmpDir, 'new.txt');
            await expect(fs.async.rename(path.join(tmpDir, 'missing.txt'), newPath)).rejects.toThrow(FileNotFoundException);
        });

        it('should throw FileAlreadyExistsException when overwrite is false', async () => {
            const oldPath = path.join(tmpDir, 'old.txt');
            const newPath = path.join(tmpDir, 'new.txt');
            await fs.async.dumpFile(oldPath, 'old');
            await fs.async.dumpFile(newPath, 'new');
            await expect(fs.async.rename(oldPath, newPath, false)).rejects.toThrow(FileAlreadyExistsException);
        });

        it('should rename to a nested target directory that does not exist', async () => {
            const oldPath = path.join(tmpDir, 'old.txt');
            const newPath = path.join(tmpDir, 'nested', 'dir', 'new.txt');
            await fs.async.dumpFile(oldPath, 'data');
            await fs.async.rename(oldPath, newPath);
            expect(await fs.async.exists(oldPath)).toBe(false);
            expect(await fs.async.readFile(newPath)).toBe('data');
        });
    });

    describe('remove', () => {
        it('should remove a file', async () => {
            const file = path.join(tmpDir, 'test.txt');
            await fs.async.dumpFile(file, 'data');
            await fs.async.remove(file);
            expect(await fs.async.exists(file)).toBe(false);
        });

        it('should remove a directory recursively', async () => {
            const dir = path.join(tmpDir, 'subdir');
            const file = path.join(dir, 'file.txt');
            await fs.async.mkdir(dir);
            await fs.async.dumpFile(file, 'data');
            await fs.async.remove(dir);
            expect(await fs.async.exists(dir)).toBe(false);
        });

        it('should throw FileNotFoundException for missing path', async () => {
            await expect(fs.async.remove(path.join(tmpDir, 'missing.txt'))).rejects.toThrow(FileNotFoundException);
        });

        it('should remove multiple paths', async () => {
            const file1 = path.join(tmpDir, 'a.txt');
            const file2 = path.join(tmpDir, 'b.txt');
            await fs.async.dumpFile(file1, 'a');
            await fs.async.dumpFile(file2, 'b');
            await fs.async.remove([file1, file2]);
            expect(await fs.async.exists(file1)).toBe(false);
            expect(await fs.async.exists(file2)).toBe(false);
        });
    });

    describe('touch', () => {
        it('should create a file if it does not exist', async () => {
            const file = path.join(tmpDir, 'touched.txt');
            await fs.async.touch(file);
            expect(await fs.async.exists(file)).toBe(true);
        });
    });

    describe('exists', () => {
        it('should return true for existing paths', async () => {
            const file = path.join(tmpDir, 'test.txt');
            await fs.async.dumpFile(file, 'data');
            expect(await fs.async.exists(file)).toBe(true);
        });

        it('should return false for non-existing paths', async () => {
            expect(await fs.async.exists('/nonexistent')).toBe(false);
        });
    });

    describe('isReadable / isWritable', () => {
        it('should check readability and writability', async () => {
            const file = path.join(tmpDir, 'test.txt');
            await fs.async.dumpFile(file, 'data');
            expect(await fs.async.isReadable(file)).toBe(true);
            expect(await fs.async.isWritable(file)).toBe(true);
        });

        it('should return false for non-existing paths', async () => {
            expect(await fs.async.isReadable('/nonexistent/path')).toBe(false);
            expect(await fs.async.isWritable('/nonexistent/path')).toBe(false);
        });

        it('should return false for writable when write permission is removed', async () => {
            const file = path.join(tmpDir, 'readonly.txt');
            await fs.async.dumpFile(file, 'data');
            await fs.async.chmod(file, 0o444);
            try {
                expect(await fs.async.isReadable(file)).toBe(true);
                expect(await fs.async.isWritable(file)).toBe(false);
            } finally {
                try { await fs.async.chmod(file, 0o644); } catch { /* ignore */ }
            }
        });
    });

    describe('symlink / readlink', () => {
        it('should create and read a symbolic link', async () => {
            const target = path.join(tmpDir, 'target.txt');
            const link = path.join(tmpDir, 'link.txt');
            await fs.async.dumpFile(target, 'data');
            await fs.async.symlink(target, link);
            const linkTarget = await fs.async.readlink(link);
            expect(linkTarget).toBe(target);
        });

        it('should canonicalize a symbolic link', async () => {
            const target = path.join(tmpDir, 'target.txt');
            const link = path.join(tmpDir, 'link.txt');
            await fs.async.dumpFile(target, 'data');
            await fs.async.symlink(target, link);
            const canonical = await fs.async.readlink(link, true);
            expect(canonical).toBe(target);
        });

        it('should throw SymbolicLinkException when reading non-symlink', async () => {
            const file = path.join(tmpDir, 'file.txt');
            await fs.async.dumpFile(file, 'data');
            await expect(fs.async.readlink(file)).rejects.toThrow(SymbolicLinkException);
        });
    });

    describe('tempnam', () => {
        it('should create a temporary file', async () => {
            const tmpFile = await fs.async.tempnam(tmpDir, 'prefix-');
            expect(await fs.async.exists(tmpFile)).toBe(true);
        });
    });
});
