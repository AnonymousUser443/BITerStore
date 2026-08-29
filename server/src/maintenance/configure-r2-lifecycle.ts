import { GetBucketLifecycleConfigurationCommand, PutBucketLifecycleConfigurationCommand, S3Client, type LifecycleRule } from '@aws-sdk/client-s3'

const ruleId = 'biterstore-expire-incomplete-uploads'
const bucket = process.env.R2_BUCKET || ''
const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || ''
  }
})

async function currentRules(): Promise<LifecycleRule[]> {
  try {
    return (await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))).Rules || []
  } catch (cause) {
    const status = (cause as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (status === 404) return []
    throw cause
  }
}

async function main() {
  if (!bucket || !process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID) throw new Error('R2 storage is not configured')
  const rule: LifecycleRule = { ID: ruleId, Status: 'Enabled', Filter: { Prefix: 'pending/' }, Expiration: { Days: 1 } }
  const rules = [...(await currentRules()).filter((item) => item.ID !== ruleId), rule]
  await s3.send(new PutBucketLifecycleConfigurationCommand({ Bucket: bucket, LifecycleConfiguration: { Rules: rules } }))
  const applied = (await currentRules()).find((item) => item.ID === ruleId)
  if (applied?.Status !== 'Enabled' || applied.Filter?.Prefix !== 'pending/' || applied.Expiration?.Days !== 1) throw new Error('R2 lifecycle rule verification failed')
  console.log(JSON.stringify({ lifecycleRule: ruleId, prefix: 'pending/', expirationDays: 1, preservedRules: rules.length - 1 }))
}

main()
