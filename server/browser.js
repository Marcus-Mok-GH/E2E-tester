import { chromium } from 'playwright'

/**
 * Local, keyless browser backend.
 *
 * Exposes a Firecrawl-compatible `scrape()` response shape so the rest of the
 * server can keep its action/observation pipeline unchanged:
 *   { success, html, markdown, screenshot, metadata, actions: { screenshots, javascriptReturns } }
 */

let browserPromise = null

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
        ],
      })
      .catch((err) => {
        browserPromise = null
        throw err
      })
  }
  return browserPromise
}

export async function closeBrowser() {
  if (!browserPromise) return
  const b = await browserPromise.catch(() => null)
  browserPromise = null
  if (b) await b.close().catch(() => {})
}

const DEFAULT_TIMEOUT = 60000

function normalizeKey(key) {
  const k = String(key || 'Enter').trim()
  if (!k) return 'Enter'
  if (k.length === 1) return k
  return k.replace(/^(\w)/, (m) => m.toUpperCase())
}

async function runAction(page, action, screenshots, javascriptReturns) {
  if (!action || typeof action !== 'object') return
  switch (action.type) {
    case 'click': {
      const selector = String(action.selector || '').trim()
      if (!selector) throw new Error('click: selector required')
      await page.locator(selector).first().click({ timeout: 15000 })
      return
    }
    case 'write': {
      const text = String(action.text ?? '')
      await page.keyboard.type(text)
      return
    }
    case 'press': {
      await page.keyboard.press(normalizeKey(action.key))
      return
    }
    case 'scroll': {
      const delta = action.direction === 'up' ? -900 : 900
      if (action.selector) {
        await page.locator(String(action.selector)).first().scrollIntoViewIfNeeded({ timeout: 15000 })
      } else {
        await page.mouse.wheel(0, delta)
      }
      return
    }
    case 'wait': {
      if (action.selector) {
        await page
          .locator(String(action.selector))
          .first()
          .waitFor({ state: 'visible', timeout: Number(action.milliseconds) || 15000 })
      } else {
        await page.waitForTimeout(Math.max(0, Number(action.milliseconds) || 500))
      }
      return
    }
    case 'screenshot': {
      const buf = await page.screenshot({ fullPage: Boolean(action.fullPage), type: 'png' })
      screenshots.push(`data:image/png;base64,${buf.toString('base64')}`)
      return
    }
    case 'executeJavascript': {
      const script = String(action.script || '')
      if (!script.trim()) return
      let value = null
      try {
        value = await page.evaluate(script)
      } catch (err) {
        value = { error: String(err?.message || err) }
      }
      javascriptReturns.push({ return: value })
      return
    }
    case 'scrape':
      return
    default:
      return
  }
}

export async function scrape({
  url,
  formats = [],
  waitFor = 0,
  timeout = DEFAULT_TIMEOUT,
  actions = [],
  onlyMainContent = false,
}) {
  const browser = await getBrowser()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()
  const screenshots = []
  const javascriptReturns = []
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 500))
  })
  page.on('pageerror', (err) => consoleErrors.push(String(err?.message || err).slice(0, 500)))

  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
    if (waitFor) await page.waitForTimeout(Math.min(Number(waitFor) || 0, 10000))
    // Give the page one frame to settle after load.
    await page.waitForTimeout(50)

    for (const action of Array.isArray(actions) ? actions : []) {
      await runAction(page, action, screenshots, javascriptReturns)
    }

    let html = ''
    let text = ''
    let title = ''
    try {
      html = await page.content()
      text = await page.evaluate(() => (document.body ? document.body.innerText : ''))
      title = await page.title()
    } catch {}

    let finalShot = screenshots.length ? screenshots[screenshots.length - 1] : null
    if (formats.includes('screenshot') && !finalShot) {
      const buf = await page.screenshot({ type: 'png' })
      finalShot = `data:image/png;base64,${buf.toString('base64')}`
    }

    return {
      success: true,
      html,
      markdown: onlyMainContent ? text : text,
      rawText: text,
      screenshot: finalShot,
      metadata: {
        sourceURL: page.url(),
        url: page.url(),
        title,
        statusCode: resp ? resp.status() : null,
        consoleErrors,
      },
      actions: { screenshots, javascriptReturns },
    }
  } finally {
    await context.close().catch(() => {})
  }
}
