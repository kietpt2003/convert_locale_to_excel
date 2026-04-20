interface RedmineTimeEntry {
  id: number;
  hours: number;
  spent_on: string;
  issue?: {
    id: number;
  };
  project: {
    id: number;
    name: string;
  };
}

interface RedmineTimeEntryResponse {
  time_entries: RedmineTimeEntry[];
  total_count: number;
  offset: number;
  limit: number;
}
