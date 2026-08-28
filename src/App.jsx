import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import { downloadRulebookPDF } from "./lib/pdf";
const BBT_DEPARTMENTS = [
  { id: 1, name: "Sales" },
  { id: 2, name: "Marketing" },
  { id: 3, name: "DGM / Digital" },
  { id: 4, name: "Operations" },
  { id: 5, name: "Projects" },
  { id: 6, name: "Procurement" },
  { id: 7, name: "Admin" },
  { id: 8, name: "Accounts" },
];
const EMPTY_FORM = {
  name: "",
  designation: "",
  department_id: "",
  mistake_title: "",
  project_name: "",
  finding: "",
  learning: "",
  solution: "",
  mistake_date: "",
};

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("bbt_user")) || null;
    } catch {
      return null;
    }
  });

  const [page, setPage] = useState("dashboard");
  const [loading, setLoading] = useState(false);

  const [departments, setDepartments] =
  useState(BBT_DEPARTMENTS);
  const [entries, setEntries] = useState([]);
  const [cases, setCases] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [loginMessage, setLoginMessage] = useState("");

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  async function loadData() {
    setLoading(true);

    const isAdmin = user?.role === "admin";
    const myDepartmentId = user?.department_id
      ? Number(user.department_id)
      : null;

    const [departmentsResult, entriesResult, casesResult] =
      await Promise.all([
        supabase
          .from("departments")
          .select("*")
          .order("name"),

        isAdmin || !myDepartmentId
          ? supabase
              .from("rulebook_entries")
              .select("*, departments(name)")
              .order("rulebook_number", {
                ascending: false,
              })
          : supabase
              .from("rulebook_entries")
              .select("*, departments(name)")
              .eq("department_id", myDepartmentId)
              .order("rulebook_number", {
                ascending: false,
              }),

        supabase
          .from("case_studies")
          .select(
            "*, rulebook_entries(rulebook_number, mistake_title, department_id)"
          )
          .order("created_at", {
            ascending: false,
          }),
      ]);

    if (departmentsResult.error) {
      setDepartments(
        isAdmin
          ? BBT_DEPARTMENTS
          : BBT_DEPARTMENTS.filter(
              (department) =>
                String(department.id) ===
                String(myDepartmentId)
            )
      );
    } else {
      const dbDepartments =
        departmentsResult.data || [];

      setDepartments(
        isAdmin
          ? dbDepartments.length
            ? dbDepartments
            : BBT_DEPARTMENTS
          : dbDepartments.filter(
              (department) =>
                String(department.id) ===
                String(myDepartmentId)
            )
      );
    }

    if (entriesResult.error) {
      setEntries([]);
      setMessage(entriesResult.error.message);
    } else {
      setEntries(entriesResult.data || []);
    }

    if (casesResult.error) {
      setCases([]);
    } else {
      const loadedCases =
        casesResult.data || [];

      setCases(
        isAdmin || !myDepartmentId
          ? loadedCases
          : loadedCases.filter(
              (item) =>
                String(
                  item.rulebook_entries?.department_id
                ) ===
                String(myDepartmentId)
            )
      );
    }

    setLoading(false);
  }

  async function login(event) {
    event.preventDefault();

    setLoginMessage("");

    if (!username.trim() || !pin.trim()) {
      setLoginMessage(
        "Enter your username and PIN."
      );
      return;
    }

    const { data, error } =
      await supabase.rpc("bbt_login", {
        p_username: username.trim(),
        p_pin: pin,
      });

    if (error) {
      setLoginMessage(error.message);
      return;
    }

    if (!data?.success) {
      setLoginMessage(
        data?.message ||
          "Invalid username or PIN."
      );
      return;
    }

    localStorage.setItem(
      "bbt_user",
      JSON.stringify(data.user)
    );

    setUser(data.user);
    setUsername("");
    setPin("");
  }

  function logout() {
    localStorage.removeItem("bbt_user");
    setUser(null);
    setPage("dashboard");
  }

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveRulebook(event) {
    event.preventDefault();

    setMessage("");

    const words = form.mistake_title
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3);

    const similarEntries = entries.filter(
      (entry) => {
        const existingText = [
          entry.mistake_title,
          entry.finding,
          entry.learning,
          entry.solution,
        ]
          .join(" ")
          .toLowerCase();

        const matches = words.filter(
          (word) =>
            existingText.includes(word)
        );

        return (
          words.length >= 2 &&
          matches.length >= 2
        );
      }
    );

    if (
      similarEntries.length > 0
    ) {
      const first =
        similarEntries[0];

      const continueSaving = window.confirm(
        `Similar Rulebook case found: #${first.rulebook_number} â€” ${first.mistake_title}\n\nDo you want to save this as a new case anyway?`
      );

      if (!continueSaving) {
        return;
      }
    }

    const { error } =
      await supabase
        .from("rulebook_entries")
        .insert({
          name: user.full_name,
          designation:
            user.designation || null,

          department_id:
            user.department_id || null,

          mistake_title:
            form.mistake_title,

          project_name:
            form.project_name || null,

          finding: form.finding,

          learning: form.learning,

          solution: form.solution,

          mistake_date:
            form.mistake_date ||
            new Date()
              .toISOString()
              .slice(0, 10),

          user_id: user.id,
        });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      "Rulebook entry saved successfully."
    );

    setForm(EMPTY_FORM);
    setShowForm(false);

    await loadData();
  }

  async function createCaseStudy(
    entry
  ) {
    const { error } =
      await supabase
        .from("case_studies")
        .upsert(
          {
            rulebook_entry_id:
              entry.id,

            title:
              entry.mistake_title,

            summary:
              entry.learning,
          },
          {
            onConflict:
              "rulebook_entry_id",
          }
        );

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      "Case Study created successfully."
    );

    await loadData();
  }

  const visibleEntries =
    useMemo(() => {
      const query =
        search.toLowerCase().trim();

      return entries.filter(
        (entry) => {
          const text = [
            entry.mistake_title,
            entry.name,
            entry.project_name,
            entry.finding,
            entry.learning,
            entry.solution,
            entry.departments?.name,
          ]
            .join(" ")
            .toLowerCase();

          const searchMatch =
            !query ||
            text.includes(query);

          const selectedDepartmentMatch =
            !departmentFilter ||
            String(entry.department_id) ===
              String(departmentFilter);

          const userDepartmentMatch =
            user.role === "admin" ||
            String(entry.department_id) ===
              String(user.department_id);

          return (
            searchMatch &&
            selectedDepartmentMatch &&
            userDepartmentMatch
          );
        }
      );
    }, [
      entries,
      search,
      departmentFilter,
    ]);

  if (!user) {
    return (
      <Login
        username={username}
        setUsername={setUsername}
        pin={pin}
        setPin={setPin}
        message={loginMessage}
        login={login}
      />
    );
  }

  if (loading) {
    return (
      <div style={styles.center}>
        Loading BBT...
      </div>
    );
  }

  if (
    user.role !== "admin" &&
    (page === "users" || page === "departments")
  ) {
    setPage("dashboard");
    return (
      <div style={styles.center}>
        Loading BBT...
      </div>
    );
  }

  return (
    <div className="bbt-app">

      <aside className="bbt-sidebar">

        <div className="bbt-brand">
          <div className="bbt-brand-mark">BBT</div>

          <div>
            <div className="bbt-brand-name">Black Box Thinking</div>
            <div className="bbt-brand-subtitle">
              Black Box Thinking
            </div>
          </div>
        </div>

        <nav className="bbt-navigation">

          <div className="bbt-nav-section-title">
            WORKSPACE
          </div>

          <button
            className={
              page === "dashboard"
                ? "bbt-nav-item active"
                : "bbt-nav-item"
            }
            onClick={() => setPage("dashboard")}
          >
            <span className="bbt-nav-icon">⌂</span>
            <span>Dashboard</span>
          </button>

          <button
            className={
              page === "rulebook"
                ? "bbt-nav-item active"
                : "bbt-nav-item"
            }
            onClick={() => setPage("rulebook")}
          >
            <span className="bbt-nav-icon">▤</span>
            <span>Rulebook</span>
          </button>

          <button
            className={
              page === "cases"
                ? "bbt-nav-item active"
                : "bbt-nav-item"
            }
            onClick={() => setPage("cases")}
          >
            <span className="bbt-nav-icon">▣</span>
            <span>Case Studies</span>
          </button>

          {user.role === "admin" && (
            <>
              <div className="bbt-nav-section-title admin">
                ADMINISTRATION
              </div>

              <button
                className={
                  page === "users"
                    ? "bbt-nav-item active"
                    : "bbt-nav-item"
                }
                onClick={() => setPage("users")}
              >
                <span className="bbt-nav-icon">♙</span>
                <span>User Management</span>
              </button>

              <button
                className={
                  page === "departments"
                    ? "bbt-nav-item active"
                    : "bbt-nav-item"
                }
                onClick={() => setPage("departments")}
              >
                <span className="bbt-nav-icon">▦</span>
                <span>Departments</span>
              </button>
            </>
          )}

        </nav>

        <div className="bbt-sidebar-bottom">

          <div className="bbt-profile-card">
  <div className="bbt-profile-info">
    <strong>{user.role === "admin" ? "BBT Administrator" : `${getDepartmentName(departments, user.department_id)} User`}</strong>
  </div>
</div>

<button
  className="bbt-logout"
            onClick={logout}
          >
            <span>↪</span>
            Logout
          </button>

        </div>

      </aside>

      <main className="bbt-main">

        <header className="bbt-topbar">

          <div className="bbt-mobile-menu">
            ☰
          </div>

          <div className="bbt-search">

            <span className="bbt-search-icon">
              ⌕
            </span>

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search mistakes, learnings, cases..."
            />

          </div>

          <div className="bbt-topbar-right">

            <button className="bbt-notification">
              ♧
              <span>3</span>
            </button>          </div>

        </header>

        <div className="bbt-content">

          {message && (
            <div className="bbt-message">
              <span>{message}</span>

              <button
                onClick={() => setMessage("")}
              >
                ×
              </button>
            </div>
          )}

          {page === "dashboard" && (
            <Dashboard
              entries={entries}
              cases={cases}
              departments={departments}
              isAdmin={user.role === "admin"}
              user={user}
              onAddMistake={() => {
                setForm(EMPTY_FORM);
                setShowForm(true);
              }}
              onPageChange={setPage}
            />
          )}

          {page === "rulebook" && (
            <Rulebook
              entries={visibleEntries}
              departments={departments}
              search={search}
              setSearch={setSearch}
              departmentFilter={departmentFilter}
              setDepartmentFilter={setDepartmentFilter}
              createCaseStudy={createCaseStudy}
              onViewEntry={setSelectedEntry}
              isAdmin={user.role === "admin"}
            />
          )}

          {page === "cases" && (
            <CaseStudies cases={cases} />
          )}

          {page === "departments" &&
            user.role === "admin" && (
              <Departments
                departments={departments}
                entries={entries}
              />
            )}

          {page === "users" &&
            user.role === "admin" && (
              <UserManagement
                departments={departments}
                message={setMessage}
                currentUser={user}
              />
            )}

          {showForm && (
            <div className="bbt-modal-overlay">

              <div className="bbt-modal">

                <div className="bbt-modal-header">

                  <div>
                    <span className="bbt-modal-eyebrow">
                      RULEBOOK
                    </span>

                    <h2>Add Mistake</h2>

                    <p>
                      Capture the mistake so the team
                      can learn from it.
                    </p>
                  </div>

                  <button
                    className="bbt-close"
                    onClick={() =>
                      setShowForm(false)
                    }
                  >
                    ×
                  </button>

                </div>

                <form
                  onSubmit={saveRulebook}
                  className="bbt-form"
                >

                  <Field
                    label="Mistake Title"
                    value={form.mistake_title}
                    required
                    onChange={(value) =>
                      updateForm(
                        "mistake_title",
                        value
                      )
                    }
                  />

                  <Field
                    label="Project Name"
                    value={form.project_name}
                    onChange={(value) =>
                      updateForm(
                        "project_name",
                        value
                      )
                    }
                  />

                  <Field
                    label="Date"
                    type="date"
                    value={form.mistake_date}
                    onChange={(value) =>
                      updateForm(
                        "mistake_date",
                        value
                      )
                    }
                  />

                  <TextArea
                    label="Finding"
                    value={form.finding}
                    required
                    onChange={(value) =>
                      updateForm(
                        "finding",
                        value
                      )
                    }
                  />

                  <TextArea
                    label="Learning"
                    value={form.learning}
                    required
                    onChange={(value) =>
                      updateForm(
                        "learning",
                        value
                      )
                    }
                  />

                  <TextArea
                    label="Solution"
                    value={form.solution}
                    required
                    onChange={(value) =>
                      updateForm(
                        "solution",
                        value
                      )
                    }
                  />

                  <div className="bbt-department-lock">

                    <div>
                      <span>Your Department</span>
                      <strong>
                        {getDepartmentName(
                          departments,
                          user.department_id
                        )}
                      </strong>
                    </div>

                    <span className="bbt-lock">
                      🔒
                    </span>

                  </div>

                  <div className="bbt-form-actions">

                    <button
                      type="button"
                      className="bbt-secondary-button"
                      onClick={() =>
                        setShowForm(false)
                      }
                    >
                      Cancel
                    </button>

                    <button
                      className="bbt-primary-button"
                    >
                      Save Rulebook
                    </button>

                  </div>

                </form>

              </div>

            </div>
          )}

        </div>

        {selectedEntry && (
          <div className="bbt-modal-overlay">
            <div className="bbt-modal learning-modal">

              <div className="learning-modal-header">
                <div>
                  <span className="page-eyebrow">
                    RULEBOOK #{selectedEntry.rulebook_number}
                  </span>

                  <h2>{selectedEntry.mistake_title}</h2>

                  <p>
                    {selectedEntry.project_name || "General"}
                    {" · "}
                    {selectedEntry.mistake_date || "No date"}
                  </p>
                </div>

                <button
                  type="button"
                  className="bbt-close"
                  onClick={() => setSelectedEntry(null)}
                >
                  ×
                </button>
              </div>

              <div className="learning-meta">
                <div>
                  <span>CAPTURED BY</span>
                  <strong>
                    {selectedEntry.name || "Team member"}
                  </strong>
                </div>

                <div>
                  <span>DEPARTMENT</span>
                  <strong>
                    {selectedEntry.departments?.name ||
                      getDepartmentName(
                        departments,
                        selectedEntry.department_id
                      )}
                  </strong>
                </div>
              </div>

              <div className="learning-content">

                <article className="learning-block">
                  <div className="learning-block-number">
                    01
                  </div>

                  <div>
                    <span>FINDING</span>
                    <p>
                      {selectedEntry.finding ||
                        "No finding recorded."}
                    </p>
                  </div>
                </article>

                <article className="learning-block highlight">
                  <div className="learning-block-number">
                    02
                  </div>

                  <div>
                    <span>LEARNING</span>
                    <p>
                      {selectedEntry.learning ||
                        "No learning recorded."}
                    </p>
                  </div>
                </article>

                <article className="learning-block">
                  <div className="learning-block-number">
                    03
                  </div>

                  <div>
                    <span>SOLUTION</span>
                    <p>
                      {selectedEntry.solution ||
                        "No solution recorded."}
                    </p>
                  </div>
                </article>

              </div>

              <div className="learning-modal-footer">

                <button
                  type="button"
                  className="bbt-secondary-button"
                  onClick={() => setSelectedEntry(null)}
                >
                  Close
                </button>

                <button
                  type="button"
                  className="bbt-primary-button"
                  onClick={() => {
                    createCaseStudy(selectedEntry);
                    setSelectedEntry(null);
                  }}
                >
                  Create Case Study →
                </button>

              </div>

            </div>
          </div>
        )}
      </main>

    </div>
  );
}
function Login({
  username,
  setUsername,
  pin,
  setPin,
  message,
  login,
}) {
  return (
    <div
      style={
        styles.loginPage
      }
    >
      <form
        style={
          styles.loginCard
        }
        onSubmit={login}
      >
        <div
          style={
            styles.logo
          }
        >
          B
        </div>

        <h1>BBT</h1>

        <p>
          Black Box Thinking
        </p>

        <input
          style={
            styles.input
          }
          placeholder="Username"
          value={username}
          onChange={(e) =>
            setUsername(
              e.target.value
            )
          }
          autoComplete="username"
          required
        />

        <input
          style={
            styles.input
          }
          type="password"
          inputMode="numeric"
          placeholder="PIN"
          value={pin}
          onChange={(e) =>
            setPin(
              e.target.value
            )
          }
          autoComplete="current-password"
          required
        />

        {message && (
          <div
            style={
              styles.error
            }
          >
            {message}
          </div>
        )}

        <button
          style={
            styles.primaryButton
          }
        >
          LOGIN
        </button>
      </form>
    </div>
  );
}

