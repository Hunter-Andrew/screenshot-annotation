import { expect, test } from "@playwright/test";

test("Settings window shows the version and Check for updates opens the Releases page", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (req) => {
    if (!req.url().startsWith("http://localhost") && !req.url().startsWith("data:")) {
      externalRequests.push(req.url());
    }
  });

  // The real app loads this same URL in its Settings window.
  await page.goto("/#settings");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
  await expect(page.getByText("Version 0.0.0-fake")).toBeVisible();

  await page.getByRole("button", { name: "Check for updates" }).click();

  const opened = await page.evaluate(
    () => (window as unknown as { __fakeBridge: { openedUrls: string[] } }).__fakeBridge.openedUrls,
  );
  expect(opened).toEqual(["https://github.com/Hunter-Andrew/screenshot-annotation/releases"]);
  expect(externalRequests).toEqual([]);
});
