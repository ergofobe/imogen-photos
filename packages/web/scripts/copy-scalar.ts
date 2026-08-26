/**
 * Copies the API reference viewer in beside the app.
 *
 * Scalar's own HTML fetches this from a CDN, which a home server with no route out to
 * the internet cannot reach — and the page it renders without it is blank. Serving it
 * ourselves also keeps `script-src 'self'` intact for everything but the one inline
 * configuration block the viewer needs.
 *
 * Copied at build time from a devDependency rather than depended on at runtime: the
 * package brings several hundred others with it, and the image needs one file.
 *
 * The browser bundle is not named in the package's `exports`, so the entry point is
 * resolved and the package root walked back to from there.
 */
import { access } from 'node:fs/promises'
import { dirname, join } from 'node:path'

async function packageRoot(specifier: string): Promise<string> {
  let dir = dirname(Bun.resolveSync(specifier, import.meta.dir))
  for (let depth = 0; depth < 10; depth++) {
    try {
      await access(join(dir, 'package.json'))
      return dir
    } catch {
      dir = dirname(dir)
    }
  }
  throw new Error(`Could not find the root of ${specifier}`)
}

const root = await packageRoot('@scalar/api-reference')
const source = join(root, 'dist', 'browser', 'standalone.js')
const destination = join(import.meta.dir, '..', 'public', 'scalar.js')

if (!(await Bun.file(source).exists())) {
  throw new Error(`Scalar's browser bundle is not at ${source}`)
}

await Bun.write(destination, Bun.file(source))
const { size } = await Bun.file(destination).stat()
console.log(`scalar.js ${(size / 1024 / 1024).toFixed(1)} MB`)
