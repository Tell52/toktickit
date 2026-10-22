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
import { allowNavigation } from './navigation-guard';
import './App.css';
import RequesterDashboard from './components/RequesterDashboard';
import StaffDashboard from './components/StaffDashboard';


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
  const [currentUrl, setCurrentUrl] = useState(
    typeof window !== "undefined" ? window.location.pathname + window.location.search : "/"
  );
  const currentPath = currentUrl.split('?')[0];
  const detailMatch = /^\/tickets\/([1-9]\d*)$/.exec(currentPath);
  const currentQuery = currentUrl.includes('?') ? currentUrl.slice(currentUrl.indexOf('?') + 1) : '';

  // Fallback for legacy Lab 1 & 2 tests that render <App /> directly without AuthProvider
  if (!authContext) {
    if (!lab2Requester) {
      return <RequesterSelection onSelect={setLab2Requester} />;
    }
  }

  const navigate = (path: string) => {
    if (path !== currentUrl && !allowNavigation()) return;
    if (typeof window !== "undefined" && window.location.pathname + window.location.search !== path) {
      window.history.pushState({ ticketList: ['/tickets', '/queue', '/dashboard'].includes(currentPath) ? currentUrl : window.history.state?.ticketList }, "", path);
    }
    setCurrentUrl(path);
  };

  useEffect(() => {
    const handlePopState = () => {
      if (!allowNavigation()) { window.history.pushState({}, "", currentUrl); return; }
      setCurrentUrl(window.location.pathname + window.location.search);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [currentUrl]);

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
      navigate("/dashboard");
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
    if (!allowNavigation()) return;
    await logout();
    navigate("/login");
  };

  const handleViewTicket = (ticketId: string) => {
    navigate(`/tickets/${ticketId}`);
  };

  const userRole = (user.role || "").toUpperCase();
  const isRequester = userRole === "REQUESTER";
  const isItStaff = userRole === "IT_STAFF";
  const isAdmin = userRole === "ADMINISTRATOR";

  return (
    <div style={{ backgroundColor: "#F5F7F6", minHeight: "100vh" }}>
      {/* Navbar Header */}
      <header className="app-shell-header p-3 text-white d-flex flex-wrap gap-3 justify-content-between align-items-center shadow-sm" style={{ backgroundColor: "#006B3C" }}>
        <div className="d-flex flex-wrap align-items-center gap-4">
          <h1
            className="h5 mb-0 fw-bold"
          >
            <a href="/dashboard" className="text-white text-decoration-none" onClick={event => { event.preventDefault(); navigate('/dashboard'); }}>TokTickIT</a>
          </h1>

          {/* Navigation Items filtered strictly by role (FR-07) */}
          <nav className="d-flex flex-wrap gap-3 align-items-center">
            <a href="/dashboard" aria-current={currentPath === '/dashboard' ? 'page' : undefined} className={`text-white text-decoration-none ${currentPath === '/dashboard' ? 'fw-bold' : ''}`} onClick={e => { e.preventDefault(); navigate('/dashboard'); }}>Dashboard</a>
            {/* Requester Navigation Links */}
            {isRequester && (
              <a
                href="/tickets"
                aria-current={currentPath === '/tickets' ? 'page' : undefined}
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
                href="/queue"
                aria-current={currentPath === '/queue' ? 'page' : undefined}
                className={`text-white text-decoration-none ${currentPath === "/queue" ? "fw-bold" : ""}`}
                style={{ opacity: currentPath === "/queue" ? 1 : 0.8 }}
                onClick={(e) => { e.preventDefault(); navigate("/queue"); }}
              >
                My Queue
              </a>
            )}

            {/* Create Ticket available for all roles */}
            <a
              href="/create-ticket"
              aria-current={currentPath === '/create-ticket' ? 'page' : undefined}
              className={`text-white text-decoration-none ${currentPath === "/create-ticket" ? "fw-bold" : ""}`}
              style={{ opacity: currentPath === "/create-ticket" ? 1 : 0.8 }}
              onClick={(e) => { e.preventDefault(); navigate("/create-ticket"); }}
            >
              Create Ticket
            </a>

            {/* Administrator only Navigation Link */}
            {isAdmin && (
              <a
                href="/admin"
                aria-current={currentPath === '/admin' ? 'page' : undefined}
                className={`text-white text-decoration-none ${currentPath === "/admin" ? "fw-bold" : ""}`}
                style={{ opacity: currentPath === "/admin" ? 1 : 0.8 }}
                onClick={(e) => { e.preventDefault(); navigate("/admin"); }}
              >
                Admin
              </a>
            )}

            {/* Profile available for all roles */}
            <a
              href="/profile"
              aria-current={currentPath === '/profile' ? 'page' : undefined}
              className={`text-white text-decoration-none ${currentPath === "/profile" ? "fw-bold" : ""}`}
              style={{ opacity: currentPath === "/profile" ? 1 : 0.8 }}
              onClick={(e) => { e.preventDefault(); navigate("/profile"); }}
            >
              Profile
            </a>
          </nav>
        </div>

        {/* User identity & Role badge & Logout on top-right */}
        <div className="d-flex flex-wrap align-items-center gap-3">
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
      <main className="container py-4" style={{ maxWidth: currentPath === "/admin" ? 1140 : currentPath.startsWith('/tickets/') || currentPath === '/dashboard' ? 1280 : 880 }}>
        {currentPath === '/dashboard' && <ProtectedRoute currentPath={currentPath} onNavigate={navigate}>
          {isRequester ? <RequesterDashboard key={user.id} onNavigate={navigate} /> : <StaffDashboard key={user.id + user.role} query={currentQuery} onNavigate={navigate} />}
        </ProtectedRoute>}
        {/* Requester: My Tickets */}
        {currentPath === "/tickets" && (
          <ProtectedRoute allowedRoles={["REQUESTER"]} currentPath={currentPath} onNavigate={navigate}>
            <MyTickets
              key={user.id}
              requesterId={user.id}
              onViewTicket={handleViewTicket}
              query={currentQuery}
              onNavigate={navigate}
            />
          </ProtectedRoute>
        )}

        {/* Ticket Detail */}
        {detailMatch && (
          <ProtectedRoute currentPath={currentPath} onNavigate={navigate}>
            <div>
              <button
                className="btn btn-outline-secondary mb-3"
                onClick={() => navigate(window.history.state?.ticketList || (isRequester ? '/tickets' : '/queue'))}
              >
                &larr; Back to {isRequester ? "My Tickets" : "My Queue"}
              </button>
              {isRequester ? (
                <RequesterTicketDetail
                  key={currentPath}
                  ticketId={detailMatch[1]}
                  currentRequesterId={user.id}
                />
              ) : (
                <StaffTicketDetail
                  key={currentPath}
                  ticketId={detailMatch[1]}
                  currentUser={user}
                  onBack={() => navigate(window.history.state?.ticketList || '/queue')}
                />
              )}
            </div>
          </ProtectedRoute>
        )}

        {/* IT Staff & Admin: My Queue */}
        {currentPath === "/queue" && (
          <ProtectedRoute allowedRoles={["IT_STAFF", "ADMINISTRATOR"]} currentPath={currentPath} onNavigate={navigate}>
            <StaffTicketQueue key={user.id + user.role + currentQuery} query={currentQuery} onNavigate={navigate} onViewTicket={handleViewTicket} />
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
        {!detailMatch && !['/', '/login', '/change-password', '/dashboard', '/tickets', '/queue', '/create-ticket', '/admin', '/profile'].includes(currentPath) && <section>
          <h2>Page not found</h2><a href="/dashboard" onClick={e => { e.preventDefault(); navigate('/dashboard'); }}>Return to your home page</a>
        </section>}
      </main>
    </div>
  );
}
