import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { getPool } from '../../db/pool';

export interface StoredUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface DocumentRow {
  id: string;
  name: string;
  mime_type: string | null;
  storage_key: string;
}

@Injectable()
export class DocumentsService {
  private readonly root = path.resolve(process.env.DOCUMENT_STORAGE_DIR || path.join(process.cwd(), 'storage', 'documents'));

  private get supabaseConfigured(): boolean {
    return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_STORAGE_BUCKET);
  }

  private get supabaseBase(): string {
    return `${String(process.env.SUPABASE_URL).replace(/\/$/, '')}/storage/v1/object`;
  }

  private get supabaseHeaders(): Record<string, string> {
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY);
    return { Authorization: `Bearer ${key}`, apikey: key };
  }

  async upload(organizationId: string, userId: string, file: StoredUpload, entityType: string) {
    const id = randomUUID();
    const extension = path.extname(file.originalname).toLowerCase();
    const safeName = `${id}${extension}`;
    const storageKey = `${organizationId}/${safeName}`;

    if (this.supabaseConfigured) {
      const response = await fetch(`${this.supabaseBase}/${encodeURIComponent(String(process.env.SUPABASE_STORAGE_BUCKET))}/${storageKey.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: { ...this.supabaseHeaders, 'Content-Type': file.mimetype, 'x-upsert': 'false' },
        body: file.buffer,
      });
      if (!response.ok) throw new Error(`Document storage upload failed (${response.status})`);
    } else {
      const directory = path.join(this.root, organizationId);
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, safeName), file.buffer, { flag: 'wx' });
    }

    try {
      const result = await getPool().query(
        `INSERT INTO files_documents
         (id, organization_id, name, mime_type, storage_key, size_bytes, entity_type, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         RETURNING id, name, mime_type, size_bytes, entity_type, created_at`,
        [id, organizationId, file.originalname, file.mimetype, storageKey, file.size, entityType || 'DOCUMENT', JSON.stringify({ originalName: file.originalname, uploadedBy: userId })],
      );
      return result.rows[0];
    } catch (error) {
      await this.deleteStorage(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async list(organizationId: string) {
    const result = await getPool().query(
      `SELECT id, name, mime_type, size_bytes, entity_type, created_at
       FROM files_documents WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [organizationId],
    );
    return result.rows;
  }

  async getDownload(organizationId: string, id: string): Promise<DocumentRow & { fileBuffer?: Buffer; filePath?: string }> {
    const result = await getPool().query(
      `SELECT id, name, mime_type, storage_key FROM files_documents WHERE id = $1 AND organization_id = $2`,
      [id, organizationId],
    );
    if (result.rows.length === 0) throw new NotFoundException('Document not found');
    const row = result.rows[0] as DocumentRow;

    if (this.supabaseConfigured) {
      const response = await fetch(`${this.supabaseBase}/sign/${encodeURIComponent(String(process.env.SUPABASE_STORAGE_BUCKET))}/${row.storage_key.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST', headers: { ...this.supabaseHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 120 }),
      });
      if (!response.ok) throw new NotFoundException('Document storage file not found');
      const payload = await response.json() as { signedURL?: string };
      if (!payload.signedURL) throw new NotFoundException('Document storage file not found');
      const signed = await fetch(payload.signedURL.startsWith('http') ? payload.signedURL : `${String(process.env.SUPABASE_URL).replace(/\/$/, '')}${payload.signedURL}`);
      if (!signed.ok) throw new NotFoundException('Document storage file not found');
      return { ...row, fileBuffer: Buffer.from(await signed.arrayBuffer()) };
    }

    const filePath = path.resolve(this.root, row.storage_key);
    if (!filePath.startsWith(`${this.root}${path.sep}`)) throw new NotFoundException('Document not found');
    return { ...row, filePath };
  }

  async readDownload(organizationId: string, id: string) {
    const document = await this.getDownload(organizationId, id);
    if (document.fileBuffer) return document;
    return { ...document, fileBuffer: await fs.readFile(document.filePath as string) };
  }

  async remove(organizationId: string, id: string) {
    const document = await this.getDownload(organizationId, id);
    await this.deleteStorage(document.storage_key);
    await getPool().query(`DELETE FROM files_documents WHERE id = $1 AND organization_id = $2`, [id, organizationId]);
    return { id, deleted: true };
  }

  private async deleteStorage(storageKey: string): Promise<void> {
    if (this.supabaseConfigured) {
      await fetch(`${this.supabaseBase}/${encodeURIComponent(String(process.env.SUPABASE_STORAGE_BUCKET))}/${storageKey.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'DELETE', headers: this.supabaseHeaders,
      });
      return;
    }
    await fs.rm(path.resolve(this.root, storageKey), { force: true });
  }
}
