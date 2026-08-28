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
        `Similar Rulebook case found: #${first.rulebook_number} — ${first.mistake_title}\n\nDo you want to save this as a new case anyway?`
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
    <div style={styles.app}>
      <style>{GLOBAL_CSS}</style>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.logoSmall}>
            B
          </div>

          <div>
            <strong>BBT</strong>
            <small>
              Black Box Thinking
            </small>
          </div>
        </div>

        <div style={styles.userBox}>
          <strong>
            {user.full_name}
          </strong>

          <small>
            {user.designation ||
              "Team Member"}
          </small>

          <small>
            {getDepartmentName(
              departments,
              user.department_id
            )}
          </small>
        </div>

        <nav style={styles.nav}>
          <NavButton
            active={
              page === "dashboard"
            }
            onClick={() =>
              setPage("dashboard")
            }
          >
            Dashboard
          </NavButton>

          <NavButton
            active={
              page === "rulebook"
            }
            onClick={() =>
              setPage("rulebook")
            }
          >
            Rulebook
          </NavButton>

          <NavButton
            active={
              page === "cases"
            }
            onClick={() =>
              setPage("cases")
            }
          >
            Case Studies
          </NavButton>

          {user.role ===
            "admin" && (
            <NavButton
              active={
                page ===
                "departments"
              }
              onClick={() =>
                setPage(
                  "departments"
                )
              }
            >
              Departments
            </NavButton>
          )}

          {user.role ===
            "admin" && (
            <NavButton
              active={
                page === "users"
              }
              onClick={() =>
                setPage("users")
              }
            >
              User Management
            </NavButton>
          )}
        </nav>

        <button
          style={styles.logout}
          onClick={logout}
        >
          Logout
        </button>
      </aside>

      <main style={styles.main}>
        <header style={styles.header}>
          <div>
            <small
              style={styles.eyebrow}
            >
              BLACK BOX THINKING
            </small>

            <h1
              style={styles.title}
            >
              {page ===
                "dashboard" &&
                "Learning Dashboard"}

              {page === "rulebook" &&
                "Rulebook"}

              {page === "cases" &&
                "Case Studies"}

              {page ===
                "departments" &&
                "Departments"}

              {page === "users" &&
                "User Management"}
            </h1>
          </div>

          <div
            style={
              styles.headerButtons
            }
          >
            <button
              style={
                styles.secondaryButton
              }
              onClick={() =>
                downloadRulebookPDF(
                  visibleEntries,
                  "BBT Rulebook"
                )
              }
            >
              Download PDF
            </button>

            <button
              style={
                styles.primaryButton
              }
              onClick={() => {
                setForm(
                  EMPTY_FORM
                );
                setShowForm(
                  true
                );
              }}
            >
              + Add Mistake
            </button>
          </div>
        </header>

        {message && (
          <div
            style={
              styles.message
            }
          >
            {message}

            <button
              style={
                styles.closeMessage
              }
              onClick={() =>
                setMessage("")
              }
            >
              ×
            </button>
          </div>
        )}

        {page ===
          "dashboard" && (
          <Dashboard
            entries={entries}
            cases={cases}
            departments={departments}
            isAdmin={user.role === "admin"}
            userDepartmentId={user.department_id}
          />
        )}

        {page ===
          "rulebook" && (
          <Rulebook
            entries={visibleEntries}
            departments={departments}
            search={search}
            setSearch={setSearch}
            departmentFilter={departmentFilter}
            setDepartmentFilter={setDepartmentFilter}
            createCaseStudy={createCaseStudy}
            isAdmin={user.role === "admin"}
          />
        )}

        {page === "cases" && (
          <CaseStudies
            cases={cases}
          />
        )}

        {page ===
          "departments" &&
          user.role ===
            "admin" && (
            <Departments
              departments={
                departments
              }
              entries={entries}
            />
          )}

        {page === "users" &&
          user.role ===
            "admin" && (
            <UserManagement
              departments={departments}
              message={setMessage}
              currentUser={user}
            />
          )}

        {showForm && (
          <div
            style={
              styles.overlay
            }
          >
            <div
              style={
                styles.modal
              }
            >
              <div
                style={
                  styles.modalHeader
                }
              >
                <h2>
                  Add Rulebook Entry
                </h2>

                <button
                  style={
                    styles.closeButton
                  }
                  onClick={() =>
                    setShowForm(
                      false
                    )
                  }
                >
                  ×
                </button>
              </div>

              <form
                onSubmit={
                  saveRulebook
                }
                style={
                  styles.form
                }
              >
                <Field
                  label="Mistake Title"
                  value={
                    form.mistake_title
                  }
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
                  value={
                    form.project_name
                  }
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
                  value={
                    form.mistake_date
                  }
                  onChange={(value) =>
                    updateForm(
                      "mistake_date",
                      value
                    )
                  }
                />

                <TextArea
                  label="Finding"
                  value={
                    form.finding
                  }
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
                  value={
                    form.learning
                  }
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
                  value={
                    form.solution
                  }
                  required
                  onChange={(value) =>
                    updateForm(
                      "solution",
                      value
                    )
                  }
                />

                <div
                  style={
                    styles.formInfo
                  }
                >
                  <strong>
                    Department:
                  </strong>{" "}
                  {getDepartmentName(
                    departments,
                    user.department_id
                  )}
                </div>

                <div
                  style={
                    styles.formButtons
                  }
                >
                  <button
                    type="button"
                    style={
                      styles.secondaryButton
                    }
                    onClick={() =>
                      setShowForm(
                        false
                      )
                    }
                  >
                    Cancel
                  </button>

                  <button
                    style={
                      styles.primaryButton
                    }
                  >
                    Save Rulebook
                  </button>
                </div>
              </form>
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
}) {
  return (
    <div>
      <section style={styles.hero}>
        <h2>
          Turn mistakes into learning.
        </h2>

        <p>
          Capture mistakes, learning and
          solutions so the organization
          does not repeat them.
        </p>
      </section>

      <div style={styles.stats}>
        <Stat
          title="Rulebook Entries"
          value={entries.length}
        />

        <Stat
          title="Case Studies"
          value={cases.length}
        />

        <Stat
          title={isAdmin ? "Departments" : "My Department"}
          value={departments.length}
        />
      </div>

      <section style={styles.panel}>
        <h2>
          {isAdmin
            ? "Department Overview"
            : "My Department"}
        </h2>

        {departments.map((department) => (
          <div
            key={department.id}
            style={styles.departmentRow}
          >
            <span>{department.name}</span>

            <strong>
              {
                entries.filter(
                  (entry) =>
                    String(entry.department_id) ===
                    String(department.id)
                ).length
              }
            </strong>
          </div>
        ))}

        {!departments.length && (
          <div style={styles.empty}>
            Your department could not be loaded.
          </div>
        )}
      </section>
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
  isAdmin,
}) {
  return (
    <section style={styles.panel}>
      <div
        style={{
          ...styles.toolbar,
          gridTemplateColumns: isAdmin
            ? "1fr 240px"
            : "1fr",
        }}
      >
        <input
          style={styles.input}
          placeholder="Search Rulebook..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
        />

        {isAdmin && (
          <select
            style={styles.input}
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

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th>No.</th>
              <th>Mistake</th>
              <th>Department</th>
              <th>Project</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  #{entry.rulebook_number}
                </td>

                <td>
                  <strong>
                    {entry.mistake_title}
                  </strong>

                  <small>
                    {entry.name}
                  </small>
                </td>

                <td>
                  {entry.departments?.name || "—"}
                </td>

                <td>
                  {entry.project_name || "—"}
                </td>

                <td>
                  {entry.mistake_date}
                </td>

                <td>
                  <button
                    style={styles.smallButton}
                    onClick={() =>
                      createCaseStudy(entry)
                    }
                  >
                    Case Study
                  </button>
                </td>
              </tr>
            ))}

            {!entries.length && (
              <tr>
                <td
                  colSpan="6"
                  style={styles.empty}
                >
                  No Rulebook entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CaseStudies({
  cases,
}) {
  return (
    <div
      style={
        styles.cards
      }
    >
      {cases.map(
        (item) => (
          <article
            key={
              item.id
            }
            style={
              styles.card
            }
          >
            <small>
              Rulebook #
              {
                item
                  .rulebook_entries
                  ?.rulebook_number
              }
            </small>

            <h2>
              {item.title}
            </h2>

            <p>
              {item.summary}
            </p>
          </article>
        )
      )}

      {!cases.length && (
        <section
          style={
            styles.panel
          }
        >
          No Case Studies
          yet.
        </section>
      )}
    </div>
  );
}

function Departments({
  departments,
  entries,
}) {
  return (
    <div
      style={
        styles.cards
      }
    >
      {departments.map(
        (department) => (
          <article
            key={
              department.id
            }
            style={
              styles.card
            }
          >
            <h2>
              {
                department.name
              }
            </h2>

            <p>
              {
                entries.filter(
                  (entry) =>
                    entry.department_id ===
                    department.id
                ).length
              }{" "}
              Rulebook Entries
            </p>

            {department.name ===
              "Projects" && (
              <small>
                Site Work ·
                Design &
                Development ·
                Project
                Management
              </small>
            )}
          </article>
        )
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
    <div>
      <section style={styles.panel}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 15,
            marginBottom: 20,
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 5px" }}>
              User Management
            </h2>

            <p
              style={{
                margin: 0,
                color: "#64748b",
              }}
            >
              Create and manage BBT users,
              departments, PINs and account status.
            </p>
          </div>

          <button
            type="button"
            style={styles.primaryButton}
            onClick={openCreate}
          >
            + Create User
          </button>
        </div>

        {loadingUsers ? (
          <div style={styles.empty}>
            Loading users...
          </div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {users.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>
                        {item.full_name ||
                          "Unnamed User"}
                      </strong>
                    </td>

                    <td>
                      {item.username}
                    </td>

                    <td>
                      {item.department_name ||
                        "—"}
                    </td>

                    <td>
                      {item.designation ||
                        "—"}
                    </td>

                    <td>
                      {item.role === "admin"
                        ? "Admin"
                        : "User"}
                    </td>

                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "5px 9px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          background:
                            item.is_active
                              ? "#dcfce7"
                              : "#fee2e2",
                          color:
                            item.is_active
                              ? "#166534"
                              : "#991b1b",
                        }}
                      >
                        {item.is_active
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </td>

                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          style={styles.smallButton}
                          onClick={() =>
                            openEdit(item)
                          }
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          style={styles.smallButton}
                          onClick={() => {
                            setPinUser(item);
                            setPin("");
                          }}
                        >
                          Change PIN
                        </button>

                        <button
                          type="button"
                          disabled={
                            saving ||
                            String(item.id) ===
                              String(currentUser?.id)
                          }
                          style={{
                            ...styles.smallButton,
                            color:
                              item.is_active
                                ? "#dc2626"
                                : "#16a34a",
                            opacity:
                              String(item.id) ===
                              String(currentUser?.id)
                                ? 0.45
                                : 1,
                            cursor:
                              String(item.id) ===
                              String(currentUser?.id)
                                ? "not-allowed"
                                : "pointer",
                          }}
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

                {!users.length && (
                  <tr>
                    <td
                      colSpan="7"
                      style={styles.empty}
                    >
                      No users found. Click Refresh to
                      load the BBT user list.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(showCreate || editingUser) && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={{ margin: 0 }}>
                  {editingUser
                    ? "Edit User"
                    : "Create User"}
                </h2>

                <small
                  style={{
                    color: "#64748b",
                  }}
                >
                  {editingUser
                    ? "Update this BBT account."
                    : "Create a username + PIN account."}
                </small>
              </div>

              <button
                type="button"
                style={styles.closeButton}
                onClick={closeCreateEdit}
              >
                ×
              </button>
            </div>

            <form
              style={{
                ...styles.form,
                marginTop: 20,
              }}
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

              <label style={styles.label}>
                Department

                <select
                  style={styles.input}
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

                  {departments.map(
                    (item) => (
                      <option
                        key={item.id}
                        value={item.id}
                      >
                        {item.name}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label style={styles.label}>
                Role

                <select
                  style={styles.input}
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
                <label style={styles.label}>
                  Account Status

                  <select
                    style={styles.input}
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

              <div style={styles.formButtons}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={closeCreateEdit}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  style={{
                    ...styles.primaryButton,
                    opacity: saving ? 0.7 : 1,
                  }}
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
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={{ margin: 0 }}>
                  Change PIN
                </h2>

                <small
                  style={{
                    color: "#64748b",
                  }}
                >
                  {pinUser.full_name ||
                    pinUser.username}
                </small>
              </div>

              <button
                type="button"
                style={styles.closeButton}
                onClick={() => {
                  setPinUser(null);
                  setPin("");
                }}
              >
                ×
              </button>
            </div>

            <form
              style={{
                ...styles.form,
                marginTop: 20,
              }}
              onSubmit={changePin}
            >
              <Field
                label="New PIN"
                type="password"
                value={pin}
                required
                onChange={setPin}
              />

              <div style={styles.formButtons}>
                <button
                  type="button"
                  style={styles.secondaryButton}
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
                  style={{
                    ...styles.primaryButton,
                    opacity: saving ? 0.7 : 1,
                  }}
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