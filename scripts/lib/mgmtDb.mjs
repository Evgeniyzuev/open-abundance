// A tiny read-only stand-in for the supabase-js query builder over the Supabase Management API (SQL over HTTPS).
// Lets `pnpm analytics:daily --source=mgmt` build the report in a cloud session that can reach api.supabase.com
// but has no service key. Only the calls loadAnalyticsSnapshot makes are supported: select, gte, eq, order, range.
const ident = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unsupported identifier: ${name}`);
  return `"${name}"`;
};
const literal = (value) => `'${String(value).replace(/'/g, "''")}'`;

export function createMgmtDb({ projectRef, token }) {
  async function query(sql) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
      body: JSON.stringify({ query: sql, read_only: true })
    });
    const text = await response.text();
    if (!response.ok) return { data: null, error: { message: `${response.status}: ${text.slice(0, 300)}` } };
    return { data: text ? JSON.parse(text) : [], error: null };
  }

  return {
    from(table) {
      const state = { columns: "*", where: [], order: null };
      const builder = {
        select(columns) { state.columns = columns.split(",").map((c) => ident(c.trim())).join(", "); return builder; },
        gte(column, value) { state.where.push(`${ident(column)} >= ${literal(value)}`); return builder; },
        eq(column, value) { state.where.push(`${ident(column)} = ${literal(value)}`); return builder; },
        order(column, options = {}) { state.order = `${ident(column)} ${options.ascending === false ? "desc" : "asc"}`; return builder; },
        range(from, to) {
          const where = state.where.length ? ` where ${state.where.join(" and ")}` : "";
          const order = state.order ? ` order by ${state.order}` : "";
          return query(`select ${state.columns} from public.${ident(table)}${where}${order} offset ${Number(from)} limit ${Number(to) - Number(from) + 1}`);
        }
      };
      return builder;
    }
  };
}
