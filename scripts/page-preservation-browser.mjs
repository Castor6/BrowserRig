import { chromium } from 'playwright-core'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

// Isolated test browser only: requires a task-owned relay at 21990; never uses the user profile.
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'browserrig-preservation-'))
const repo = fileURLToPath(new URL('../', import.meta.url))
let browser
let inspector
try {
  await fs.cp(path.join(repo, 'extension/dist'), path.join(root, 'extension'), { recursive: true })
  const background = path.join(root, 'extension/background.js')
  const source = await fs.readFile(background, 'utf8')
  assert(source.includes('var relayPort = 19990;'), 'Expected built extension relay port')
  await fs.writeFile(background, source.replace('var relayPort = 19990;', 'var relayPort = 21990;'))
  browser = await chromium.launch({ channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'] })
  const cdp = await browser.newBrowserCDPSession()
  await cdp.send('Target.createTarget', { url: 'about:blank' })
  await cdp.send('Extensions.loadUnpacked', { path: path.join(root, 'extension') })
  await cdp.send('Extensions.loadUnpacked', { path: path.join(repo, 'scripts/fixtures/protected-extension') })
  inspector = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost')
      const all = await cdp.send('Target.getTargets')
      if (url.pathname === '/activate') {
        const target = all.targetInfos.find((target) => target.targetId === url.searchParams.get('id') && target.url.startsWith('http://127.0.0.1:') && target.url.endsWith('/protected'))
        assert(target, 'Only the task protected fixture may be activated')
        await cdp.send('Target.activateTarget', { targetId: target.targetId })
      }
      response.end(JSON.stringify(all))
    } catch (error) { response.writeHead(500); response.end(String(error)) }
  })
  await new Promise((resolve, reject) => { inspector.once('error', reject); inspector.listen(21992, '127.0.0.1', resolve) })
  console.log(`Chrome ${browser.version()}; isolated extension relay 21990; fixture inspector 21992`)
  await new Promise((resolve) => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve) })
} finally {
  if (inspector) await new Promise((resolve) => inspector.close(resolve))
  await browser?.close()
  await fs.rm(root, { recursive: true, force: true })
}
