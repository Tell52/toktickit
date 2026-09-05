import { useState, useEffect } from "react";
import { getMyTickets } from "./api.js";

interface Ticket {
    id: number;
    ticketNumber: string;
    summary: string;
    currentStatus: string;
    createdAt: string;
    category: { name: string };
}

interface MyTicketsProps {
    requesterId: number;
}

export default function MyTickets({ requesterId }: MyTicketsProps) {
    // 1. จัดการ States ทั้งหมด
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // States สำหรับค้นหา คัดกรอง และแบ่งหน้า
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // 2. ดึงข้อมูลจาก API เมื่อ State เปลี่ยนแปลง
    useEffect(() => {
        async function fetchTickets() {
            if (!requesterId) return;

            setLoading(true);
            setError(null);

            try {
                const response = await getMyTickets(requesterId, {
                    page,
                    search,
                    status: statusFilter,
                });
                setTickets(response.data);
                setTotalPages(response.meta.totalPages || 1);
            } catch (err) {
                setError("Unable to load your tickets. Please try again later.");
            } finally {
                setLoading(false);
            }
        }

        // หน่วงเวลา (Debounce) เล็กน้อยเวลาพิมพ์ค้นหาเพื่อไม่ให้ยิง API รัวเกินไป
        const delayDebounceFn = setTimeout(() => {
            fetchTickets();
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [requesterId, page, search, statusFilter]);

    // ฟังก์ชันล้างค่า Filter
    const handleClearFilters = () => {
        setSearch("");
        setStatusFilter("");
        setPage(1);
    };

    return (
        <div className="container py-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h2 className="h4" style={{ color: "#006B3C" }}>My Tickets</h2>
                <button className="btn text-white" style={{ backgroundColor: "#006B3C" }}>
                    + Create Ticket
                </button>
            </div>

            {/* 3. แถบเครื่องมือ Search & Filter */}
            <div className="card shadow-sm mb-4 border-0" style={{ backgroundColor: "#F5F7F6" }}>
                <div className="card-body d-flex flex-column flex-md-row gap-3">
                    <input
                        type="text"
                        className="form-control"
                        placeholder="Search by ticket number or summary..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    />
                    <select
                        className="form-select"
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    >
                        <option value="">All Statuses</option>
                        <option value="New">New</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                    </select>
                    <button className="btn btn-outline-secondary text-nowrap" onClick={handleClearFilters}>
                        Clear Filters
                    </button>
                </div>
            </div>

            {/* 4. การจัดการ UI States ต่างๆ */}
            {loading ? (
                <div className="text-center py-5">
                    <div className="spinner-border text-success" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                </div>
            ) : error ? (
                <div className="alert alert-danger shadow-sm">{error}</div>
            ) : tickets.length === 0 ? (
                <div className="text-center py-5 bg-white shadow-sm rounded">
                    <p className="text-muted mb-0">
                        {search || statusFilter
                            ? "No tickets match your search criteria."
                            : "You haven't created any tickets yet."}
                    </p>
                </div>
            ) : (
                <>
                    {/* 5. แสดงผลข้อมูล (Responsive: Desktop เป็นตาราง, Mobile เป็นการ์ด) */}
                    <div className="table-responsive d-none d-md-block shadow-sm rounded">
                        <table className="table table-hover align-middle mb-0">
                            <thead style={{ backgroundColor: "#EAF6EF", color: "#0B7A46" }}>
                                <tr>
                                    <th>Ticket No.</th>
                                    <th>Created Date</th>
                                    <th>Summary</th>
                                    <th>Category</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tickets.map((ticket) => (
                                    <tr key={ticket.id}>
                                        <td className="fw-bold">{ticket.ticketNumber}</td>
                                        <td>{new Date(ticket.createdAt).toLocaleDateString()}</td>
                                        <td>{ticket.summary}</td>
                                        <td>{ticket.category.name}</td>
                                        <td>
                                            <span className="badge bg-success bg-opacity-75">
                                                {ticket.currentStatus}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* มุมมอง Mobile (Card) */}
                    <div className="d-block d-md-none">
                        {tickets.map((ticket) => (
                            <div key={ticket.id} className="card shadow-sm mb-3 border-0">
                                <div className="card-body">
                                    <div className="d-flex justify-content-between mb-2">
                                        <span className="fw-bold" style={{ color: "#006B3C" }}>{ticket.ticketNumber}</span>
                                        <span className="badge bg-success bg-opacity-75">{ticket.currentStatus}</span>
                                    </div>
                                    <h6 className="card-title">{ticket.summary}</h6>
                                    <p className="card-text text-muted small mb-0">
                                        {ticket.category.name} • {new Date(ticket.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 6. ระบบเปลี่ยนหน้า (Pagination) */}
                    <div className="d-flex justify-content-between align-items-center mt-4">
                        <span className="text-muted small">
                            Page {page} of {totalPages}
                        </span>
                        <div className="btn-group">
                            <button
                                className="btn btn-outline-success"
                                disabled={page === 1}
                                onClick={() => setPage(p => p - 1)}
                            >
                                Previous
                            </button>
                            <button
                                className="btn btn-outline-success"
                                disabled={page === totalPages}
                                onClick={() => setPage(p => p + 1)}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}