// Test helper: writes zip files by hand, including ones no zip tool would make (names with `..`, symlinks leading
// out, sizes that lie), so the extractor's checks can be tried on them.
import { writeFile } from 'node:fs/promises';
import { crc32, deflateRawSync } from 'node:zlib';

export interface ZipItem {
  readonly name: string;
  readonly data?: string | Buffer;
  /** Unix mode with type bits; default a regular file 0644 (a directory when the name ends with `/`). */
  readonly mode?: number;
  readonly deflate?: boolean;
  /** Declared uncompressed size, when it should lie. */
  readonly declaredSize?: number;
}

export function zipBytes(items: readonly ZipItem[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const item of items) {
    const name = Buffer.from(item.name, 'utf8');
    const raw = Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data ?? '', 'utf8');
    const body = item.deflate ? deflateRawSync(raw) : raw;
    const method = item.deflate ? 8 : 0;
    const crc = crc32(raw);
    const size = item.declaredSize ?? raw.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);
    const mode = item.mode ?? (item.name.endsWith('/') ? 0o040755 : 0o100644);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((mode << 16) >>> 0) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(items.length, 8);
  end.writeUInt16LE(items.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

export async function writeZip(file: string, items: readonly ZipItem[]): Promise<string> {
  await writeFile(file, zipBytes(items));
  return file;
}
