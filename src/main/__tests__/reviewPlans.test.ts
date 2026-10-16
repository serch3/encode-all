import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createReviewPlans } from '../reviewPlans'
import type { BatchReviewEntry, EncodingOptions } from '../../preload/api.types'

test('binds execution to reviewed settings and detects source replacement', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'encode-all-plan-'))
  try {
    const inputPath = join(directory, 'source.mp4')
    await writeFile(inputPath, 'original source')
    const encoding = {
      inputPath,
      outputPath: join(directory, 'out.mp4'),
      videoCodec: 'libx264',
      container: 'mp4',
      crf: 23
    } as EncodingOptions
    const entry: BatchReviewEntry = {
      jobId: 'one',
      name: 'source',
      inputPath,
      outputPath: encoding.outputPath,
      encoding,
      errors: [],
      warnings: []
    }
    const plans = createReviewPlans()
    const [reviewed] = await plans.issue([entry])
    const request = {
      ...encoding,
      reviewToken: reviewed.reviewToken,
      enableLogging: true,
      jobTimestamp: 'now'
    }
    await expect(plans.verify(request)).resolves.toBeUndefined()
    await expect(plans.verify({ ...request, crf: 28 })).rejects.toThrow('not been reviewed')
    await writeFile(inputPath, 'replaced source with different contents')
    await expect(plans.verify(request)).rejects.toThrow('source file changed')
    plans.release(reviewed.reviewToken)
    await expect(plans.verify(request)).rejects.toThrow('not been reviewed')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