function Dashboard({
  entries,
  cases,
  departments,
  isAdmin,
  user,
  onAddMistake,
  onPageChange,
}) {
  const totalEntries = entries.length;
  const totalCases = cases.length;

  const myDepartment = departments.find(
    (department) =>
      String(department.id) ===
      String(user?.department_id)
  );

  const departmentName = isAdmin
    ? "All Departments"
    : myDepartment?.name || "My Department";

  const learningRate = totalEntries
    ? Math.min(
        100,
        Math.round(
          (totalCases / Math.max(totalEntries, 1)) * 100
        )
      )
    : 0;

  const recentEntries = [...entries]
    .sort(
      (a, b) =>
        new Date(b.mistake_date || 0) -
        new Date(a.mistake_date || 0)
    )
    .slice(0, 5);

  const departmentEntries = isAdmin
    ? entries
    : entries.filter(
        (entry) =>
          String(entry.department_id) ===
          String(user?.department_id)
      );

  return (
    <div className="dashboard-page">

      <section className="dashboard-welcome">

        <div>
          <span className="dashboard-eyebrow">
            {isAdmin
              ? "ORGANIZATION OVERVIEW"
              : `${departmentName.toUpperCase()} WORKSPACE`}
          </span>

          <h2>
            {isAdmin
              ? "Turn mistakes into"
              : `${departmentName} learning into`}
            <span> better decisions.</span>
          </h2>

          <p>
            {isAdmin
              ? "Capture what happened, understand what was learned, and make sure the organization does not repeat the same mistake twice."
              : `Capture ${departmentName} mistakes, learn from them, and make better decisions the next time.`}
          </p>
        </div>

        <div className="dashboard-welcome-art">
          <div className="welcome-orbit orbit-one"></div>
          <div className="welcome-orbit orbit-two"></div>

          <div className="welcome-symbol">
            B
          </div>
        </div>

      </section>


      <section className="dashboard-stats">

        <div className="dashboard-stat purple">

          <div className="stat-icon">
            ▤
          </div>

          <div>
            <span>
              {isAdmin
                ? "Rulebook Entries"
                : "My Rulebook"}
            </span>

            <strong>
              {totalEntries}
            </strong>

            <small>
              {isAdmin
                ? "Learning captured"
                : `${departmentName} learning`}
            </small>
          </div>

        </div>


        <div className="dashboard-stat green">

          <div className="stat-icon">
            ✓
          </div>

          <div>
            <span>
              Case Studies
            </span>

            <strong>
              {totalCases}
            </strong>

            <small>
              Lessons documented
            </small>
          </div>

        </div>


        <div className="dashboard-stat orange">

          <div className="stat-icon">
            ✦
          </div>

          <div>
            <span>
              {isAdmin
                ? "Departments"
                : "My Department"}
            </span>

            <strong>
              {isAdmin ? departments.length : 1}
            </strong>

            <small>
              {isAdmin
                ? "Teams learning together"
                : departmentName}
            </small>
          </div>

        </div>


        <div className="dashboard-stat blue">

          <div className="stat-icon">
            ↗
          </div>

          <div>
            <span>
              Learning Rate
            </span>

            <strong>
              {learningRate}%
            </strong>

            <small>
              Entries converted to cases
            </small>
          </div>

        </div>

      </section>


      <div className="dashboard-grid">


        <section className="dashboard-card recent-card">

          <div className="dashboard-card-header">

            <div>
              <span className="card-kicker">
                {isAdmin
                  ? "LEARNING LIBRARY"
                  : `${departmentName.toUpperCase()} LIBRARY`}
              </span>

              <h3>
                Recent Rulebook Entries
              </h3>

              <p>
                {isAdmin
                  ? "The latest mistakes captured by the organization."
                  : `The latest mistakes captured by ${departmentName}.`}
              </p>
            </div>

            <span className="card-count">
              {totalEntries}
            </span>

          </div>


          {recentEntries.length ? (

            <div className="recent-entry-list">

              {recentEntries.map((entry) => (

                <div
                  className="recent-entry"
                  key={entry.id}
                >

                  <div className="recent-number">
                    #{entry.rulebook_number}
                  </div>

                  <div className="recent-info">

                    <strong>
                      {entry.mistake_title}
                    </strong>

                    <span>
                      {entry.project_name || "General"}{" "}
                      ·{" "}
                      {entry.mistake_date || "No date"}
                    </span>

                  </div>

                  <div className="recent-arrow">
                    →
                  </div>

                </div>

              ))}

            </div>

          ) : (

            <div className="dashboard-empty">

              <div className="empty-illustration">
                ✦
              </div>

              <h4>
                No learning captured yet
              </h4>

              <p>
                Start by recording the first mistake
                and turn it into a useful lesson.
              </p>

              <button
                className="quick-action primary-action"
                style={{
                  marginTop: "12px",
                  width: "auto",
                  padding: "0 14px",
                }}
                onClick={onAddMistake}
              >
                <strong>
                  + Add First Mistake
                </strong>
              </button>

            </div>

          )}

        </section>


        <section className="dashboard-card department-card">

          <div className="dashboard-card-header">

            <div>
              <span className="card-kicker">
                {isAdmin
                  ? "ORGANIZATION"
                  : "YOUR DEPARTMENT"}
              </span>

              <h3>
                {departmentName}
              </h3>

              <p>
                {isAdmin
                  ? "Learning activity across every department."
                  : `Learning activity inside ${departmentName}.`}
              </p>
            </div>

          </div>


          <div className="department-list">

            {isAdmin ? (

              departments.map((department) => {

                const count =
                  entries.filter(
                    (entry) =>
                      String(entry.department_id) ===
                      String(department.id)
                  ).length;

                const percentage =
                  totalEntries
                    ? Math.round(
                        (count /
                          totalEntries) *
                          100
                      )
                    : 0;

                return (
                  <div
                    className="department-item"
                    key={department.id}
                  >

                    <div className="department-name">

                      <div className="department-avatar">
                        {department.name.charAt(0)}
                      </div>

                      <span>
                        {department.name}
                      </span>

                    </div>

                    <div className="department-progress">

                      <div>
                        <span
                          style={{
                            width:
                              `${percentage}%`,
                          }}
                        />
                      </div>

                      <strong>
                        {count}
                      </strong>

                    </div>

                  </div>
                );
              })

            ) : (

              <div className="department-single">

                <div className="department-large-icon">
                  {departmentName.charAt(0)}
                </div>

                <strong>
                  {departmentName}
                </strong>

                <span>
                  {departmentEntries.length}{" "}
                  rulebook{" "}
                  {departmentEntries.length === 1
                    ? "entry"
                    : "entries"}{" "}
                  captured
                </span>

                <div className="department-single-bar">
                  <span
                    style={{
                      width:
                        departmentEntries.length
                          ? "100%"
                          : "0%",
                    }}
                  />
                </div>

              </div>

            )}

          </div>

        </section>


        <section className="dashboard-card quick-card">

          <div className="dashboard-card-header">

            <div>
              <span className="card-kicker">
                GET THINGS DONE
              </span>

              <h3>
                Quick Actions
              </h3>

              <p>
                Jump straight into your most useful tools.
              </p>
            </div>

          </div>


          <div className="quick-actions">

            <button
              className="quick-action primary-action"
              onClick={onAddMistake}
            >

              <div className="quick-action-icon">
                +
              </div>

              <div>
                <strong>
                  Add a Mistake
                </strong>

                <span>
                  Capture a new learning
                </span>
              </div>

              <b>
                →
              </b>

            </button>


            <button
              className="quick-action"
              onClick={() =>
                onPageChange("rulebook")
              }
            >

              <div className="quick-action-icon">
                ▤
              </div>

              <div>
                <strong>
                  Browse Rulebook
                </strong>

                <span>
                  Explore past learnings
                </span>
              </div>

              <b>
                →
              </b>

            </button>


            <button
              className="quick-action"
              onClick={() =>
                onPageChange("cases")
              }
            >

              <div className="quick-action-icon">
                ✓
              </div>

              <div>
                <strong>
                  Case Studies
                </strong>

                <span>
                  See lessons in action
                </span>
              </div>

              <b>
                →
              </b>

            </button>

          </div>

        </section>


        <section className="dashboard-card learning-card">

          <div className="dashboard-card-header">

            <div>
              <span className="card-kicker">
                BLACK BOX THINKING
              </span>

              <h3>
                The Learning Loop
              </h3>

              <p>
                Every mistake follows a simple path.
              </p>

            </div>

          </div>


          <div className="learning-loop">

            <div className="loop-step">

              <div className="loop-number">
                01
              </div>

              <strong>
                Capture
              </strong>

              <span>
                What happened?
              </span>

            </div>


            <div className="loop-line">
              →
            </div>


            <div className="loop-step">

              <div className="loop-number">
                02
              </div>

              <strong>
                Learn
              </strong>

              <span>
                Why did it happen?
              </span>

            </div>


            <div className="loop-line">
              →
            </div>


            <div className="loop-step">

              <div className="loop-number">
                03
              </div>

              <strong>
                Improve
              </strong>

              <span>
                What changes now?
              </span>

            </div>

          </div>

        </section>


      </div>

    </div>
  );
}


