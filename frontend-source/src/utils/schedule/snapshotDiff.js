function itemKey(item = {}) {
  return String(item.id ?? item.itemId ?? item.item_id ?? "").trim();
}

function byItemId(items = []) {
  return new Map(items.map((item) => [itemKey(item), item]).filter(([key]) => key));
}

function snapshotItems(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.snapshot?.items)) return value.snapshot.items;
  if (Array.isArray(value?.snapshot?.plan?.items)) return value.snapshot.plan.items;
  return [];
}

function changedTypes(before = {}, after = {}) {
  const changes = [];

  if (before.startDate !== after.startDate || before.endDate !== after.endDate) changes.push("dateChanged");
  if (before.status !== after.status) changes.push("statusChanged");
  if (before.title !== after.title) changes.push("titleChanged");
  if (before.module !== after.module) changes.push("moduleChanged");

  return changes;
}

export function diffScheduleSnapshot(snapshot = [], current = []) {
  const snapshotList = snapshotItems(snapshot);
  const currentList = snapshotItems(current);
  const snapshotById = byItemId(snapshotList);
  const currentById = byItemId(currentList);
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  currentById.forEach((currentItem, id) => {
    const snapshotItem = snapshotById.get(id);
    if (!snapshotItem) {
      added.push(currentItem);
      return;
    }

    const changeTypes = changedTypes(snapshotItem, currentItem);
    if (changeTypes.length) {
      changed.push({
        id,
        before: snapshotItem,
        after: currentItem,
        changeTypes
      });
    } else {
      unchanged.push(currentItem);
    }
  });

  snapshotById.forEach((snapshotItem, id) => {
    if (!currentById.has(id)) removed.push(snapshotItem);
  });

  return {
    added,
    removed,
    changed,
    unchanged,
    summary: {
      added: added.length,
      removed: removed.length,
      changed: changed.length
    }
  };
}
