import { chromium } from "@playwright/test"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
await page.goto("file:///C:/Users/eobi6/arclens/scripts/promo.html", { waitUntil: "load" })
await page.waitForTimeout(900)
const out = "C:/Users/eobi6/Downloads/arclens-promo.png"
await page.screenshot({ path: out })
await browser.close()
console.log("wrote", out)