function Rulebook({
  entries,
  departments,
  search,
  setSearch,
  departmentFilter,
  setDepartmentFilter,
  createCaseStudy,
  onViewEntry,
  isAdmin,
}) {
  return (
    <div className="rulebook-page">

      <div className="page-heading">

        <div>
          <span className="page-eyebrow">
            BLACK BOX THINKING
          </span>

          <h1>
            {isAdmin
              ? "Rulebook"
              : "My Rulebook"}
          </h1>

          <p>
            {isAdmin
              ? "A searchable record of mistakes, learnings and solutions across the organization."
              : "Review the mistakes, learnings and solutions captured by your department."}
          </p>
        </div>

        <div className="page-heading-count">
          <strong>{entries.length}</strong>
          <span>
            {entries.length === 1
              ? "Entry"
              : "Entries"}
          </span>
        </div>

      </div>


      <section className="rulebook-card">

        <div className="rulebook-toolbar">

          <div className="rulebook-search">

            <span>
              ⌕
            </span>

            <input
              placeholder="Search mistakes, projects or people..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />

            {search && (
              <button
                onClick={() => setSearch("")}
                type="button"
              >
                ×
              </button>
            )}

          </div>


          {isAdmin && (
            <select
              value={departmentFilter}
              onChange={(e) =>
                setDepartmentFilter(e.target.value)
              }
            >
              <option value="">
                All Departments
              </option>

              {departments.map((department) => (
                <option
                  key={department.id}
                  value={department.id}
                >
                  {department.name}
                </option>
              ))}

            </select>
          )}

        </div>


        <div className="rulebook-table-wrap">

          <table className="rulebook-table">

            <thead>
              <tr>
                <th>RULE</th>
                <th>MISTAKE</th>
                <th>
                  {isAdmin
                    ? "DEPARTMENT"
                    : "PROJECT"}
                </th>
                {isAdmin && (
                  <th>PROJECT</th>
                )}
                <th>DATE</th>
                <th></th>
              </tr>
            </thead>


            <tbody>

              {entries.map((entry) => (

                <tr key={entry.id}>

                  <td>
                    <span className="rule-number">
                      #{entry.rulebook_number}
                    </span>
                  </td>


                  <td>

                    <div className="rule-mistake">

                      <strong>
                        {entry.mistake_title}
                      </strong>

                      <span>
                        {entry.name || "Team member"}
                      </span>

                    </div>

                  </td>


                  {isAdmin && (
                    <td>
                      <span className="department-pill">
                        {entry.departments?.name || "—"}
                      </span>
                    </td>
                  )}


                  <td>
                    <span className="project-text">
                      {entry.project_name || "General"}
                    </span>
                  </td>


                  <td>
                    <span className="date-text">
                      {entry.mistake_date || "—"}
                    </span>
                  </td>


                  <td>

                    <button
                      type="button"
                      className="case-button"
                      onClick={() => onViewEntry(entry)}
                    >
                      View Learning →
                    </button>

                  </td>

                </tr>

              ))}


              {!entries.length && (

                <tr>

                  <td
                    colSpan={isAdmin ? "6" : "5"}
                  >

                    <div className="rulebook-empty">

                      <div className="rulebook-empty-icon">
                        ▤
                      </div>

                      <strong>
                        {search
                          ? "No matching entries"
                          : "Your Rulebook is empty"}
                      </strong>

                      <span>
                        {search
                          ? "Try a different search term."
                          : "Mistakes captured by your team will appear here."}
                      </span>

                    </div>

                  </td>

                </tr>

              )}

            </tbody>

          </table>

        </div>

      </section>

    </div>
  );
}


