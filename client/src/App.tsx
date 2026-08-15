import { useState } from "react";
import { checkSystem, Category } from "./api.js";

// UI states you must handle for Issue 4: idle, loading, success, error.
type UiState = "idle" | "loading" | "success" | "error";

export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  void categories;

  async function handleCheck() {
    // TODO(Issue 4): set loading, call checkSystem(), then either
    //   - success: store categories and show Online + the list, or
    //   - error: show Offline + a useful message.
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

  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>

      <button className="btn btn-success" onClick={handleCheck} disabled={state === "loading"}>
        {state === "loading" ? "Loading…" : "Check System"}
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
  );
}
