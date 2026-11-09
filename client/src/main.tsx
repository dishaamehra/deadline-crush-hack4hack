import React, { useState, useEffect, createContext, useContext } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useParams,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  Sun,
  Moon,
  Monitor,
  Bookmark,
  Bell,
  ArrowUpRight,
  ArrowRight,
  CheckCircle,
  Clock,
  UploadCloud,
} from "lucide-react";
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-600.css";
import "@fontsource/space-grotesk/latin-700.css";
import "./base.css";
import "./app.css";
import { api, date } from "./api";
import { UploadPanel } from "./UploadPanel";

const Account = createContext<{ user: any; refresh: () => Promise<void> }>({
  user: null,
  refresh: async () => {},
});
function useAction() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return {
    error,
    busy,
    run: async (fn: () => Promise<void>) => {
      setError("");
      setBusy(true);
      try {
        await fn();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    },
  };
}
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}
function Loading() {
  return (
    <div className="wrap loading" role="status">
      Loading your workspace…
    </div>
  );
}
function Theme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("deadline-theme") || "system",
  );
  useEffect(() => {
    localStorage.setItem("deadline-theme", theme);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (mq.matches ? "dark" : "light") : theme;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  return (
    <label className="theme">
      <span className="sr-only">Theme</span>
      {theme === "system" ? (
        <Monitor size={16} />
      ) : theme === "dark" ? (
        <Moon size={16} />
      ) : (
        <Sun size={16} />
      )}
      <select
        aria-label="Theme"
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
function Shell() {
  const { user, refresh } = useContext(Account);
  const action = useAction();
  const navigate = useNavigate();
  const [announcement, setAnnouncement] = useState(true);
  return (
    <>
      <header>
        <Link className="brand" to="/hackathons">
          <b>H4</b> Hack4Hack
        </Link>
        <nav aria-label="Main">
          <Link className="active" to="/hackathons">
            Hackathons
          </Link>
          <Link to="/programs">My Programs</Link>
          {user?.role === "organiser" && <Link to="/organiser">Organiser</Link>}
        </nav>
        <Theme />
        {user ? (
          <>
            <Link to="/notifications" aria-label="Notifications">
              <Bell size={20} />
            </Link>
            <button
              onClick={() =>
                action.run(async () => {
                  await api("/auth/logout", "POST", {});
                  await refresh();
                  navigate("/hackathons");
                })
              }
            >
              Sign out
            </button>
          </>
        ) : (
          <Link className="button primary" to="/signin">
            Sign in
          </Link>
        )}
      </header>
      {announcement && (
        <div className="notice">
          <div className="wrap">
            <span>
              <b>Development edition</b> · Fictional events and seeded accounts
              for local testing
            </span>
            <button
              aria-label="Close announcement"
              onClick={() => setAnnouncement(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}
      <ErrorBox message={action.error} />
      <Routes>
        <Route path="/" element={<Directory />} />
        <Route path="/hackathons" element={<Directory />} />
        <Route path="/hackathons/:slug" element={<Detail />} />
        <Route path="/signin" element={<Auth />} />
        <Route path="/programs" element={<Programs />} />
        <Route path="/workspace/:teamId" element={<Workspace />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/organiser" element={<Organiser />} />
        <Route
          path="*"
          element={
            <main className="wrap empty">
              <h1>Page unavailable</h1>
              <Link to="/hackathons">Browse hackathons</Link>
            </main>
          }
        />
      </Routes>
      <footer>
        <div className="wrap foot">
          <div>
            <b>H4 · Hack4Hack development</b>
            <p>Build. Submit. Know where you stand.</p>
          </div>
          <div>
            <b>Explore</b>
            <p>
              <Link to="/hackathons">Hackathons</Link>
            </p>
          </div>
          <div>
            <b>Your space</b>
            <p>
              <Link to="/programs">My Programs</Link>
            </p>
          </div>
          <div>
            <b>Updates</b>
            <p>
              <Link to="/notifications">Notifications</Link>
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
function Artwork({ event, large = false }: { event: any; large?: boolean }) {
  return (
    <div className={"art " + (large ? "detail-art " : "") + "ink"}>
      <small>
        {event.format?.toUpperCase()} · {event.mode}
      </small>
      <strong>{event.title}</strong>
      <span>{event.prize || "Build something worth submitting"}</span>
    </div>
  );
}
function SaveButton({
  eventId,
  saved,
  reload,
}: {
  eventId: string;
  saved: boolean;
  reload: () => Promise<void>;
}) {
  const action = useAction();
  const { user } = useContext(Account);
  const navigate = useNavigate();
  return (
    <>
      <button
        className="save"
        aria-label={saved ? "Unsave hackathon" : "Save hackathon"}
        aria-pressed={saved}
        onClick={() => {
          if (!user) {
            navigate("/signin?next=" + encodeURIComponent(location.pathname));
            return;
          }
          action.run(async () => {
            await api(
              "/events/" + eventId + "/save",
              saved ? "DELETE" : "PUT",
              {},
            );
            await reload();
          });
        }}
      >
        <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
      </button>
      <ErrorBox message={action.error} />
    </>
  );
}
function Directory() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const action = useAction();
  const reload = async () => setData(await api("/events?" + params));
  useEffect(() => {
    void action.run(reload);
  }, [params.toString()]);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };
  const events = data?.events || [];
  const featured = events.filter((e: any) => e.featured);
  const spotlight = featured[slide % Math.max(featured.length, 1)];
  const groups: Record<string, string[]> = {
    status: ["Open", "In progress", "Ended"],
    mode: ["Online", "Offline", "Hybrid"],
    fee: ["Free", "Paid"],
    participation: ["Solo allowed", "Teams allowed"],
    format: [
      "Hackathon",
      "Ideathon",
      "Coding Challenge",
      "Datathon",
      "Buildathon",
      "Design Challenge",
      "Case Study",
      "Hiring Challenge",
      "Bootcamp",
    ],
    theme: [
      "AI / ML",
      "Generative AI",
      "Web3",
      "FinTech",
      "HealthTech",
      "EdTech",
      "AgriTech",
      "Sustainability",
      "Cybersecurity",
      "IoT",
      "Gaming",
      "Open Innovation",
      "Space Tech",
      "Smart Cities",
    ],
  };
  return (
    <main>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <small>EXPLORE · BUILD TOGETHER</small>
            <h1>
              <mark>Hackathons</mark>
            </h1>
            <p>
              Your next idea deserves a place to grow. Discover challenges, meet
              your team and ship something real.
            </p>
            <div className="actions">
              <Link className="button primary" to="/programs">
                My Programs <ArrowRight size={16} />
              </Link>
              <Link className="button outlined" to="/organiser">
                Host a hackathon
              </Link>
            </div>
          </div>
          {spotlight ? (
            <div className="carousel">
              <Link to={"/hackathons/" + spotlight.slug}>
                <Artwork event={spotlight} />
              </Link>
              {featured.length > 1 && (
                <div className="carousel-controls">
                  <button
                    onClick={() => setSlide(slide + featured.length - 1)}
                    aria-label="Previous"
                  >
                    ‹
                  </button>
                  <button onClick={() => setSlide(slide + 1)} aria-label="Next">
                    ›
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="hero-placeholder">
              <UploadCloud size={40} />
              <p>Build with confidence, even in the final minutes.</p>
            </div>
          )}
        </div>
      </section>
      <section className="wrap directory">
        <div className="toolbar">
          <input
            aria-label="Search hackathons"
            placeholder="Search by name, organizer or city"
            value={params.get("q") || ""}
            onChange={(e) => update("q", e.target.value)}
          />
          <select
            aria-label="Sort"
            value={params.get("sort") || ""}
            onChange={(e) => update("sort", e.target.value)}
          >
            {[
              ["", "Recommended"],
              ["deadline", "Closing soon"],
              ["prize", "Highest prize"],
              ["registered", "Most registered"],
              ["newest", "Newest"],
            ].map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen(!filterOpen)}
          >
            Filters
          </button>
        </div>
        {filterOpen && (
          <section className="filter-grid" aria-label="Filters">
            {Object.entries(groups).map(([key, choices]) => (
              <label key={key}>
                {key}
                <select
                  value={params.get(key) || ""}
                  onChange={(e) => update(key, e.target.value)}
                >
                  <option value="">Any</option>
                  {choices.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            ))}
            <button onClick={() => setParams({})}>Clear all</button>
          </section>
        )}
        <ErrorBox message={action.error} />
        {action.error && (
          <button onClick={() => action.run(reload)}>Retry</button>
        )}
        {!data && action.error ? null : !data ? (
          <div className="skeleton" />
        ) : (
          <>
            <p role="status">
              {events.length} {events.length === 1 ? "result" : "results"}
            </p>
            <div className="cards">
              {events.map((e: any) => (
                <article className="card" key={e._id}>
                  <Link to={"/hackathons/" + e.slug}>
                    <Artwork event={e} />
                  </Link>
                  <span className="status">● {e.status}</span>
                  <SaveButton
                    eventId={e.slug}
                    saved={e.saved}
                    reload={reload}
                  />
                  <div className="card-content">
                    <h3>
                      <Link to={"/hackathons/" + e.slug}>{e.title}</Link>
                    </h3>
                    <p>{e.organizer}</p>
                    <p>
                      {e.city || e.mode} · closes {date(e.registrationEnd)}
                    </p>
                    <dl className="stats">
                      <div>
                        <dt>Prize</dt>
                        <dd>{e.prize || "To be announced"}</dd>
                      </div>
                      <div>
                        <dt>Team</dt>
                        <dd>
                          {e.minTeam}–{e.maxTeam}
                        </dd>
                      </div>
                      <div>
                        <dt>Registered</dt>
                        <dd>{e.registered}</dd>
                      </div>
                    </dl>
                  </div>
                </article>
              ))}
            </div>
            {!events.length && (
              <div className="empty">
                <h2>No matching events</h2>
                <button onClick={() => setParams({})}>Reset filters</button>
              </div>
            )}
          </>
        )}
        <section className="faq">
          <h2>Good questions. Clear answers.</h2>
          {[
            [
              "How do I participate?",
              "Register on the event page, create or join a team and open your workspace.",
            ],
            [
              "Can I resume an upload?",
              "Select the same ZIP file in your workspace and resume only the missing parts.",
            ],
            [
              "When is my project submitted?",
              "Finalisation issues a server-timestamped receipt. Background checks then determine validation status.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      </section>
    </main>
  );
}
function Countdown({
  deadline,
  serverNow,
}: {
  deadline: string;
  serverNow: string;
}) {
  const [now, setNow] = useState(Date.parse(serverNow));
  useEffect(() => {
    const started = performance.now();
    const initial = Date.parse(serverNow);
    const timer = setInterval(
      () => setNow(initial + performance.now() - started),
      1000,
    );
    return () => clearInterval(timer);
  }, [serverNow]);
  const left = Math.max(0, Math.floor((Date.parse(deadline) - now) / 1000));
  return (
    <dl className="countdown">
      {[
        ["Days", Math.floor(left / 86400)],
        ["Hours", Math.floor(left / 3600) % 24],
        ["Mins", Math.floor(left / 60) % 60],
        ["Secs", left % 60],
      ].map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{String(value).padStart(2, "0")}</dd>
        </div>
      ))}
    </dl>
  );
}
function Detail() {
  const { slug } = useParams();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const action = useAction();
  const { user } = useContext(Account);
  const navigate = useNavigate();
  const reload = async () => setData(await api("/events/" + slug));
  useEffect(() => {
    void action.run(reload);
  }, [slug, user]);
  if (!data)
    return (
      <main className="wrap">
        <ErrorBox message={action.error} />
        {action.error ? (
          <button onClick={() => action.run(reload)}>Retry</button>
        ) : (
          <Loading />
        )}
      </main>
    );
  const e = data.event;
  const tabs = ["Overview", "Timeline", "Submission", "Prizes", "Rules", "FAQ"];
  const register = () =>
    action.run(async () => {
      if (!user) {
        navigate("/signin?next=" + encodeURIComponent("/hackathons/" + slug));
        return;
      }
      await api("/events/" + slug + "/register", "POST", {});
      await reload();
      navigate("/programs");
    });
  return (
    <main className="wrap detail">
      <nav className="breadcrumb">
        <Link to="/hackathons">Hackathons</Link> › <span>{e.title}</span>
      </nav>
      <Artwork event={e} large />
      <div className="event-toolbar">
        <div className="badges">
          <b className="avatar">H</b>
          <span>{e.status}</span>
          <span>{e.format}</span>
          {e.featured && <span>Featured</span>}
        </div>
        <div className="actions">
          <button
            onClick={() =>
              action.run(async () => {
                await navigator.clipboard.writeText(location.href);
                setCopied(true);
              })
            }
          >
            {copied ? "Link copied" : "Share"}
          </button>
          <SaveButton eventId={e.slug} saved={data.saved} reload={reload} />
        </div>
      </div>
      <div className="detail-grid">
        <div>
          <h1>{e.title}</h1>
          <p>
            by <b>{e.organizer}</b>
          </p>
          <p className="summary">{e.summary}</p>
          <dl className="stats">
            {[
              ["Prize", e.prize],
              ["Team size", e.minTeam + "–" + e.maxTeam],
              ["Mode", e.mode],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="tabs" role="tablist" aria-label="Event information">
            {tabs.map((name, i) => (
              <button
                key={name}
                id={"tab-" + i}
                role="tab"
                tabIndex={i === tab ? 0 : -1}
                aria-selected={i === tab}
                aria-controls="detail-panel"
                onClick={() => setTab(i)}
                onKeyDown={(ev) => {
                  const next =
                    ev.key === "ArrowRight"
                      ? (i + 1) % 6
                      : ev.key === "ArrowLeft"
                        ? (i + 5) % 6
                        : ev.key === "Home"
                          ? 0
                          : ev.key === "End"
                            ? 5
                            : null;
                  if (next !== null) {
                    ev.preventDefault();
                    setTab(next);
                    document.getElementById("tab-" + next)?.focus();
                  }
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <section
            role="tabpanel"
            id="detail-panel"
            aria-labelledby={"tab-" + tab}
            className="panel prose"
          >
            {tab === 0 && (
              <>
                <h2>About the challenge</h2>
                <p>{e.overview}</p>
                <h3>Who can participate</h3>
                <p>{e.eligibility}</p>
                {e.announcements?.length > 0 && (
                  <>
                    <h3>Announcements</h3>
                    {e.announcements.map((a: string, i: number) => (
                      <p className="callout" key={i}>
                        {a}
                      </p>
                    ))}
                  </>
                )}
              </>
            )}
            {tab === 1 && (
              <>
                <h2>Timeline</h2>
                <p>Registration closes {date(e.registrationEnd)}</p>
                <p>Submissions close {date(e.deadline)}</p>
              </>
            )}
            {tab === 2 && (
              <>
                <h2>Submission requirements</h2>
                <p>
                  Save your project description and links. Upload a ZIP up to
                  100 MiB, then finalise to receive your receipt.
                </p>
                <p>
                  Grace policy · {e.graceMinutes} minutes for uploads initiated
                  before the deadline. Finalisation must reach the server by the
                  cutoff.
                </p>
                <p>
                  Additional fields · {e.requirements?.join(", ") || "None"}
                </p>
                <Link className="button primary" to="/programs">
                  Open My Programs
                </Link>
              </>
            )}
            {tab === 3 && (
              <>
                <h2>Prizes and opportunities</h2>
                <p>{e.prize}</p>
              </>
            )}
            {tab === 4 && (
              <>
                <h2>Participation rules</h2>
                <p>{e.rules}</p>
              </>
            )}
            {tab === 5 &&
              e.faqs?.map((f: any, i: number) => (
                <details key={i}>
                  <summary>{f.question}</summary>
                  <p>{f.answer}</p>
                </details>
              ))}
          </section>
        </div>
        <aside>
          <div className="sidebar">
            <section className="registration">
              <small>Registration closes in</small>
              <Countdown
                deadline={e.registrationEnd}
                serverNow={data.serverNow}
              />
              {data.registration ? (
                <Link
                  className="button primary"
                  to={
                    data.registration.teamId
                      ? "/workspace/" + data.registration.teamId
                      : "/programs"
                  }
                >
                  Open workspace <ArrowUpRight size={16} />
                </Link>
              ) : (
                <button
                  className="primary wide"
                  disabled={e.status !== "Open" || action.busy}
                  onClick={register}
                >
                  {e.status === "Open"
                    ? user
                      ? "Register now"
                      : "Sign in to register"
                    : "Registration closed"}
                </button>
              )}
              <p>
                <b>{data.registered}</b> registered
              </p>
              <dl>
                {[
                  ["Registration closes", date(e.registrationEnd)],
                  ["Submission deadline", date(e.deadline)],
                  ["Entry", e.fee],
                  ["Eligibility", e.eligibility],
                ].map(([k, v]) => (
                  <div className="fact" key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <ErrorBox message={action.error} />
            </section>
            <section className="registration">
              <b>Your submission stays traceable</b>
              <p>
                Every finalised version has its own receipt and validation
                history.
              </p>
            </section>
          </div>
        </aside>
      </div>
    </main>
  );
}
function Auth() {
  const [params] = useSearchParams();
  const { refresh } = useContext(Account);
  const [signup, setSignup] = useState(false);
  const action = useAction();
  const navigate = useNavigate();
  const submit = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const body = Object.fromEntries(new FormData(ev.currentTarget));
    action.run(async () => {
      await api("/auth/" + (signup ? "register" : "login"), "POST", body);
      await refresh();
      const next = params.get("next");
      navigate(
        next?.startsWith("/") && !next.startsWith("//") ? next : "/programs",
      );
    });
  };
  return (
    <main className="auth-page">
      <div className="box">
        <small>YOUR NEXT BUILD STARTS HERE</small>
        <h1>{signup ? "Create your account" : "Welcome back"}</h1>
        <p>Sign in to manage your teams and submissions.</p>
        <form onSubmit={submit}>
          {signup && (
            <label>
              Your name
              <input name="name" required minLength={2} />
            </label>
          )}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              required
              minLength={10}
            />
          </label>
          <button className="primary wide" disabled={action.busy}>
            {signup ? "Create account" : "Sign in"}
          </button>
        </form>
        <ErrorBox message={action.error} />
        <button className="text-button" onClick={() => setSignup(!signup)}>
          {signup
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
        <p className="muted">
          Local development accounts are created by the seed command.
        </p>
      </div>
    </main>
  );
}
function Programs() {
  const { user } = useContext(Account);
  const [data, setData] = useState<any>(null);
  const action = useAction();
  const navigate = useNavigate();
  const reload = async () => setData(await api("/programs"));
  useEffect(() => {
    if (user) void action.run(reload);
  }, [user]);
  if (!user) return <SignIn />;
  return (
    <main className="wrap page">
      <small>YOUR BUILDING SPACE</small>
      <h1>My Programs</h1>
      <p>One workspace for every team and event.</p>
      <ErrorBox message={action.error} />
      {data?.programs.map((p: any) => (
        <section className="box" key={p._id}>
          <h2>{p.event.title}</h2>
          {p.team?.active ? (
            <>
              <p>{p.team.name}</p>
              <Link className="button primary" to={"/workspace/" + p.team._id}>
                Open workspace <ArrowRight size={16} />
              </Link>
            </>
          ) : (
            <div className="two-col">
              <form
                onSubmit={(ev) => {
                  ev.preventDefault();
                  const name = new FormData(ev.currentTarget).get("name");
                  action.run(async () => {
                    const r = await api(
                      "/events/" + p.event.slug + "/teams",
                      "POST",
                      { name },
                    );
                    navigate("/workspace/" + r.team._id);
                  });
                }}
              >
                <h3>Create your team</h3>
                <label>
                  Team name
                  <input name="name" required minLength={2} />
                </label>
                <button disabled={action.busy}>Create team</button>
              </form>
              <form
                onSubmit={(ev) => {
                  ev.preventDefault();
                  const code = new FormData(ev.currentTarget).get("code");
                  action.run(async () => {
                    const r = await api(
                      "/events/" + p.event.slug + "/join",
                      "POST",
                      { code },
                    );
                    navigate("/workspace/" + r.team._id);
                  });
                }}
              >
                <h3>Join with an invitation</h3>
                <label>
                  Invitation code
                  <input name="code" required />
                </label>
                <button disabled={action.busy}>Join team</button>
              </form>
            </div>
          )}
        </section>
      ))}
      {data?.programs.length === 0 && (
        <div className="empty">
          <p>You haven't registered for an event yet.</p>
          <Link className="button primary" to="/hackathons">
            Explore hackathons
          </Link>
        </div>
      )}
    </main>
  );
}
function SignIn() {
  return (
    <main className="wrap empty">
      <h1>Your workspace awaits</h1>
      <Link
        className="button primary"
        to={"/signin?next=" + encodeURIComponent(location.pathname)}
      >
        Sign in to continue
      </Link>
    </main>
  );
}
function Workspace() {
  const { teamId } = useParams();
  const { user } = useContext(Account);
  const [data, setData] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [live, setLive] = useState(false);
  const action = useAction();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const reload = async () => {
    const r = await api("/teams/" + teamId);
    setData(r);
    setDraft((current: any) => current || r.team.project);
  };
  useEffect(() => {
    if (!user) return;
    void action.run(reload);
    const stream = new EventSource("/api/teams/" + teamId + "/stream");
    stream.addEventListener("workspace", (event) => {
      setData(JSON.parse((event as MessageEvent).data));
      setLive(true);
    });
    stream.onerror = () => setLive(false);
    return () => stream.close();
  }, [teamId, user]);
  if (!user) return <SignIn />;
  if (!data || !draft)
    return (
      <main className="wrap page">
        <ErrorBox message={action.error} />
        {action.error ? (
          <button onClick={() => action.run(reload)}>Retry</button>
        ) : (
          <Loading />
        )}
      </main>
    );
  const t = data.team,
    e = data.event;
  const required = [
    "title",
    "shortDescription",
    "description",
    "stack",
    "github",
    "demo",
  ];
  const missing = required
    .filter((k) => !draft[k]?.trim())
    .concat(
      (e.requirements || []).filter((k: string) => !draft.extra?.[k]?.trim()),
    );
  const save = (ev: React.FormEvent) => {
    ev.preventDefault();
    action.run(async () => {
      await api("/teams/" + teamId + "/project", "PUT", draft);
      setMessage("Project draft saved");
      await reload();
    });
  };
  return (
    <main className="wrap page">
      <nav className="breadcrumb">
        <Link to="/programs">My Programs</Link> ›{" "}
        <Link to={"/hackathons/" + e.slug}>{e.title}</Link>
      </nav>
      <div className="page-heading">
        <div>
          <small>TEAM WORKSPACE</small>
          <h1>{t.name}</h1>
          <p>
            {live
              ? "● Live updates connected"
              : "○ Reconnecting · refresh remains available"}
          </p>
        </div>
        <button onClick={() => action.run(reload)}>Refresh</button>
      </div>
      <ErrorBox message={action.error} />
      <p role="status">{message}</p>
      <div className="callout">
        <Clock size={18} />
        <span>
          Submit by {date(e.deadline)} · {e.graceMinutes}-minute grace for
          uploads started before the deadline.
        </span>
      </div>
      <div className="workspace-grid">
        <div>
          <section className="box">
            <h2>01 · Project details</h2>
            <form onSubmit={save}>
              {required.map((k) => (
                <label key={k}>
                  {
                    (
                      {
                        title: "Project title",
                        shortDescription: "Short description",
                        description: "Full description",
                        stack: "Technology stack",
                        github: "GitHub URL",
                        demo: "Live demo URL",
                      } as any
                    )[k]
                  }
                  {k === "description" ? (
                    <textarea
                      rows={5}
                      value={draft[k]}
                      onChange={(ev) =>
                        setDraft({ ...draft, [k]: ev.target.value })
                      }
                    />
                  ) : (
                    <input
                      type={["github", "demo"].includes(k) ? "url" : "text"}
                      value={draft[k]}
                      onChange={(ev) =>
                        setDraft({ ...draft, [k]: ev.target.value })
                      }
                    />
                  )}
                </label>
              ))}
              {e.requirements?.map((k: string) => (
                <label key={k}>
                  {k}
                  <input
                    value={draft.extra?.[k] || ""}
                    onChange={(ev) =>
                      setDraft({
                        ...draft,
                        extra: { ...draft.extra, [k]: ev.target.value },
                      })
                    }
                  />
                </label>
              ))}
              <button className="primary" disabled={action.busy}>
                Save draft
              </button>
            </form>
          </section>
          <UploadPanel
            teamId={teamId!}
            uploads={data.uploads}
            refresh={reload}
            run={action.run}
            error={action.error}
            actionBusy={action.busy}
          />
          <section className="box">
            <h2>03 · Submission history</h2>
            <p>
              Received means the server issued a receipt. Accepted means the
              file and link checks passed.
            </p>
            {!data.submissions.length && (
              <p className="muted">
                Your first receipt will appear here after finalisation.
              </p>
            )}
            {data.submissions.map((s: any) => (
              <details className="submission" key={s._id}>
                <summary>
                  Version {s.version} · <span className="pill">{s.status}</span>{" "}
                  {s._id === data.latestEligible && " · Latest eligible"}
                </summary>
                <dl className="receipt">
                  <dt>Receipt</dt>
                  <dd>{s._id}</dd>
                  <dt>Received</dt>
                  <dd>{date(s.receivedAt)}</dd>
                  <dt>Deadline eligibility</dt>
                  <dd>{s.eligible ? "Within policy" : "Late"}</dd>
                  <dt>File</dt>
                  <dd>{s.file.filename}</dd>
                  <dt>SHA-256</dt>
                  <dd>{s.file.hash}</dd>
                </dl>
                {s.errors?.map((err: string) => (
                  <p className="error" key={err}>
                    {err}
                  </p>
                ))}
                {s.duplicate && (
                  <p className="warning">
                    Duplicate file warning. This version has its own receipt.
                  </p>
                )}
                {s.preview && <pre className="readme">{s.preview}</pre>}
                <button
                  onClick={() =>
                    action.run(async () => {
                      const r = await api(
                        "/submissions/" + s._id + "/download",
                      );
                      location.assign(r.url);
                    })
                  }
                >
                  Download original ZIP
                </button>
              </details>
            ))}
          </section>
          <section className="box">
            <h2>Deadline ledger</h2>
            {data.ledger.map((a: any) => (
              <div className="ledger" key={a._id}>
                <CheckCircle size={16} />
                <div>
                  <b>{a.action}</b>
                  <small>{date(a.createdAt)}</small>
                </div>
              </div>
            ))}
          </section>
        </div>
        <aside>
          <section className="box">
            <h2>Ready to submit?</h2>
            {missing.length ? (
              <ul>
                {missing.map((k: string) => (
                  <li key={k}>{k} required</li>
                ))}
              </ul>
            ) : (
              <p>✓ All project fields are complete.</p>
            )}
            <p>
              {t.members.length} / {e.maxTeam} members · minimum {e.minTeam}
            </p>
            {t.members.length < e.minTeam && (
              <p className="warning">
                Invite another member before finalising.
              </p>
            )}
          </section>
          <section className="box">
            <h2>Your team</h2>
            {data.members.map((m: any) => (
              <div className="member" key={m._id}>
                <b>{m.name}</b>
                <small>{m.email}</small>
                {m._id === t.leaderId && <span className="pill">Leader</span>}
                {t.leaderId === user.id && m._id !== user.id && (
                  <button
                    onClick={() =>
                      action.run(async () => {
                        await api(
                          "/teams/" + teamId + "/members/" + m._id,
                          "DELETE",
                          {},
                        );
                        await reload();
                      })
                    }
                  >
                    Remove member
                  </button>
                )}
              </div>
            ))}
            {t.leaderId === user.id && (
              <>
                <label>
                  Invitation code
                  <input readOnly value={t.invite} />
                </label>
                <small>Expires {date(t.inviteExpires)}</small>
                <form
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    const email = new FormData(ev.currentTarget).get("email");
                    action.run(async () => {
                      await api(
                        "/teams/" + teamId + "/invite",
                        "POST",
                        email ? { email } : {},
                      );
                      await reload();
                      setMessage("New invitation code created");
                    });
                  }}
                >
                  <label>
                    Invite an existing account
                    <input
                      name="email"
                      type="email"
                      placeholder="teammate@example.com"
                    />
                  </label>
                  <button>Renew invitation</button>
                </form>
              </>
            )}
            <button
              onClick={() =>
                action.run(async () => {
                  await api(
                    "/teams/" + teamId + "/members/" + user.id,
                    "DELETE",
                    {},
                  );
                  navigate("/programs");
                })
              }
            >
              Leave team
            </button>
          </section>
        </aside>
      </div>
    </main>
  );
}
function Notifications() {
  const { user } = useContext(Account);
  const [items, setItems] = useState<any[]>([]);
  const action = useAction();
  const reload = async () =>
    setItems((await api("/notifications")).notifications);
  useEffect(() => {
    if (user) void action.run(reload);
  }, [user]);
  if (!user) return <SignIn />;
  return (
    <main className="wrap page">
      <h1>Notifications</h1>
      <ErrorBox message={action.error} />
      {items.length === 0 && <p>No notifications yet.</p>}
      {items.map((n) => (
        <section className="box notification" key={n._id}>
          <div>
            <h3>
              {n.title} {!n.read && <span className="pill">New</span>}
            </h3>
            <p className="prose">{n.message}</p>
            <Link to={n.url}>Open related workspace</Link>
          </div>
          {!n.read && (
            <button
              onClick={() =>
                action.run(async () => {
                  await api("/notifications/" + n._id + "/read", "PUT", {});
                  await reload();
                })
              }
            >
              Mark read
            </button>
          )}
        </section>
      ))}
    </main>
  );
}
function Organiser() {
  const { user } = useContext(Account);
  const [events, setEvents] = useState<any[]>([]);
  const [selected, setSelected] = useState("");
  const [data, setData] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const action = useAction();
  const reload = async () => {
    const r = await api("/organiser/events");
    setEvents(r.events);
    const target = selected || r.events[0]?._id;
    if (target) {
      setSelected(target);
      setData(await api("/organiser/events/" + target + "/dashboard"));
    }
  };
  useEffect(() => {
    if (user?.role === "organiser") void action.run(reload);
  }, [user, selected]);
  if (!user) return <SignIn />;
  if (user.role !== "organiser")
    return (
      <main className="wrap empty">
        <h1>Organiser access required</h1>
        <p>
          Your account can participate in events. Use the organiser account
          created during local setup to manage them.
        </p>
      </main>
    );
  const newEvent = () =>
    setEditing({
      title: "",
      slug: "",
      organizer: "",
      summary: "",
      overview: "",
      rules: "",
      eligibility: "",
      mode: "Online",
      city: "",
      format: "Hackathon",
      theme: "Open Innovation",
      fee: "Free",
      prize: "",
      prizeAmount: 0,
      featured: false,
      minTeam: 2,
      maxTeam: 4,
      registrationEnd: new Date(Date.now() + 6 * 86400000).toISOString(),
      deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      graceMinutes: 5,
      requirements: [],
      announcements: [],
      faqs: [],
    });
  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    await action.run(async () => {
      await api(
        "/organiser/events" + (editing._id ? "/" + editing._id : ""),
        editing._id ? "PUT" : "POST",
        editing,
      );
      setEditing(null);
      await reload();
    });
  }
  return (
    <main className="wrap page">
      <div className="page-heading">
        <div>
          <small>ORGANISER CONTROL ROOM</small>
          <h1>Every submission accounted for.</h1>
        </div>
        <button className="primary" onClick={newEvent}>
          Create event
        </button>
      </div>
      <ErrorBox message={action.error} />
      <div className="actions">
        <label>
          Event
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {events.map((e) => (
              <option value={e._id} key={e._id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => action.run(reload)}>Refresh dashboard</button>
        {data && (
          <>
            <button
              onClick={() =>
                setEditing({
                  ...data.event,
                  registrationEnd: new Date(
                    data.event.registrationEnd,
                  ).toISOString(),
                  deadline: new Date(data.event.deadline).toISOString(),
                })
              }
            >
              Edit event
            </button>
            <a
              className="button"
              href={"/api/organiser/events/" + selected + "/export"}
            >
              Export CSV
            </a>
          </>
        )}
      </div>
      {editing && (
        <section className="box">
          <h2>{editing._id ? "Edit event" : "New event"}</h2>
          <form onSubmit={save}>
            <div className="form-grid">
              {[
                "title",
                "slug",
                "organizer",
                "summary",
                "overview",
                "rules",
                "eligibility",
                "city",
                "format",
                "theme",
                "prize",
              ].map((k) => (
                <label key={k}>
                  {k}
                  {["overview", "rules", "summary"].includes(k) ? (
                    <textarea
                      value={editing[k]}
                      onChange={(e) =>
                        setEditing({ ...editing, [k]: e.target.value })
                      }
                    />
                  ) : (
                    <input
                      value={editing[k]}
                      onChange={(e) =>
                        setEditing({ ...editing, [k]: e.target.value })
                      }
                    />
                  )}
                </label>
              ))}
              {["registrationEnd", "deadline"].map((k) => (
                <label key={k}>
                  {k} · UTC
                  <input
                    type="datetime-local"
                    required
                    value={editing[k].slice(0, 16)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        [k]: e.target.value + ":00.000Z",
                      })
                    }
                  />
                </label>
              ))}
              {["minTeam", "maxTeam", "graceMinutes", "prizeAmount"].map(
                (k) => (
                  <label key={k}>
                    {k}
                    <input
                      type="number"
                      min={0}
                      value={editing[k]}
                      onChange={(e) =>
                        setEditing({ ...editing, [k]: Number(e.target.value) })
                      }
                    />
                  </label>
                ),
              )}
              <label>
                Mode
                <select
                  value={editing.mode}
                  onChange={(e) =>
                    setEditing({ ...editing, mode: e.target.value })
                  }
                >
                  {["Online", "Offline", "Hybrid"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                Entry fee
                <select
                  value={editing.fee}
                  onChange={(e) =>
                    setEditing({ ...editing, fee: e.target.value })
                  }
                >
                  <option>Free</option>
                  <option>Paid</option>
                </select>
              </label>
              <label>
                Featured
                <input
                  type="checkbox"
                  checked={editing.featured}
                  onChange={(e) =>
                    setEditing({ ...editing, featured: e.target.checked })
                  }
                />
              </label>
              <label>
                Extra required fields · one per line
                <textarea
                  value={editing.requirements.join("\n")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      requirements: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                />
              </label>
              <label>
                Announcements · one per line
                <textarea
                  value={editing.announcements.join("\n")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      announcements: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                />
              </label>
            </div>
            <button className="primary" disabled={action.busy}>
              Save event
            </button>
            <button type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </form>
        </section>
      )}
      {data && (
        <>
          <section className="metrics">
            {Object.entries(data.metrics).map(([k, v]) => (
              <div className="box" key={k}>
                <small>{k.replace(/([A-Z])/g, " $1")}</small>
                <strong>{String(v)}</strong>
              </div>
            ))}
          </section>
          <section className="box">
            <h2>Teams and registrations</h2>
            <input
              aria-label="Search teams"
              placeholder="Search teams or project title"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Members</th>
                    <th>Project</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.teams
                    .filter((t: any) =>
                      (t.name + " " + t.project?.title)
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((t: any) => (
                      <tr key={t._id}>
                        <td>{t.name}</td>
                        <td>
                          {data.users
                            .filter((u: any) => t.members.includes(u._id))
                            .map((u: any) => u.name + " (" + u.email + ")")
                            .join(", ")}
                        </td>
                        <td>{t.project?.title || "Draft"}</td>
                        <td>{t.active ? "Active" : "Archived"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="box">
            <h2>Submission monitor</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Team / Version</th>
                    <th>Project</th>
                    <th>Receipt time</th>
                    <th>Eligibility</th>
                    <th>Validation</th>
                    <th>File</th>
                  </tr>
                </thead>
                <tbody>
                  {data.submissions.map((s: any) => (
                    <tr key={s._id}>
                      <td>
                        {data.teams.find((t: any) => t._id === s.teamId)?.name}{" "}
                        · v{s.version}
                      </td>
                      <td>{s.project.title}</td>
                      <td>{date(s.receivedAt)}</td>
                      <td>{s.eligible ? "On policy" : "Late"}</td>
                      <td>
                        {s.status}
                        {s.errors?.map((x: string) => (
                          <small key={x}>{x}</small>
                        ))}
                      </td>
                      <td>
                        <button
                          onClick={() =>
                            action.run(async () => {
                              const r = await api(
                                "/submissions/" + s._id + "/download",
                              );
                              location.assign(r.url);
                            })
                          }
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="box">
            <h2>Worker and email jobs</h2>
            <p className="muted">
              SMTP acceptance is shown separately from delivery. Inspect
              uncertain sends before retrying.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>State</th>
                    <th>Attempts</th>
                    <th>Details</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.map((j: any) => (
                    <tr key={j._id}>
                      <td>{j.kind}</td>
                      <td>{j.state}</td>
                      <td>{j.attempts}</td>
                      <td>{j.lastError || j.providerResponse || "—"}</td>
                      <td>
                        {["failed", "uncertain"].includes(j.state) && (
                          <button
                            onClick={() =>
                              action.run(async () => {
                                await api(
                                  "/organiser/jobs/" + j._id + "/retry",
                                  "POST",
                                  {},
                                );
                                await reload();
                              })
                            }
                          >
                            Retry job
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="box">
            <h2>Recent event ledger</h2>
            {data.ledger.map((a: any) => (
              <div className="ledger" key={a._id}>
                <Clock size={16} />
                <span>
                  {a.action} · {date(a.createdAt)}
                </span>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
function Root() {
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const refresh = async () => {
    setUser((await api("/me")).user);
  };
  useEffect(() => {
    refresh()
      .finally(() => setReady(true))
      .catch(() => {});
  }, []);
  return (
    <Account.Provider value={{ user, refresh }}>
      <BrowserRouter>{ready ? <Shell /> : <Loading />}</BrowserRouter>
    </Account.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<Root />);
