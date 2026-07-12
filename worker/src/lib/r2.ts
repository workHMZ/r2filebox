export class R2Storage {
  constructor(private bucket: R2Bucket) {}

  /**
   * Upload a file to R2
   */
  async uploadFile(key: string, file: File | Blob, options?: R2PutOptions): Promise<R2Object> {
    return await this.bucket.put(key, file, options)
  }

  /**
   * Get an object from R2
   */
  async getObject(key: string): Promise<R2ObjectBody | null> {
    return await this.bucket.get(key)
  }

  /**
   * Delete an object from R2
   */
  async deleteObject(key: string): Promise<void> {
    await this.bucket.delete(key)
  }

  async createMultipartUpload(key: string, options?: R2MultipartOptions): Promise<R2MultipartUpload> {
    return await this.bucket.createMultipartUpload(key, options)
  }

  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload {
    return this.bucket.resumeMultipartUpload(key, uploadId)
  }
}

export const generateR2Key = (shareId: string): string => {
  const date = new Date()
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  
  const uuid = crypto.randomUUID()
  
  return `objects/${year}/${month}/${day}/${shareId}/${uuid}`
}
