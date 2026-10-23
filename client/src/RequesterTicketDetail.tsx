import AttachmentReference from './components/AttachmentReference';
import React, { useState, useEffect, useRef } from "react";
import {
  getTicketDetail,
  uploadAttachment,
  softRemoveAttachment,
  createComment,
  indicateResolved,
} from "./api.js";
import { StatusBadge, PriorityBadge } from './components/StaffTicketQueue.js';
import { RoleBadge } from "./App.js";
import ActionsTaken from './components/ActionsTaken';
import TicketStatusHistory from './components/TicketStatusHistory';
import WorkflowDialog from './components/WorkflowDialog';
import { accessFailure } from './workflow-feedback';
import { useAuth } from './context/AuthContext';

interface Attachment {
  id: number;
  fileName: string;
  isRemoved: boolean;
  removalReason?: string;
  fileUrl: string;
}

interface Comment {
  id: string;
  content: string;
  authorName?: string;
  authorRole?: string;
  author?: {
    id: string;
    name: string;
    role: string;
  };
  createdAt: string;
}

interface Ticket {
  version?: number;
  resolutionCycle?: number;
  resolvedAt?: string | null;
  id: number;
  ticketNumber: string;
  summary: string;
  description: string;
  requestedPriority: string;
  itPriority?: string;
  currentStatus: string;
  problemAppearsResolved?: boolean;
  indicatedAt?: string | null;
  attachments: Attachment[];
  comments?: Comment[];
  category: { name: string };
  relatedSystem: { name: string };
}

