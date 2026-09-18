import React, { useState, useEffect, useCallback } from "react";
import {
  getStaffTickets,
  getCategories,
  Category,
  StaffTicket,
} from "../api.js";

interface StaffTicketQueueProps {
  onViewTicket?: (ticketId: string) => void;
}

type SortField = "ticketNumber" | "createdAt" | "itPriority" | "status";
type SortOrder = "asc" | "desc";

// Utility to render owner avatar initials
function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

// Badge styling helper for Ticket Status
export function StatusBadge({ status }: { status: string }) {
  const norm = (status || "").toLowerCase();
  let bg = "#F1F3F5";
  let color = "#495057";
  let border = "#CED4DA";

  if (norm === "new" || norm === "open") {
    bg = "#E7F5FF";
    color = "#1971C2";
    border = "#A5D8FF";
  } else if (norm === "in progress" || norm === "in_progress") {
    bg = "#FFF3BF";
    color = "#D9480F";
    border = "#FFE066";
  } else if (norm === "waiting for requester" || norm === "waiting_for_requester") {
    bg = "#F3F0FF";
    color = "#6741D9";
    border = "#D0BFFF";
  } else if (norm === "resolved") {
    bg = "#EAF6EF";
    color = "#006B3C";
    border = "#A3CFBB";
  } else if (norm === "closed") {
    bg = "#F1F3F5";
    color = "#495057";
    border = "#CED4DA";
  } else if (norm === "cancelled") {
    bg = "#FFE3E3";
    color = "#C92A2A";
    border = "#FFA8A8";
  } else if (norm === "reopened") {
    bg = "#FFF4E6";
    color = "#D9480F";
    border = "#FFD8A8";
  }

  return (
    <span
      className="badge px-2 py-1"
      data-testid="status-badge"
      style={{
        backgroundColor: bg,
        color,
        border: `1px solid ${border}`,
        fontWeight: 600,
        fontSize: "0.8rem",
      }}
    >
      {status}
    </span>
  );
}

// Badge styling helper for Priority
export function PriorityBadge({ priority }: { priority: string }) {
  const norm = (priority || "").toLowerCase();
  let bg = "#F1F3F5";
  let color = "#495057";
  let border = "#CED4DA";

  if (norm === "high") {
    bg = "#FFE3E3";
    color = "#C92A2A";
    border = "#FFA8A8";
  } else if (norm === "medium") {
    bg = "#FFF3BF";
    color = "#B15600";
    border = "#FFE066";
  } else if (norm === "low") {
    bg = "#EAF6EF";
    color = "#006B3C";
    border = "#A3CFBB";
  }

  return (
    <span
      className="badge px-2 py-1"
      data-testid="priority-badge"
      style={{
        backgroundColor: bg,
        color,
        border: `1px solid ${border}`,
        fontWeight: 600,
        fontSize: "0.78rem",
      }}
    >
      {priority}
    </span>
  );
}

