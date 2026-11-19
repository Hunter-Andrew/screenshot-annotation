import { expect, test, type Page } from "@playwright/test";

type Fake = {
  delayedCaptures: number[];
  launchAtSignIn: boolean;
  libraryFolderOpened: number;
  libraryFolder: string;
  toolStyles: Record<string, unknown>;
  toolStylesResets: number;
  setCountdown(remaining: number | null): void;
  setOverlayAttempt(attempt: number | null): void;
  overlayFrameRequests: number[];
};
const fake = <T,>(page: Page, read: (f: Fake) => T) =>
  page.evaluate(`(${read.toString()})(window.__fakeBridge)`) as Promise<T>;

test("the editor's top bar has a single 3 second delay timer button", async ({ page }) => {
  await page.goto("/");
  const group = page.getByRole("group", { name: "Capture after a delay" });
  await expect(group.getByRole("button")).toHaveText(["3s"]);
  await group.getByRole("button", { name: "Capture in 3 seconds" }).click();
  expect(await fake(page, (f) => f.delayedCaptures)).toEqual([3]);
});

test("the countdown badge page shows the number the platform sends, on a transparent page", async ({ page }) => {
  await page.goto("/#countdown");
  await page.evaluate(() => (window as unknown as { __fakeBridge: Fake }).__fakeBridge.setCountdown(3));
  await expect(page.getByRole("status")).toHaveText("3");
  await page.evaluate(() => (window as unknown as { __fakeBridge: Fake }).__fakeBridge.setCountdown(2));
  await expect(page.getByRole("status")).toHaveText("2");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
});

test("Settings: launch at sign-in, the Library folder and Reset tool styles", async ({ page }) => {
  await page.goto("/#settings");

  const launch = page.getByRole("checkbox", { name: "Launch at sign-in" });
  await expect(launch).toBeChecked();
  await launch.uncheck();
  expect(await fake(page, (f) => f.launchAtSignIn)).toBe(false);
  await page.reload(); // the choice is stored
  await expect(page.getByRole("checkbox", { name: "Launch at sign-in" })).not.toBeChecked();

  const folder = page.getByLabel("Library folder");
  await expect(folder).toHaveValue(/Sigil \(Screenshot Annotation\)/);
  await expect(folder).toHaveJSProperty("readOnly", true);
  await page.getByRole("button", { name: "Open in Explorer" }).click();
  expect(await fake(page, (f) => f.libraryFolderOpened)).toBe(1);

  await page.evaluate(() =>
    (window as unknown as { __fakeBridge: { setToolStyles(s: unknown): Promise<void> } }).__fakeBridge.setToolStyles({
      rect: { stroke: { color: "#2563eb", width: 8 } },
    }),
  );
  await page.getByRole("button", { name: "Reset tool styles" }).click();
  await expect(page.getByRole("status")).toHaveText("Tool styles reset.");
  expect(await fake(page, (f) => f.toolStyles)).toEqual({});
});

test("a pre-warmed overlay page stays idle until a capture begins, then shows its frame", async ({ page }) => {
  await page.goto("/#overlay/0");
  await page.evaluate(() => {
    // A page that loaded before any capture: the fake starts with a capture open, so end it.
    (window as unknown as { __fakeBridge: Fake }).__fakeBridge.setOverlayAttempt(null);
  });
  await expect(page.getByTestId("overlay")).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __fakeBridge: Fake }).__fakeBridge.setOverlayAttempt(2));
  await expect(page.getByRole("img", { name: "Frozen screen" })).toBeVisible();
});
