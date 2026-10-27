import React, { useEffect, useMemo, useState } from "react";
import defaultDocs from "../data/docs.json";
import defaultTaxonomy from "../data/taxonomy.json";

const STATUSES = ["Draft", "In review", "Approved", "Archived"];
const STATUS_COLORS = {
  Draft: "var(--draft)",
  "In review": "var(--warn)",
  Approved: "var(--ok)",
  Archived: "var(--draft)",
};
const KINDS = {
  games: { field: "game", label: "Titles", singular: "title" },
  departments: { field: "department", label: "Departments", singular: "department" },
  categories: { field: "category", label: "Document types", singular: "document type" },
};
const PREF_KEY = "document-hub-react-prefs";
const DATA_KEY = "document-hub-react-data";
const escapeText = (value) => String(value ?? "");

function readStoredData() {
  try {
    const stored = localStorage.getItem(DATA_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed.docs) && parsed.tax?.games) return parsed;
    }
  } catch {
    return { docs: defaultDocs.map((doc) => ({ ...doc, _id: doc.id })), tax: defaultTaxonomy };
  }
  return { docs: defaultDocs.map((doc) => ({ ...doc, _id: doc.id })), tax: defaultTaxonomy };
}

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
  } catch {
    return {};
  }
}

function codeFor(tax, kind, value) {
  return tax[kind]?.find((entry) => entry.name === value)?.code || "XX";
}

function colorFor(tax, kind, value) {
  const entry = tax[kind]?.find((item) => item.name === value);
  return `var(--c${entry ? entry.c % 8 : 7})`;
}

function slug(value) {
  return (
    String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^A-Za-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join("-")
      .slice(0, 48)
      .replace(/-+$/, "") || "Untitled"
  );
}

function fileName(doc, tax) {
  const version = String(Math.max(1, Number.parseInt(doc.version, 10) || 1)).padStart(2, "0");
  return [
    codeFor(tax, "games", doc.game),
    codeFor(tax, "departments", doc.department),
    codeFor(tax, "categories", doc.category),
    slug(doc.shortName || doc.title),
    `v${version}`,
  ].join("_");
}

function timeAgo(timestamp) {
  if (!timestamp) return "—";
  const seconds = (Date.now() - timestamp) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: seconds / 86400 > 300 ? "numeric" : undefined,
  });
}

function Status({ value }) {
  const status = value || "Draft";
  return (
    <span
      className={`status s-${status.toLowerCase().replace(/\s/g, "")}`}
      style={{ "--sc": STATUS_COLORS[status] || "var(--draft)" }}
    >
      {status}
    </span>
  );
}

function Chip({ tax, kind, value }) {
  if (!value) return null;
  return (
    <span className="chip" style={{ "--cc": colorFor(tax, kind, value) }}>
      {value}
    </span>
  );
}

function Owner({ id }) {
  return id ? <span className="owner">{id}</span> : <span className="owner none">Unassigned</span>;
}

function getGroups(list, key) {
  const grouped = new Map();
  for (const doc of list) {
    const label = doc[key] || "Unfiled";
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label).push(doc);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, items]) => ({ name, items }));
}

