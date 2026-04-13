import { describe, it, expect, beforeEach } from 'vitest';
import {
    FileNotFoundException,
    FileAlreadyExistsException,
    DirectoryAlreadyExistsException,
    IOException,
    SymbolicLinkException,
    TempFileCreationException,
    PermissionDeniedException,
} from '../src';
import { InMemoryFilesystemAdapter } from '../src/adapters/in-memory';

describe('InMemoryFilesystemAdapter - Sync API', () => {
    let adapter: InMemoryFilesystemAdapter;

    beforeEach(() => {
        adapter = new InMemoryFilesystemAdapter();
    });

    describe('mkdir', () => {
        it('should create a directory', () => {
            adapter.sync.mkdir('/test/dir');
            expect(adapter.has('/test/dir')).toBe(true);
            expect(adapter.sync.isDirectory('/test/dir')).toBe(true);
        });

        it('should create nested directories recursively', () => {
            adapter.sync.mkdir('/a/b/c/d');
            expect(adapter.has('/a')).toBe(true);
            expect(adapter.has('/a/b')).toBe(true);
            expect(adapter.has('/a/b/c')).toBe(true);
            expect(adapter.has('/a/b/c/d')).toBe(true);
        });

        it('should create multiple directories at once', () => {
            adapter.sync.mkdir(['/dir1', '/dir2', '/dir3']);
            expect(adapter.has('/dir1')).toBe(true);
            expect(adapter.has('/dir2')).toBe(true);
            expect(adapter.has('/dir3')).toBe(true);
        });

        it('should throw if a file exists at the path', () => {
            adapter.sync.dumpFile('/test/file.txt', 'content');
            expect(() => adapter.sync.mkdir('/test/file.txt')).toThrow(DirectoryAlreadyExistsException);
        });
    });

    describe('exists', () => {
        it('should return true for existing paths', () => {
            adapter.sync.dumpFile('/test.txt', 'hello');
            expect(adapter.sync.exists('/test.txt')).toBe(true);
        });

        it('should return false for non-existing paths', () => {
            expect(adapter.sync.exists('/nonexistent')).toBe(false);
        });

        it('should return true only if ALL paths exist', () => {
            adapter.sync.dumpFile('/a.txt', 'a');
            adapter.sync.dumpFile('/b.txt', 'b');
            expect(adapter.sync.exists(['/a.txt', '/b.txt'])).toBe(true);
            expect(adapter.sync.exists(['/a.txt', '/c.txt'])).toBe(false);
        });
    });

    describe('dumpFile and readFile', () => {
        it('should write and read a file', () => {
            adapter.sync.dumpFile('/test.txt', 'Hello World');
            expect(adapter.sync.readFile('/test.txt')).toBe('Hello World');
        });

        it('should create parent directories automatically', () => {
            adapter.sync.dumpFile('/a/b/c/file.txt', 'nested');
            expect(adapter.sync.readFile('/a/b/c/file.txt')).toBe('nested');
        });

        it('should overwrite existing files', () => {
            adapter.sync.dumpFile('/test.txt', 'first');
            adapter.sync.dumpFile('/test.txt', 'second');
            expect(adapter.sync.readFile('/test.txt')).toBe('second');
        });

        it('should throw FileNotFoundException for non-existing file', () => {
            expect(() => adapter.sync.readFile('/missing.txt')).toThrow(FileNotFoundException);
        });

        it('should read file with specified encoding', () => {
            adapter.sync.dumpFile('/test.txt', Buffer.from('ciao', 'utf8'));
            expect(adapter.sync.readFile('/test.txt', 'base64')).toBe(Buffer.from('ciao').toString('base64'));
        });

});

    describe('readFileAsBuffer', () => {
        it('should return a Buffer', () => {
            adapter.sync.dumpFile('/test.bin', Buffer.from([1, 2, 3]));
            const buf = adapter.sync.readFileAsBuffer('/test.bin');
            expect(buf).toBeInstanceOf(Buffer);
            expect(buf).toEqual(Buffer.from([1, 2, 3]));
        });

        it('should throw IOException when reading a directory', () => {
            adapter.sync.mkdir('/mydir');
            expect(() => adapter.sync.readFile('/mydir')).toThrow(IOException);
        });

        it('should throw IOException when reading a directory as buffer', () => {
            adapter.sync.mkdir('/mydir');
            expect(() => adapter.sync.readFileAsBuffer('/mydir')).toThrow(IOException);
        });
    });

    describe('appendToFile', () => {
        it('should append content to an existing file', () => {
            adapter.sync.dumpFile('/test.txt', 'Hello');
            adapter.sync.appendToFile('/test.txt', ' World');
            expect(adapter.sync.readFile('/test.txt')).toBe('Hello World');
        });

        it('should create the file if it does not exist', () => {
            adapter.sync.appendToFile('/new.txt', 'content');
            expect(adapter.sync.readFile('/new.txt')).toBe('content');
        });

        it('should throw IOException when appending to a directory', () => {
            adapter.sync.mkdir('/mydir');
            expect(() => adapter.sync.appendToFile('/mydir', 'data')).toThrow(IOException);
        });

});

    describe('copy', () => {
        it('should copy a file', () => {
            adapter.sync.dumpFile('/source.txt', 'copy me');
            adapter.sync.copy('/source.txt', '/dest.txt');
            expect(adapter.sync.readFile('/dest.txt')).toBe('copy me');
        });

        it('should throw FileNotFoundException if source does not exist', () => {
            expect(() => adapter.sync.copy('/missing.txt', '/dest.txt')).toThrow(FileNotFoundException);
        });

        it('should throw FileAlreadyExistsException when overwrite is false', () => {
            adapter.sync.dumpFile('/source.txt', 'src');
            adapter.sync.dumpFile('/dest.txt', 'dst');
            expect(() => adapter.sync.copy('/source.txt', '/dest.txt', { overwrite: false })).toThrow(FileAlreadyExistsException);
        });

        it('should overwrite by default', () => {
            adapter.sync.dumpFile('/source.txt', 'new content');
            adapter.sync.dumpFile('/dest.txt', 'old content');
            adapter.sync.copy('/source.txt', '/dest.txt');
            expect(adapter.sync.readFile('/dest.txt')).toBe('new content');
        });

        it('should preserve permissions when option is set', () => {
            adapter.sync.dumpFile('/source.txt', 'data');
            adapter.sync.chmod('/source.txt', 0o700);
            adapter.sync.copy('/source.txt', '/dest.txt', { preservePermissions: true });
            const store: Map<string, any> = (adapter as any).store;
            expect(store.get('/dest.txt').permissions).toBe(0o700);
        });

        it('should not preserve permissions by default', () => {
            adapter.sync.dumpFile('/source.txt', 'data');
            adapter.sync.chmod('/source.txt', 0o700);
            adapter.sync.copy('/source.txt', '/dest.txt');
            const store: Map<string, any> = (adapter as any).store;
            expect(store.get('/dest.txt').permissions).toBe(0o644);
        });

        it('should throw PermissionDeniedException when source file is not readable', () => {
            adapter.sync.dumpFile('/source.txt', 'data');
            adapter.sync.chmod('/source.txt', 0o000);
            expect(() => adapter.sync.copy('/source.txt', '/dest.txt')).toThrow(PermissionDeniedException);
        });

        it('should throw IOException when source is a directory', () => {
            adapter.sync.mkdir('/srcdir');
            expect(() => adapter.sync.copy('/srcdir', '/dest.txt')).toThrow(IOException);
        });

        it('should create target directory automatically when copying', () => {
            adapter.sync.dumpFile('/source.txt', 'data');
            adapter.sync.copy('/source.txt', '/a/b/c/dest.txt');
            expect(adapter.sync.readFile('/a/b/c/dest.txt')).toBe('data');
        });
    });

    describe('rename', () => {
        it('should rename a file', () => {
            adapter.sync.dumpFile('/old.txt', 'data');
            adapter.sync.rename('/old.txt', '/new.txt');
            expect(adapter.sync.exists('/old.txt')).toBe(false);
            expect(adapter.sync.readFile('/new.txt')).toBe('data');
        });

        it('should throw FileNotFoundException if source does not exist', () => {
            expect(() => adapter.sync.rename('/missing.txt', '/new.txt')).toThrow(FileNotFoundException);
        });

        it('should throw FileAlreadyExistsException when overwrite is false', () => {
            adapter.sync.dumpFile('/old.txt', 'old');
            adapter.sync.dumpFile('/new.txt', 'new');
            expect(() => adapter.sync.rename('/old.txt', '/new.txt', false)).toThrow(FileAlreadyExistsException);
        });

        it('should rename a symlink', () => {
            adapter.sync.dumpFile('/target.txt', 'data');
            adapter.sync.symlink('/target.txt', '/link.txt');
            adapter.sync.rename('/link.txt', '/newlink.txt');
            expect(adapter.sync.exists('/link.txt')).toBe(false);
            expect(adapter.sync.readlink('/newlink.txt')).toBe('/target.txt');
        });

        it('should create target directory automatically when renaming', () => {
            adapter.sync.dumpFile('/old.txt', 'data');
            adapter.sync.rename('/old.txt', '/a/b/c/new.txt');
            expect(adapter.sync.exists('/old.txt')).toBe(false);
            expect(adapter.sync.readFile('/a/b/c/new.txt')).toBe('data');
        });

        it('should rename a directory', () => {
            adapter.sync.mkdir('/olddir');
            adapter.sync.rename('/olddir', '/newdir');
            expect(adapter.sync.exists('/olddir')).toBe(false);
            expect(adapter.sync.exists('/newdir')).toBe(true);
            expect(adapter.sync.isDirectory('/newdir')).toBe(true);
        });
    });

    describe('remove', () => {
        it('should remove a file', () => {
            adapter.sync.dumpFile('/test.txt', 'data');
            adapter.sync.remove('/test.txt');
            expect(adapter.sync.exists('/test.txt')).toBe(false);
        });

        it('should remove a directory recursively', () => {
            adapter.sync.dumpFile('/dir/sub/file.txt', 'data');
            adapter.sync.remove('/dir');
            expect(adapter.sync.exists('/dir')).toBe(false);
            expect(adapter.sync.exists('/dir/sub/file.txt')).toBe(false);
        });

        it('should throw FileNotFoundException if path does not exist', () => {
            expect(() => adapter.sync.remove('/missing')).toThrow(FileNotFoundException);
        });

        it('should remove multiple paths', () => {
            adapter.sync.dumpFile('/a.txt', 'a');
            adapter.sync.dumpFile('/b.txt', 'b');
            adapter.sync.remove(['/a.txt', '/b.txt']);
            expect(adapter.sync.exists('/a.txt')).toBe(false);
            expect(adapter.sync.exists('/b.txt')).toBe(false);
        });

        it('should throw FileNotFoundException for the first missing path in multi-path remove', () => {
            // InMemorySyncAdapter throws immediately on first error (no AggregateError)
            expect(() => adapter.sync.remove(['/missing1.txt', '/missing2.txt'])).toThrow(FileNotFoundException);
        });

        it('should throw single FileNotFoundException when one path fails', () => {
            expect(() => adapter.sync.remove('/missing.txt')).toThrow(FileNotFoundException);
        });

        it('should remove a symlink', () => {
            adapter.sync.dumpFile('/target.txt', 'data');
            adapter.sync.symlink('/target.txt', '/link.txt');
            adapter.sync.remove('/link.txt');
            expect(adapter.sync.exists('/link.txt')).toBe(false);
            expect(adapter.sync.exists('/target.txt')).toBe(true);
        });
    });

    describe('touch', () => {
        it('should create a file if it does not exist', () => {
            adapter.sync.touch('/new.txt');
            expect(adapter.sync.exists('/new.txt')).toBe(true);
        });

        it('should update modification time of existing file', () => {
            adapter.sync.dumpFile('/test.txt', 'data');
            const futureDate = new Date(Date.now() + 10000);
            adapter.sync.touch('/test.txt', futureDate);
            // Access internal store to verify timestamp was set
            const store: Map<string, any> = (adapter as any).store;
            const node = store.get('/test.txt');
            expect(node.modifiedAt.getTime()).toBe(futureDate.getTime());
        });

        it('should set both mtime and atime when provided', () => {
            adapter.sync.dumpFile('/test.txt', 'data');
            const mtime = new Date(Date.now() + 20000);
            const atime = new Date(Date.now() + 30000);
            adapter.sync.touch('/test.txt', mtime, atime);
            const store: Map<string, any> = (adapter as any).store;
            const node = store.get('/test.txt');
            expect(node.modifiedAt.getTime()).toBe(mtime.getTime());
            expect(node.accessedAt.getTime()).toBe(atime.getTime());
        });

        it('should touch multiple files at once', () => {
            adapter.sync.touch(['/a.txt', '/b.txt']);
            expect(adapter.sync.exists('/a.txt')).toBe(true);
            expect(adapter.sync.exists('/b.txt')).toBe(true);
        });
    });

    describe('isDirectory / isFile', () => {
        it('should correctly identify directories and files', () => {
            adapter.sync.mkdir('/mydir');
            adapter.sync.dumpFile('/myfile.txt', 'data');

            expect(adapter.sync.isDirectory('/mydir')).toBe(true);
            expect(adapter.sync.isFile('/mydir')).toBe(false);
            expect(adapter.sync.isFile('/myfile.txt')).toBe(true);
            expect(adapter.sync.isDirectory('/myfile.txt')).toBe(false);
        });

        it('should return false for non-existing paths', () => {
            expect(adapter.sync.isDirectory('/missing')).toBe(false);
            expect(adapter.sync.isFile('/missing')).toBe(false);
        });
    });

    describe('chmod / chown', () => {
        it('should change permissions', () => {
            adapter.sync.dumpFile('/test.txt', 'data');
            adapter.sync.chmod('/test.txt', 0o755);
            const store: Map<string, any> = (adapter as any).store;
            expect(store.get('/test.txt').permissions).toBe(0o755);
        });

        it('should throw FileNotFoundException for non-existing path', () => {
            expect(() => adapter.sync.chmod('/missing', 0o755)).toThrow(FileNotFoundException);
        });

        it('should change owner', () => {
            adapter.sync.dumpFile('/test.txt', 'data');
            adapter.sync.chown('/test.txt', 1000, 1000);
            const store: Map<string, any> = (adapter as any).store;
            const node = store.get('/test.txt');
            expect(node.uid).toBe(1000);
            expect(node.gid).toBe(1000);
        });

        it('chown should throw FileNotFoundException for non-existing path', () => {
            expect(() => adapter.sync.chown('/missing', 1000, 1000)).toThrow(FileNotFoundException);
        });
    });

    describe('symlink / readlink', () => {
        it('should create and read a symbolic link', () => {
            adapter.sync.dumpFile('/target.txt', 'data');
            adapter.sync.symlink('/target.txt', '/link.txt');
            expect(adapter.sync.readlink('/link.txt')).toBe('/target.txt');
        });

        it('should allow dangling symlinks (origin does not exist)', () => {
            adapter.sync.symlink('/missing', '/link');
            expect(adapter.sync.exists('/link')).toBe(true);
            expect(adapter.sync.readlink('/link')).toBe('/missing');
        });

        it('should throw SymbolicLinkException when reading non-symlink', () => {
            adapter.sync.dumpFile('/file.txt', 'data');
            expect(() => adapter.sync.readlink('/file.txt')).toThrow(SymbolicLinkException);
        });

        it('should read file content through a symlink', () => {
            adapter.sync.dumpFile('/target.txt', 'secret');
            adapter.sync.symlink('/target.txt', '/link.txt');
            expect(adapter.sync.readFile('/link.txt')).toBe('secret');
        });

        it('should resolve symlink chain with canonicalize', () => {
            adapter.sync.dumpFile('/real.txt', 'data');
            adapter.sync.symlink('/real.txt', '/link1');
            adapter.sync.symlink('/link1', '/link2');
            expect(adapter.sync.readlink('/link2', true)).toBe('/real.txt');
        });

        it('should detect circular symlinks with canonicalize', () => {
            adapter.sync.dumpFile('/a.txt', 'data');
            adapter.sync.symlink('/b', '/a');
            adapter.sync.symlink('/a', '/b');
            expect(() => adapter.sync.readlink('/a', true)).toThrow(SymbolicLinkException);
        });
    });

    describe('isReadable / isWritable', () => {
        it('should return true for existing paths', () => {
            adapter.sync.dumpFile('/test.txt', 'data');
            expect(adapter.sync.isReadable('/test.txt')).toBe(true);
            expect(adapter.sync.isWritable('/test.txt')).toBe(true);
        });

        it('should return false for non-existing paths', () => {
            expect(adapter.sync.isReadable('/missing')).toBe(false);
            expect(adapter.sync.isWritable('/missing')).toBe(false);
        });

        it('should return false for writable when write permission is removed', () => {
            adapter.sync.dumpFile('/test.txt', 'data');
            adapter.sync.chmod('/test.txt', 0o444); // read-only
            expect(adapter.sync.isReadable('/test.txt')).toBe(true);
            expect(adapter.sync.isWritable('/test.txt')).toBe(false);
        });

        it('should return true for readable/writable directories', () => {
            adapter.sync.mkdir('/mydir');
            expect(adapter.sync.isReadable('/mydir')).toBe(true);
        });
    });

    describe('tempnam', () => {
        it('should create a temporary file', () => {
            adapter.sync.mkdir('/tmp');
            const tmpFile = adapter.sync.tempnam('/tmp', 'prefix-');
            expect(adapter.sync.exists(tmpFile)).toBe(true);
            expect(tmpFile).toContain('prefix-');
        });

        it('should throw TempFileCreationException if directory does not exist', () => {
            expect(() => adapter.sync.tempnam('/missing', 'prefix-')).toThrow(TempFileCreationException);
        });
    });

    describe('snapshot / clear / seed', () => {
        it('should return a snapshot of files', () => {
            adapter.sync.dumpFile('/a.txt', 'aaa');
            adapter.sync.dumpFile('/b.txt', 'bbb');
            adapter.sync.mkdir('/dir');

            const snapshot = adapter.snapshot();
            expect(snapshot['/a.txt']).toBe('aaa');
            expect(snapshot['/b.txt']).toBe('bbb');
            expect(snapshot['/dir']).toBeUndefined(); // directories not in snapshot
        });

        it('should clear the filesystem', () => {
            adapter.sync.dumpFile('/test.txt', 'data');
            adapter.clear();
            expect(adapter.sync.exists('/test.txt')).toBe(false);
        });

        it('should seed the filesystem', () => {
            adapter.seed({
                '/seeded/file1.txt': 'content1',
                '/seeded/file2.txt': 'content2',
            });
            expect(adapter.sync.readFile('/seeded/file1.txt')).toBe('content1');
            expect(adapter.sync.readFile('/seeded/file2.txt')).toBe('content2');
        });

        it('should normalize paths with .. traversal beyond root', () => {
            adapter.seed({ '/foo.txt': 'data' });
            // Path traversal beyond root should resolve to /foo.txt
            expect(adapter.has('/../../foo.txt')).toBe(true);
            expect(adapter.has('/a/../foo.txt')).toBe(true);
            expect(adapter.has('/a/b/../../foo.txt')).toBe(true);
        });

        it('should normalize paths with backslashes and trailing slashes', () => {
            adapter.seed({ '/dir/file.txt': 'data' });
            expect(adapter.has('\\dir\\file.txt')).toBe(true);
            expect(adapter.has('/dir/file.txt/')).toBe(true);
        });

        it('should normalize relative paths in seed', () => {
            adapter.seed({ 'relative.txt': 'data' });
            expect(adapter.has('/relative.txt')).toBe(true);
            expect(adapter.sync.readFile('/relative.txt')).toBe('data');
        });
    });
});

