import { createHash } from 'node:crypto';

export function createElementorIdFactory(): (sourcePath: string) => string {
  const usedIds = new Set<string>();

  return (sourcePath: string): string => {
    let salt = 0;
    let id: string;
    do {
      id = createHash('sha256')
        .update(`${sourcePath}:${salt}`)
        .digest('hex')
        .slice(0, 8);
      salt += 1;
    } while (usedIds.has(id));

    usedIds.add(id);
    return id;
  };
}
