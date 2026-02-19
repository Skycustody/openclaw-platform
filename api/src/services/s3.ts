import AWS from 'aws-sdk';

const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const BUCKET_PREFIX = process.env.S3_BUCKET_PREFIX || 'openclaw-users';

export function getBucketName(userId: string): string {
  return `${BUCKET_PREFIX}-${userId.slice(0, 8)}`;
}

export async function createUserBucket(userId: string): Promise<string> {
  const bucket = getBucketName(userId);

  try {
    await s3.createBucket({ Bucket: bucket }).promise();
    await s3.putBucketVersioning({
      Bucket: bucket,
      VersioningConfiguration: { Status: 'Enabled' },
    }).promise();

    // Lifecycle: delete old versions after 30 days
    await s3.putBucketLifecycleConfiguration({
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
    }).promise();

    return bucket;
  } catch (err: any) {
    if (err.code === 'BucketAlreadyOwnedByYou') return bucket;
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

    await s3.upload({
      Bucket: bucket,
      Key: file,
      Body: fs.createReadStream(filePath),
    }).promise();
  }
}

export async function syncFromS3(userId: string, localPath: string): Promise<void> {
  const bucket = getBucketName(userId);
  const fs = await import('fs');
  const path = await import('path');

  const list = await s3.listObjectsV2({ Bucket: bucket }).promise();
  if (!list.Contents) return;

  for (const obj of list.Contents) {
    if (!obj.Key) continue;
    const filePath = path.join(localPath, obj.Key);
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    const data = await s3.getObject({ Bucket: bucket, Key: obj.Key }).promise();
    fs.writeFileSync(filePath, data.Body as Buffer);
  }
}

export async function deleteUserBucket(userId: string): Promise<void> {
  const bucket = getBucketName(userId);
  try {
    // Empty bucket first
    const list = await s3.listObjectsV2({ Bucket: bucket }).promise();
    if (list.Contents?.length) {
      await s3.deleteObjects({
        Bucket: bucket,
        Delete: { Objects: list.Contents.map((o) => ({ Key: o.Key! })) },
      }).promise();
    }
    await s3.deleteBucket({ Bucket: bucket }).promise();
  } catch (err: any) {
    if (err.code === 'NoSuchBucket') return;
    throw err;
  }
}

export async function listUserFiles(userId: string): Promise<Array<{ key: string; size: number; modified: Date }>> {
  const bucket = getBucketName(userId);
  try {
    const list = await s3.listObjectsV2({ Bucket: bucket }).promise();
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
  return s3.getSignedUrlPromise('getObject', {
    Bucket: bucket,
    Key: key,
    Expires: 3600,
  });
}

export async function getUploadUrl(userId: string, key: string, contentType: string): Promise<string> {
  const bucket = getBucketName(userId);
  return s3.getSignedUrlPromise('putObject', {
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    Expires: 3600,
  });
}