function App() {
  const initial = useMemo(readStoredData, []);
  const prefs = useMemo(readPrefs, []);
  const [docs, setDocs] = useState(initial.docs);
  const [tax, setTax] = useState(initial.tax);
  const [scope, setScope] = useState({ type: "home" });
  const [view, setView] = useState(["table", "board", "gallery"].includes(prefs.view) ? prefs.view : "table");
  const [group, setGroup] = useState(prefs.group || "department");
  const [sort, setSort] = useState(["updated", "title", "file"].includes(prefs.sort) ? prefs.sort : "updated");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [query, setQuery] = useState("");
  const [openTitles, setOpenTitles] = useState(prefs.openTitles || {});
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [drawer, setDrawer] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify({ docs, tax }));
      setStorageError("");
    } catch (error) {
      setStorageError(`Changes could not be saved in this browser: ${error.message}`);
    }
  }, [docs, tax]);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ view, group, sort, openTitles }));
    } catch {
      // Preferences are optional; the library data remains available.
    }
  }, [view, group, sort, openTitles]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setDrawer(null);
        setMenuOpen(false);
      }
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
      ) {
        event.preventDefault();
        if (scope.type === "home") setScope({ type: "all" });
        window.setTimeout(() => document.getElementById("q")?.focus(), 0);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [scope.type]);

  const visibleDocs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = docs.filter((doc) => {
      if (scope.type === "game" && doc.game !== scope.game) return false;
      if (scope.type === "game" && scope.dept && doc.department !== scope.dept) return false;
      if (scope.type === "pinned" && !doc.pinned) return false;
      if (scope.type === "category" && doc.category !== scope.value) return false;
      if (statusFilter === "Active" && doc.status === "Archived") return false;
      if (statusFilter !== "Active" && statusFilter !== "All" && doc.status !== statusFilter) return false;
      if (!normalized) return true;
      const haystack = [
        doc.title,
        fileName(doc, tax),
        doc.game,
        doc.department,
        doc.category,
        doc.status,
        doc.summary,
        ...(doc.tags || []),
        doc.ownerId,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
    return filtered.sort((left, right) => {
      if (sort === "title") return (left.title || "").localeCompare(right.title || "");
      if (sort === "file") return fileName(left, tax).localeCompare(fileName(right, tax));
      return (right.updatedAt || 0) - (left.updatedAt || 0);
    });
  }, [docs, query, scope, sort, statusFilter, tax]);

  const effectiveGroup =
    scope.type === "game"
      ? scope.dept
        ? "category"
        : group === "game"
          ? "department"
          : group
      : group;

  function chooseScope(nextScope) {
    setScope(nextScope);
    if (nextScope.type === "game") {
      setOpenTitles((previous) => ({ ...previous, [nextScope.game]: true }));
    }
    setMenuOpen(false);
    if (drawer?.type !== "document") setDrawer(null);
    document.getElementById("canvas")?.scrollTo(0, 0);
  }

  function openDocument(doc = null, preset = {}) {
    const currentScope = scope;
    const formDoc = doc
      ? { ...doc, tags: [...(doc.tags || [])] }
      : {
          title: "",
          shortName: "",
          version: 1,
          game: preset.game || (currentScope.type === "game" ? currentScope.game : tax.games[0]?.name),
          department:
            currentScope.type === "game" && currentScope.dept ? currentScope.dept : "",
          category: currentScope.type === "category" ? currentScope.value : "",
          status: "Draft",
          link: "",
          summary: "",
          tags: [],
          pinned: false,
          ownerId: null,
        };
    setDrawer({ type: "document", doc: formDoc, isNew: !doc });
  }

  function saveDocument(form) {
    const title = form.title.trim();
    if (!title) return "Give the document a title.";
    for (const [field, label] of [
      ["game", "title"],
      ["department", "department"],
      ["category", "document type"],
    ]) {
      if (!form[field]) return `Choose a ${label}.`;
    }
    const normalized = {
      ...form,
      title,
      shortName: form.shortName.trim() ? slug(form.shortName) : "",
      version: Math.max(1, Number.parseInt(form.version, 10) || 1),
      link: form.link.trim()
        ? /^https?:\/\//i.test(form.link.trim())
          ? form.link.trim()
          : `https://${form.link.trim()}`
        : "",
      tags: form.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      summary: form.summary.trim(),
      updatedAt: Date.now(),
    };
    const docId = form._id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    normalized._id = docId;
    normalized.createdAt = form.createdAt || normalized.updatedAt;
    const conflict = docs.find(
      (doc) => doc._id !== docId && fileName(doc, tax) === fileName(normalized, tax),
    );
    if (conflict) {
      return `${fileName(normalized, tax)} is already used by “${conflict.title}”. Change the file name or bump the version.`;
    }
    setDocs((previous) =>
      form._id
        ? previous.map((doc) => (doc._id === docId ? normalized : doc))
        : [normalized, ...previous],
    );
    setToast(form._id ? "Changes saved" : `Added ${fileName(normalized, tax)}`);
    setDrawer(null);
    return "";
  }

  function deleteDocument(doc) {
    setDocs((previous) => previous.filter((item) => item._id !== doc._id));
    setToast("Document deleted");
    setDrawer(null);
  }

  function saveTaxonomy(nextTax) {
    const errors = [];
    for (const [kind, definition] of Object.entries(KINDS)) {
      const entries = nextTax[kind];
      if (!entries.length) errors.push(`Keep at least one ${definition.singular}.`);
      const names = entries.map((entry) => entry.name.trim().toLowerCase());
      const codes = entries.map((entry) => entry.code.trim().toUpperCase());
      if (names.some((name) => !name)) errors.push(`Every ${definition.singular} needs a name.`);
      if (codes.some((code) => !code)) errors.push(`Every ${definition.singular} needs a code.`);
      if (new Set(names).size !== names.length) errors.push(`Names must be unique in ${definition.label}.`);
      if (new Set(codes).size !== codes.length) errors.push(`Codes must be unique in ${definition.label}.`);
      const retainedKeys = new Set(entries.map((entry) => entry._key).filter(Boolean));
      const removed = tax[kind].filter((item) => !retainedKeys.has(item.name));
      const used = docs.some((doc) => removed.some((item) => doc[definition.field] === item.name));
      if (used) errors.push(`Move documents to another ${definition.singular} before removing it.`);
    }
    if (errors.length) return [...new Set(errors)].join(" ");

    const remaps = Object.fromEntries(
      Object.keys(KINDS).map((kind) => [
        kind,
        new Map(
          tax[kind]
            .map((oldEntry) => {
              const nextEntry = nextTax[kind].find((item) => item._key === oldEntry.name);
              return nextEntry && oldEntry.name !== nextEntry.name
                ? [oldEntry.name, nextEntry.name]
                : null;
            })
            .filter(Boolean),
        ),
      ]),
    );
    if (scope.type === "game") {
      const nextGame = remaps.games.get(scope.game);
      const nextDepartment = remaps.departments.get(scope.dept);
      if (nextGame || nextDepartment) {
        setScope({
          ...scope,
          ...(nextGame ? { game: nextGame } : {}),
          ...(nextDepartment ? { dept: nextDepartment } : {}),
        });
      }
      if (nextGame) {
        setOpenTitles((previous) => ({
          ...previous,
          [nextGame]: previous[scope.game] || false,
        }));
      }
    } else if (scope.type === "category") {
      const nextCategory = remaps.categories.get(scope.value);
      if (nextCategory) setScope({ ...scope, value: nextCategory });
    }
    setDocs((previous) =>
      previous.map((doc) => {
        const updated = { ...doc };
        for (const [kind, definition] of Object.entries(KINDS)) {
          const nextName = remaps[kind].get(doc[definition.field]);
          if (nextName) updated[definition.field] = nextName;
        }
        return updated;
      }),
    );
    setTax(
      Object.fromEntries(
        Object.keys(KINDS).map((kind) => [
          kind,
          nextTax[kind].map(({ _key, ...entry }) => ({
            ...entry,
            name: entry.name.trim(),
            code: entry.code.trim().toUpperCase(),
          })),
        ]),
      ),
    );
    setToast("Titles and categories saved");
    setDrawer(null);
    return "";
  }

  const titleCount = (title) =>
    docs.filter((doc) => doc.game === title && doc.status !== "Archived").length;
  const categoryCount = (category) =>
    docs.filter((doc) => doc.category === category && doc.status !== "Archived").length;
  const gameDepartments = tax.departments;
  const heading = (() => {
    if (scope.type === "home") return "Document Hub";
    if (scope.type === "all") return "All documents";
    if (scope.type === "pinned") return "Pinned";
    if (scope.type === "category") return scope.value;
    if (scope.type === "game" && scope.dept) return `${scope.game} / ${scope.dept}`;
    return scope.game || "Documents";
  })();
  const subtitle =
    scope.type === "home"
      ? `${docs.filter((doc) => doc.status !== "Archived").length} active documents across ${tax.games.length} titles`
      : `${visibleDocs.length} ${visibleDocs.length === 1 ? "document" : "documents"}`;

  return (
    <>
      <div className="app">
        <aside className={`side${menuOpen ? " open" : ""}`} aria-label="Library">
          <div className="brand">
            <span className="mark mark-text" aria-hidden="true">DH</span>
            <div>
              <b>Document Hub</b>
              <span>Project document library</span>
            </div>
          </div>
          <nav className="nav">
            <ul>
              <NavItem label="Home" icon="⌂" active={scope.type === "home"} onClick={() => chooseScope({ type: "home" })} />
              <NavItem label="All documents" icon="▤" count={docs.filter((doc) => doc.status !== "Archived").length} active={scope.type === "all"} onClick={() => chooseScope({ type: "all" })} />
              <NavItem label="Pinned" icon="☆" count={docs.filter((doc) => doc.pinned && doc.status !== "Archived").length} active={scope.type === "pinned"} onClick={() => chooseScope({ type: "pinned" })} />
            </ul>
            <div>
              <h4>Titles</h4>
              <ul>
                {tax.games.map((game) => (
                  <li key={game.name}>
                    <div className="tree-row">
                      <button
                        className="chev"
                        aria-expanded={!!openTitles[game.name]}
                        aria-label={`Show departments in ${game.name}`}
                        onClick={() =>
                          setOpenTitles((previous) => ({
                            ...previous,
                            [game.name]: !previous[game.name],
                          }))
                        }
                      >
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4.5 2.5 8 6l-3.5 3.5" /></svg>
                      </button>
                      <button
                        aria-current={scope.type === "game" && scope.game === game.name && !scope.dept}
                        onClick={() => chooseScope({ type: "game", game: game.name })}
                      >
                        <span className="dot" style={{ background: `var(--c${game.c % 8})` }} />
                        <span className="lbl tl">{game.name}</span>
                        <span className="code">{game.code}</span>
                        <span className="ct">{titleCount(game.name)}</span>
                      </button>
                    </div>
                    {openTitles[game.name] && (
                      <ul className="sub">
                        {gameDepartments.map((department) => {
                          const count = docs.filter(
                            (doc) =>
                              doc.game === game.name &&
                              doc.department === department.name &&
                              doc.status !== "Archived",
                          ).length;
                          return (
                            <li key={department.name}>
                              <button
                                aria-current={
                                  scope.type === "game" &&
                                  scope.game === game.name &&
                                  scope.dept === department.name
                                }
                                className={count ? "" : "zero"}
                                onClick={() =>
                                  chooseScope({
                                    type: "game",
                                    game: game.name,
                                    dept: department.name,
                                  })
                                }
                              >
                                <span className="dot" style={{ background: `var(--c${department.c % 8})` }} />
                                <span className="lbl">{department.name}</span>
                                <span className="ct">{count || ""}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Document types</h4>
              <ul>
                {tax.categories.map((category) => (
                  <NavItem
                    key={category.name}
                    label={category.name}
                    icon={<span className="dot" style={{ background: `var(--c${category.c % 8})` }} />}
                    count={categoryCount(category.name)}
                    active={scope.type === "category" && scope.value === category.name}
                    onClick={() => chooseScope({ type: "category", value: category.name })}
                  />
                ))}
              </ul>
            </div>
          </nav>
          <div className="side-tools">
            <button onClick={() => setDrawer({ type: "guide" })}><span className="ico">▧</span><span className="lbl">Naming guide</span></button>
            <button onClick={() => setDrawer({ type: "manage" })}><span className="ico">⚙</span><span className="lbl">Manage titles &amp; categories</span></button>
          </div>
          <div className="side-foot">{storageError ? "Storage issue" : "Saved in this browser"}</div>
        </aside>

        <main className="main">
          <div className="top">
            <button className="btn menu-btn" aria-label="Open library menu" onClick={() => setMenuOpen(true)}>☰ Browse</button>
            <h1>
              {heading}
              <small>{subtitle}</small>
            </h1>
            <button className="btn primary" onClick={() => openDocument()}>
              <span aria-hidden="true">＋</span> New document
            </button>
          </div>
          {scope.type !== "home" && (
            <div className="bar">
              <label className="search" htmlFor="q">
                <span aria-hidden="true">⌕</span>
                <input
                  id="q"
                  type="search"
                  placeholder="Search titles, file names, tags, owners"
                  autoComplete="off"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <kbd>/</kbd>
              </label>
              <div className="seg" role="group" aria-label="Layout">
                {["table", "board", "gallery"].map((layout) => (
                  <button
                    key={layout}
                    aria-pressed={view === layout}
                    onClick={() => setView(layout)}
                  >
                    {layout[0].toUpperCase() + layout.slice(1)}
                  </button>
                ))}
              </div>
              <label className="ctl">
                Group
                <select value={group} onChange={(event) => setGroup(event.target.value)} disabled={view === "board"}>
                  <option value="department">Department</option>
                  <option value="game">Title</option>
                  <option value="category">Type</option>
                  <option value="status">Status</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label className="ctl">
                Status
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option>Active</option>
                  <option>All</option>
                  {STATUSES.map((entry) => <option key={entry}>{entry}</option>)}
                </select>
              </label>
              <label className="ctl">
                Sort
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="updated">Recently updated</option>
                  <option value="title">Title A–Z</option>
                  <option value="file">File name</option>
                </select>
              </label>
            </div>
          )}
          {storageError && <div className="storage-warning" role="alert">{storageError}</div>}
          <section className="canvas" id="canvas" aria-live="polite">
            {scope.type === "home" ? (
              <Home
                docs={docs}
                tax={tax}
                onScope={chooseScope}
                onOpen={openDocument}
              />
            ) : visibleDocs.length === 0 ? (
              <div className="notice">
                <h3>{query || statusFilter !== "Active" ? "No matches" : "Nothing filed here yet"}</h3>
                {query || statusFilter !== "Active"
                  ? "Nothing in this view matches your search or status filter."
                  : "Documents you add to this view appear here."}
                <div style={{ marginTop: 14 }}>
                  <button className="btn primary" onClick={() => openDocument()}>Add a document</button>
                </div>
              </div>
            ) : view === "board" ? (
              <Board docs={visibleDocs} tax={tax} onOpen={openDocument} />
            ) : view === "gallery" ? (
              <Gallery docs={visibleDocs} tax={tax} group={effectiveGroup} onOpen={openDocument} />
            ) : (
              <Table
                docs={visibleDocs}
                tax={tax}
                group={effectiveGroup}
                collapsed={collapsedGroups}
                onToggle={(key) => setCollapsedGroups((previous) => ({ ...previous, [key]: !previous[key] }))}
                onOpen={openDocument}
              />
            )}
          </section>
        </main>
      </div>
      {menuOpen && <button className="mobile-scrim" aria-label="Close library menu" onClick={() => setMenuOpen(false)} />}
      {drawer && (
        <>
          <button className="scrim" aria-label="Close details" onClick={() => setDrawer(null)} />
          <aside className={`drawer${drawer.type === "manage" || drawer.type === "guide" ? " wide" : ""}`} aria-label="Details">
            {drawer.type === "document" ? (
              <DocumentForm
                key={drawer.doc._id || "new"}
                doc={drawer.doc}
                isNew={drawer.isNew}
                tax={tax}
                onClose={() => setDrawer(null)}
                onSave={saveDocument}
                onDelete={deleteDocument}
                onGuide={() => setDrawer({ type: "guide" })}
                onToast={setToast}
              />
            ) : drawer.type === "guide" ? (
              <NamingGuide tax={tax} docs={docs} onClose={() => setDrawer(null)} onManage={() => setDrawer({ type: "manage" })} />
            ) : (
              <TaxonomyManager
                tax={tax}
                docs={docs}
                onClose={() => setDrawer(null)}
                onSave={saveTaxonomy}
              />
            )}
          </aside>
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function NavItem({ label, icon, count, active, onClick }) {
  return (
    <li>
      <button aria-current={active ? "true" : undefined} onClick={onClick}>
        <span className="ico">{icon}</span>
        <span className="lbl">{label}</span>
        {count !== undefined && <span className="ct">{count}</span>}
      </button>
    </li>
  );
}

function Home({ docs, tax, onScope, onOpen }) {
  const recent = [...docs]
    .filter((doc) => doc.status !== "Archived")
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
    .slice(0, 6);
  return (
    <div className="home">
      <section>
        <h2>Titles <span>Pick a title, then a department</span></h2>
        <div className="tgrid">
          {tax.games.map((game) => {
            const gameDocs = docs.filter((doc) => doc.game === game.name && doc.status !== "Archived");
            const departments = tax.departments
              .map((department) => ({
                department,
                count: gameDocs.filter((doc) => doc.department === department.name).length,
              }))
              .filter((row) => row.count);
            return (
              <article className="tcard" style={{ "--cc": `var(--c${game.c % 8})` }} key={game.name}>
                <span className="band" />
                <button className="th" onClick={() => onScope({ type: "game", game: game.name })}>
                  <b>{game.name}</b><span className="badge">{game.code}</span>
                </button>
                <div className="tot">
                  {gameDocs.length} {gameDocs.length === 1 ? "document" : "documents"} · {departments.length}{" "}
                  {departments.length === 1 ? "department" : "departments"}
                </div>
                <ul>
                  {departments.length ? departments.map(({ department, count }) => (
                    <li key={department.name}>
                      <button onClick={() => onScope({ type: "game", game: game.name, dept: department.name })}>
                        <span>{department.name}</span><span className="n">{count}</span>
                      </button>
                    </li>
                  )) : <li className="empty">No documents filed yet</li>}
                </ul>
                <div className="tf">
                  <button className="btn ghost sm" onClick={() => onScope({ type: "game", game: game.name })}>Open</button>
                  <button className="btn ghost sm" onClick={() => onOpen(null, { game: game.name })}>＋ Add document</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <section>
        <h2>Recently updated</h2>
        <div className="recent">
          {recent.map((doc) => (
            <button key={doc._id} onClick={() => onOpen(doc)}>
              <span className="t"><b>{doc.title}</b><span className="mono">{fileName(doc, tax)}</span></span>
              <Chip tax={tax} kind="games" value={doc.game} />
              <span className="upd">{timeAgo(doc.updatedAt)}</span>
            </button>
          ))}
          {!recent.length && <div className="notice" style={{ border: 0 }}>Nothing filed yet.</div>}
        </div>
      </section>
    </div>
  );
}

function Table({ docs, tax, group, collapsed, onToggle, onOpen }) {
  const grouped = group === "none" ? [{ name: "", items: docs }] : getGroups(docs, group);
  return (
    <div className="tbl-wrap">
      <table>
        <thead><tr>
          <th style={{ width: "30%" }}>Document</th><th>Title</th><th>Department</th><th>Type</th>
          <th>Status</th><th>Owner</th><th>Ver</th><th>Updated</th><th>File</th>
        </tr></thead>
        <tbody>
          {grouped.map((entry) => {
            const key = `${group}:${entry.name}`;
            const isCollapsed = !!collapsed[key];
            return (
              <FragmentGroup
                key={key}
                entry={entry}
                group={group}
                collapsed={isCollapsed}
                onToggle={() => onToggle(key)}
                tax={tax}
                onOpen={onOpen}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentGroup({ entry, group, collapsed, onToggle, tax, onOpen }) {
  return (
    <>
      {group !== "none" && (
        <tr className={`grp${collapsed ? " closed" : ""}`} onClick={onToggle}>
          <td colSpan="9"><span className="caret">▾</span>{group === "status" ? <Status value={entry.name} /> : entry.name}<span className="ct">{entry.items.length}</span></td>
        </tr>
      )}
      {!collapsed && entry.items.map((doc) => (
        <tr className="row" key={doc._id} tabIndex="0" onClick={() => onOpen(doc)} onKeyDown={(event) => event.key === "Enter" && onOpen(doc)}>
          <td><div className="t-title"><b>{doc.title || "Untitled"}{doc.pinned && <span className="pin" title="Pinned">★</span>}</b><span className="mono">{fileName(doc, tax)}</span></div></td>
          <td><Chip tax={tax} kind="games" value={doc.game} /></td>
          <td><Chip tax={tax} kind="departments" value={doc.department} /></td>
          <td>{doc.category}</td><td><Status value={doc.status} /></td><td><Owner id={doc.ownerId} /></td>
          <td className="ver mono">v{String(doc.version || 1).padStart(2, "0")}</td>
          <td className="upd">{timeAgo(doc.updatedAt)}</td>
          <td>{doc.link ? <a className="linkicon on" href={doc.link} target="_blank" rel="noopener noreferrer" title="Open file" onClick={(event) => event.stopPropagation()}>↗</a> : <span className="linkicon" title="No link yet">↗</span>}</td>
        </tr>
      ))}
    </>
  );
}

function DocumentCard({ doc, tax, band = false, onOpen }) {
  return (
    <button className={`card${band ? " gcard" : ""}`} onClick={() => onOpen(doc)} style={{ "--cc": colorFor(tax, "games", doc.game) }}>
      {band && <span className="band" />}
      <b>{doc.title || "Untitled"}{doc.pinned && <span className="pin"> ★</span>}</b>
      <span className="mono">{fileName(doc, tax)}</span>
      {doc.summary && <p>{doc.summary}</p>}
      <span className="meta">
        <Chip tax={tax} kind="games" value={doc.game} />
        <Chip tax={tax} kind="departments" value={doc.department} />
        {(doc.tags || []).slice(0, 2).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
      </span>
      <span className="foot">{band ? <Status value={doc.status} /> : <span className="hint">{doc.category}</span>}<Owner id={doc.ownerId} /></span>
    </button>
  );
}

function Board({ docs, tax, onOpen }) {
  return (
    <div className="board">
      {STATUSES.map((status) => {
        const items = docs.filter((doc) => (doc.status || "Draft") === status);
        return <div className="col" key={status}>
          <h3><Status value={status} /><span className="ct">{items.length}</span></h3>
          {items.map((doc) => <DocumentCard key={doc._id} doc={doc} tax={tax} onOpen={onOpen} />)}
          {!items.length && <span className="hint" style={{ padding: 6 }}>Nothing here</span>}
        </div>;
      })}
    </div>
  );
}

function Gallery({ docs, tax, group, onOpen }) {
  const grouped = group === "none" ? [{ name: "Documents", items: docs }] : getGroups(docs, group);
  return <div className="gallery">{grouped.map((entry) => (
    <section key={entry.name}>
      <h3>{entry.name}<span className="ct">{entry.items.length}</span></h3>
      <div className="grid">{entry.items.map((doc) => <DocumentCard key={doc._id} doc={doc} tax={tax} band onOpen={onOpen} />)}</div>
    </section>
  ))}</div>;
}

function DocumentForm({ doc, isNew, tax, onClose, onSave, onDelete, onGuide, onToast }) {
  const [form, setForm] = useState({
    ...doc,
    tags: (doc.tags || []).join(", "),
    version: doc.version || 1,
  });
  const [error, setError] = useState("");
  const update = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const preview = fileName(
    {
      ...form,
      shortName: form.shortName || slug(form.title),
    },
    tax,
  );
  const copyFileName = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      onToast("File name copied");
    } catch {
      setError(`Copy this file name: ${preview}`);
    }
  };
  const submit = (event) => {
    event.preventDefault();
    setError(onSave(form));
  };

  return (
    <>
      <div className="dhead"><h2>{isNew ? "New document" : "Document"}</h2><button className="btn ghost" aria-label="Close" onClick={onClose}>✕</button></div>
      <form className="dbody" onSubmit={submit}>
        <input className="ttl" placeholder="Document title" value={form.title} onChange={(event) => update("title", event.target.value)} autoFocus={isNew} />
        <div className="fname">
          <code><span className="lab">Standard file name</span><span>{preview}</span></code>
          <button className="btn sm" type="button" onClick={copyFileName}>Copy</button>
        </div>
        <div className="props">
          <label htmlFor="f-game">Title</label>
          <div><select id="f-game" value={form.game} onChange={(event) => update("game", event.target.value)}><option value="">Choose…</option>{tax.games.map((item) => <option key={item.name}>{item.name}</option>)}</select></div>
          <label htmlFor="f-department">Department</label>
          <div><select id="f-department" value={form.department} onChange={(event) => update("department", event.target.value)}><option value="">Choose…</option>{tax.departments.map((item) => <option key={item.name}>{item.name}</option>)}</select></div>
          <label htmlFor="f-category">Document type</label>
          <div><select id="f-category" value={form.category} onChange={(event) => update("category", event.target.value)}><option value="">Choose…</option>{tax.categories.map((item) => <option key={item.name}>{item.name}</option>)}</select></div>
          <label htmlFor="f-short">File name</label>
          <div className="two">
            <input id="f-short" placeholder={slug(form.title)} value={form.shortName} onChange={(event) => update("shortName", event.target.value)} />
            <input type="number" min="1" max="99" aria-label="Version" value={form.version} onChange={(event) => update("version", event.target.value)} />
          </div>
          <label htmlFor="f-status">Status</label>
          <div><select id="f-status" value={form.status || "Draft"} onChange={(event) => update("status", event.target.value)}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></div>
          <label htmlFor="f-owner">Owner</label>
          <input id="f-owner" placeholder="Owner ID (optional)" value={form.ownerId || ""} onChange={(event) => update("ownerId", event.target.value || null)} />
          <label htmlFor="f-link">File link</label>
          <input id="f-link" type="url" placeholder="Google Drive, Figma, Notion URL…" value={form.link || ""} onChange={(event) => update("link", event.target.value)} />
          <label htmlFor="f-tags">Tags</label>
          <input id="f-tags" placeholder="investors, onboarding" value={form.tags} onChange={(event) => update("tags", event.target.value)} />
        </div>
        <div className="field"><label htmlFor="f-summary">Summary</label><textarea id="f-summary" placeholder="What is this document, and when should someone use it?" value={form.summary || ""} onChange={(event) => update("summary", event.target.value)} /></div>
        <label className="check"><input type="checkbox" checked={!!form.pinned} onChange={(event) => update("pinned", event.target.checked)} /> Pin to the top of every view</label>
        <span className="hint">File names follow the <button type="button" className="btn ghost sm" onClick={onGuide} style={{ padding: 0, color: "var(--peri)" }}>studio naming guide</button>.</span>
        {!isNew && doc.updatedAt && <span className="hint">Last updated {new Date(doc.updatedAt).toLocaleString()}</span>}
        <span className="err" role="alert">{error}</span>
        <div className="dfoot">
          {form.link && <a className="btn" href={form.link} target="_blank" rel="noopener noreferrer">↗ Open file</a>}
          <span className="sp" />
          {!isNew && <button className="btn ghost danger" type="button" onClick={() => window.confirm(`Delete “${doc.title}”?`) && onDelete(doc)}>Delete</button>}
          <button className="btn primary" type="submit">{isNew ? "Add document" : "Save changes"}</button>
        </div>
      </form>
    </>
  );
}

function NamingGuide({ tax, docs, onClose, onManage }) {
  const example = docs.find((doc) => doc.category && doc.department) || {
    game: tax.games[1]?.name || tax.games[0]?.name,
    department: "Game Design",
    category: "Design doc / GDD",
    title: "Game Design Document",
    version: 1,
  };
  const parts = fileName(example, tax).split("_");
  return (
    <>
      <div className="dhead"><h2>Naming guide</h2><button className="btn ghost" aria-label="Close" onClick={onClose}>✕</button></div>
      <div className="dbody guide">
        <p style={{ margin: 0, maxWidth: "62ch" }}>Every file stored in the hub, and the matching file in Drive, uses one name built from five parts. The hub builds it for you as you fill in a document.</p>
        <div className="pattern"><span className="tok-g">TITLE</span>_<span className="tok-d">DEPT</span>_<span className="tok-t">TYPE</span>_<span className="tok-n">Short-Name</span>_<span className="tok-v">v##</span></div>
        <div><span className="hint">Example from the library</span><div className="pattern" style={{ fontSize: 13, marginTop: 4 }}>{parts.map((part, index) => <span key={index}><span className={`tk tok-${["g", "d", "t", "n", "v"][index]}`}>{part}</span>{index < parts.length - 1 ? "_" : ""}</span>)}</div></div>
        <dl className="legend">
          <dt className="tok-g">TITLE</dt><dd>Code for the studio or game the document belongs to.</dd>
          <dt className="tok-d">DEPT</dt><dd>Code for the department that owns it.</dd>
          <dt className="tok-t">TYPE</dt><dd>Code for the kind of document.</dd>
          <dt className="tok-n">Short-Name</dt><dd>2–5 words in Title-Case, joined by hyphens. No spaces, dates or version words.</dd>
          <dt className="tok-v">v##</dt><dd>Two-digit version, starting at v01.</dd>
        </dl>
        <h3>Rules</h3>
        <ol>
          <li>Use underscores only between the five parts, and hyphens only inside the short name.</li>
          <li>Bump the version for a revision that changes meaning. Fix typos without bumping.</li>
          <li>Keep superseded versions as their own record set to Archived.</li>
          <li>Rename the Drive or Figma file to match before linking it here.</li>
          <li>Two documents can't share a file name.</li>
        </ol>
        <h3>Codes</h3>
        <div className="codes">{Object.entries(KINDS).map(([kind, definition]) => <div key={kind}><h4>{definition.label}</h4><ul>{tax[kind].map((item) => <li key={item.name}><span>{item.name}</span><span className="mono">{item.code}</span></li>)}</ul></div>)}</div>
        <div><button className="btn" onClick={onManage}>Edit titles and codes</button></div>
      </div>
    </>
  );
}

function TaxonomyManager({ tax, docs, onClose, onSave }) {
  const [tab, setTab] = useState("games");
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(
      Object.entries(tax).map(([kind, entries]) => [
        kind,
        entries.map((entry) => ({ ...entry, _key: entry.name })),
      ]),
    ),
  );
  const [error, setError] = useState("");
  const updateEntry = (index, field, value) => {
    setDraft((previous) => ({
      ...previous,
      [tab]: previous[tab].map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              [field]: field === "code" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "") : value,
            }
          : entry,
      ),
    }));
  };
  const addEntry = () => {
    const code = `NEW${draft[tab].length}`.slice(0, 4);
    setDraft((previous) => ({
      ...previous,
      [tab]: [...previous[tab], { name: "", code, c: previous[tab].length % 8, _key: null }],
    }));
  };
  const removeEntry = (index) => {
    setDraft((previous) => ({
      ...previous,
      [tab]: previous[tab].filter((_, entryIndex) => entryIndex !== index),
    }));
  };
  const save = () => {
    const problem = onSave(draft);
    setError(problem);
  };
  return (
    <>
      <div className="dhead"><h2>Titles &amp; categories</h2><button className="btn ghost" aria-label="Close" onClick={onClose}>✕</button></div>
      <div className="tabs" role="tablist">
        {Object.entries(KINDS).map(([key, definition]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{definition.label}</button>)}
      </div>
      <div className="dbody">
        <span className="hint">Codes are used in each standard file name. Renaming a title or category updates every document that uses it.</span>
        <div className="mhead"><span /><span>Name</span><span>Code</span><span>Used</span><span /></div>
        <div className="manager-rows">
          {draft[tab].map((entry, index) => (
            <div className="mrow" key={`${entry._key || "new"}-${index}`}>
              <button className="swatch" style={{ "--cc": `var(--c${entry.c % 8})` }} aria-label="Cycle color" onClick={() => updateEntry(index, "c", (entry.c + 1) % 8)} />
              <input aria-label="Name" value={entry.name} placeholder={`${KINDS[tab].singular} name`} onChange={(event) => updateEntry(index, "name", event.target.value)} />
              <input className="mono" aria-label="Code" maxLength="4" value={entry.code} onChange={(event) => updateEntry(index, "code", event.target.value)} />
              <span className="n">{docs.filter((doc) => doc[KINDS[tab].field] === entry._key).length} docs</span>
              <span className="acts"><button type="button" aria-label="Move up" disabled={!index} onClick={() => setDraft((previous) => {
                const next = [...previous[tab]];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                return { ...previous, [tab]: next };
              })}>↑</button><button type="button" aria-label="Move down" disabled={index === draft[tab].length - 1} onClick={() => setDraft((previous) => {
                const next = [...previous[tab]];
                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                return { ...previous, [tab]: next };
              })}>↓</button><button type="button" aria-label={`Remove ${entry.name || "entry"}`} onClick={() => removeEntry(index)}>✕</button></span>
            </div>
          ))}
        </div>
        <div><button className="btn" type="button" onClick={addEntry}>＋ Add {KINDS[tab].singular}</button></div>
        <span className="err" role="alert">{error}</span>
      </div>
      <div className="dfoot"><span className="hint">Changes are saved in this browser.</span><span className="sp" /><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save changes</button></div>
    </>
  );
}

export default App;
