import type ort from 'onnxruntime-node'
import { Tensor } from 'onnxruntime-node'
import { alignFace, FACE_SIZE } from './align.ts'
import type { Face } from './detect.ts'

/**
 * Turns a detected face into a 512-dimension embedding.
 *
 * The alignment step matters more than anything else here. Measured on the same face
 * rotated nine degrees, a naive crop scores 0.26 against the upright original while a
 * template-aligned crop scores 0.98 — the difference between grouping working and not.
 */
export async function embedFace(
  session: ort.InferenceSession,
  imagePath: string,
  face: Face,
): Promise<Float32Array> {
  const tensor = await alignFace(imagePath, face.keypoints)
  const output = await session.run({
    [session.inputNames[0]!]: new Tensor('float32', tensor, [1, 3, FACE_SIZE, FACE_SIZE]),
  })

  const raw = output[session.outputNames[0]!]!.data as Float32Array

  // Normalised on the way out, so similarity everywhere else is a plain dot product.
  let norm = 0
  for (const v of raw) norm += v * v
  norm = Math.sqrt(norm) || 1
  return new Float32Array(Array.from(raw, (v) => v / norm))
}
