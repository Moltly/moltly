import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const accessKeyId = process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY || "";
const region = process.env.S3_REGION || process.env.AWS_REGION || "us-east-1";
const endpoint = process.env.S3_ENDPOINT || "";
const bucket = process.env.S3_BUCKET || "";
const publicUrl = process.env.S3_PUBLIC_URL || endpoint;
const forcePathStyle = String(process.env.S3_FORCE_PATH_STYLE ?? "true").toLowerCase() !== "false";

export function isS3Configured() {
  return Boolean(bucket && (endpoint || region) && accessKeyId && secretAccessKey);
}

export function getS3Client() {
  if (!isS3Configured()) return null;
  return new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function putObject({ key, body, contentType }: { key: string; body: Buffer | Uint8Array | Blob | string; contentType?: string; }) {
  const client = getS3Client();
  if (!client) throw new Error("S3 not configured");
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  const base = publicUrl || endpoint || "";
  const url = `${base.replace(/\/$/, "")}/${bucket}/${encodeURI(key)}`;
  return { url };
}

export function objectKeyFor(userId: string, filename: string) {
  return `${userId}/${filename}`;
}

export async function deleteObject(key: string) {
  const client = getS3Client();
  if (!client) return;
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export function isS3Url(url: string) {
  if (!bucket) return false;
  try {
    const u = new URL(url, publicUrl || endpoint || "http://local");
    return u.pathname.startsWith(`/${bucket}/`);
  } catch {
    return false;
  }
}

export function keyFromS3Url(url: string) {
  if (!isS3Url(url)) return null;
  const base = publicUrl || endpoint || "";
  try {
    const u = new URL(url, base || "http://local");
    const parts = u.pathname.split(`/`).filter(Boolean);
    if (parts.length < 2) return null;
    return decodeURI(parts.slice(1).join(`/`));
  } catch {
    return null;
  }
}
