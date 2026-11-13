import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const env = { ...process.env, PORT: "3007" };
delete env.PATCHBOUNTY_TESTNET_CONFIG;
delete env.NEAR_AI_API_KEY; // Browser CI never incurs inference charges.
const server = spawn("bash", ["scripts/start.sh", "--low-fd"], {
  cwd: repo,
  env,
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (data) => {
  log += data;
});
server.stderr.on("data", (data) => {
  log += data;
});
async function ready() {
  for (let i = 0; i < 120; i++) {
    if (log.includes("PatchBounty ready")) return;
    if (server.exitCode !== null) throw Error(log);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error("Server startup timed out: " + log);
}
let browser;
try {
  await ready();
  browser = await chromium.launch({
    executablePath: process.env.PATCHBOUNTY_BROWSER || undefined,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Africa/Lagos",
  });
  const page = await context.newPage();
  const screenshots = process.env.PATCHBOUNTY_SCREENSHOTS;
  if (screenshots) await fs.mkdir(screenshots, { recursive: true });
  const capture = async (name) => {
    if (screenshots) {
      // Accessibility probes may leave focus/scroll on a tested control.
      // Capture the actual resting page from the top, without hiding content.
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: path.join(screenshots, name + ".png"),
        fullPage: true,
      });
    }
  };
  const checkAccessibility = async (label) => {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    if (result.violations.length)
      throw Error(
        label +
          ": " +
          JSON.stringify(
            result.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => ({
                target: n.target,
                summary: n.failureSummary,
              })),
            })),
          ).slice(0, 4500),
      );
  };
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3007/");
  await page.getByText("No challenges yet.", { exact: false }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await checkAccessibility("empty workspace");
  await capture("01-empty");
  await page.locator("#new-challenge").click();
  await page.locator("#title").fill("Authorization edge cases");
  await checkAccessibility("funding dialog");
  await capture("02-funding");
  await page
    .getByRole("button", { name: "Fund challenge", exact: true })
    .click();
  await page.locator("#candidate-form").waitFor({ timeout: 60000 });
  await checkAccessibility("proposal");
  await capture("03-proposal");
  const draft = JSON.stringify({
    user: "alice",
    path: "/accounts/bob/profile",
  });
  await page.locator("#candidate").fill(draft);
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await page.keyboard.press("ArrowRight");
  if (
    (await page.locator("#tab-activity").getAttribute("aria-selected")) !==
    "true"
  )
    throw Error("keyboard tab navigation failed");
  await page.keyboard.press("Home");
  if ((await page.locator("#candidate").inputValue()) !== draft)
    throw Error("draft lost during tab navigation");
  await page
    .locator("#candidate")
    .fill('{"user":"alice","user":"bob","path":"/accounts/bob/profile"}');
  await page.getByRole("button", { name: "Submit claim", exact: true }).click();
  await page.locator("#notice.error").waitFor();
  if (!(await page.locator("#notice").innerText()).includes("unique keys"))
    throw Error("duplicate keys accepted");
  if (
    (await page.locator("#candidate").getAttribute("aria-invalid")) !== "true"
  )
    throw Error("candidate error not announced inline");
  await checkAccessibility("invalid candidate");
  await capture("04-validation");
  await page
    .getByRole("button", { name: "Benign sample", exact: true })
    .click();
  await page.getByRole("button", { name: "Submit claim", exact: true }).click();
  await page.locator("#verify").waitFor({ timeout: 60000 });
  await page.locator("#verify").click();
  await page.locator("#settle").waitFor({ timeout: 60000 });
  if ((await page.locator("#settle").innerText()) !== "Reject claim")
    throw Error("benign claim rewarded");
  await page.locator("#settle").click();
  await page.locator("#candidate-form").waitFor({ timeout: 60000 });
  await page
    .getByRole("button", { name: "Qualifying sample", exact: true })
    .click();
  await page.getByRole("button", { name: "Submit claim", exact: true }).click();
  await page.locator("#verify").waitFor({ timeout: 60000 });
  await page.locator("#verify").click();
  await page.locator("#settle").waitFor({ timeout: 60000 });
  if ((await page.locator("#settle").innerText()) !== "Approve reward payout")
    throw Error("eligible decision missing");
  await checkAccessibility("verified counterexample");
  await page.locator("#settle").click({ trial: true, timeout: 1500 });
  await capture("05-verified");

  await page.locator("#settle").click();
  await page
    .getByText("Reward paid to the recorded claimant", { exact: true })
    .waitFor({ timeout: 60000 });
  await checkAccessibility("paid reward");
  await capture("06-paid");

  const session = await (
    await page.request.get("http://127.0.0.1:3007/api/session")
  ).json();
  const challenge = session.challenges[0];
  const settlement = challenge.attempts.at(-1).settlement;
  if (
    BigInt(settlement.balanceAfter) - BigInt(settlement.balanceBefore) !==
    80000000000000000000000n
  )
    throw Error("wrong payout delta");
  const forged = await page.request.post(
    "http://127.0.0.1:3007/api/challenges/0/settle",
    { data: {} },
  );
  if (forged.status() !== 403) throw Error("missing token accepted");
  const foreign = await page.request.get("http://127.0.0.1:3007/api/session", {
    headers: { Origin: "http://attacker.example" },
  });
  if (foreign.status() !== 403) throw Error("foreign origin accepted");
  const replay = await page.request.post(
    "http://127.0.0.1:3007/api/challenges/0/settle",
    {
      data: {},
      headers: {
        "X-PatchBounty-Token": session.token,
        "X-Request-ID": randomUUID(),
      },
    },
  );
  if (replay.status() !== 400) throw Error("repeat settlement accepted");
  await page.getByRole("tab", { name: /^Evidence/ }).click();
  await checkAccessibility("evidence library");
  await capture("07-evidence");
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download evidence", exact: true })
    .first()
    .click();
  const download = await downloadEvent;
  const proof = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  if (proof.verification.decision !== "eligible")
    throw Error("wrong evidence download");
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await page.reload();
  await page
    .getByRole("heading", { name: "Challenge activity", exact: true })
    .waitFor();
  if (!page.url().includes("view=activity"))
    throw Error("tab deep link not preserved");
  await checkAccessibility("activity");
  await capture("08-activity");
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page
    .getByText("Reward paid to the recorded claimant", { exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("mobile overflow");
  await checkAccessibility("mobile settlement");
  await capture("09-mobile");
  await page.getByRole("tab", { name: /^Evidence/ }).click();
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("mobile evidence overflow");
  await checkAccessibility("mobile evidence");
  await capture("10-mobile-evidence");
  await page.locator("#archives").click();
  await checkAccessibility("archive dialog");
  await capture("11-archives");
  await page.locator("#archive-dialog .close").click();
  if (process.env.PATCHBOUNTY_CHECK_REFUND === "1") {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator("#new-challenge").click();
    await page.locator("#title").fill("Expiry recovery");
    await page.locator("#minutes").fill("1");
    await page.locator("#reward").fill("0.001");
    await page
      .getByRole("button", { name: "Fund challenge", exact: true })
      .click();
    await page.locator("#candidate-form").waitFor({ timeout: 60000 });
    const fresh = await (
      await page.request.get("http://127.0.0.1:3007/api/session")
    ).json();
    const deadline = Number(
      BigInt(fresh.challenges.at(-1).snapshot.state.deadline_ns) / 1000000n,
    );
    while (Date.now() < deadline + 2000)
      await new Promise((resolve) => setTimeout(resolve, 500));
    await page.locator("#refresh").click();
    await page.locator("#refund").waitFor({ timeout: 15000 });
    await page.locator("#refund").click();
    await page
      .getByText("Reward refunded to the creator", { exact: true })
      .waitFor({ timeout: 60000 });
    if (await page.locator(".workflow").count())
      throw Error("refund falsely shows completed verification steps");
    await checkAccessibility("refunded challenge");
    await capture("12-refunded");
  }
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS: real local-chain create, invalid input, benign rejection, eligible verification, exact payout, replay rejection, origin/token checks, keyboard tabs, draft retention, deep links, evidence download, mobile layout and automated accessibility checks.",
  );
} finally {
  if (browser) await browser.close();
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
  await new Promise((resolve) => {
    if (server.exitCode !== null) return resolve();
    server.once("close", resolve);
    setTimeout(resolve, 10000).unref();
  });
}
