import { useState, useEffect, useContext } from "react";
import { AuthContext, useAuth } from "./context/AuthContext.js";
import RequesterSelection from "./RequesterSelection.js";
import Login from "./components/Login.js";
import ChangePassword from "./components/ChangePassword.js";
import CreateTicket from "./components/CreateTicket.js";
import MyTickets from "./MyTickets.js";
import RequesterTicketDetail from "./RequesterTicketDetail.js";
import ProtectedRoute from "./components/ProtectedRoute.js";
import StaffTicketQueue from "./components/StaffTicketQueue.js";
import StaffTicketDetail from "./components/StaffTicketDetail.js";
import UserManagement from "./components/UserManagement.js";


export function RoleBadge({ role }: { role: string }) {
  const norm = (role || "").toUpperCase();
  if (norm === "ADMINISTRATOR") {
    return (
      <span
        data-testid="role-badge"
        className="badge px-2 py-1"
        style={{
          backgroundColor: "#EAF6EF",
          color: "#006B3C",
          border: "1.5px solid #006B3C",
          fontWeight: 600,
        }}
      >
        Administrator
      </span>
    );
  }
  if (norm === "IT_STAFF") {
    return (
      <span
        data-testid="role-badge"
        className="badge px-2 py-1"
        style={{
          backgroundColor: "#EBF5FF",
          color: "#0D6EFD",
          border: "1.5px solid #0D6EFD",
          fontWeight: 600,
        }}
      >
        IT Staff
      </span>
    );
  }
  // REQUESTER or default: สีเทา/Neutral
  return (
    <span
      data-testid="role-badge"
      className="badge px-2 py-1"
      style={{
        backgroundColor: "#F1F3F5",
        color: "#495057",
        border: "1px solid #CED4DA",
        fontWeight: 600,
      }}
    >
      Requester
    </span>
  );
}

