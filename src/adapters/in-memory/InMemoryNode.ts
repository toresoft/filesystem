/**
 * Represents a node in the in-memory filesystem.
 * Can be either a file or a directory.
 */
export type InMemoryNode =
    | {
          type: 'file';
          content: Buffer;
          permissions: number;
          uid: number;
          gid: number;
          modifiedAt: Date;
          accessedAt: Date;
          createdAt: Date;
      }
    | {
          type: 'directory';
          permissions: number;
          uid: number;
          gid: number;
          modifiedAt: Date;
          accessedAt: Date;
          createdAt: Date;
      };

export function createFileNode(content: string | Buffer, permissions: number = 0o644): InMemoryNode {
    const now = new Date();
    return {
        type: 'file',
        content: typeof content === 'string' ? Buffer.from(content, 'utf8') : content,
        permissions,
        uid: 0,
        gid: 0,
        modifiedAt: now,
        accessedAt: now,
        createdAt: now,
    };
}

export function createDirectoryNode(permissions: number = 0o755): InMemoryNode {
    const now = new Date();
    return {
        type: 'directory',
        permissions,
        uid: 0,
        gid: 0,
        modifiedAt: now,
        accessedAt: now,
        createdAt: now,
    };
}
