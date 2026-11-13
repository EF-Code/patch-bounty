import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const response = await fetch("http://127.0.0.1:3000/api/session");
if ((await response.json()).network !== "local-sandbox")
  throw Error("Recording automation is restricted to simulated local funds.");
const browser = await chromium.launch({
  executablePath: process.env.PATCHBOUNTY_BROWSER || undefined,
  args: ["--no-sandbox"],
});
const dir = path.join(repo, ".patchbounty", "recordings");
await fs.mkdir(dir, { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "Africa/Lagos",
  recordVideo: { dir, size: { width: 1440, height: 1000 } },
});
const page = await context.newPage();
try {
  await page.goto("http://127.0.0.1:3000/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#new-challenge").click();
  await page.locator("#title").fill("Challenge the authorization patch");
  await page
    .getByRole("button", { name: "Fund challenge", exact: true })
    .click();
  await page.locator("#candidate-form").waitFor({ timeout: 60000 });
  for (const sample of ["Benign sample", "Qualifying sample"]) {
    await page.getByRole("button", { name: sample, exact: true }).click();
    await page.waitForTimeout(1500);
    await page
      .getByRole("button", { name: "Submit claim", exact: true })
      .click();
    await page.locator("#verify").waitFor({ timeout: 60000 });
    await page.locator("#verify").click();
    await page.locator("#settle").waitFor({ timeout: 60000 });
    if (sample === "Qualifying sample") {
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: path.join(repo, "demo/app-verification.png"),
        fullPage: true,
      });
    }
    await page.locator("#settle").scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);
    await page.locator("#settle").click();
    if (sample === "Benign sample")
      await page.locator("#candidate-form").waitFor({ timeout: 60000 });
  }
  await page
    .getByText("Reward paid to the recorded claimant", { exact: true })
    .waitFor({ timeout: 60000 });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: path.join(repo, "demo/app-paid.png"),
    fullPage: true,
  });
  await page
    .getByText("Reward paid to the recorded claimant", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.waitForTimeout(4000);
  const video = page.video();
  await page.close();
  await context.close();
  console.log(await video.path());
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Africa/Lagos",
  });
  const phone = await mobile.newPage();
  await phone.goto("http://127.0.0.1:3000/");
  await phone
    .getByText("Reward paid to the recorded claimant", { exact: true })
    .waitFor();
  await phone.evaluate(() => document.fonts.ready);
  await phone.screenshot({
    path: path.join(repo, "demo/app-mobile.png"),
    fullPage: true,
  });
  await mobile.close();
} finally {
  await browser.close();
}