describe('InMemoryFilesystemAdapter - Async API', () => {
    let adapter: InMemoryFilesystemAdapter;

    beforeEach(() => {
        adapter = new InMemoryFilesystemAdapter();
    });

    it('should write and read a file', async () => {
        await adapter.async.dumpFile('/test.txt', 'Hello');
        expect(await adapter.async.readFile('/test.txt')).toBe('Hello');
    });

    it('should handle Readable streams in dumpFile', async () => {
        const { Readable } = await import('node:stream');
        const stream = Readable.from(['Hello', ' ', 'World']);
        await adapter.async.dumpFile('/stream.txt', stream);
        expect(await adapter.async.readFile('/stream.txt')).toBe('Hello World');
    });

    it('should handle Readable streams in appendToFile', async () => {
        const { Readable } = await import('node:stream');
        await adapter.async.dumpFile('/test.txt', 'Start');
        const stream = Readable.from([' End']);
        await adapter.async.appendToFile('/test.txt', stream);
        expect(await adapter.async.readFile('/test.txt')).toBe('Start End');
    });

    it('should create and check directories', async () => {
        await adapter.async.mkdir('/dir');
        expect(await adapter.async.isDirectory('/dir')).toBe(true);
        expect(await adapter.async.isFile('/dir')).toBe(false);
    });

    it('should check existence', async () => {
        expect(await adapter.async.exists('/missing')).toBe(false);
        await adapter.async.dumpFile('/file.txt', 'data');
        expect(await adapter.async.exists('/file.txt')).toBe(true);
    });

    it('should copy a file', async () => {
        await adapter.async.dumpFile('/src.txt', 'copy');
        await adapter.async.copy('/src.txt', '/dst.txt');
        expect(await adapter.async.readFile('/dst.txt')).toBe('copy');
    });

    it('should rename a file', async () => {
        await adapter.async.dumpFile('/old.txt', 'data');
        await adapter.async.rename('/old.txt', '/new.txt');
        expect(await adapter.async.exists('/old.txt')).toBe(false);
        expect(await adapter.async.readFile('/new.txt')).toBe('data');
    });

    it('should remove a file', async () => {
        await adapter.async.dumpFile('/test.txt', 'data');
        await adapter.async.remove('/test.txt');
        expect(await adapter.async.exists('/test.txt')).toBe(false);
    });

    it('should touch a file', async () => {
        await adapter.async.touch('/new.txt');
        expect(await adapter.async.exists('/new.txt')).toBe(true);
    });

    it('should read file as buffer', async () => {
        await adapter.async.dumpFile('/test.bin', Buffer.from([1, 2, 3]));
        const buf = await adapter.async.readFileAsBuffer('/test.bin');
        expect(buf).toEqual(Buffer.from([1, 2, 3]));
    });

    it('should handle chmod and chown', async () => {
        await adapter.async.dumpFile('/test.txt', 'data');
        await adapter.async.chmod('/test.txt', 0o700);
        await adapter.async.chown('/test.txt', 500, 500);
        const store: Map<string, any> = (adapter as any).store;
        const node = store.get('/test.txt');
        expect(node.permissions).toBe(0o700);
        expect(node.uid).toBe(500);
        expect(node.gid).toBe(500);
    });

    it('should handle symlinks', async () => {
        await adapter.async.dumpFile('/target.txt', 'data');
        await adapter.async.symlink('/target.txt', '/link.txt');
        expect(await adapter.async.readlink('/link.txt')).toBe('/target.txt');
    });

    it('should check readable and writable', async () => {
        await adapter.async.dumpFile('/test.txt', 'data');
        expect(await adapter.async.isReadable('/test.txt')).toBe(true);
        expect(await adapter.async.isWritable('/test.txt')).toBe(true);
        expect(await adapter.async.isReadable('/missing')).toBe(false);
    });

    it('should create a temporary file', async () => {
        await adapter.async.mkdir('/tmp');
        const tmpFile = await adapter.async.tempnam('/tmp', 'pfx-');
        expect(await adapter.async.exists(tmpFile)).toBe(true);
    });

    it('should throw PermissionDeniedException when copying unreadable file', async () => {
        await adapter.async.dumpFile('/source.txt', 'data');
        adapter.sync.chmod('/source.txt', 0o000);
        await expect(adapter.async.copy('/source.txt', '/dest.txt')).rejects.toThrow(PermissionDeniedException);
    });

    it('should throw FileNotFoundException when renaming non-existent file', async () => {
        await expect(adapter.async.rename('/missing.txt', '/new.txt')).rejects.toThrow(FileNotFoundException);
    });

    it('should throw FileAlreadyExistsException when renaming with overwrite=false', async () => {
        await adapter.async.dumpFile('/old.txt', 'old');
        await adapter.async.dumpFile('/new.txt', 'new');
        await expect(adapter.async.rename('/old.txt', '/new.txt', false)).rejects.toThrow(FileAlreadyExistsException);
    });

    it('should throw FileNotFoundException when copying non-existent file', async () => {
        await expect(adapter.async.copy('/missing.txt', '/dest.txt')).rejects.toThrow(FileNotFoundException);
    });

    it('should throw FileAlreadyExistsException when copying with overwrite=false', async () => {
        await adapter.async.dumpFile('/src.txt', 'src');
        await adapter.async.dumpFile('/dst.txt', 'dst');
        await expect(adapter.async.copy('/src.txt', '/dst.txt', { overwrite: false })).rejects.toThrow(FileAlreadyExistsException);
    });
});