export default function App() {
  const authContext = useContext(AuthContext);
  const { user, loading, logout } = useAuth();
  const [lab2Requester, setLab2Requester] = useState<any>(null);
  const [currentPath, setCurrentPath] = useState(
    typeof window !== "undefined" ? window.location.pathname || "/" : "/"
  );
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Fallback for legacy Lab 1 & 2 tests that render <App /> directly without AuthProvider
  if (!authContext) {
    if (!lab2Requester) {
      return <RequesterSelection onSelect={setLab2Requester} />;
    }
  }

  const navigate = (path: string) => {
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setCurrentPath(path);
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || "/");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Sync root path '/' with role-based default destination
  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (currentPath !== "/login") {
        navigate("/login");
      }
      return;
    }

    if (user.mustChangePassword) {
      if (currentPath !== "/change-password") {
        navigate("/change-password");
      }
      return;
    }

    if (currentPath === "/" || currentPath === "/login") {
      const userRole = (user.role || "").toUpperCase();
      if (userRole === "REQUESTER") {
        navigate("/tickets");
      } else {
        navigate("/queue");
      }
    }
  }, [user, loading, currentPath]);

  // Loading indicator while verifying authentication
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100" style={{ backgroundColor: "#F5F7F6" }}>
        <div className="spinner-border text-success" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  // Handle Login screen
  if (!user && currentPath === "/login") {
    return <Login onNavigate={navigate} />;
  }

  // Handle mandatory Change Password screen before entering shell
  if (user && user.mustChangePassword && currentPath === "/change-password") {
    return <ChangePassword onNavigate={navigate} />;
  }

  // If unauthenticated for any other route, redirect via ProtectedRoute or fallback to Login
  if (!user) {
    return <Login onNavigate={navigate} />;
  }

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleViewTicket = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    navigate(`/tickets/${ticketId}`);
  };

  const userRole = (user.role || "").toUpperCase();
  const isRequester = userRole === "REQUESTER";
  const isItStaff = userRole === "IT_STAFF";
  const isAdmin = userRole === "ADMINISTRATOR";

  return (
    <div style={{ backgroundColor: "#F5F7F6", minHeight: "100vh" }}>
      {/* Navbar Header */}
      <header className="p-3 text-white d-flex justify-content-between align-items-center shadow-sm" style={{ backgroundColor: "#006B3C" }}>
        <div className="d-flex align-items-center gap-4">
          <h1
            className="h5 mb-0 fw-bold"
            style={{ cursor: "pointer" }}
            onClick={() => navigate(isRequester ? "/tickets" : "/queue")}
          >
            TokTickIT
          </h1>

          {/* Navigation Items filtered strictly by role (FR-07) */}
          <nav className="d-flex gap-3 align-items-center">
            {/* Requester Navigation Links */}
            {isRequester && (
              <a
                href="#tickets"
                className={`text-white text-decoration-none ${currentPath === "/tickets" || currentPath.startsWith("/tickets/") ? "fw-bold" : ""}`}
                style={{ opacity: currentPath === "/tickets" || currentPath.startsWith("/tickets/") ? 1 : 0.8 }}
                onClick={(e) => { e.preventDefault(); navigate("/tickets"); }}
              >
                My Tickets
              </a>
            )}

            {/* IT Staff & Administrator Navigation Links */}
            {(isItStaff || isAdmin) && (
              <a
                href="#queue"
                className={`text-white text-decoration-none ${currentPath === "/queue" ? "fw-bold" : ""}`}
                style={{ opacity: currentPath === "/queue" ? 1 : 0.8 }}
                onClick={(e) => { e.preventDefault(); navigate("/queue"); }}
              >
                My Queue
              </a>
            )}

            {/* Create Ticket available for all roles */}
            <a
              href="#create-ticket"
              className={`text-white text-decoration-none ${currentPath === "/create-ticket" ? "fw-bold" : ""}`}
              style={{ opacity: currentPath === "/create-ticket" ? 1 : 0.8 }}
              onClick={(e) => { e.preventDefault(); navigate("/create-ticket"); }}
            >
              Create Ticket
            </a>

            {/* Administrator only Navigation Link */}
            {isAdmin && (
              <a
                href="#admin"
                className={`text-white text-decoration-none ${currentPath === "/admin" ? "fw-bold" : ""}`}
                style={{ opacity: currentPath === "/admin" ? 1 : 0.8 }}
                onClick={(e) => { e.preventDefault(); navigate("/admin"); }}
              >
                Admin
              </a>
            )}

            {/* Profile available for all roles */}
            <a
              href="#profile"
              className={`text-white text-decoration-none ${currentPath === "/profile" ? "fw-bold" : ""}`}
              style={{ opacity: currentPath === "/profile" ? 1 : 0.8 }}
              onClick={(e) => { e.preventDefault(); navigate("/profile"); }}
            >
              Profile
            </a>
          </nav>
        </div>

        {/* User identity & Role badge & Logout on top-right */}
        <div className="d-flex align-items-center gap-3">
          <span className="small text-white d-flex align-items-center gap-1">
            👤 <span>{user.name}</span>
          </span>
          <RoleBadge role={user.role} />
          <button
            className="btn btn-sm btn-outline-light"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content with Route Guards */}
      <main className="container py-4" style={{ maxWidth: currentPath === "/admin" ? 1140 : 880 }}>
        {/* Requester: My Tickets */}
        {currentPath === "/tickets" && (
          <ProtectedRoute allowedRoles={["REQUESTER"]} currentPath={currentPath} onNavigate={navigate}>
            <MyTickets
              requesterId={user.id}
              onViewTicket={handleViewTicket}
            />
          </ProtectedRoute>
        )}

        {/* Ticket Detail */}
        {currentPath.startsWith("/tickets/") && (
          <ProtectedRoute currentPath={currentPath} onNavigate={navigate}>
            <div>
              <button
                className="btn btn-outline-secondary mb-3"
                onClick={() => navigate(isRequester ? "/tickets" : "/queue")}
              >
                &larr; Back to {isRequester ? "My Tickets" : "My Queue"}
              </button>
              {isRequester ? (
                <RequesterTicketDetail
                  ticketId={selectedTicketId || currentPath.replace("/tickets/", "")}
                  currentRequesterId={user.id}
                />
              ) : (
                <StaffTicketDetail
                  ticketId={selectedTicketId || currentPath.replace("/tickets/", "")}
                  currentUser={user}
                  onBack={() => navigate("/queue")}
                />
              )}
            </div>
          </ProtectedRoute>
        )}

        {/* IT Staff & Admin: My Queue */}
        {currentPath === "/queue" && (
          <ProtectedRoute allowedRoles={["IT_STAFF", "ADMINISTRATOR"]} currentPath={currentPath} onNavigate={navigate}>
            <StaffTicketQueue onViewTicket={handleViewTicket} />
          </ProtectedRoute>
        )}

        {/* Create Ticket */}
        {currentPath === "/create-ticket" && (
          <ProtectedRoute allowedRoles={["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]} currentPath={currentPath} onNavigate={navigate}>
            <CreateTicket requesterId={user.id} />
          </ProtectedRoute>
        )}

        {/* Admin User Management */}
        {currentPath === "/admin" && (
          <ProtectedRoute allowedRoles={["ADMINISTRATOR"]} currentPath={currentPath} onNavigate={navigate}>
            <UserManagement currentUser={user} />
          </ProtectedRoute>
        )}

        {/* Profile / Change Password Screen */}
        {currentPath === "/profile" && (
          <ProtectedRoute allowedRoles={["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]} currentPath={currentPath} onNavigate={navigate}>
            <div className="card shadow-sm border-0 p-4" style={{ backgroundColor: "#FFFFFF", borderRadius: 12 }}>
              <h3 className="h5 mb-4" style={{ color: "#006B3C" }}>Profile</h3>
              <div className="row g-3 mb-4">
                <div className="col-md-6">
                  <label className="form-label text-muted small fw-semibold">Full Name</label>
                  <input type="text" className="form-control" value={user.name} readOnly style={{ backgroundColor: "#F0F4F1" }} />
                </div>
                <div className="col-md-6">
                  <label className="form-label text-muted small fw-semibold">Email Address</label>
                  <input type="text" className="form-control" value={user.email} readOnly style={{ backgroundColor: "#F0F4F1" }} />
                </div>
                <div className="col-md-6">
                  <label className="form-label text-muted small fw-semibold">Role</label>
                  <div><RoleBadge role={user.role} /></div>
                </div>
              </div>
              <hr />
              <h4 className="h6 mb-3" style={{ color: "#006B3C" }}>Change Password</h4>
              <p className="text-muted small">Update your password voluntarily at any time.</p>
              <ChangePassword onSuccess={() => navigate("/profile")} />
            </div>
          </ProtectedRoute>
        )}
      </main>
    </div>
  );
}