function CaseStudies({
  cases,
}) {
  return (
    <div className="case-studies-page">

      <div className="page-heading">

        <div>
          <span className="page-eyebrow">
            BLACK BOX THINKING
          </span>

          <h1>
            Case Studies
          </h1>

          <p>
            Turn recorded mistakes into practical lessons
            the team can use.
          </p>
        </div>

        <div className="page-heading-count">
          <strong>{cases.length}</strong>
          <span>
            {cases.length === 1
              ? "Case"
              : "Cases"}
          </span>
        </div>

      </div>


      {cases.length ? (

        <div className="case-study-grid">

          {cases.map((item) => (

            <article
              className="case-study-card"
              key={item.id}
            >

              <div className="case-study-top">

                <span className="case-study-number">
                  RULEBOOK #
                  {item.rulebook_entries?.rulebook_number || "—"}
                </span>

                <span className="case-study-status">
                  LEARNING
                </span>

              </div>


              <div className="case-study-icon">
                ✓
              </div>


              <h2>
                {item.title}
              </h2>


              <p>
                {item.summary ||
                  "No summary has been added yet."}
              </p>


              <div className="case-study-footer">

                <span>
                  Black Box Thinking
                </span>

                <span className="case-study-arrow">
                  →
                </span>

              </div>

            </article>

          ))}

        </div>

      ) : (

        <section className="case-study-empty">

          <div className="case-study-empty-icon">
            ✓
          </div>

          <h2>
            No Case Studies yet
          </h2>

          <p>
            When a Rulebook entry is converted into
            a case study, it will appear here.
          </p>

        </section>

      )}

    </div>
  );
}