export default function StaffTicketQueue({ onViewTicket }: StaffTicketQueueProps) {
  // Data states
  const [tickets, setTickets] = useState<StaffTicket[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [ownerFilter, setOwnerFilter] = useState<string>("");

  // Sorting
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [totalCount, setTotalCount] = useState<number>(0);

  // 1. Fetch Categories for filter dropdown
  useEffect(() => {
    let isMounted = true;
    try {
      const p = getCategories?.();
      if (p && typeof p.then === "function") {
        p.then((data) => {
          if (isMounted && Array.isArray(data)) setCategories(data);
        }).catch(() => {});
      }
    } catch {}
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Debounce search input (~300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // 3. Fetch tickets from backend API
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sortParam = (sortOrder === "desc" ? "-" : "") + sortField;
      const res = await getStaffTickets?.({
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        category: categoryFilter || undefined,
        owner: ownerFilter || undefined,
        sort: sortParam,
        page,
        pageSize,
      });

      if (res && Array.isArray(res.tickets)) {
        setTickets(res.tickets);
        setTotalCount(res.pagination?.totalCount ?? res.tickets.length);
      } else {
        setTickets([]);
        setTotalCount(0);
      }
    } catch (err: any) {
      setError("Unable to load ticket queue. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, priorityFilter, categoryFilter, ownerFilter, sortField, sortOrder, page, pageSize]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Handle Sort column click
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder(field === "createdAt" ? "desc" : "asc");
    }
    setPage(1);
  };

  // Clear all filters
  const handleClearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("");
    setPriorityFilter("");
    setCategoryFilter("");
    setOwnerFilter("");
    setSortField("createdAt");
    setSortOrder("desc");
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    search || statusFilter || priorityFilter || categoryFilter || ownerFilter
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalCount);

  // Sort indicator arrow
  const renderSortArrow = (field: SortField) => {
    if (sortField !== field) {
      return <span className="text-muted ms-1" style={{ fontSize: "0.7rem" }}>↕</span>;
    }
    return (
      <span className="ms-1 fw-bold text-success" data-testid={`sort-indicator-${field}`}>
        {sortOrder === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  return (
    <div className="container-fluid px-0">
      {/* Header */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2 mb-4">
        <div>
          <h2 className="h4 mb-1 fw-bold" style={{ color: "#006B3C" }}>
            IT Staff Ticket Queue
          </h2>
          <p className="text-muted small mb-0">
            Monitor, prioritize, and manage all support requests across the organization.
          </p>
        </div>
        <span className="badge px-3 py-2" style={{ backgroundColor: "#EAF6EF", color: "#006B3C", border: "1px solid #A3CFBB" }}>
          Total Tickets: {totalCount}
        </span>
      </div>

      {/* Search & Filter Bar */}
      <div className="card shadow-sm border-0 mb-4" style={{ backgroundColor: "#FFFFFF", borderRadius: 10 }}>
        <div className="card-body p-3">
          <div className="row g-2 align-items-center">
            {/* Search Input */}
            <div className="col-12 col-md-4">
              <div className="input-group">
                <span className="input-group-text bg-light border-end-0 text-muted">🔍</span>
                <input
                  type="text"
                  className="form-control border-start-0"
                  placeholder="Search by ticket number or summary…"
                  aria-label="Search by ticket number or summary"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Status Filter */}
            <div className="col-6 col-md-2">
              <select
                className="form-select"
                aria-label="Status filter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Statuses</option>
                <option value="New">New</option>
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Waiting for Requester">Waiting for Requester</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
                <option value="Reopened">Reopened</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {/* Priority Filter */}
            <div className="col-6 col-md-2">
              <select
                className="form-select"
                aria-label="Priority filter"
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Priorities</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>

            {/* Owner Filter */}
            <div className="col-6 col-md-2">
              <select
                className="form-select"
                aria-label="Owner filter"
                value={ownerFilter}
                onChange={(e) => {
                  setOwnerFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Owners</option>
                <option value="me">Me</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </div>

            {/* Category Filter */}
            <div className="col-6 col-md-2 d-flex gap-2">
              <select
                className="form-select"
                aria-label="Category filter"
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Filter Clear Action */}
          {hasActiveFilters && (
            <div className="d-flex justify-content-end align-items-center mt-2 pt-2 border-top">
              <button
                type="button"
                className="btn btn-sm btn-link text-decoration-none text-danger px-0"
                onClick={handleClearFilters}
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="card shadow-sm border-0 p-5 text-center bg-white" style={{ borderRadius: 10 }}>
          <div className="spinner-border text-success mx-auto mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted small mb-0">Loading ticket queue…</p>
        </div>
      ) : error ? (
        <div className="alert alert-danger shadow-sm d-flex justify-content-between align-items-center p-3" role="alert">
          <div>
            <strong>Error:</strong> {error}
          </div>
          <button className="btn btn-sm btn-outline-danger" onClick={fetchTickets}>
            Retry
          </button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="card shadow-sm border-0 p-5 text-center bg-white" style={{ borderRadius: 10 }}>
          <div className="mb-3" style={{ fontSize: "2.5rem" }}>
            📋
          </div>
          {hasActiveFilters ? (
            <div>
              <h5 className="h6 text-muted mb-2">No tickets match your search/filters</h5>
              <p className="text-muted small mb-3">Try adjusting or clearing your search criteria.</p>
              <button className="btn btn-sm btn-outline-success" onClick={handleClearFilters}>
                Clear Filters
              </button>
            </div>
          ) : (
            <div>
              <h5 className="h6 text-muted mb-1">No tickets yet</h5>
              <p className="text-muted small mb-0">All submitted tickets will appear here.</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table (Visible on md and wider) */}
          <div className="table-responsive d-none d-md-block shadow-sm rounded-3 bg-white mb-3">
            <table className="table table-hover align-middle mb-0" data-testid="staff-ticket-table">
              <thead style={{ backgroundColor: "#EAF6EF", color: "#006B3C" }}>
                <tr>
                  <th
                    style={{ cursor: "pointer", width: "13%" }}
                    onClick={() => handleSort("ticketNumber")}
                    aria-label="Sort by Ticket Number"
                  >
                    Ticket No. {renderSortArrow("ticketNumber")}
                  </th>
                  <th
                    style={{ cursor: "pointer", width: "12%" }}
                    onClick={() => handleSort("createdAt")}
                    aria-label="Sort by Created Date"
                  >
                    Created Date {renderSortArrow("createdAt")}
                  </th>
                  <th style={{ width: "25%" }}>Summary</th>
                  <th style={{ width: "11%" }}>Category</th>
                  <th style={{ width: "10%" }}>Req. Priority</th>
                  <th
                    style={{ cursor: "pointer", width: "10%" }}
                    onClick={() => handleSort("itPriority")}
                    aria-label="Sort by IT Priority"
                  >
                    IT Priority {renderSortArrow("itPriority")}
                  </th>
                  <th
                    style={{ cursor: "pointer", width: "10%" }}
                    onClick={() => handleSort("status")}
                    aria-label="Sort by Status"
                  >
                    Status {renderSortArrow("status")}
                  </th>
                  <th style={{ width: "12%" }}>Owner</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => onViewTicket?.(t.id.toString())}
                    data-testid={`ticket-row-${t.ticketNumber}`}
                  >
                    <td className="fw-bold" style={{ color: "#006B3C" }}>
                      {t.ticketNumber}
                    </td>
                    <td className="text-muted small">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <span className="fw-medium text-dark">{t.summary}</span>
                    </td>
                    <td className="small text-muted">{t.category || "—"}</td>
                    <td>
                      <PriorityBadge priority={t.requestedPriority} />
                    </td>
                    <td>
                      <PriorityBadge priority={t.itPriority || t.requestedPriority} />
                    </td>
                    <td>
                      <StatusBadge status={t.status || t.currentStatus || "New"} />
                    </td>
                    <td>
                      {t.owner ? (
                        <div className="d-flex align-items-center gap-2">
                          <span
                            className="rounded-circle d-flex align-items-center justify-content-center text-primary fw-bold"
                            style={{
                              width: 26,
                              height: 26,
                              backgroundColor: "#EBF5FF",
                              fontSize: "0.75rem",
                              border: "1px solid #BEE3F8",
                            }}
                            title={t.owner.name}
                          >
                            {getInitials(t.owner.name)}
                          </span>
                          <span className="small text-truncate" style={{ maxWidth: 100 }}>
                            {t.owner.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted fst-italic small">Unassigned</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List (Visible below md breakpoint) */}
          <div className="d-block d-md-none mb-3" data-testid="staff-ticket-mobile-list">
            {tickets.map((t) => (
              <div
                key={t.id}
                className="card shadow-sm border-0 mb-3"
                style={{ borderRadius: 10, cursor: "pointer" }}
                onClick={() => onViewTicket?.(t.id.toString())}
                data-testid={`ticket-card-${t.ticketNumber}`}
              >
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="fw-bold" style={{ color: "#006B3C" }}>
                      {t.ticketNumber}
                    </span>
                    <StatusBadge status={t.status || t.currentStatus || "New"} />
                  </div>
                  <h6 className="card-title fw-semibold text-dark mb-2">{t.summary}</h6>
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                    <span className="small text-muted">{t.category || "General"}</span>
                    <span className="text-muted">•</span>
                    <PriorityBadge priority={t.itPriority || t.requestedPriority} />
                  </div>
                  <div className="d-flex justify-content-between align-items-center pt-2 border-top text-muted small">
                    <div>
                      {t.owner ? (
                        <span>
                          👤 <span className="text-dark fw-medium">{t.owner.name}</span>
                        </span>
                      ) : (
                        <span className="fst-italic">Unassigned</span>
                      )}
                    </div>
                    <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          <div className="card shadow-sm border-0 bg-white p-3" style={{ borderRadius: 10 }}>
            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-center gap-2">
              <span className="text-muted small" data-testid="pagination-label">
                Showing {startItem} to {endItem} of {totalCount} tickets
              </span>
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous Page"
                >
                  Previous
                </button>
                <span className="small text-muted px-2">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next Page"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
