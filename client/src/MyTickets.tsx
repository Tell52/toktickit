import { StatusBadge } from './components/StaffTicketQueue.js';
import { useState, useEffect } from "react";
import { getMyTickets } from "./api.js";
import { accessFailure } from "./workflow-feedback";

interface Ticket {
    id: number;
    ticketNumber: string;
    summary: string;
    currentStatus: string;
    createdAt: string;
    category: { name: string };
}

interface MyTicketsProps {
    requesterId: number | string;
    onViewTicket?: (ticketId: string) => void;
    query?: string;
    onNavigate?: (url: string) => void;
}

export default function MyTickets({ requesterId, onViewTicket, query, onNavigate }: MyTicketsProps) {
    // 1. จัดการ States ทั้งหมด
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [localQuery, setLocalQuery] = useState('');
    const [retry, setRetry] = useState(0);
    const [total, setTotal] = useState(0);
    const serialized = query ?? localQuery;
    const params = new URLSearchParams(serialized);
    const search = params.get('search') ?? '', statusFilter = params.get('status') ?? '';
    const page = Number(params.get('page') ?? 1);
    const [totalPages, setTotalPages] = useState(1);
    const update = (changes: Record<string, string>) => {
        const next = new URLSearchParams(serialized);
        for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
        if (onNavigate) onNavigate(`/tickets${next.size ? '?' + next : ''}`); else setLocalQuery(next.toString());
    };
    useEffect(() => {
        let current = true;
        setLoading(true); setError(null); setTickets([]);
        const timer = setTimeout(async () => {
            try {
                const response = await getMyTickets(requesterId, Object.fromEntries(new URLSearchParams(serialized)));
                if (!current) return;
                setTickets(response.data); setTotalPages(response.meta.totalPages || 1); setTotal(response.meta.total ?? response.data.length);
            } catch (err: any) {
                if (current) setError(accessFailure(err) || (err?.status === 400 ? 'These ticket filters are invalid. Clear filters and try again.' : 'Unable to load your tickets. Please try again.'));
            } finally { if (current) setLoading(false); }
        }, 300);
        return () => { current = false; clearTimeout(timer); };
    }, [requesterId, serialized, retry]);
    const handleClearFilters = () => { if (onNavigate) onNavigate('/tickets'); else setLocalQuery(''); };
    const chipNames: Record<string, string> = { statusGroup: 'Status group', updatedFrom: 'Updated from (inclusive)', updatedBefore: 'Updated before (exclusive)', resolvedFrom: 'Resolved from (inclusive)', resolvedBefore: 'Resolved before (exclusive)', sort: 'Sort' };
    const ticketLink = (ticket: Ticket) => <a href={`/tickets/${ticket.id}`} style={{ color: '#006B3C', overflowWrap: 'anywhere' }} onClick={e => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && onViewTicket) { e.preventDefault(); onViewTicket(String(ticket.id)); } }}>{ticket.summary}</a>;

    return (
        <div className="container py-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h2 className="h4" style={{ color: "#006B3C" }}>My Tickets</h2>
                <a href="/create-ticket" onClick={e => { if (onNavigate) { e.preventDefault(); onNavigate('/create-ticket'); } }} className="btn text-white" style={{ backgroundColor: "#006B3C" }}>
                    + Create Ticket
                </a>
            </div>

            {/* 3. แถบเครื่องมือ Search & Filter */}
            <div className="card shadow-sm mb-4 border-0" style={{ backgroundColor: "#F5F7F6" }}>
                <div className="card-body d-flex flex-column flex-md-row gap-3">
                    <input
                        type="text"
                        className="form-control"
                        aria-label="Search tickets"
                        placeholder="Search by ticket number or summary..."
                        value={search}
                        onChange={(e) => update({ search: e.target.value, page: '' })}
                    />
                    <select
                        className="form-select"
                        aria-label="Ticket status"
                        value={statusFilter}
                        onChange={(e) => update({ status: e.target.value, statusGroup: '', page: '' })}
                    >
                        <option value="">All Statuses</option>
                        <option value="New">New</option>
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Waiting for Requester">Waiting for Requester</option>
                        <option value="Reopened">Reopened</option>
                        <option value="Closed">Closed</option>
                        <option value="Cancelled">Cancelled</option>
                        <option value="Resolved">Resolved</option>
                    </select>
                    <button className="btn btn-outline-secondary text-nowrap" onClick={handleClearFilters}>
                        Clear Filters
                    </button>
                </div>
            </div>

            <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Applied ticket filters">
                {Object.entries(chipNames).filter(([key]) => params.has(key)).map(([key, label]) => <span className="badge bg-light text-dark border" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }} key={key}>{label}: {params.get(key)}</span>)}
            </div>
            {/* 4. การจัดการ UI States ต่างๆ */}
            {loading ? (
                <div className="text-center py-5">
                    <div className="spinner-border text-success" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                </div>
            ) : error ? (
                <div role="alert" className="alert alert-danger shadow-sm">{error}<button className="btn btn-outline-success ms-2" onClick={() => setRetry(n => n + 1)}>Retry tickets</button></div>
            ) : tickets.length === 0 ? (
                <div className="text-center py-5 bg-white shadow-sm rounded">
                    <p className="text-muted mb-0">
                        {serialized
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

                                        {/* แก้ไขที่ 1 (Desktop): ทำให้ Summary กดคลิกได้ */}
                                        <td>
                                            {ticketLink(ticket)}
                                        </td>

                                        <td>{ticket.category.name}</td>
                                        <td>
                                            <StatusBadge status={ticket.currentStatus} />
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
                                        <StatusBadge status={ticket.currentStatus} />
                                    </div>

                                    {/* แก้ไขที่ 2 (Mobile): ทำให้ Summary กดคลิกได้ */}
                                    <h6 className="card-title">
                                        {ticketLink(ticket)}
                                    </h6>

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
                            {total} tickets · Page {page} of {totalPages}
                        </span>
                        <div className="btn-group">
                            <button
                                className="btn btn-outline-success"
                                disabled={page === 1}
                                onClick={() => update({ page: String(page - 1) })}
                            >
                                Previous
                            </button>
                            <button
                                className="btn btn-outline-success"
                                disabled={page === totalPages}
                                onClick={() => update({ page: String(page + 1) })}
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