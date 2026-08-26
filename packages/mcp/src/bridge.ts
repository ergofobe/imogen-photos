import { type Credentials, currentAccessToken } from './credentials.ts'

/**
 * A stdio-to-HTTP bridge.
 *
 * Claude.ai and Grok connect to imogen's `/mcp` endpoint directly. A local agent that
 * only speaks stdio cannot, so this process sits between them: it reads newline-delimited
 * JSON-RPC from stdin, forwards each message to the remote endpoint with a bearer token,
 * and writes the reply to stdout. The token is refreshed here rather than in the agent,
 * so a long conversation never fails because an hour elapsed.
 */
export async function runBridge(credentials: Credentials): Promise<void> {
  const endpoint = `${credentials.server}/mcp`

  const send = (message: unknown) => {
    process.stdout.write(`${JSON.stringify(message)}\n`)
  }

  const forward = async (message: { id?: unknown; method?: string }) => {
    try {
      const token = await currentAccessToken(credentials)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(message),
      })

      // A notification gets no reply, and neither does its forwarded form.
      if (response.status === 202 || message.id === undefined || message.id === null) return

      const text = await response.text()
      if (!text) return
      send(JSON.parse(text))
    } catch (error) {
      if (message.id === undefined || message.id === null) return
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32603, message: (error as Error).message },
      })
    }
  }

  const decoder = new TextDecoder()
  let buffer = ''

  const reader = Bun.stdin.stream().getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Messages are newline-delimited; a partial line stays in the buffer until it completes.
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
      if (!line) continue

      let message: { id?: unknown; method?: string }
      try {
        message = JSON.parse(line)
      } catch {
        send({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        })
        continue
      }

      // Deliberately not awaited: a slow tool call must not block the next message.
      void forward(message)
    }
  }
}
