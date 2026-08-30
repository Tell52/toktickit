import { useState } from "react";
import { checkSystem, Category, Requester } from "./api.js";
import RequesterSelection from "./RequesterSelection.js";

type UiState = "idle" | "loading" | "success" | "error";

export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);

  const [currentRequester, setCurrentRequester] = useState<Requester | null>(null);

  async function handleCheck() {
    setState("loading");
    try {
      const status = await checkSystem();
      if (status.online) {
        setCategories(status.categories);
        setState("success");
      }
    } catch (error) {
      setState("error");
    }
  }

  if (!currentRequester) {
    return <RequesterSelection onSelect={setCurrentRequester} />;
  }

  return (
    <div>
      <header className="p-3 text-white d-flex justify-content-between align-items-center" style={{ backgroundColor: "#006B3C" }}>
        <div className="d-flex align-items-center gap-4">
          <h1 className="h5 mb-0 m-0">TokTickIT</h1>
          <nav className="d-flex gap-3">
            <span className="fw-bold" style={{ cursor: "pointer" }}>My Tickets</span>
            <span style={{ cursor: "pointer", opacity: 0.8 }}>Create Ticket</span>
          </nav>
        </div>

        <div className="d-flex align-items-center gap-3">
          <span className="small">👤 {currentRequester.name}</span>
          <button
            className="btn btn-sm btn-outline-light"
            onClick={() => setCurrentRequester(null)}
          >
            Change Requester
          </button>
        </div>
      </header>

      <main className="container py-5" style={{ maxWidth: 640 }}>
        <h2 className="h4 mb-4">
          Welcome, {currentRequester.name}
        </h2>

        <div className="card p-4 shadow-sm border-0" style={{ backgroundColor: "#F5F7F6" }}>
          <h3 className="h6 mb-3 text-muted">Lab 1 System Check</h3>
          <button className="btn text-white w-100" style={{ backgroundColor: "#0B7A46" }} onClick={handleCheck} disabled={state === "loading"}>
            {state === "loading" ? "Loading..." : "Check System"}
          </button>

          <div className="mt-4">
            {state === "success" && (
              <div>
                <p>System Status: <strong>Online</strong></p>
                <p>Supported Request Categories:</p>
                <ul>
                  {categories.map((cat) => (
                    <li key={cat.id}>{cat.name}</li>
                  ))}
                </ul>
              </div>
            )}
            {state === "error" && (
              <div>
                <p>System Status: <strong>Offline</strong></p>
                <p className="text-danger">Unable to connect to TokTickIT API</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}