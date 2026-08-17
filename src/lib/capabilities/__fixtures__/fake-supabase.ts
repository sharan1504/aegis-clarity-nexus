// Minimal in-memory stand-in for a Supabase PostgREST client, enough for the
// authorization + router + guardrail tests (select / eq / in / or / order /
// limit / insert / maybeSingle).
export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

export interface FakeClient {
  from: (table: string) => Builder;
  /** Every table touched, in order — used to assert access ordering. */
  readonly accessLog: string[];
  /** Rows inserted during the test run, keyed by table. */
  readonly inserted: Record<string, Row[]>;
}

interface Builder {
  select: (columns?: string) => Builder;
  eq: (column: string, value: unknown) => Builder;
  in: (column: string, values: unknown[]) => Builder;
  or: (expression: string) => Builder;
  order: (column: string, options?: Record<string, unknown>) => Builder;
  limit: (count: number) => Builder;
  insert: (values: Row | Row[]) => Builder;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  then: (
    onfulfilled: (value: { data: Row[]; error: null }) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

/** Parses `col.eq.value,col.is.null` into predicates joined by OR. */
function parseOr(expression: string): Array<(row: Row) => boolean> {
  return expression.split(",").map((clause) => {
    const [column, op, ...rest] = clause.split(".");
    const raw = rest.join(".");
    return (row: Row) => {
      const value = row[String(column)];
      if (op === "is") return raw === "null" ? value == null : String(value) === raw;
      return String(value) === raw;
    };
  });
}

export function createFakeSupabase(tables: Tables, failTables: string[] = []): FakeClient {
  const accessLog: string[] = [];
  const inserted: Record<string, Row[]> = {};

  function builder(table: string): Builder {
    const eqs: Array<[string, unknown]> = [];
    const ins: Array<[string, unknown[]]> = [];
    const ors: Array<Array<(row: Row) => boolean>> = [];
    let max: number | null = null;

    const rows = () => {
      const matched = (tables[table] ?? []).filter(
        (row) =>
          eqs.every(([c, v]) => row[c] === v) &&
          ins.every(([c, vs]) => vs.some((v) => v === row[c])) &&
          ors.every((group) => group.some((predicate) => predicate(row))),
      );
      return max == null ? matched : matched.slice(0, max);
    };

    const result = () =>
      failTables.includes(table)
        ? { data: [] as Row[], error: { message: `${table} unavailable` } as unknown as null }
        : { data: rows(), error: null };

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
      or: (expression) => {
        ors.push(parseOr(expression));
        return self;
      },
      order: () => self,
      limit: (count) => {
        max = count;
        return self;
      },
      insert: (values) => {
        const list = Array.isArray(values) ? values : [values];
        inserted[table] = [...(inserted[table] ?? []), ...list];
        return self;
      },
      maybeSingle: async () => {
        const { data, error } = result();
        return { data: data[0] ?? null, error: error as null };
      },
      then: (onfulfilled, onrejected) =>
        Promise.resolve(result() as { data: Row[]; error: null }).then(onfulfilled, onrejected),
    };
    return self;
  }

  return {
    accessLog,
    inserted,
    from: (table: string) => {
      accessLog.push(table);
      return builder(table);
    },
  };
}
