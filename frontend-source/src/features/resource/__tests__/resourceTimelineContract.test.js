import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

function blocksForSelector(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, "g");
  return css.match(pattern) || [];
}

function finalBlockForSelector(css, selector) {
  const blocks = blocksForSelector(css, selector);
  assert.ok(blocks.length, `missing CSS selector ${selector}`);
  return blocks[blocks.length - 1];
}

function assertSomeBlockMatches(css, selector, pattern, message) {
  const blocks = blocksForSelector(css, selector);
  assert.ok(blocks.length, `missing CSS selector ${selector}`);
  assert.ok(blocks.some((block) => pattern.test(block)), message);
}

describe("resource timeline source contracts", () => {
  it("keeps the left name department project column fixed while the timeline scrolls", async () => {
    const timeline = await source("../components/ResourceTimeline.vue");
    const css = await source("../../../styles/resource.css");

    assert.match(timeline, /class="resource-timeline-fixed-head"[\s\S]*姓名\s*\/\s*部门\s*\/\s*项目/);
    assert.match(timeline, /class="resource-person-cell"/);
    assert.match(timeline, /class="resource-timeline-scale"[\s\S]*transform:\s*`translateX\(-\$\{scrollLeft\}px\)`/);
    assert.match(timeline, /@scroll="syncTimelineScroll"/);

    const finalDepartmentBand = finalBlockForSelector(css, ".resource-workbench .resource-department-band");
    assert.match(finalDepartmentBand, /position:\s*sticky;/, "final department band CSS must stay sticky");
    assert.match(finalDepartmentBand, /left:\s*0;/, "final department band CSS must stay fixed on the left edge");
    assert.match(finalDepartmentBand, /z-index:\s*\d+;/, "final department band CSS must cover the scrolling timeline");
    assert.match(finalDepartmentBand, /background-clip:\s*padding-box;/, "final department band CSS must keep its own painted surface");
    assert.match(finalDepartmentBand, /inline-size:\s*var\(--resource-person-column-width,\s*210px\);/, "department label must be clipped to the fixed column");
    assert.match(finalDepartmentBand, /min-inline-size:\s*var\(--resource-person-column-width,\s*210px\);/, "department label must keep the same sticky width as person rows");
    assert.match(finalDepartmentBand, /max-inline-size:\s*var\(--resource-person-column-width,\s*210px\);/, "department label must not scroll horizontally with the canvas");

    assertSomeBlockMatches(
      css,
      ".resource-timeline-fixed-head",
      /position:\s*sticky;[\s\S]*left:\s*0;[\s\S]*z-index:/,
      "timeline fixed header must remain sticky on the left edge"
    );
    assertSomeBlockMatches(
      css,
      ".resource-person-cell",
      /position:\s*sticky;[\s\S]*left:\s*0;[\s\S]*z-index:/,
      "person cells must remain sticky on the left edge"
    );
    assertSomeBlockMatches(
      css,
      ".resource-person-cell",
      /background:[\s\S]*box-shadow:/,
      "sticky person cells need an opaque surface and divider over the scrolling body"
    );
    assertSomeBlockMatches(
      css,
      ".resource-workload-bar.is-dragging",
      /z-index:\s*3;/,
      "dragging task bars must stay below sticky department and person labels"
    );
  });

  it("keeps wheel zoom anchored to the timeline viewport and scroll position", async () => {
    const timeline = await source("../components/ResourceTimeline.vue");

    assert.match(timeline, /@wheel="zoomTimeline"/);
    assert.doesNotMatch(timeline, /@wheel\.prevent="zoomTimeline"/);
    assert.match(timeline, /async function zoomTimeline\(event\) \{/);
    assert.match(timeline, /event\.preventDefault\(\)/);
    assert.match(timeline, /const zoomFactor = event\.deltaY < 0 \? WHEEL_ZOOM_STEP : 1 \/ WHEEL_ZOOM_STEP/);
    assert.match(timeline, /const nextDayWidth = clampNumber\(oldDayWidth \* zoomFactor,\s*MIN_DAY_WIDTH,\s*MAX_DAY_WIDTH\)/);
    assert.match(timeline, /const anchorViewportX = clampNumber\(event\.clientX - rect\.left - fixedColumn,\s*0,\s*timelineViewportWidth\)/);
    assert.match(timeline, /const anchorDayOffset = Math\.max\(0,\s*pointerX \/ oldDayWidth\)/);
    assert.match(timeline, /dayWidth\.value = nextDayWidth/);
    assert.match(timeline, /await nextTick\(\)/);
    assert.match(timeline, /const maxScrollLeft = Math\.max\(0,\s*timelineBody\.scrollWidth - timelineBody\.clientWidth\)/);
    assert.match(timeline, /timelineBody\.scrollLeft = clampNumber\(anchorDayOffset \* nextDayWidth - anchorViewportX,\s*0,\s*maxScrollLeft\)/);
    assert.match(timeline, /syncScrollLeftFromElement\(timelineBody\)/);
  });

  it("zooms the timeline with a plain mouse wheel without horizontal drift", async () => {
    const timeline = await source("../components/ResourceTimeline.vue");
    const css = await source("../../../styles/resource.css");

    assert.doesNotMatch(timeline, /if \(!event\.ctrlKey && !event\.altKey\) return;/);
    assert.match(timeline, /const previousScrollTop = timelineBody\.scrollTop/);
    assert.match(timeline, /timelineBody\.scrollTop = previousScrollTop/);
    assert.match(timeline, /const maxScrollLeft = Math\.max\(0,\s*timelineBody\.scrollWidth - timelineBody\.clientWidth\)/);
    assert.match(timeline, /timelineBody\.scrollLeft = clampNumber\(anchorDayOffset \* nextDayWidth - anchorViewportX,\s*0,\s*maxScrollLeft\)/);

    assertSomeBlockMatches(
      css,
      ".resource-workbench .resource-timeline-body",
      /overscroll-behavior:\s*contain;/,
      "timeline body must keep wheel zoom from leaking to the page"
    );
    assertSomeBlockMatches(
      css,
      ".resource-workbench .resource-timeline-body",
      /scrollbar-gutter:\s*stable;/,
      "timeline body must keep viewport measurements stable during zoom"
    );
  });

  it("keeps department headers visible while vertically scrolling to the bottom", async () => {
    const css = await source("../../../styles/resource.css");

    assertSomeBlockMatches(
      css,
      ".resource-workbench .resource-department-band",
      /position:\s*sticky;[\s\S]*top:\s*0;/,
      "department headers must stick to the top while scrolling vertically"
    );
    assertSomeBlockMatches(
      css,
      ".resource-workbench .resource-department-band",
      /display:\s*inline-flex;[\s\S]*overflow:\s*hidden;/,
      "sticky department headers must keep their label surface clipped to the fixed column"
    );
    assertSomeBlockMatches(
      css,
      ".resource-workbench .resource-department-band",
      /background:[\s\S]*box-shadow:/,
      "sticky department headers need an opaque surface over scrolled rows"
    );
  });

  it("keeps resource timeline sources free of Vite error overlay markers", async () => {
    const files = [
      ["timeline component", await source("../components/ResourceTimeline.vue")],
      ["resource view", await source("../components/ResourceView.vue")],
      ["resource styles", await source("../../../styles/resource.css")]
    ];
    const overlayPatterns = [
      /vite-error-overlay/i,
      /__vite_plugin_vue_error_overlay/i,
      /ErrorOverlay/,
      /plugin:vite/i,
      /Internal server error/i
    ];

    for (const [label, text] of files) {
      for (const pattern of overlayPatterns) {
        assert.doesNotMatch(text, pattern, `${label} should not include ${pattern}`);
      }
    }
  });
});