export default function RequesterTicketDetail({
  ticketId,
  currentRequesterId, // retained as optional for backwards compatibility, not sent to API
}: {
  ticketId: string;
  currentRequesterId?: any;
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const auth = useAuth();
  const revoked = useRef(false), indicatorInFlight = useRef(false);
  const [indicatorError, setIndicatorError] = useState('');
  const [indicatorNeedsLatest, setIndicatorNeedsLatest] = useState(false);
  const onAccessError = (err: any) => {
    revoked.current = true;
    setTicket(null); setNewComment(''); setSelectedFile(null); setRemovalReason(''); setShowResolvedDialog(false);
    setError(accessFailure(err) || 'Ticket access is unavailable.');
    if (err?.status === 401 || err?.error?.code === 'UNAUTHENTICATED') { localStorage.removeItem('csrfToken'); auth.invalidateSession?.(); }
    else if (err?.status === 403) void auth.checkAuth();
  };

  // Attachments state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removalReason, setRemovalReason] = useState("");

  // Problem Appears Resolved state
  const [showResolvedDialog, setShowResolvedDialog] = useState(false);
  const [resolvingIndicator, setResolvingIndicator] = useState(false);

  // Public Comments state
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Background refresh leaves comments, actions, and recoverable drafts mounted.
  const fetchTicket = async () => {
    try {
      const data = await getTicketDetail(ticketId);
      if (!revoked.current) { setTicket(data); setError(''); }
      return data;
    } catch (err) {
      if (accessFailure(err)) onAccessError(err);
      else setError('Failed to load ticket details. Please retry.');
      throw err;
    } finally { setLoading(false); }
  };
  useEffect(() => {
    revoked.current = false; setLoading(true); setTicket(null);
    void fetchTicket().catch(() => {});
  }, [ticketId]);

  // 2. Upload attachment
  const handleUpload = async () => {
    if (!selectedFile) return;
    try {
      setUploading(true);
      await uploadAttachment(ticketId, selectedFile, currentRequesterId);
      setSelectedFile(null);
      await fetchTicket();
    } catch (err: any) {
      if (accessFailure(err)) onAccessError(err);
      else setError('Failed to upload attachment. Please retry.');
    } finally {
      setUploading(false);
    }
  };

  // 3. Confirm attachment soft-removal
  const handleConfirmRemove = async () => {
    if (!removingId || !removalReason.trim()) {
      alert("Please provide a removal reason.");
      return;
    }
    try {
      await softRemoveAttachment(ticketId, removingId, removalReason, currentRequesterId);
      setRemovingId(null);
      setRemovalReason("");
      await fetchTicket();
    } catch (err: any) {
      if (accessFailure(err)) onAccessError(err);
      else setError('Failed to remove attachment. Please retry.');
    }
  };

  // The Requester's indication never changes the formal Ticket status.
  const handleConfirmResolved = async () => {
    if (indicatorInFlight.current || indicatorNeedsLatest) return;
    indicatorInFlight.current = true; setResolvingIndicator(true); setIndicatorError('');
    let written = false;
    try {
      const res = await indicateResolved(ticketId);
      written = true;
      setShowResolvedDialog(false);
      setTicket(prev => prev ? { ...prev, problemAppearsResolved: true, indicatedAt: res.indicatedAt, version: res.version ?? prev.version } : null);
      await fetchTicket();
    } catch (err) {
      if (accessFailure(err)) onAccessError(err);
      else {
        setIndicatorNeedsLatest(true);
        setIndicatorError(written ? 'Your indication was saved. Load the latest ticket to refresh this view.' : 'Your indication could not be confirmed. Load the latest ticket before retrying.');
      }
    } finally { indicatorInFlight.current = false; setResolvingIndicator(false); }
  };
  const refreshIndicator = async () => {
    if (indicatorInFlight.current) return;
    indicatorInFlight.current = true; setResolvingIndicator(true);
    try { await fetchTicket(); setIndicatorNeedsLatest(false); setIndicatorError(''); }
    catch { /* fetchTicket displays a safe message and clears denied data. */ }
    finally { indicatorInFlight.current = false; setResolvingIndicator(false); }
  };

  // 5. Post Public Comment
  const handlePostComment = async () => {
    const trimmed = newComment.trim();
    if (!trimmed) return;

    try {
      setSubmittingComment(true);
      await createComment(ticketId, trimmed);
      setNewComment("");
      await fetchTicket();
    } catch (err: any) {
      if (accessFailure(err)) onAccessError(err);
      else setError('Failed to post comment. Please retry.');
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <div className="spinner-border text-success" role="status">
          <span className="visually-hidden">Loading ticket details...</span>
        </div>
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="requester-ticket-detail container py-4">
        <div className="alert alert-danger" role="alert">
          Error: {error}
        </div>
        <button type="button" className="btn btn-outline-success" onClick={() => { revoked.current = false; void fetchTicket().catch(() => {}); }}>Retry loading ticket</button>
      </div>
    );
  }

  if (!ticket) return null;

  const activeAttachmentsCount = (ticket.attachments || []).filter((a) => !a.isRemoved).length;
  const isUploadDisabled = activeAttachmentsCount >= 5;
  const readOnlyStyle = { backgroundColor: "#F0F4F1", borderColor: "#D1DDD5" };

  // Status check for "Problem Appears Resolved" button:
  // Visible ONLY when status is Open, In Progress, or Waiting for Requester
  // Hidden if Resolved, Closed, Cancelled (or New), or if already indicated
  const normalizedStatus = (ticket.currentStatus || "").toLowerCase().replace(/_/g, " ").trim();
  const isEligibleStatus = ["open", "in progress", "waiting for requester"].includes(normalizedStatus);
  const canShowResolvedButton = isEligibleStatus && !ticket.problemAppearsResolved;

  // Format date for display: "You indicated this problem appears resolved on [date]"
  const formatResolvedDate = (dateVal?: string | null) => {
    if (!dateVal) return new Date().toLocaleDateString();
    try {
      const d = new Date(dateVal);
      return isNaN(d.getTime()) ? dateVal : d.toLocaleDateString();
    } catch {
      return dateVal;
    }
  };

  // Sort comments chronologically (oldest first)
  const sortedComments = [...(ticket.comments || [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="requester-ticket-detail container py-4">
      {error && <div role="alert">{error}<button type="button" onClick={() => void fetchTicket().catch(() => {})}>Retry loading ticket</button></div>}
      {indicatorError && !showResolvedDialog && <div role="alert">{indicatorError}<button type="button" disabled={resolvingIndicator} onClick={() => void refreshIndicator()}>Load latest ticket</button></div>}
      {/* Header with Title and Status/Priority Badges */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
        <div>
          <h2 className="mb-1 fw-bold" style={{ color: "#006B3C" }}>
            Ticket Details: {ticket.ticketNumber}
          </h2>
          <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
            <span className="text-muted small">Status:</span>
            <StatusBadge status={ticket.currentStatus} />
            <span className="text-muted small ms-2">Priority:</span>
            <PriorityBadge priority={ticket.requestedPriority} />
          </div>
        </div>

        {/* Problem Appears Resolved Indicator Section */}
        <div>
          {ticket.problemAppearsResolved ? (
            <div
              className="px-3 py-2 rounded d-flex align-items-center gap-2"
              style={{
                backgroundColor: "#EAF6EF",
                color: "#006B3C",
                border: "1px solid #A3D9B8",
                fontWeight: 500,
                fontSize: "0.9rem",
              }}
            >
              <span>✓</span>
              <span>
                You indicated this problem appears resolved on {formatResolvedDate(ticket.indicatedAt)}
              </span>
            </div>
          ) : canShowResolvedButton ? (
            <div>
              {!showResolvedDialog ? (
                <button
                  type="button"
                  className="btn btn-outline-success d-flex align-items-center gap-2 shadow-sm"
                  style={{ borderColor: "#006B3C", color: "#006B3C", fontWeight: 600 }}
                  onClick={() => setShowResolvedDialog(true)}
                  id="requester-resolved-indicator"
                >
                  <span>✓</span> Problem Appears Resolved
                </button>
              ) : (
                <WorkflowDialog title="Confirm Problem Resolved" returnFocusId="requester-resolved-indicator" busy={resolvingIndicator} onDismiss={() => setShowResolvedDialog(false)}>
                  <p className="small mb-2 fw-medium text-dark">
                    This lets IT Staff know the issue seems fixed. It won't close the ticket.
                  </p>
                  {indicatorError && <div role="alert">{indicatorError}</div>}
                  {indicatorNeedsLatest && <button type="button" disabled={resolvingIndicator} onClick={() => void refreshIndicator()}>Load latest ticket</button>}
                  <div className="d-flex justify-content-end gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => setShowResolvedDialog(false)}
                      disabled={resolvingIndicator}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm text-white fw-semibold"
                      style={{ backgroundColor: "#006B3C", borderColor: "#006B3C" }}
                      onClick={handleConfirmResolved}
                      disabled={resolvingIndicator || indicatorNeedsLatest}
                    >
                      {resolvingIndicator ? "Submitting..." : "Confirm"}
                    </button>
                  </div>
                </WorkflowDialog>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* ======================================================== */}
      {/* ส่วนที่ 1: ข้อมูลตั๋ว (Read-only)                          */}
      {/* ======================================================== */}
      <div className="card shadow-sm border-0 mb-4" style={{ borderRadius: 12 }}>
        <div className="card-body p-4">
          <div className="row g-3">
            <div className="col-md-6">
              <label htmlFor="ticket-summary" className="form-label text-muted small fw-semibold">Summary</label>
              <textarea id="ticket-summary" rows={2}
                className="form-control"
                value={ticket.summary}
                readOnly
                style={readOnlyStyle}
              />
            </div>
            <div className="col-md-6">
              <label htmlFor="ticket-status" className="form-label text-muted small fw-semibold">Status</label>
              <input id="ticket-status"
                type="text"
                className="form-control"
                value={ticket.currentStatus}
                readOnly
                style={readOnlyStyle}
              />
            </div>
            <div className="col-md-4">
              <label htmlFor="ticket-category" className="form-label text-muted small fw-semibold">Category</label>
              <input id="ticket-category"
                type="text"
                className="form-control"
                value={ticket.category?.name || ""}
                readOnly
                style={readOnlyStyle}
              />
            </div>
            <div className="col-md-4">
              <label htmlFor="ticket-related-system" className="form-label text-muted small fw-semibold">Related System</label>
              <input id="ticket-related-system"
                type="text"
                className="form-control"
                value={ticket.relatedSystem?.name || ""}
                readOnly
                style={readOnlyStyle}
              />
            </div>
            <div className="col-md-4">
              <label htmlFor="ticket-priority" className="form-label text-muted small fw-semibold">Priority</label>
              <input id="ticket-priority"
                type="text"
                className="form-control"
                value={ticket.requestedPriority}
                readOnly
                style={readOnlyStyle}
              />
            </div>
            <div className="col-12">
              <label htmlFor="ticket-description" className="form-label text-muted small fw-semibold">Description</label>
              <textarea id="ticket-description"
                className="form-control"
                rows={4}
                value={ticket.description}
                readOnly
                style={readOnlyStyle}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* ส่วนที่ 2: Public Comments (Lab 3)                       */}
      {/* ======================================================== */}
      <div className="card shadow-sm border-0 mb-4" style={{ borderRadius: 12 }}>
        <div className="card-body p-4">
          <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
            <h5 className="mb-0 fw-bold" style={{ color: "#006B3C" }}>
              Public Comments ({sortedComments.length})
            </h5>
            <span className="badge bg-light text-muted border">Visible to IT Staff & Requester</span>
          </div>

          {/* รายการคอมเมนต์เรียงตามเวลา (เก่าสุดอยู่บน) */}
          <div className="mb-4">
            {sortedComments.length === 0 ? (
              <div className="p-4 text-center text-muted bg-light rounded" style={{ border: "1px dashed #D1DDD5" }}>
                No comments yet. Be the first to leave a message for IT Staff.
              </div>
            ) : (
              <div className="d-flex flex-column gap-3">
                {sortedComments.map((cmt) => (
                  <div
                    key={cmt.id}
                    className="card border shadow-none"
                    style={{
                      backgroundColor: "#FAFCFA",
                      borderColor: "#E2E8F0",
                      borderRadius: 10,
                    }}
                  >
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                        <div className="d-flex align-items-center gap-2">
                          <span className="fw-bold" style={{ color: "#1A202C" }}>
                            {cmt.authorName || cmt.author?.name || "Unknown"}
                          </span>
                          <RoleBadge role={cmt.authorRole || cmt.author?.role || "REQUESTER"} />
                        </div>
                        <span className="text-muted small">
                          {new Date(cmt.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-secondary" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {cmt.content}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ช่องกรอกข้อความ (Composer) */}
          <div className="border-top pt-3">
            <label className="form-label fw-semibold small text-muted">Leave a Comment</label>
            <textarea
              className="form-control mb-3"
              rows={3}
              placeholder="Write a public comment for IT Staff..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              disabled={submittingComment}
              style={{ borderColor: "#D1DDD5" }}
            />
            <div className="d-flex justify-content-end">
              <button
                type="button"
                className="btn text-white fw-bold px-4 py-2"
                style={{ backgroundColor: "#006B3C", borderColor: "#006B3C" }}
                onClick={handlePostComment}
                disabled={!newComment.trim() || submittingComment}
              >
                {submittingComment ? "Posting..." : "Post Comment"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* ส่วนที่ 3: ส่วนจัดการไฟล์แนบ (Attachment Section)            */}
      {/* ======================================================== */}
      <div className="card shadow-sm border-0" style={{ borderRadius: 12 }}>
        <div className="card-body p-4">
          <h5 className="fw-bold mb-3" style={{ color: "#006B3C" }}>
            Attachments ({activeAttachmentsCount}/5)
          </h5>

          {/* ฟอร์มอัปโหลดไฟล์ */}
          <label htmlFor="ticket-attachment" className="form-label">Add a Ticket attachment (JPG, PNG, WebP or PDF; up to 5 MB)</label>
          <div className="d-flex align-items-center mb-4 mt-2 flex-wrap gap-2">
            <input id="ticket-attachment"
              type="file"
              className="form-control"
              onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
              disabled={isUploadDisabled || uploading}
              style={{ maxWidth: "320px", borderColor: "#D1DDD5" }}
            />
            <button
              type="button"
              className="btn text-white fw-bold px-3"
              style={{ backgroundColor: "#006B3C", borderColor: "#006B3C" }}
              onClick={handleUpload}
              disabled={!selectedFile || isUploadDisabled || uploading}
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
            {isUploadDisabled && (
              <span className="text-warning small ms-2">
                Maximum of 5 active attachments reached.
              </span>
            )}
          </div>

          {/* รายการไฟล์แนบ */}
          <ul className="list-group list-group-flush border rounded" style={{ borderColor: "#E2E8F0" }}>
            {(ticket.attachments || []).map((att) => (
              <li
                key={att.id}
                className="list-group-item d-flex flex-wrap gap-2 justify-content-between align-items-start p-3"
              >
                <div className="flex-grow-1" style={{ flexBasis: '12rem', minWidth: 0 }}>
                  {att.isRemoved ? (
                    // กรณี Soft-remove: แสดงแค่ข้อมูล ห้ามมีลิงก์ดาวน์โหลด
                    <div>
                      <span className="text-decoration-line-through text-muted">{att.fileName}</span>
                      <span className="badge bg-secondary ms-2">Removed</span>
                      <div className="text-muted small mt-1">Reason: {att.removalReason}</div>
                    </div>
                  ) : (
                    // กรณี Active: แสดงชื่อไฟล์และลิงก์
                    <AttachmentReference fileName={att.fileName} fileUrl={att.fileUrl} />
                  )}
                </div>

                {/* ปุ่มลบไฟล์ สำหรับไฟล์ที่ยัง Active */}
                {!att.isRemoved && (
                  <div style={{ maxWidth: '100%', flexShrink: 0 }}>
                    {removingId === att.id ? (
                      <div className="input-group input-group-sm" style={{ maxWidth: 300 }}>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Reason for removal..."
                          aria-label={`Removal reason for ${att.fileName}`}
                          value={removalReason}
                          onChange={(e) => setRemovalReason(e.target.value)}
                        />
                        <button className="btn btn-danger" onClick={handleConfirmRemove}>
                          Confirm
                        </button>
                        <button
                          className="btn btn-outline-secondary"
                          onClick={() => setRemovingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => setRemovingId(att.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
            {(!ticket.attachments || ticket.attachments.length === 0) && (
              <li className="list-group-item text-muted text-center py-3">
                No attachments uploaded yet.
              </li>
            )}
          </ul>
        </div>
      </div>

      <ActionsTaken key={ticketId} ticketId={ticketId} ticketStatus={ticket.currentStatus} refreshKey={ticket.version} onAccessError={onAccessError} readOnly />
      <TicketStatusHistory ticketId={ticketId} refreshKey={ticket.version} onAccessError={onAccessError} />
      {/* NOTE: Internal Notes are NEVER rendered in Requester's DOM (BR-04, AC-04) */}
    </div>
  );
}
