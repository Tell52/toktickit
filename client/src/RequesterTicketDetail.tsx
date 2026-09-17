import React, { useState, useEffect } from "react";
import {
  getTicketDetail,
  uploadAttachment,
  softRemoveAttachment,
  createComment,
  indicateResolved,
} from "./api.js";
import { RoleBadge } from "./App.js";

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

// Helper badge function for Ticket Status
function StatusBadge({ status }: { status: string }) {
  const norm = (status || "").toUpperCase().replace(/\s+/g, "_");
  let bg = "#F1F3F5";
  let color = "#495057";
  let border = "#CED4DA";

  if (norm === "NEW") {
    bg = "#F8F9FA";
    color = "#6C757D";
    border = "#6C757D";
  } else if (norm === "OPEN") {
    bg = "#EBF5FF";
    color = "#0D6EFD";
    border = "#0D6EFD";
  } else if (norm === "IN_PROGRESS") {
    bg = "#FFFBEB";
    color = "#D97706";
    border = "#D97706";
  } else if (norm === "WAITING_FOR_REQUESTER") {
    bg = "#F3E8FF";
    color = "#7C3AED";
    border = "#7C3AED";
  } else if (norm === "RESOLVED") {
    bg = "#EAF6EF";
    color = "#006B3C";
    border = "#006B3C";
  } else if (norm === "CLOSED") {
    bg = "#E9ECEF";
    color = "#495057";
    border = "#495057";
  } else if (norm === "REOPENED") {
    bg = "#FFF4E6";
    color = "#FD7E14";
    border = "#FD7E14";
  } else if (norm === "CANCELLED") {
    bg = "#FEE2E2";
    color = "#DC2626";
    border = "#DC2626";
  }

  return (
    <span
      className="badge px-2 py-1"
      style={{
        backgroundColor: bg,
        color,
        border: `1px solid ${border}`,
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}

// Helper badge function for Priority
function PriorityBadge({ priority }: { priority: string }) {
  const norm = (priority || "").toUpperCase();
  let bg = "#EAF6EF";
  let color = "#006B3C";
  let border = "#006B3C";

  if (norm === "HIGH") {
    bg = "#FEE2E2";
    color = "#DC2626";
    border = "#DC2626";
  } else if (norm === "MEDIUM") {
    bg = "#FFFBEB";
    color = "#D97706";
    border = "#D97706";
  }

  return (
    <span
      className="badge px-2 py-1"
      style={{
        backgroundColor: bg,
        color,
        border: `1px solid ${border}`,
        fontWeight: 600,
      }}
    >
      {priority}
    </span>
  );
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

  // 1. Fetch ticket details using session auth (no requesterId param)
  const fetchTicket = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getTicketDetail(ticketId);
      setTicket(data);
    } catch (err: any) {
      setError(err?.error?.message || err?.message || "Failed to load ticket details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTicket();
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
      alert(err?.error?.message || err?.message || "Failed to upload attachment");
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
      alert(err?.error?.message || err?.message || "Failed to remove attachment");
    }
  };

  // 4. Confirm Problem Appears Resolved
  const handleConfirmResolved = async () => {
    try {
      setResolvingIndicator(true);
      const res = await indicateResolved(ticketId);
      setShowResolvedDialog(false);
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              problemAppearsResolved: true,
              indicatedAt: res.indicatedAt || new Date().toISOString(),
            }
          : null
      );
    } catch (err: any) {
      alert(err?.error?.message || err?.message || "Failed to indicate problem resolved");
    } finally {
      setResolvingIndicator(false);
    }
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
      alert(err?.error?.message || err?.message || "Failed to post comment");
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

  if (error) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger" role="alert">
          Error: {error}
        </div>
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
    <div className="container py-4">
      {/* Header with Title and Status/Priority Badges */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
        <div>
          <h2 className="mb-1 fw-bold" style={{ color: "#006B3C" }}>
            Ticket Details: {ticket.ticketNumber}
          </h2>
          <div className="d-flex align-items-center gap-2 mt-2">
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
                >
                  <span>✓</span> Problem Appears Resolved
                </button>
              ) : (
                <div
                  role="dialog"
                  aria-label="Confirm Problem Resolved"
                  className="card p-3 shadow-sm border"
                  style={{
                    backgroundColor: "#FFFBEB",
                    borderColor: "#FDE68A",
                    maxWidth: 420,
                  }}
                >
                  <p className="small mb-2 fw-medium text-dark">
                    This lets IT Staff know the issue seems fixed. It won't close the ticket.
                  </p>
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
                      disabled={resolvingIndicator}
                    >
                      {resolvingIndicator ? "Submitting..." : "Confirm"}
                    </button>
                  </div>
                </div>
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
              <label className="form-label text-muted small fw-semibold">Summary</label>
              <input
                type="text"
                className="form-control"
                value={ticket.summary}
                readOnly
                style={readOnlyStyle}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label text-muted small fw-semibold">Status</label>
              <input
                type="text"
                className="form-control"
                value={ticket.currentStatus}
                readOnly
                style={readOnlyStyle}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label text-muted small fw-semibold">Category</label>
              <input
                type="text"
                className="form-control"
                value={ticket.category?.name || ""}
                readOnly
                style={readOnlyStyle}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label text-muted small fw-semibold">Related System</label>
              <input
                type="text"
                className="form-control"
                value={ticket.relatedSystem?.name || ""}
                readOnly
                style={readOnlyStyle}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label text-muted small fw-semibold">Priority</label>
              <input
                type="text"
                className="form-control"
                value={ticket.requestedPriority}
                readOnly
                style={readOnlyStyle}
              />
            </div>
            <div className="col-12">
              <label className="form-label text-muted small fw-semibold">Description</label>
              <textarea
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
          <div className="d-flex justify-content-between align-items-center mb-3">
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
          <div className="d-flex align-items-center mb-4 mt-2 flex-wrap gap-2">
            <input
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
                className="list-group-item d-flex justify-content-between align-items-start p-3"
              >
                <div>
                  {att.isRemoved ? (
                    // กรณี Soft-remove: แสดงแค่ข้อมูล ห้ามมีลิงก์ดาวน์โหลด
                    <div>
                      <span className="text-decoration-line-through text-muted">{att.fileName}</span>
                      <span className="badge bg-secondary ms-2">Removed</span>
                      <div className="text-muted small mt-1">Reason: {att.removalReason}</div>
                    </div>
                  ) : (
                    // กรณี Active: แสดงชื่อไฟล์และลิงก์
                    <a
                      href={att.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#006B3C", fontWeight: "600", textDecoration: "none" }}
                    >
                      📎 <span>{att.fileName}</span>
                    </a>
                  )}
                </div>

                {/* ปุ่มลบไฟล์ สำหรับไฟล์ที่ยัง Active */}
                {!att.isRemoved && (
                  <div>
                    {removingId === att.id ? (
                      <div className="input-group input-group-sm" style={{ maxWidth: 300 }}>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Reason for removal..."
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

      {/* NOTE: Internal Notes are NEVER rendered in Requester's DOM (BR-04, AC-04) */}
    </div>
  );
}