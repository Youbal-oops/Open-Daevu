// The only built-in app is an empty page. Everything else is built by you or by an agent.
export const STARTER_APP = `<!doctype html><html><head><meta charset="utf-8"><style>
body{display:grid;place-items:center;height:100vh;margin:0;text-align:center}
p{color:var(--rw-muted);max-width:440px;line-height:1.6;font-size:14px}code{background:var(--rw-card);padding:1px 6px;border-radius:5px}
</style></head><body><div><h2>New app</h2><p>Ask AI to build this, or edit the source yourself. Use <code>rw.get("name")</code>, <code>rw.kpis()</code>, <code>rw.table("name")</code>, <code>rw.file(id)</code>, <code>rw.db</code> for persistent project records, and <code>rw.state</code> to work with your project.</p></div></body></html>`;
