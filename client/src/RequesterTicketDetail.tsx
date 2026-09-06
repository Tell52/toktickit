import React, { useState, useEffect } from "react";
import { getTicketDetail, uploadAttachment, softRemoveAttachment } from "./api";

interface Attachment {
    id: number;
    fileName: string;
    isRemoved: boolean;
    removalReason?: string;
    fileUrl: string;
}

interface Ticket {
    id: number;
    ticketNumber: string;
    summary: string;
    description: string;
    requestedPriority: string;
    currentStatus: string;
    attachments: Attachment[];
    category: { name: string };
    relatedSystem: { name: string };
}

export default function RequesterTicketDetail({ ticketId, currentRequesterId }: { ticketId: string, currentRequesterId: number }) {
    const [ticket, setTicket] = useState<Ticket | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // States สำหรับแนบไฟล์
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    // States สำหรับ Soft-remove
    const [removingId, setRemovingId] = useState<number | null>(null);
    const [removalReason, setRemovalReason] = useState("");

    // 1. ดึงข้อมูลตั๋ว
    const fetchTicket = async () => {
        try {
            setLoading(true);
            const data = await getTicketDetail(ticketId, currentRequesterId);
            setTicket(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTicket();
    }, [ticketId, currentRequesterId]);

    // 2. ฟังก์ชันอัปโหลดไฟล์
    const handleUpload = async () => {
        if (!selectedFile) return;
        try {
            setUploading(true);
            await uploadAttachment(ticketId, selectedFile, currentRequesterId);
            setSelectedFile(null); // ล้างค่าไฟล์หลังอัปโหลดเสร็จ
            fetchTicket(); // รีเฟรชข้อมูลเพื่อดึงไฟล์ใหม่มาแสดง
        } catch (err: any) {
            alert(err.message);
        } finally {
            setUploading(false);
        }
    };

    // 3. ฟังก์ชันยืนยันการลบไฟล์ (Soft-remove)
    const handleConfirmRemove = async () => {
        if (!removingId || !removalReason.trim()) {
            alert("Please provide a removal reason.");
            return;
        }
        try {
            await softRemoveAttachment(ticketId, removingId, removalReason, currentRequesterId);
            setRemovingId(null); // ปิดกล่องยืนยัน
            setRemovalReason("");
            fetchTicket(); // รีเฟรชข้อมูล
        } catch (err: any) {
            alert(err.message);
        }
    };

    if (loading) return <div>Loading ticket details...</div>;
    if (error) return <div className="text-danger">Error: {error}</div>;
    if (!ticket) return null;

    // นับจำนวนไฟล์ที่ยังใช้งานอยู่ (เพื่อซ่อน/ปิดปุ่มอัปโหลด)
    const activeAttachmentsCount = ticket.attachments.filter(a => !a.isRemoved).length;
    const isUploadDisabled = activeAttachmentsCount >= 5;

    // สีเทาอมเขียว (Soft gray-green) สำหรับช่อง Read-only
    const readOnlyStyle = { backgroundColor: "#F0F4F1", borderColor: "#D1DDD5" };

    return (
        <div className="container py-4">
            <h2 className="mb-4" style={{ color: "#006B3C" }}>Ticket Details: {ticket.ticketNumber}</h2>

            {/* ======================================================== */}
            {/* ส่วนที่ 1: ข้อมูลตั๋ว (Read-only)                          */}
            {/* ======================================================== */}
            <div className="card shadow-sm mb-4">
                <div className="card-body">
                    <div className="row g-3">
                        <div className="col-md-6">
                            <label className="form-label text-muted">Summary</label>
                            <input type="text" className="form-control" value={ticket.summary} readOnly style={readOnlyStyle} />
                        </div>
                        <div className="col-md-6">
                            <label className="form-label text-muted">Status</label>
                            <input type="text" className="form-control" value={ticket.currentStatus} readOnly style={readOnlyStyle} />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label text-muted">Category</label>
                            <input type="text" className="form-control" value={ticket.category.name} readOnly style={readOnlyStyle} />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label text-muted">Related System</label>
                            <input type="text" className="form-control" value={ticket.relatedSystem.name} readOnly style={readOnlyStyle} />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label text-muted">Priority</label>
                            <input type="text" className="form-control" value={ticket.requestedPriority} readOnly style={readOnlyStyle} />
                        </div>
                        <div className="col-12">
                            <label className="form-label text-muted">Description</label>
                            <textarea className="form-control" rows={4} value={ticket.description} readOnly style={readOnlyStyle}></textarea>
                        </div>
                    </div>
                </div>
            </div>

            {/* ======================================================== */}
            {/* ส่วนที่ 2: ส่วนจัดการไฟล์แนบ (Attachment Section)            */}
            {/* ======================================================== */}
            <div className="card shadow-sm">
                <div className="card-body">
                    <h5 style={{ color: "#006B3C" }}>Attachments ({activeAttachmentsCount}/5)</h5>

                    {/* ฟอร์มอัปโหลดไฟล์ */}
                    <div className="d-flex align-items-center mb-4 mt-3">
                        <input
                            type="file"
                            className="form-control me-2"
                            onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                            disabled={isUploadDisabled || uploading}
                            style={{ maxWidth: "300px" }}
                        />
                        <button
                            className="btn text-white"
                            style={{ backgroundColor: "#006B3C" }}
                            onClick={handleUpload}
                            disabled={!selectedFile || isUploadDisabled || uploading}
                        >
                            {uploading ? "Uploading..." : "Upload"}
                        </button>
                        {isUploadDisabled && <span className="ms-3 text-warning">Maximum of 5 active attachments reached.</span>}
                    </div>

                    {/* รายการไฟล์แนบ */}
                    <ul className="list-group">
                        {ticket.attachments.map(att => (
                            <li key={att.id} className="list-group-item d-flex justify-content-between align-items-start">
                                <div>
                                    {att.isRemoved ? (
                                        // กรณี Soft-remove: แสดงแค่ข้อมูล ห้ามมีลิงก์ดาวน์โหลด
                                        <div>
                                            <span className="text-decoration-line-through text-muted">{att.fileName}</span>
                                            <span className="badge bg-secondary ms-2">Removed</span>
                                            <div className="text-muted small mt-1">Reason: {att.removalReason}</div>
                                        </div>
                                    ) : (
                                        // กรณี Active: แสดงชื่อไฟล์และลิงก์ (จำลอง)
                                        <a href={att.fileUrl} target="_blank" rel="noreferrer" style={{ color: "#0B7A46", fontWeight: "500" }}>
                                            {att.fileName}
                                        </a>
                                    )}
                                </div>

                                {/* ปุ่มลบไฟล์ สำหรับไฟล์ที่ยัง Active */}
                                {!att.isRemoved && (
                                    <div>
                                        {removingId === att.id ? (
                                            // กล่องยืนยันการลบ (Confirmation & Reason Input)
                                            <div className="input-group input-group-sm">
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    placeholder="Reason for removal..."
                                                    value={removalReason}
                                                    onChange={(e) => setRemovalReason(e.target.value)}
                                                />
                                                <button className="btn btn-danger" onClick={handleConfirmRemove}>Confirm</button>
                                                <button className="btn btn-outline-secondary" onClick={() => setRemovingId(null)}>Cancel</button>
                                            </div>
                                        ) : (
                                            <button className="btn btn-sm btn-outline-danger" onClick={() => setRemovingId(att.id)}>
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                )}
                            </li>
                        ))}
                        {ticket.attachments.length === 0 && <li className="list-group-item text-muted text-center py-3">No attachments uploaded yet.</li>}
                    </ul>
                </div>
            </div>
        </div>
    );
}