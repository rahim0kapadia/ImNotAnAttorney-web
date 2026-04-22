import { test, expect } from "@playwright/test";

const CHARGES = [
  { slug: "drug-possession-defense", label: "Drug Possession" },
  { slug: "assault-defense", label: "Assault" },
  { slug: "domestic-violence-defense", label: "Domestic Violence" },
];

const STATES = ["florida", "california", "texas"];

for (const charge of CHARGES) {
  test.describe(`pSEO — ${charge.slug}`, () => {
    test(`landing page renders with state list`, async ({ page }) => {
      await page.goto(`/${charge.slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText("Florida")).toBeVisible();
    });

    for (const state of STATES) {
      test(`${state} page renders with statute data + score CTA`, async ({ page }) => {
        await page.goto(`/${charge.slug}/${state}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(
          page.getByRole("link", { name: /Take the Free Defense Score/i }),
        ).toBeVisible();
        const html = await page.content();
        expect(html).toContain("application/ld+json");
        expect(html).toContain("FAQPage");
        expect(html).toContain("BreadcrumbList");
      });
    }
  });
}
