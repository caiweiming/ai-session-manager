export type SessionTableRow = {
  id?: string;
  title?: string;
  tool?: string;
  path?: string;
  sizeBytes?: number;
  isSubagent?: boolean;
  parentSourceId?: string;
  createdAt?: string;
  updatedAt?: string;
  sourceTool?: string;
  sourceId?: string;
};

export type SessionSortMode = "default" | "path_asc" | "path_desc" | "size_asc" | "size_desc";
export type SessionTableViewMode = "overview" | "trash";
export type SessionResumeState = "idle" | "pending" | "success" | "error";

export type NormalizedSessionRow = {
  id: string;
  title: string;
  tool: string;
  toolLabel: string;
  toolShortLabel: string;
  toolClass: string;
  path: string;
  sizeBytes: number | null;
  isSubagent: boolean;
  parentSourceId?: string;
  createdAt: string;
  updatedAt: string;
  sourceTool: string;
  sourceId: string;
};

export type SessionGroup = {
  groupKey: string;
  displayPath: string;
  rows: NormalizedSessionRow[];
  toolLabel: string;
  toolShortLabel: string;
  toolClass: string;
  totalSizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type VirtualGroupRow = {
  key: string;
  type: "group";
  height: number;
  group: SessionGroup;
  expanded: boolean;
};

export type VirtualSessionRow = {
  key: string;
  type: "session";
  height: number;
  groupKey: string;
  row: NormalizedSessionRow;
  isLastChild: boolean;
};

export type VirtualSessionListRow = VirtualGroupRow | VirtualSessionRow;
