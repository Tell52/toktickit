import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  getStaffTicketDetail,
  createComment,
  createStaffTicketNote,
  getStaffUsers,
  StaffTicketDetailData,
  StaffUserItem,
} from "../api.js";
import { StatusBadge, PriorityBadge } from "./StaffTicketQueue.js";
import { RoleBadge } from "../App.js";
import ActionsTaken from './ActionsTaken';

import TicketWorkflow from './TicketWorkflow';
import TicketStatusHistory from './TicketStatusHistory';
import { accessFailure } from '../workflow-feedback';
import { useAuth } from '../context/AuthContext';
export { ALLOWED_STATUS_TRANSITIONS } from './TicketWorkflow';

interface StaffTicketDetailProps {
  ticketId: string | number;
  currentUser?: any;
  onBack?: () => void;
}

export default function StaffTicketDetail({
  ticketId,
  currentUser,
  onBack,
}: StaffTicketDetailProps) {
  const [ticket, setTicket] = useState<StaffTicketDetailData | null>(null);
  const [staffUsers, setStaffUsers] = useState<StaffUserItem[]>([]);
  const [activeTab, setActiveTab] = useState<"comments" | "notes" | "attachments">("comments");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionsBusy, setActionsBusy] = useState(false);
  const auth = useAuth();
  const revoked = useRef(false);
  const onAccessError = useCallback((err: any) => {
    revoked.current = true;
    setTicket(null); setStaffUsers([]); setNewComment(''); setNewNote('');
    setError(accessFailure(err) || 'Ticket access is unavailable.');
    if (err?.status === 401 || err?.error?.code === 'UNAUTHENTICATED') {
      localStorage.removeItem('csrfToken'); auth.invalidateSession?.();
    } else if (err?.status === 403) void auth.checkAuth();
  }, [auth.invalidateSession, auth.checkAuth]);
  const accessHandler = useRef(onAccessError);
  accessHandler.current = onAccessError;

  // Composers
  const [newComment, setNewComment] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const [newNote, setNewNote] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const fetchTicket = useCallback(async () => {
    try {
      const data = await getStaffTicketDetail(ticketId);
      if (!revoked.current) { setError(null); setTicket(data); }
      return data;
    } catch (err) {
      if (accessFailure(err)) accessHandler.current(err);
      else setError('Failed to load ticket details. Please retry.');
      throw err;
    } finally { setLoading(false); }
  }, [ticketId]);

  const fetchStaffUsers = useCallback(async () => {
    try {
      const res = await getStaffUsers();
      if (res && Array.isArray(res.users)) {
        setStaffUsers(res.users);
      }
    } catch {
      // Non-critical, fallback to current owner or empty list
    }
  }, []);

  useEffect(() => {
    revoked.current = false;
    setLoading(true);
    setTicket(null);
    void fetchTicket().catch(() => {});
    fetchStaffUsers();
  }, [fetchTicket, fetchStaffUsers]);

  // 4. Handle Public Comment submit
  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) {
      setCommentError("Comment cannot be empty");
      return;
    }
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      await createComment(String(ticket?.id || ticketId), newComment.trim());
      setNewComment("");
      await fetchTicket();
    } catch (err: any) {
      if (accessFailure(err)) onAccessError(err);
      else setCommentError('Failed to post comment. Please retry.');
    } finally {
      setCommentSubmitting(false);
    }
  };

  // 5. Handle Internal Note submit
  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) {
      setNoteError("Internal note cannot be empty");
      return;
    }
    setNoteSubmitting(true);
    setNoteError(null);
    try {
      await createStaffTicketNote(ticketId, newNote.trim());
      setNewNote("");
      await fetchTicket();
    } catch (err: any) {
      if (accessFailure(err)) onAccessError(err);
      else setNoteError('Failed to post internal note. Please retry.');
    } finally {
      setNoteSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="card shadow-sm border-0 p-5 text-center my-4" style={{ backgroundColor: "#FFFFFF", borderRadius: 12 }}>
        <div className="spinner-border text-success mx-auto mb-3" role="status">
          <span className="visually-hidden">Loading ticket...</span>
        </div>
        <div className="text-muted">Loading ticket details...</div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="card shadow-sm border-0 p-4 my-4" style={{ backgroundColor: "#FFFFFF", borderRadius: 12 }}>
        <div className="alert alert-danger mb-3" role="alert">
          <strong>Error:</strong> {error || "Unable to display ticket"}
        </div>
        {!revoked.current && <button type="button" className="btn btn-outline-success" onClick={() => void fetchTicket().catch(() => {})}>Retry loading ticket</button>}
        {onBack && (
          <button className="btn btn-outline-secondary" onClick={onBack}>
            &larr; Back to Queue
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="staff-ticket-detail my-3" data-testid="staff-ticket-detail">
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {/* Main Ticket Container */}
      <div className="card shadow-sm border-0 mb-4" style={{ backgroundColor: "#FFFFFF", borderRadius: 12 }}>
        <div className="card-body p-4">
          {/* Top Title & ID Bar */}
          <div className="d-flex flex-wrap justify-content-between align-items-center border-bottom pb-3 mb-4 gap-2">
            <div>
              <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                <h2 className="h4 mb-0 fw-bold" style={{ color: "#006B3C" }}>
                  <span style={{ overflowWrap: 'anywhere' }}>{ticket.ticketNumber}</span>
                </h2>
                <span className="badge bg-light text-muted border">Staff Detail</span>
              </div>
              <p className="text-muted small mb-0">
                Created on {new Date(ticket.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <StatusBadge status={ticket.status || ticket.currentStatus} />
              <PriorityBadge priority={ticket.itPriority} />
            </div>
          </div>

          {/* Section 1 & 2: Header Identity & Requester Info (Read-Only) */}
          <div className="mb-4">
            <h5 className="text-muted text-uppercase fw-bold" style={{ fontSize: "0.75rem", letterSpacing: "0.5px" }}>
              Ticket Information (Read-Only)
            </h5>
            <div className="row g-3">
              {/* Category */}
              <div className="col-md-4 col-sm-6">
                <label className="form-label text-muted small fw-semibold mb-1">Category</label>
                <div
                  className="p-2 rounded read-only-field"
                  data-testid="readonly-category"
                  style={{ backgroundColor: "#F0F4F1", border: "1px solid #E2E8E4", minHeight: 38 }}
                >
                  <span className="fw-medium text-dark">{ticket.category || "—"}</span>
                </div>
              </div>

              {/* Related System */}
              <div className="col-md-4 col-sm-6">
                <label className="form-label text-muted small fw-semibold mb-1">Related System</label>
                <div
                  className="p-2 rounded read-only-field"
                  data-testid="readonly-related-system"
                  style={{ backgroundColor: "#F0F4F1", border: "1px solid #E2E8E4", minHeight: 38 }}
                >
                  <span className="fw-medium text-dark">{ticket.relatedSystem || "—"}</span>
                </div>
              </div>

              {/* Requester Info */}
              <div className="col-md-4 col-sm-12">
                <label className="form-label text-muted small fw-semibold mb-1">Requester</label>
                <div
                  className="p-2 rounded read-only-field d-flex align-items-center gap-2"
                  data-testid="readonly-requester"
                  style={{ backgroundColor: "#F0F4F1", border: "1px solid #E2E8E4", minHeight: 38 }}
                >
                  <span>👤</span>
                  <div>
                    <span className="fw-medium text-dark d-block leading-tight">
                      {ticket.requester?.name || "Unknown Requester"}
                    </span>
                    {ticket.requester?.email && (
                      <span className="text-muted" style={{ fontSize: "0.75rem" }}>
                        {ticket.requester.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Requester Priority note & Problem Appears Resolved Indicator */}
            <div className="d-flex flex-wrap gap-3 mt-2 align-items-center">
              <span className="small text-muted">
                Requested Priority: <strong>{ticket.requestedPriority}</strong>
              </span>
              {ticket.problemAppearsResolved && (
                <span
                  className="badge px-2 py-1"
                  style={{ backgroundColor: "#EAF6EF", color: "#006B3C", border: "1px solid #A3CFBB" }}
                  data-testid="problem-resolved-indicator"
                >
                  ✓ Requester indicated problem appears resolved
                  {ticket.indicatedAt ? ` (${new Date(ticket.indicatedAt).toLocaleDateString()})` : ""}
                </span>
              )}
            </div>
          </div>

          <TicketWorkflow key={`workflow-${ticketId}`} ticketId={ticketId} ticket={ticket} staffUsers={staffUsers}
            currentUser={currentUser} refreshTicket={fetchTicket} onAccessError={onAccessError} blocked={actionsBusy || commentSubmitting || noteSubmitting} />

          {/* Section 4: Summary & Description (Read-Only) */}
          <div className="mb-4">
            <h5 className="text-muted text-uppercase fw-bold" style={{ fontSize: "0.75rem", letterSpacing: "0.5px" }}>
              Summary & Description
            </h5>
            <div className="p-3 rounded mb-2" style={{ backgroundColor: "#F8F9FA", border: "1px solid #E9ECEF" }}>
              <div className="fw-bold mb-2 text-dark">{ticket.summary}</div>
              <div className="text-dark" style={{ whiteSpace: "pre-wrap" }}>
                {ticket.description}
              </div>
            </div>
          </div>

          <ActionsTaken key={String(ticketId)} ticketId={ticketId} ticketStatus={ticket.status || ticket.currentStatus}
            ticketCreatedAt={ticket.createdAt} currentUser={currentUser}
            refreshKey={ticket.version} refreshTicket={fetchTicket} onAccessError={onAccessError} onBusyChange={setActionsBusy} />
          <TicketStatusHistory ticketId={ticketId} refreshKey={ticket.version} onAccessError={onAccessError} />

          {/* Section 5: Tabbed Section (Public Comments · Internal Notes · Attachments) */}
          <div className="mt-4">
            {/* Tabs Header */}
            <ul className="nav nav-tabs mb-3" role="tablist">
              {/* Public Comments Tab */}
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link fw-semibold ${activeTab === "comments" ? "active text-success" : "text-muted"}`}
                  onClick={() => setActiveTab("comments")}
                  type="button"
                  data-testid="tab-public-comments"
                  style={{
                    borderColor: activeTab === "comments" ? "#006B3C #006B3C #FFFFFF" : undefined,
                    borderTopWidth: activeTab === "comments" ? 3 : 1,
                  }}
                >
                  💬 Public Comments ({ticket.comments?.length || 0})
                </button>
              </li>

              {/* Internal Notes Tab (Distinctly styled) */}
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link fw-semibold ${activeTab === "notes" ? "active" : ""}`}
                  onClick={() => setActiveTab("notes")}
                  type="button"
                  data-testid="tab-internal-notes"
                  style={{
                    backgroundColor: activeTab === "notes" ? "#FFFBEB" : undefined,
                    color: activeTab === "notes" ? "#B45309" : "#6B7280",
                    borderColor: activeTab === "notes" ? "#F59E0B #F59E0B #FFFBEB" : undefined,
                    borderTopWidth: activeTab === "notes" ? 3 : 1,
                  }}
                >
                  🔒 Internal Notes ({ticket.notes?.length || 0})
                </button>
              </li>

              {/* Attachments Tab */}
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link fw-semibold ${activeTab === "attachments" ? "active text-success" : "text-muted"}`}
                  onClick={() => setActiveTab("attachments")}
                  type="button"
                  data-testid="tab-attachments"
                  style={{
                    borderColor: activeTab === "attachments" ? "#006B3C #006B3C #FFFFFF" : undefined,
                    borderTopWidth: activeTab === "attachments" ? 3 : 1,
                  }}
                >
                  📎 Attachments ({ticket.attachments?.length || 0})
                </button>
              </li>
            </ul>

            {/* Tab 1: Public Comments Panel */}
            {activeTab === "comments" && (
              <div data-testid="public-comments-panel" className="p-3 border rounded" style={{ backgroundColor: "#FFFFFF" }}>
                <div className="mb-3 d-flex flex-wrap gap-2 justify-content-between align-items-center">
                  <h6 className="fw-bold mb-0 text-dark">Public Conversation Thread</h6>
                  <span className="small text-muted">Visible to Requester and Staff</span>
                </div>

                {/* Comment List */}
                <div className="comments-list mb-4 d-flex flex-column gap-3">
                  {!ticket.comments || ticket.comments.length === 0 ? (
                    <div className="text-muted text-center py-4 bg-light rounded small">
                      No public comments yet. Post an update below.
                    </div>
                  ) : (
                    ticket.comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="p-3 rounded border"
                        style={{ backgroundColor: "#F8F9FA", borderColor: "#E9ECEF" }}
                        data-testid="comment-item"
                      >
                        <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-2">
                          <div className="d-flex align-items-center gap-2">
                            <span className="fw-bold small text-dark">{comment.authorName}</span>
                            <RoleBadge role={comment.authorRole} />
                          </div>
                          <span className="text-muted small">
                            {new Date(comment.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-dark small" style={{ whiteSpace: "pre-wrap" }}>
                          {comment.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Comment Composer */}
                <form onSubmit={handleCommentSubmit}>
                  {commentError && (
                    <div className="alert alert-danger py-1 px-2 small mb-2">{commentError}</div>
                  )}
                  <div className="mb-2">
                    <label htmlFor="public-comment-input" className="form-label small fw-semibold text-dark">
                      Add Public Comment
                    </label>
                    <textarea
                      id="public-comment-input"
                      data-testid="public-comment-input"
                      className="form-control"
                      rows={3}
                      placeholder="Write a message visible to the requester..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      disabled={commentSubmitting}
                    />
                  </div>
                  <button
                    type="submit"
                    data-testid="post-comment-button"
                    className="btn btn-sm text-white"
                    style={{ backgroundColor: "#006B3C" }}
                    disabled={commentSubmitting || !newComment.trim()}
                  >
                    {commentSubmitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" />
                        Posting...
                      </>
                    ) : (
                      "Post Comment"
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* Tab 2: Internal Notes Panel (Visually Distinct STYLE-04, UI-09) */}
            {activeTab === "notes" && (
              <div
                data-testid="internal-notes-panel"
                className="p-3 border rounded"
                style={{
                  backgroundColor: "#FFFBEB",
                  borderColor: "#FDE68A",
                }}
              >
                {/* Internal Warning Banner */}
                <div
                  className="d-flex align-items-center gap-2 p-2 mb-3 rounded"
                  data-testid="internal-notes-banner"
                  style={{ backgroundColor: "#FEF3C7", border: "1px solid #FCD34D", color: "#92400E" }}
                >
                  <span style={{ fontSize: "1.2rem" }}>🔒</span>
                  <div>
                    <strong className="d-block small">Internal Notes — Confidential</strong>
                    <span className="small">
                      Visible exclusively to IT Staff and Administrators. Never shown to Requesters.
                    </span>
                  </div>
                </div>

                {/* Notes List */}
                <div className="notes-list mb-4 d-flex flex-column gap-3">
                  {!ticket.notes || ticket.notes.length === 0 ? (
                    <div
                      className="text-muted text-center py-4 rounded small"
                      style={{ backgroundColor: "#FEF9C3" }}
                    >
                      No internal notes recorded yet.
                    </div>
                  ) : (
                    ticket.notes.map((note) => (
                      <div
                        key={note.id}
                        className="p-3 rounded border"
                        style={{ backgroundColor: "#FFFFFF", borderColor: "#FDE68A" }}
                        data-testid="note-item"
                      >
                        <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-2">
                          <div className="d-flex align-items-center gap-2">
                            <span className="fw-bold small text-dark">🔒 {note.authorName}</span>
                            <span
                              className="badge px-1 py-0"
                              style={{ backgroundColor: "#FEF3C7", color: "#B45309", fontSize: "0.7rem" }}
                            >
                              IT Staff Note
                            </span>
                          </div>
                          <span className="text-muted small">
                            {new Date(note.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-dark small" style={{ whiteSpace: "pre-wrap" }}>
                          {note.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Note Composer */}
                <form onSubmit={handleNoteSubmit}>
                  {noteError && (
                    <div className="alert alert-danger py-1 px-2 small mb-2">{noteError}</div>
                  )}
                  <div className="mb-2">
                    <label htmlFor="internal-note-input" className="form-label small fw-semibold text-dark">
                      Add Internal Note
                    </label>
                    <textarea
                      id="internal-note-input"
                      data-testid="internal-note-input"
                      className="form-control"
                      rows={3}
                      placeholder="Add private technical notes, troubleshooting steps, or vendor escalations..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      disabled={noteSubmitting}
                      style={{ borderColor: "#F59E0B" }}
                    />
                  </div>
                  <button
                    type="submit"
                    data-testid="post-note-button"
                    className="btn btn-sm text-dark fw-semibold"
                    style={{ backgroundColor: "#FBBF24", border: "1px solid #D97706" }}
                    disabled={noteSubmitting || !newNote.trim()}
                  >
                    {noteSubmitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" />
                        Saving Note...
                      </>
                    ) : (
                      "Add Internal Note"
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* Tab 3: Attachments Panel */}
            {activeTab === "attachments" && (
              <div data-testid="attachments-panel" className="p-3 border rounded" style={{ backgroundColor: "#FFFFFF" }}>
                <h6 className="fw-bold mb-3 text-dark">Attached Files</h6>
                {!ticket.attachments || ticket.attachments.length === 0 ? (
                  <div className="text-muted text-center py-4 bg-light rounded small">
                    No attachments uploaded for this ticket.
                  </div>
                ) : (
                  <div className="list-group">
                    {ticket.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="list-group-item d-flex justify-content-between align-items-center"
                        data-testid="attachment-item"
                      >
                        <div>
                          <div className="fw-semibold text-dark">{att.fileName}</div>
                          <div className="small text-muted">
                            {(att.fileSize / 1024).toFixed(1)} KB · {att.fileType}
                          </div>
                        </div>
                        {att.fileUrl && (
                          <a
                            href={att.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-sm btn-outline-success"
                          >
                            Download / View
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