function Departments({
  departments,
  entries,
}) {
  const getEntries = (departmentId) =>
    entries.filter(
      (entry) =>
        String(entry.department_id) ===
        String(departmentId)
    ).length;

  return (
    <div className="departments-page">

      <div className="page-heading">

        <div>
          <span className="page-eyebrow">
            ADMINISTRATION
          </span>

          <h1>
            Departments
          </h1>

          <p>
            View learning activity across every BBT department.
          </p>
        </div>

        <div className="page-heading-count">
          <strong>{departments.length}</strong>
          <span>
            Departments
          </span>
        </div>

      </div>


      <div className="departments-grid">

        {departments.map((department) => {

          const entryCount =
            getEntries(department.id);

          const departmentInitial =
            department.name
              .trim()
              .charAt(0)
              .toUpperCase();

          return (
            <article
              className="department-card"
              key={department.id}
            >

              <div className="department-card-top">

                <div className="department-card-icon">
                  {departmentInitial}
                </div>

                <span className="department-card-number">
                  #{String(department.id).padStart(2, "0")}
                </span>

              </div>


              <div className="department-card-content">

                <h2>
                  {department.name}
                </h2>

                <p>
                  Department workspace
                </p>

              </div>


              <div className="department-card-stats">

                <div>

                  <strong>
                    {entryCount}
                  </strong>

                  <span>
                    Rulebook Entries
                  </span>

                </div>


                <div className="department-card-arrow">
                  →
                </div>

              </div>

            </article>
          );

        })}

      </div>


      {!departments.length && (

        <section className="departments-empty">

          <div className="departments-empty-icon">
            ▦
          </div>

          <h2>
            No departments found
          </h2>

          <p>
            Your BBT departments will appear here.
          </p>

        </section>

      )}

    </div>
  );
}


