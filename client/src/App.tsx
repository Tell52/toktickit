import { useState } from "react";
import { checkSystem, Category, Requester } from "./api.js";
import RequesterSelection from "./RequesterSelection.js";
import CreateTicket from "./components/CreateTicket.js";
import MyTickets from "./MyTickets.js";
import RequesterTicketDetail from "./RequesterTicketDetail.js";

type UiState = "idle" | "loading" | "success" | "error";
type PageState = "create" | "list" | "system-check" | "detail";

export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentRequester, setCurrentRequester] = useState<Requester | null>(null);

  const [activePage, setActivePage] = useState<PageState>("create");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const handleViewTicket = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setActivePage("detail");
  };

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
    <div style={{ backgroundColor: "#F5F7F6", minHeight: "100vh" }}>
      <header className="p-3 text-white d-flex justify-content-between align-items-center shadow-sm" style={{ backgroundColor: "#006B3C" }}>
        <div className="d-flex align-items-center gap-4">
          <h1 className="h5 mb-0 m-0 fw-bold">TokTickIT</h1>
          <nav className="d-flex gap-4">
            <a
              href="#"
              className={`text-white text-decoration-none ${activePage === "list" ? "fw-bold" : ""}`}
              style={{ opacity: activePage === "list" ? 1 : 0.8 }}
              onClick={(e) => { e.preventDefault(); setActivePage("list"); }}
            >
              My Tickets
            </a>
            <a
              href="#"
              className={`text-white text-decoration-none ${activePage === "create" ? "fw-bold" : ""}`}
              style={{ opacity: activePage === "create" ? 1 : 0.8 }}
              onClick={(e) => { e.preventDefault(); setActivePage("create"); }}
            >
              Create Ticket
            </a>
            <a
              href="#"
              className={`text-white text-decoration-none ${activePage === "system-check" ? "fw-bold" : ""}`}
              style={{ opacity: activePage === "system-check" ? 1 : 0.8 }}
              onClick={(e) => { e.preventDefault(); setActivePage("system-check"); }}
            >
              System Check
            </a>
          </nav>
        </div>

        <div className="d-flex align-items-center gap-3">
          <span className="small">👤 <span>{currentRequester.name}</span></span>
          <button
            className="btn btn-sm btn-outline-light"
            onClick={() => setCurrentRequester(null)}
          >
            Change Requester
          </button>
        </div>
      </header>

      <main className="container py-4" style={{ maxWidth: (activePage === "create" || activePage === "detail") ? 800 : 640 }}>

        {activePage === "create" && (
          <CreateTicket requesterId={currentRequester.id} />
        )}

        {activePage === "list" && (
          <MyTickets
            requesterId={currentRequester.id}
            onViewTicket={handleViewTicket}
          />
        )}

        {activePage === "detail" && selectedTicketId && (
          <div>
            <button
              className="btn btn-outline-secondary mb-3"
              onClick={() => setActivePage("list")}
            >
              &larr; Back to My Tickets
            </button>
            <RequesterTicketDetail
              ticketId={selectedTicketId}
              currentRequesterId={currentRequester.id}
            />
          </div>
        )}

        {activePage === "system-check" && (
          <div>
            <h2 className="h4 mb-4">Welcome, {currentRequester.name}</h2>
            <div className="card p-4 shadow-sm border-0" style={{ backgroundColor: "#FFFFFF" }}>
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
          </div>
        )}
      </main>
    </div>
  );
}