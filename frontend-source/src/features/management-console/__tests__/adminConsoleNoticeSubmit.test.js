import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const adminConsoleSource = readFileSync(new URL("../../../views/AdminConsoleView.vue", import.meta.url), "utf8");
const consoleSectionSource = readFileSync(new URL("../components/ConsoleSection.vue", import.meta.url), "utf8");

describe("admin console notice submit flow", () => {
  it("creates notices without reusing the currently selected row id", () => {
    assert.match(adminConsoleSource, /from "@\/features\/management-console\/noticeAdminModel"/);
    assert.doesNotMatch(adminConsoleSource, /function normalizeLocalNoticePayload\(payload, existingId = ""\)/);
    assert.match(
      adminConsoleSource,
      /normalizeLocalNoticePayload\(\s*payload,\s*formMode\.value === "edit" \? selectedRow\.value\?\.id : "",\s*\{\s*ignorePayloadId:\s*formMode\.value !== "edit"\s*\}\s*\)/
    );
    assert.match(adminConsoleSource, /adminApi\.createNotice\(notice,\s*\{\s*omitNoticeId:\s*true\s*\}\)/);
  });

  it("guards the modal submit while a save request is in flight", () => {
    assert.match(adminConsoleSource, /const formSubmitting = ref\(false\)/);
    assert.match(adminConsoleSource, /if \(formSubmitting\.value\) return/);
    assert.match(adminConsoleSource, /formSubmitting\.value = true/);
    assert.match(adminConsoleSource, /formSubmitting\.value = false/);
    assert.match(consoleSectionSource, /formSubmitting:\s*\{/);
    assert.match(consoleSectionSource, /:disabled="formSubmitting"/);
    assert.match(consoleSectionSource, /@click\.self="!formSubmitting && emit\('close-form'\)"/);
  });

  it("locks form controls during notice submission to prevent duplicate edits", () => {
    assert.match(consoleSectionSource, /<fieldset[\s\S]*:disabled="formSubmitting"[\s\S]*>/);
    assert.match(consoleSectionSource, /<\/fieldset>/);
    assert.match(consoleSectionSource, /<button class="console-primary-button" type="submit" :disabled="formSubmitting">/);
  });

  it("rolls back optimistic notice drafts when create sync fails", () => {
    assert.match(adminConsoleSource, /const previousNotices = \[\.\.\.\(store\.carouselNotices \|\| \[\]\)\]/);
    assert.match(adminConsoleSource, /store\.carouselNotices = previousNotices/);
  });

  it("keeps admin notice link URLs as literal routes in table cells", () => {
    assert.match(consoleSectionSource, /function isLiteralDisplayValue\(value, key = ""\)/);
    assert.match(consoleSectionSource, /\["linkurl", "url", "href", "path", "route"\]\.includes\(normalizedKey\)/);
    assert.match(consoleSectionSource, /\^\[#\/\]/);
    assert.match(consoleSectionSource, /if \(isLiteralDisplayValue\(text, key\)\) return text/);
  });
});
