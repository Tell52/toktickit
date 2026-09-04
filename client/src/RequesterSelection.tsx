import { useState, useEffect } from "react";
import { getRequesters, Requester } from "./api.js";

interface Props {
    onSelect: (requester: Requester) => void;
}

export default function RequesterSelection({ onSelect }: Props) {
    const [requesters, setRequesters] = useState<Requester[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<number | "">("");

    useEffect(() => {
        async function load() {
            try {
                const data = await getRequesters();
                setRequesters(data);
            } catch (err) {
                setError("Failed to load requesters. Is the API running?");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    const handleContinue = () => {
        const selected = requesters.find((r) => r.id === Number(selectedId));
        if (selected) {
            onSelect(selected);
        }
    };

    if (loading) return <div className="text-center mt-5">Loading requesters...</div>;

    return (
        <div className="container py-5" style={{ maxWidth: 640 }}>
            <div className="card shadow-sm border-0" style={{ backgroundColor: "#F5F7F6" }}>
                <div className="card-body p-5">
                    <div className="text-center mb-4">
                        {/* เพิ่มชื่อแอปพลิเคชัน TokTickIT ตรงนี้เพื่อให้เทสผ่านและตรงตาม Spec Lab 2 */}
                        <h1 className="fw-bold mb-3" style={{ color: "#006B3C" }}>TokTickIT</h1>

                        <h2 className="h4" style={{ color: "#006B3C" }}>Select Development Requester</h2>
                        <p className="text-muted small">
                            Choose a development requester to simulate the current requester context for Lab 2.
                            <br />
                            This is for testing only and is not a login screen.
                        </p>
                    </div>

                    {error && <div className="alert alert-danger">{error}</div>}

                    {!error && requesters.length === 0 && (
                        <div className="alert alert-warning">No active requesters found.</div>
                    )}

                    {!error && requesters.length > 0 && (
                        <>
                            <div className="mb-3">
                                <label className="form-label fw-bold" style={{ color: "#0B7A46" }}>
                                    Development Requester <span className="text-danger">*</span>
                                </label>
                                <select
                                    className="form-select"
                                    value={selectedId}
                                    onChange={(e) => setSelectedId(Number(e.target.value))}
                                >
                                    <option value="" disabled>-- Select Requester --</option>
                                    {requesters.map((req) => (
                                        <option key={req.id} value={req.id}>
                                            {req.name} ({req.email})
                                        </option>
                                    ))}
                                </select>
                                <div className="form-text mt-2 px-2 py-1" style={{ backgroundColor: "#EAF6EF", borderRadius: 4 }}>
                                    Only active development requesters are shown.
                                </div>
                            </div>

                            <div className="card border-0 mb-4" style={{ backgroundColor: "#EAF6EF" }}>
                                <div className="card-body">
                                    <h6 className="mb-1" style={{ color: "#0B7A46" }}>Authentication coming in Lab 3</h6>
                                    <p className="small mb-0 text-muted">
                                        In Lab 3, this selection will be replaced with secure authentication so you can access the system with your own account.
                                    </p>
                                </div>
                            </div>

                            <div className="d-flex justify-content-end gap-2">
                                <button className="btn btn-light border">Cancel</button>
                                <button
                                    className="btn text-white"
                                    style={{ backgroundColor: "#006B3C" }}
                                    disabled={!selectedId}
                                    onClick={handleContinue}
                                >
                                    &rarr; Continue
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}