function UserManagement({
  departments,
  message,
  currentUser,
}) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [pinUser, setPinUser] = useState(null);

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("user");
  const [pin, setPin] = useState("");
  const [active, setActive] = useState(true);

  async function loadUsers() {
    setLoadingUsers(true);

    const { data, error } =
      await supabase.rpc("bbt_list_users");

    if (error) {
      message(error.message);
      setUsers([]);
      setLoadingUsers(false);
      return;
    }

    setUsers(Array.isArray(data) ? data : []);
    setLoadingUsers(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function resetForm() {
    setUsername("");
    setFullName("");
    setDesignation("");
    setDepartment("");
    setRole("user");
    setPin("");
    setActive(true);
  }

  function closeCreateEdit() {
    setShowCreate(false);
    setEditingUser(null);
    resetForm();
  }

  function openCreate() {
    resetForm();
    setShowCreate(true);
    setEditingUser(null);
  }

  function openEdit(user) {
    setShowCreate(false);
    setEditingUser(user);

    setUsername(user.username || "");
    setFullName(user.full_name || "");
    setDesignation(user.designation || "");
    setDepartment(
      user.department_id
        ? String(user.department_id)
        : ""
    );
    setRole(user.role || "user");
    setActive(Boolean(user.is_active));
  }

  async function createUser(event) {
    event.preventDefault();

    if (!pin.trim()) {
      message("PIN is required.");
      return;
    }

    setSaving(true);

    const { data, error } =
      await supabase.rpc("bbt_create_user", {
        p_username: username.trim(),
        p_full_name: fullName.trim(),
        p_designation: designation.trim(),
        p_department_id: department
          ? Number(department)
          : null,
        p_pin: pin.trim(),
      });

    setSaving(false);

    if (error) {
      message(error.message);
      return;
    }

    if (!data?.success) {
      message(
        data?.message ||
          "Unable to create user."
      );
      return;
    }

    message("User created successfully.");
    closeCreateEdit();
    await loadUsers();
  }

  async function updateUser(event) {
    event.preventDefault();

    if (!editingUser) return;

    if (
      String(editingUser.id) ===
        String(currentUser?.id) &&
      !active
    ) {
      message(
        "You cannot deactivate your own account."
      );
      return;
    }

    setSaving(true);

    const { data, error } =
      await supabase.rpc("bbt_update_user", {
        p_id: editingUser.id,
        p_username: username.trim(),
        p_full_name: fullName.trim(),
        p_designation: designation.trim(),
        p_department_id: department
          ? Number(department)
          : null,
        p_role: role,
        p_is_active: active,
      });

    setSaving(false);

    if (error) {
      message(error.message);
      return;
    }

    if (!data?.success) {
      message(
        data?.message ||
          "Unable to update user."
      );
      return;
    }

    message("User updated successfully.");
    closeCreateEdit();
    await loadUsers();
  }

  async function changePin(event) {
    event.preventDefault();

    if (!pin.trim()) {
      message("Enter a new PIN.");
      return;
    }

    setSaving(true);

    const { data, error } =
      await supabase.rpc("bbt_change_pin", {
        p_id: pinUser.id,
        p_new_pin: pin.trim(),
      });

    setSaving(false);

    if (error) {
      message(error.message);
      return;
    }

    if (!data?.success) {
      message(
        data?.message ||
          "Unable to change PIN."
      );
      return;
    }

    message("PIN changed successfully.");
    setPinUser(null);
    setPin("");
  }

  async function toggleStatus(user) {
    if (
      String(user.id) ===
      String(currentUser?.id)
    ) {
      message(
        "You cannot deactivate your own account."
      );
      return;
    }

    const nextStatus = !user.is_active;

    const action = nextStatus
      ? "activate"
      : "deactivate";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${user.full_name || user.username}?`
    );

    if (!confirmed) return;

    setSaving(true);

    const { data, error } =
      await supabase.rpc(
        "bbt_set_user_status",
        {
          p_id: user.id,
          p_is_active: nextStatus,
        }
      );

    setSaving(false);

    if (error) {
      message(error.message);
      return;
    }

    if (!data?.success) {
      message(
        data?.message ||
          "Unable to change user status."
      );
      return;
    }

    message(
      nextStatus
        ? "User activated."
        : "User deactivated."
    );

    await loadUsers();
  }

  return (
    <div className="users-page">

      <div className="page-heading">

        <div>
          <span className="page-eyebrow">
            ADMINISTRATION
          </span>

          <h1>
            User Management
          </h1>

          <p>
            Manage BBT users, departments and account access.
          </p>
        </div>

        <button
          type="button"
          className="users-create-button"
          onClick={openCreate}
        >
          <span>+</span>
          Create User
        </button>

      </div>


      <section className="users-summary">

        <div className="users-summary-item">
          <span className="users-summary-icon">♙</span>

          <div>
            <strong>{users.length}</strong>
            <span>Total Users</span>
          </div>
        </div>


        <div className="users-summary-item">
          <span className="users-summary-icon active">✓</span>

          <div>
            <strong>
              {users.filter(
                (item) => item.is_active
              ).length}
            </strong>

            <span>Active Users</span>
          </div>
        </div>


        <div className="users-summary-item">
          <span className="users-summary-icon inactive">×</span>

          <div>
            <strong>
              {users.filter(
                (item) => !item.is_active
              ).length}
            </strong>

            <span>Inactive Users</span>
          </div>
        </div>


        <div className="users-summary-item">
          <span className="users-summary-icon departments">▦</span>

          <div>
            <strong>{departments.length}</strong>
            <span>Departments</span>
          </div>
        </div>

      </section>


      <section className="users-card">

        <div className="users-card-header">

          <div>
            <h2>
              BBT Users
            </h2>

            <p>
              Everyone with access to the Black Box Thinking system.
            </p>
          </div>

          <span className="users-count">
            {users.length}{" "}
            {users.length === 1
              ? "user"
              : "users"}
          </span>

        </div>


        {loadingUsers ? (

          <div className="users-empty">
            <div className="users-loading">
              Loading users...
            </div>
          </div>

        ) : users.length ? (

          <div className="users-table-wrap">

            <table className="users-table">

              <thead>

                <tr>
                  <th>USER</th>
                  <th>USERNAME</th>
                  <th>DEPARTMENT</th>
                  <th>DESIGNATION</th>
                  <th>ROLE</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>

              </thead>


              <tbody>

                {users.map((item) => (

                  <tr key={item.id}>

                    <td>

                      <div className="user-cell">

                        <div className="user-avatar">
                          {String(
                            item.full_name ||
                            item.username ||
                            "U"
                          )
                            .trim()
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div>
                          <strong>
                            {item.full_name ||
                              "Unnamed User"}
                          </strong>

                          <span>
                            {item.role === "admin"
                              ? "Administrator"
                              : "Team Member"}
                          </span>
                        </div>

                      </div>

                    </td>


                    <td>
                      <span className="username-text">
                        {item.username}
                      </span>
                    </td>


                    <td>

                      <span className="user-department">
                        {item.department_name || "—"}
                      </span>

                    </td>


                    <td>
                      <span className="designation-text">
                        {item.designation || "—"}
                      </span>
                    </td>


                    <td>

                      <span
                        className={
                          item.role === "admin"
                            ? "role-badge admin"
                            : "role-badge"
                        }
                      >
                        {item.role === "admin"
                          ? "Admin"
                          : "User"}
                      </span>

                    </td>


                    <td>

                      <span
                        className={
                          item.is_active
                            ? "status-badge active"
                            : "status-badge inactive"
                        }
                      >
                        <i></i>

                        {item.is_active
                          ? "Active"
                          : "Inactive"}
                      </span>

                    </td>


                    <td>

                      <div className="user-actions">

                        <button
                          type="button"
                          className="user-action edit"
                          onClick={() =>
                            openEdit(item)
                          }
                        >
                          Edit
                        </button>


                        <button
                          type="button"
                          className="user-action"
                          onClick={() => {
                            setPinUser(item);
                            setPin("");
                          }}
                        >
                          PIN
                        </button>


                        <button
                          type="button"
                          className={
                            item.is_active
                              ? "user-action danger"
                              : "user-action success"
                          }
                          disabled={
                            saving ||
                            String(item.id) ===
                              String(currentUser?.id)
                          }
                          onClick={() =>
                            toggleStatus(item)
                          }
                        >
                          {item.is_active
                            ? "Deactivate"
                            : "Activate"}
                        </button>

                      </div>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        ) : (

          <div className="users-empty">

            <div className="users-empty-icon">
              ♙
            </div>

            <h3>
              No users found
            </h3>

            <p>
              Create your first BBT department user.
            </p>

            <button
              type="button"
              className="users-create-button"
              onClick={openCreate}
            >
              <span>+</span>
              Create User
            </button>

          </div>

        )}

      </section>


      {(showCreate || editingUser) && (

        <div className="bbt-modal-overlay">

          <div className="bbt-modal user-modal">

            <div className="bbt-modal-header">

              <div>
                <span className="bbt-modal-eyebrow">
                  {editingUser
                    ? "USER ACCOUNT"
                    : "NEW USER"}
                </span>

                <h2>
                  {editingUser
                    ? "Edit User"
                    : "Create User"}
                </h2>

                <p>
                  {editingUser
                    ? "Update this BBT account."
                    : "Create a username and PIN for a department user."}
                </p>
              </div>

              <button
                type="button"
                className="bbt-close"
                onClick={closeCreateEdit}
              >
                ×
              </button>

            </div>


            <form
              className="bbt-form"
              onSubmit={
                editingUser
                  ? updateUser
                  : createUser
              }
            >

              <Field
                label="Username"
                value={username}
                required
                onChange={setUsername}
              />

              <Field
                label="Full Name"
                value={fullName}
                required
                onChange={setFullName}
              />

              <Field
                label="Designation"
                value={designation}
                onChange={setDesignation}
              />


              <label className="bbt-field">

                <span>
                  Department
                </span>

                <select
                  value={department}
                  onChange={(event) =>
                    setDepartment(
                      event.target.value
                    )
                  }
                  required
                >

                  <option value="">
                    Select Department
                  </option>

                  {departments.map((item) => (

                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.name}
                    </option>

                  ))}

                </select>

              </label>


              <label className="bbt-field">

                <span>
                  Role
                </span>

                <select
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value)
                  }
                >

                  <option value="user">
                    User
                  </option>

                  <option value="admin">
                    Admin
                  </option>

                </select>

              </label>


              {!editingUser && (

                <Field
                  label="PIN"
                  type="password"
                  value={pin}
                  required
                  onChange={setPin}
                />

              )}


              {editingUser && (

                <label className="bbt-field">

                  <span>
                    Account Status
                  </span>

                  <select
                    value={
                      active
                        ? "active"
                        : "inactive"
                    }
                    onChange={(event) =>
                      setActive(
                        event.target.value ===
                          "active"
                      )
                    }
                  >

                    <option value="active">
                      Active
                    </option>

                    <option value="inactive">
                      Inactive
                    </option>

                  </select>

                </label>

              )}


              <div className="bbt-form-buttons">

                <button
                  type="button"
                  className="bbt-secondary-button"
                  onClick={closeCreateEdit}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="bbt-primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingUser
                    ? "Save Changes"
                    : "Create User"}
                </button>

              </div>

            </form>

          </div>

        </div>

      )}


      {pinUser && (

        <div className="bbt-modal-overlay">

          <div className="bbt-modal user-modal">

            <div className="bbt-modal-header">

              <div>

                <span className="bbt-modal-eyebrow">
                  SECURITY
                </span>

                <h2>
                  Change PIN
                </h2>

                <p>
                  Set a new login PIN for{" "}
                  {pinUser.full_name ||
                    pinUser.username}.
                </p>

              </div>

              <button
                type="button"
                className="bbt-close"
                onClick={() => {
                  setPinUser(null);
                  setPin("");
                }}
              >
                ×
              </button>

            </div>


            <form
              className="bbt-form"
              onSubmit={changePin}
            >

              <Field
                label="New PIN"
                type="password"
                value={pin}
                required
                onChange={setPin}
              />


              <div className="bbt-form-buttons">

                <button
                  type="button"
                  className="bbt-secondary-button"
                  onClick={() => {
                    setPinUser(null);
                    setPin("");
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="bbt-primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : "Change PIN"}
                </button>

              </div>

            </form>

          </div>

        </div>

      )}

    </div>
  );
}


function Stat({
  title,
  value,
}) {
  return (
    <div
      style={
        styles.stat
      }
    >
      <small>
        {title}
      </small>

      <strong>
        {value}
      </strong>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}) {
  return (
    <label
      style={
        styles.label
      }
    >
      {label}

      <input
        style={
          styles.input
        }
        type={type}
        value={value}
        required={
          required
        }
        onChange={(e) =>
          onChange(
            e.target.value
          )
        }
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  required = false,
}) {
  return (
    <label
      style={
        styles.label
      }
    >
      {label}

      <textarea
        style={{
          ...styles.input,
          minHeight: 110,
          resize:
            "vertical",
        }}
        value={value}
        required={
          required
        }
        onChange={(e) =>
          onChange(
            e.target.value
          )
        }
      />
    </label>
  );
}

function NavButton({
  children,
  active,
  onClick,
}) {
  return (
    <button
      style={{
        ...styles.navButton,
        ...(active
          ? styles.navActive
          : {}),
      }}
      onClick={
        onClick
      }
    >
      {children}
    </button>
  );
}

function getDepartmentName(
  departments,
  departmentId
) {
  return (
    departments.find(
      (department) =>
        String(
          department.id
        ) ===
        String(
          departmentId
        )
    )?.name ||
    "Department"
  );
}


const GLOBAL_CSS = `
  * { box-sizing: border-box; }
  html, body, #root { margin: 0; min-height: 100%; }
  body {
    background: #f4f6fa;
    color: #172033;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  button, input, select, textarea { font: inherit; }
  button { transition: transform .15s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease, color .15s ease; }
  button:not(:disabled):hover { transform: translateY(-1px); }
  button:disabled { cursor: not-allowed; opacity: .6; }

  .bbt-table { width: 100%; min-width: 920px; border-collapse: separate; border-spacing: 0; }
  .bbt-table th {
    padding: 14px 16px;
    background: #f8fafc;
    color: #64748b;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .06em;
    text-transform: uppercase;
    text-align: left;
    border-bottom: 1px solid #e8edf3;
    white-space: nowrap;
  }
  .bbt-table th:first-child { border-top-left-radius: 10px; }
  .bbt-table th:last-child { border-top-right-radius: 10px; }
  .bbt-table td {
    padding: 17px 16px;
    background: #fff;
    border-bottom: 1px solid #edf1f5;
    color: #334155;
    font-size: 13px;
    vertical-align: middle;
  }
  .bbt-table tbody tr:last-child td { border-bottom: 0; }
  .bbt-table tbody tr:hover td { background: #fafbff; }
  .bbt-table td:first-child { font-weight: 700; color: #475569; }
  .bbt-table td strong { display: block; color: #172033; font-size: 13px; }
  .bbt-table td small { display: block; margin-top: 4px; color: #94a3b8; font-size: 11px; }
  .bbt-actions { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; }
  .bbt-action {
    border: 1px solid #e2e8f0;
    background: #fff;
    color: #475569;
    border-radius: 7px;
    padding: 7px 10px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .bbt-action:hover { border-color: #cbd5e1; background: #f8fafc; color: #111827; }
  .bbt-action-danger { color: #dc2626; }
  .bbt-action-danger:hover { border-color: #fecaca; background: #fff7f7; }
  .bbt-action-success { color: #15803d; }
  .bbt-action-success:hover { border-color: #bbf7d0; background: #f0fdf4; }

  .bbt-page-card {
    background: #fff;
    border: 1px solid #e7ebf0;
    border-radius: 16px;
    box-shadow: 0 8px 30px rgba(15, 23, 42, .045);
  }
  .bbt-page-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 22px 24px;
    border-bottom: 1px solid #edf1f5;
  }
  .bbt-page-card-header h2 { margin: 0; font-size: 18px; letter-spacing: -.02em; }
  .bbt-page-card-header p { margin: 5px 0 0; color: #64748b; font-size: 13px; }
  .bbt-table-area { padding: 0 10px 10px; overflow-x: auto; }

  @media (max-width: 900px) {
    .bbt-main-placeholder { display: block; }
    .bbt-page-card-header { align-items: flex-start; flex-direction: column; }
    .bbt-table-area { padding: 0 4px 4px; }
  }
`;

const styles = {
  app: {
    minHeight: "100vh",
    display: "flex",
    background: "#f4f6fa",
    color: "#172033",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  sidebar: {
    width: 252,
    minWidth: 252,
    background:
      "#0f172a",
    color: "#fff",
    padding: 20,
    display:
      "flex",
    flexDirection:
      "column",
    gap: 10,
  },

  brand: {
    display:
      "flex",
    alignItems:
      "center",
    gap: 10,
    marginBottom: 20,
  },

  logoSmall: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background:
      "#fff",
    color:
      "#111827",
    display:
      "grid",
    placeItems:
      "center",
    fontWeight: 900,
    fontSize: 20,
  },

  logo: {
    width: 55,
    height: 55,
    borderRadius: 14,
    background:
      "#111827",
    color: "#fff",
    display:
      "grid",
    placeItems:
      "center",
    fontWeight: 900,
    fontSize: 28,
    margin:
      "0 auto 15px",
  },

  userBox: {
    display:
      "grid",
    gap: 3,
    background:
      "#1f2937",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },

  nav: {
    display:
      "grid",
    gap: 5,
  },

  navButton: {
    border: 0,
    background:
      "transparent",
    color:
      "#cbd5e1",
    textAlign:
      "left",
    padding:
      "12px 14px",
    borderRadius: 8,
    cursor:
      "pointer",
  },

  navActive: {
    background:
      "#374151",
    color:
      "#fff",
  },

  logout: {
    marginTop:
      "auto",
    border: 0,
    background:
      "#374151",
    color:
      "#fff",
    padding: 11,
    borderRadius: 8,
    cursor:
      "pointer",
  },

  main: {
    flex: 1,
    padding: "34px clamp(22px, 3vw, 46px)",
    minWidth: 0,
    maxWidth: "calc(100vw - 252px)",
  },

  header: {
    display:
      "flex",
    justifyContent:
      "space-between",
    alignItems:
      "center",
    gap: 20,
    marginBottom:
      20,
  },

  eyebrow: {
    color:
      "#6d28d9",
    fontWeight: 800,
    letterSpacing: 2,
    fontSize: 11,
  },

  title: {
    margin: "6px 0 0",
    fontSize: 30,
    lineHeight: 1.1,
    letterSpacing: "-.035em",
    fontWeight: 800,
  },

  headerButtons: {
    display:
      "flex",
    gap: 8,
  },

  primaryButton: {
    border: 0,
    borderRadius: 9,
    background:
      "#172033",
    color: "#fff",
    padding:
      "11px 15px",
    cursor:
      "pointer",
    fontWeight: 700,
  },

  secondaryButton: {
    border:
      "1px solid #d9e0e8",
    borderRadius: 9,
    background:
      "#fff",
    color:
      "#172033",
    padding:
      "11px 15px",
    cursor:
      "pointer",
    fontWeight: 700,
  },

  hero: {
    background:
      "#fff",
    border:
      "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 25,
    marginBottom: 15,
  },

  stats: {
    display:
      "grid",
    gridTemplateColumns:
      "repeat(3, minmax(0, 1fr))",
    gap: 15,
    marginBottom: 15,
  },

  stat: {
    background:
      "#fff",
    border:
      "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 20,
    display:
      "grid",
    gap: 5,
  },

  panel: {
    background: "#fff",
    border: "1px solid #e7ebf0",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 8px 30px rgba(15,23,42,.045)",
  },

  departmentRow: {
    display:
      "flex",
    justifyContent:
      "space-between",
    padding:
      "12px 0",
    borderBottom:
      "1px solid #eef2f7",
  },

  toolbar: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 240px",
    gap: 10,
    marginBottom: 18,
  },

  input: {
    width:
      "100%",
    boxSizing:
      "border-box",
    padding:
      "10px 12px",
    border:
      "1px solid #dbe2ea",
    borderRadius: 8,
    background:
      "#fff",
    color:
      "#172033",
  },

  tableWrap: {
    overflowX:
      "auto",
  },

  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    fontSize: 13,
  },

  smallButton: {
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#475569",
    borderRadius: 7,
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  cards: {
    display:
      "grid",
    gridTemplateColumns:
      "repeat(3, minmax(0, 1fr))",
    gap: 15,
  },

  card: {
    background:
      "#fff",
    border:
      "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 20,
  },

  overlay: {
    position:
      "fixed",
    inset: 0,
    background:
      "rgba(15,23,42,.45)",
    display:
      "grid",
    placeItems:
      "center",
    padding: 20,
    zIndex: 20,
  },

  modal: {
    width:
      "min(720px, 100%)",
    maxHeight:
      "90vh",
    overflowY:
      "auto",
    background:
      "#fff",
    borderRadius: 14,
    padding: 22,
  },

  modalHeader: {
    display:
      "flex",
    justifyContent:
      "space-between",
    alignItems:
      "center",
  },

  closeButton: {
    border: 0,
    background:
      "#f1f5f9",
    borderRadius: 7,
    fontSize: 22,
    cursor:
      "pointer",
  },

  form: {
    display:
      "grid",
    gap: 14,
  },

  formInfo: {
    padding: 12,
    background:
      "#f8fafc",
    borderRadius: 8,
  },

  formButtons: {
    display:
      "flex",
    justifyContent:
      "flex-end",
    gap: 10,
  },

  message: {
    background:
      "#eef2ff",
    border:
      "1px solid #c7d2fe",
    color:
      "#3730a3",
    padding: 11,
    borderRadius: 8,
    marginBottom: 15,
  },

  error: {
    background:
      "#fef2f2",
    color:
      "#b91c1c",
    border:
      "1px solid #fecaca",
    padding: 10,
    borderRadius: 8,
  },

  closeMessage: {
    float: "right",
    border: 0,
    background:
      "transparent",
    cursor:
      "pointer",
  },

  loginPage: {
    minHeight:
      "100vh",
    display:
      "grid",
    placeItems:
      "center",
    background:
      "#f5f7fb",
    padding: 20,
  },

  loginCard: {
    width:
      "min(390px, 100%)",
    boxSizing:
      "border-box",
    background:
      "#fff",
    border:
      "1px solid #e5e7eb",
    borderRadius: 15,
    padding: 30,
    display:
      "grid",
    gap: 12,
  },

  center: {
    minHeight:
      "100vh",
    display:
      "grid",
    placeItems:
      "center",
    fontFamily:
      "Arial, sans-serif",
  },
};



















