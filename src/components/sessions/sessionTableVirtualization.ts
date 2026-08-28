import type { SessionGroup, VirtualSessionListRow } from "./sessionTableTypes";

export const GROUP_ROW_HEIGHT = 44;
export const SESSION_ROW_HEIGHT = 44;

export const buildVirtualSessionRows = (
  groups: SessionGroup[],
  expandedGroups: Record<string, boolean>,
): VirtualSessionListRow[] => {
  const flattened: VirtualSessionListRow[] = [];

  for (const group of groups) {
    const expanded = expandedGroups[group.groupKey] === true;
    flattened.push({
      key: `group-${group.groupKey}`,
      type: "group",
      height: GROUP_ROW_HEIGHT,
      group,
      expanded,
    });

    if (!expanded) {
      continue;
    }

    const mainRows = group.rows.filter((row) => !row.isSubagent);
    const visibleRows = mainRows.length > 0 ? mainRows : group.rows;
    visibleRows.forEach((row, index) => {
      flattened.push({
        key: row.id,
        type: "session",
        height: SESSION_ROW_HEIGHT,
        groupKey: group.groupKey,
        row,
        isLastChild: index === visibleRows.length - 1,
      });
    });
  }

  return flattened;
};

export const getVirtualWindow = <TRow extends { key: string; height: number }>(
  rows: TRow[],
  options: { viewportHeight: number; scrollTop: number; overscan: number },
) => {
  const { viewportHeight, scrollTop, overscan } = options;
  const offsets: number[] = [];
  let totalHeight = 0;

  for (const row of rows) {
    offsets.push(totalHeight);
    totalHeight += row.height;
  }

  let startIndex = 0;
  while (
    startIndex < rows.length &&
    offsets[startIndex] + rows[startIndex].height <= scrollTop
  ) {
    startIndex += 1;
  }
  const visibleStartIndex = startIndex;

  let endIndex = startIndex;
  const viewportBottom = scrollTop + viewportHeight;
  while (endIndex < rows.length && offsets[endIndex] < viewportBottom) {
    endIndex += 1;
  }
  const visibleEndIndex = Math.max(visibleStartIndex, endIndex - 1);

  startIndex = Math.max(0, startIndex - overscan);
  endIndex = Math.min(
    rows.length - 1,
    Math.max(startIndex, endIndex - 1 + overscan),
  );

  const items = rows.slice(startIndex, endIndex + 1);
  const paddingTop = rows.length === 0 ? 0 : (offsets[startIndex] ?? 0);
  const renderedHeight = items.reduce((sum, row) => sum + row.height, 0);
  const paddingBottom = Math.max(
    0,
    totalHeight - paddingTop - renderedHeight,
  );

  return {
    startIndex,
    endIndex,
    visibleStartIndex,
    visibleEndIndex,
    items,
    paddingTop,
    paddingBottom,
    totalHeight,
  };
};
