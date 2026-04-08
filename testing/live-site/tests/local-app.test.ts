import assert from "node:assert/strict";
import test from "node:test";
import {
  applyHarnessEnvFiles,
  isDeferredDueToDailyLimit,
  isHarnessItemTitle,
  isHarnessRuntimeFailure,
  selectHarnessAuth
} from "../src/local-app.js";

test("applyHarnessEnvFiles prefers parity env values over root env files", () => {
  const env: NodeJS.ProcessEnv = {};

  applyHarnessEnvFiles(env, [
    {
      DEMO_EMAIL: "demo@articlepod.local",
      DEMO_PASSWORD: "root-demo-password"
    },
    {
      DEMO_PASSWORD: "parity-demo-password",
      DIGEST_SCHEDULER_SECRET: "parity-digest-secret"
    }
  ]);

  assert.equal(env.DEMO_EMAIL, "demo@articlepod.local");
  assert.equal(env.DEMO_PASSWORD, "parity-demo-password");
  assert.equal(env.DIGEST_SCHEDULER_SECRET, "parity-digest-secret");
});

test("applyHarnessEnvFiles does not override already-exported process env values", () => {
  const env: NodeJS.ProcessEnv = {
    DEMO_PASSWORD: "shell-password"
  };

  applyHarnessEnvFiles(env, [
    {
      DEMO_PASSWORD: "root-demo-password"
    },
    {
      DEMO_PASSWORD: "parity-demo-password"
    }
  ]);

  assert.equal(env.DEMO_PASSWORD, "shell-password");
});

test("selectHarnessAuth prefers explicit live-site credentials", () => {
  const auth = selectHarnessAuth({
    LIVE_SITE_EMAIL: "qa@articlepod.local",
    LIVE_SITE_PASSWORD: "qa-password",
    WEBSTORE_REVIEWER_EMAIL: "chrome-reviewer@articlepod.com",
    WEBSTORE_REVIEWER_PASSWORD: "reviewer-password",
    DEMO_EMAIL: "demo@articlepod.local",
    DEMO_PASSWORD: "demo-password"
  });

  assert.deepEqual(auth, {
    authEmail: "qa@articlepod.local",
    authPassword: "qa-password",
    authSource: "live-site"
  });
});

test("selectHarnessAuth prefers reviewer credentials over demo credentials", () => {
  const auth = selectHarnessAuth({
    WEBSTORE_REVIEWER_EMAIL: "chrome-reviewer@articlepod.com",
    WEBSTORE_REVIEWER_PASSWORD: "reviewer-password",
    DEMO_EMAIL: "demo@articlepod.local",
    DEMO_PASSWORD: "demo-password"
  });

  assert.deepEqual(auth, {
    authEmail: "chrome-reviewer@articlepod.com",
    authPassword: "reviewer-password",
    authSource: "webstore-reviewer"
  });
});

test("selectHarnessAuth falls back to demo credentials", () => {
  const auth = selectHarnessAuth({
    DEMO_EMAIL: "demo@articlepod.local",
    DEMO_PASSWORD: "demo-password"
  });

  assert.deepEqual(auth, {
    authEmail: "demo@articlepod.local",
    authPassword: "demo-password",
    authSource: "demo"
  });
});

test("selectHarnessAuth requires complete live-site overrides", () => {
  assert.throws(
    () =>
      selectHarnessAuth({
        LIVE_SITE_EMAIL: "qa@articlepod.local"
      }),
    /LIVE_SITE_EMAIL and LIVE_SITE_PASSWORD must both be set/
  );
});

test("isHarnessItemTitle matches harness-created run titles", () => {
  assert.equal(isHarnessItemTitle("[live-site:2026-04-08T05-16-05-789Z] yahoo-news"), true);
  assert.equal(isHarnessItemTitle("[manual] yahoo-news"), false);
});

test("isDeferredDueToDailyLimit detects queued daily limit items", () => {
  assert.equal(
    isDeferredDueToDailyLimit({
      id: "item-1",
      title: "[live-site:run] yahoo-news",
      status: "QUEUED",
      errorCode: "PRO_DAILY_LIMIT_DEFERRED"
    }),
    true
  );
  assert.equal(
    isDeferredDueToDailyLimit({
      id: "item-2",
      title: "[live-site:run] yahoo-news",
      status: "FAILED",
      errorCode: "PRO_DAILY_LIMIT_DEFERRED"
    }),
    false
  );
});

test("isHarnessRuntimeFailure detects local runtime dependency errors", () => {
  assert.equal(
    isHarnessRuntimeFailure("spaCy model 'en_core_web_sm' is missing. Run scripts/bootstrap-python-tts.sh."),
    true
  );
  assert.equal(
    isHarnessRuntimeFailure("Could not synthesize audio with kokoro. Ensure python-tts service is running."),
    true
  );
  assert.equal(isHarnessRuntimeFailure("Article text could not be extracted from this page."), false);
});
