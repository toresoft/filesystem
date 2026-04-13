// Facade
export { Filesystem } from './Filesystem.js';

// Interfaces
export type { SyncFilesystemInterface } from './interfaces/SyncFilesystemInterface.js';
export type { AsyncFilesystemInterface } from './interfaces/AsyncFilesystemInterface.js';
export type { CopyOptions } from './interfaces/CopyOptions.js';
export type { FilesystemAdapterInterface } from './interfaces/AdapterInterface.js';

// Exceptions
export { FilesystemException } from './exceptions/FilesystemException.js';
export { IOException } from './exceptions/IOException.js';
export { FileNotFoundException } from './exceptions/FileNotFoundException.js';
export { DirectoryNotFoundException } from './exceptions/DirectoryNotFoundException.js';
export { FileAlreadyExistsException } from './exceptions/FileAlreadyExistsException.js';
export { DirectoryAlreadyExistsException } from './exceptions/DirectoryAlreadyExistsException.js';
export { PermissionDeniedException } from './exceptions/PermissionDeniedException.js';
export { InvalidArgumentException } from './exceptions/InvalidArgumentException.js';
export { SymbolicLinkException } from './exceptions/SymbolicLinkException.js';
export { TempFileCreationException } from './exceptions/TempFileCreationException.js';

// Adapters
export { NodeFsSyncAdapter } from './adapters/NodeFsSyncAdapter.js';
export { NodeFsAsyncAdapter } from './adapters/NodeFsAsyncAdapter.js';
