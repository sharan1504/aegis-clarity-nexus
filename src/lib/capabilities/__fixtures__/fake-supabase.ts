// Minimal in-memory stand-in for a Supabase PostgREST client, enough for the
// authorization + router tests (select / eq / in / order / maybeSingle).
export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

export interface FakeClient {
  from: (table: string) => Builder;
  /** Every table touched, in order — used to assert access ordering. */
  readonly accessLog: string[];
}

interface Builder {
  select: (columns?: string) => Builder;
  eq: (column: string, value: unknown) => Builder;
  in: (column: string, values: unknown[]) => Builder;
  order: (column: string) => Builder;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  then: (
    onfulfilled: (value: { data: Row[]; error: null }) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

export function createFakeSupabase(tables: Tables): FakeClient {
  const accessLog: string[] = [];

  function builder(table: string): Builder {
    const eqs: Array<[string, unknown]> = [];
    const ins: Array<[string, unknown[]]> = [];

    const rows = () =>
      (tables[table] ?? []).filter(
        (row) =>
          eqs.every(([c, v]) => row[c] === v) &&
          ins.every(([c, vs]) => vs.some((v) => v === row[c])),
      );

    const self: Builder = {
      select: () => self,
      eq: (column, value) => {
        eqs.push([column, value]);
        return self;
      },
      in: (column, values) => {
        ins.push([column, values]);
        return self;
      },
      order: () => self,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (onfulfilled, onrejected) =>
        Promise.resolve({ data: rows(), error: null }).then(onfulfilled, onrejected),
    };
    return self;
  }

  return {
    accessLog,
    from: (table: string) => {
      accessLog.push(table);
      return builder(table);
    },
  };
}
