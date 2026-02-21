import {
  S3Client,
  CreateBucketCommand,
  PutBucketVersioningCommand,
  PutBucketLifecycleConfigurationCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectsCommand,
  DeleteBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  } : undefined,
});

const BUCKET_PREFIX = process.env.S3_BUCKET_PREFIX || 'openclaw-users';

export function getBucketName(userId: string): string {
  return `${BUCKET_PREFIX}-${userId.slice(0, 8)}`;
}

export async function createUserBucket(userId: string): Promise<string> {
  const bucket = getBucketName(userId);

  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    await s3.send(new PutBucketVersioningCommand({
      Bucket: bucket,
      VersioningConfiguration: { Status: 'Enabled' },
    }));

    await s3.send(new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: 'cleanup-old-versions',
            Status: 'Enabled',
            NoncurrentVersionExpiration: { NoncurrentDays: 30 },
            Filter: { Prefix: '' },
          },
        ],
      },
    }));

    return bucket;
  } catch (err: any) {
    if (err.name === 'BucketAlreadyOwnedByYou') return bucket;
    throw err;
  }
}

export async function syncToS3(userId: string, localPath: string): Promise<void> {
  const bucket = getBucketName(userId);
  const fs = await import('fs');
  const path = await import('path');

  const files = fs.readdirSync(localPath, { recursive: true }) as string[];
  for (const file of files) {
    const filePath = path.join(localPath, file);
    if (!fs.statSync(filePath).isFile()) continue;

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: file,
      Body: fs.readFileSync(filePath),
    }));
  }
}

export async function syncFromS3(userId: string, localPath: string): Promise<void> {
  const bucket = getBucketName(userId);
  const fs = await import('fs');
  const path = await import('path');

  const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
  if (!list.Contents) return;

  for (const obj of list.Contents) {
    if (!obj.Key) continue;
    const filePath = path.join(localPath, obj.Key);
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    const data = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }));
    const body = await data.Body?.transformToByteArray();
    if (body) fs.writeFileSync(filePath, Buffer.from(body));
  }
}

export async function deleteUserBucket(userId: string): Promise<void> {
  const bucket = getBucketName(userId);
  try {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    if (list.Contents?.length) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: list.Contents.map((o) => ({ Key: o.Key! })) },
      }));
    }
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
  } catch (err: any) {
    if (err.name === 'NoSuchBucket') return;
    throw err;
  }
}

export async function listUserFiles(userId: string): Promise<Array<{ key: string; size: number; modified: Date }>> {
  const bucket = getBucketName(userId);
  try {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    return (list.Contents || []).map((o) => ({
      key: o.Key!,
      size: o.Size || 0,
      modified: o.LastModified || new Date(),
    }));
  } catch {
    return [];
  }
}

export async function getPresignedUrl(userId: string, key: string): Promise<string> {
  const bucket = getBucketName(userId);
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  }), { expiresIn: 3600 });
}

export async function getUploadUrl(userId: string, key: string, contentType: string): Promise<string> {
  const bucket = getBucketName(userId);
  return getSignedUrl(s3, new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  }), { expiresIn: 3600 });
}
