# @toresoft/filesystem

A TypeScript filesystem library inspired by the [Symfony Filesystem component](https://symfony.com/doc/current/components/filesystem.html), featuring:

- **Synchronous API** — blocking methods that return results directly
- **Asynchronous API** — non-blocking methods returning `Promise<T>`
- **Transparent streaming** — automatic use of Node.js streams for large file operations
- **Specific exception hierarchy** — each error type has its own exception class
- **In-memory adapter** — for fast, deterministic unit testing

## Installation

```bash
npm install @toresoft/filesystem
```

## Quick Start

```typescript
import { Filesystem } from '@toresoft/filesystem';

const fs = new Filesystem();

// Synchronous API
fs.sync.mkdir('/tmp/my-project/src');
fs.sync.dumpFile('/tmp/my-project/src/index.ts', 'export {}');
const content = fs.sync.readFile('/tmp/my-project/src/index.ts');
fs.sync.remove('/tmp/my-project');

// Asynchronous API
await fs.async.mkdir('/tmp/my-project/src');
await fs.async.dumpFile('/tmp/my-project/src/index.ts', 'export {}');
const asyncContent = await fs.async.readFile('/tmp/my-project/src/index.ts');
await fs.async.remove('/tmp/my-project');
```

## API Reference

### Synchronous Methods (`fs.sync`)

| Method | Description |
|--------|-------------|
| `mkdir(paths, mode?)` | Create directories recursively |
| `exists(paths)` | Check if files/directories exist (returns true if ALL exist) |
| `isDirectory(path)` | Check if path is a directory |
| `isFile(path)` | Check if path is a file |
| `copy(origin, target, options?)` | Copy a file (uses streams for large files) |
| `rename(origin, target, overwrite?)` | Rename or move a file/directory |
| `remove(paths)` | Remove files or directories recursively |
| `touch(paths, time?, atime?)` | Update timestamps or create empty files |
| `readFile(filename, encoding?)` | Read file as string |
| `readFileAsBuffer(filename)` | Read file as Buffer |
| `dumpFile(filename, content)` | Write content to file atomically |
| `appendToFile(filename, content)` | Append content to file |
| `chmod(paths, mode)` | Change file permissions |
| `chown(paths, uid, gid)` | Change file owner |
| `symlink(origin, target)` | Create a symbolic link |
| `readlink(path, canonicalize?)` | Read a symbolic link target |
| `isReadable(path)` | Check if path is readable |
| `isWritable(path)` | Check if path is writable |
| `tempnam(dir, prefix)` | Create a temporary file |

### Asynchronous Methods (`fs.async`)

Same methods as synchronous, but all return `Promise<T>`.

Additionally, `dumpFile` and `appendToFile` accept `Readable` streams as content:

```typescript
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';

const gzip = createGzip();
gzip.write(JSON.stringify(largeObject));
gzip.end();

// Pipe stream to file automatically
await fs.async.dumpFile('/backup/data.json.gz', gzip);
```

## Exception Handling

```typescript
import {
    FileNotFoundException,
    DirectoryNotFoundException,
    FileAlreadyExistsException,
    PermissionDeniedException,
    IOException,
    FilesystemException,
} from '@toresoft/filesystem';

try {
    const content = fs.sync.readFile('/path/to/file.txt');
} catch (error) {
    if (error instanceof FileNotFoundException) {
        console.error(`File not found: ${error.path}`);
    } else if (error instanceof PermissionDeniedException) {
        console.error(`Permission denied: ${error.path}`);
    } else if (error instanceof IOException) {
        console.error(`I/O error: ${error.message}`);
    }
}
```

### Exception Hierarchy

```
FilesystemException
├── IOException
│   ├── FileNotFoundException
│   ├── DirectoryNotFoundException
│   ├── FileAlreadyExistsException
│   ├── DirectoryAlreadyExistsException
│   ├── PermissionDeniedException
│   ├── SymbolicLinkException
│   └── TempFileCreationException
└── InvalidArgumentException
```

## In-Memory Adapter (Testing)

The library ships a dedicated sub-path export for the in-memory adapter:

```typescript
// Import from the dedicated sub-path
import { InMemoryFilesystemAdapter } from '@toresoft/filesystem/in-memory';
```

### Quick Start

```typescript
import { Filesystem } from '@toresoft/filesystem';

// Create an in-memory filesystem via the static factory
const fs = Filesystem.createInMemory();

// Use the same API — no disk I/O!
fs.sync.dumpFile('/test/file.txt', 'Hello World');
expect(fs.sync.readFile('/test/file.txt')).toBe('Hello World');

// Inspect state for assertions
const snapshot = fs.adapter.snapshot();
// snapshot = { '/test/file.txt': 'Hello World' }

// Reset between tests
fs.adapter.clear();

// Seed with initial data
fs.adapter.seed({
    '/config/app.json': '{"debug": true}',
    '/data/users.csv': 'id,name\n1,Alice',
});
```

## Configuration

```typescript
const fs = new Filesystem({
    streamThreshold: 32 * 1024 * 1024, // 32 MB — use streams for files larger than this
});
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0 (for type support)

## License

MIT
