import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";
import { buildPublicMetadata, buildSoftwareApplicationSchema } from "../src/lib/seo";

test("public metadata helper emits canonical pages with large-image social previews", () => {
  const metadata = buildPublicMetadata({
    title: "Pricing",
    description: "Simple pricing for private article podcasts.",
    path: "/pricing"
  });

  assert.equal(metadata.alternates?.canonical, "/pricing");
  assert.equal(metadata.openGraph?.url, "http://localhost:3000/pricing");
  assert.equal(
    metadata.twitter && "card" in metadata.twitter ? metadata.twitter.card : undefined,
    "summary_large_image"
  );
  assert.equal(metadata.robots && typeof metadata.robots === "object" ? metadata.robots.index : undefined, true);
});

test("public metadata helper supports noindex pages for private surfaces", () => {
  const metadata = buildPublicMetadata({
    title: "Shared workspace",
    description: "Read-only shared workspace.",
    path: "/share",
    noIndex: true
  });

  assert.equal(metadata.robots && typeof metadata.robots === "object" ? metadata.robots.index : undefined, false);
  assert.equal(metadata.robots && typeof metadata.robots === "object" ? metadata.robots.follow : undefined, true);
});

test("software application schema exposes starter plus monthly and annual offers", () => {
  const schema = buildSoftwareApplicationSchema("ArticlePod converts articles into podcast episodes.");
  const offers = Array.isArray(schema.offers) ? schema.offers : [];

  assert.equal(offers.length, 3);
  assert.deepEqual(
    offers.map((offer) => offer.name),
    ["Starter", "Pro Monthly", "Pro Annual"]
  );
  assert.deepEqual(
    offers.map((offer) => offer.price),
    ["0", "15", "130"]
  );
});

test("robots disallows auth and private surfaces while leaving marketing pages crawlable", () => {
  const config = robots();
  const firstRule = Array.isArray(config.rules) ? config.rules[0] : config.rules;

  assert.deepEqual(firstRule?.allow, ["/", "/product", "/pricing", "/faq", "/about", "/resources"]);
  assert.deepEqual(firstRule?.disallow, ["/app", "/admin", "/api/", "/rss/", "/share"]);
  assert.equal(config.sitemap, "http://localhost:3000/sitemap.xml");
});

test("sitemap includes the marketing homepage and excludes the login page", () => {
  const entries = sitemap();
  const urls = entries.map((entry) => entry.url);

  assert.equal(urls.includes("http://localhost:3000/"), true);
  assert.equal(urls.includes("http://localhost:3000/login"), false);
  assert.equal(urls.includes("http://localhost:3000/product"), true);
  assert.equal(urls.includes("http://localhost:3000/pricing"), true);
});

test("shared marketing routes keep private surfaces out of search", () => {
  const shareSource = readFileSync(new URL("../src/app/share/page.tsx", import.meta.url), "utf8");
  const loginAliasSource = readFileSync(new URL("../src/app/login/page.tsx", import.meta.url), "utf8");
  const ctaSource = readFileSync(new URL("../src/components/marketing-cta.tsx", import.meta.url), "utf8");
  const authLandingSource = readFileSync(new URL("../src/components/auth-landing-page.tsx", import.meta.url), "utf8");
  const secondaryMarketingRoutes = ["/product", "/pricing", "/resources", "/faq", "/about"];

  assert.equal(shareSource.includes("noIndex: true"), true);
  assert.equal(loginAliasSource.includes("redirect(query ? `/?${query}` : \"/\")"), true);
  assert.equal(ctaSource.includes('href="/app"'), false);
  assert.equal(ctaSource.includes('href="/"'), true);
  assert.equal(ctaSource.includes('secondaryHref = "/product"'), true);
  assert.equal(authLandingSource.includes("Log in to your private podcast feed"), true);
  assert.equal(existsSync(new URL("../src/components/marketing-footer.tsx", import.meta.url)), false);

  for (const route of secondaryMarketingRoutes) {
    const source = readFileSync(new URL(`../src/app${route}/page.tsx`, import.meta.url), "utf8");
    assert.equal(source.includes("MarketingFooter"), false, `${route} should not render duplicate footer navigation`);
  }
});
