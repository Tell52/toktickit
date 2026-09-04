import { useState, useEffect } from "react";
import { createTicket, getCategories, getRelatedSystems, Category, RelatedSystem } from "../api";

interface CreateTicketProps {
    requesterId: number;
}

export default function CreateTicket({ requesterId }: CreateTicketProps) {
    const [categories, setCategories] = useState<Category[]>([]);
    const [systems, setSystems] = useState<RelatedSystem[]>([]);

    // Form states
    const [summary, setSummary] = useState("");
    const [description, setDescription] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [relatedSystemId, setRelatedSystemId] = useState("");
    const [requestedPriority, setRequestedPriority] = useState("");

    // UI states
    const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
    const [createdTicketNumber, setCreatedTicketNumber] = useState("");
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [apiError, setApiError] = useState("");

    useEffect(() => {
        async function loadReferenceData() {
            try {
                const [cats, sys] = await Promise.all([getCategories(), getRelatedSystems()]);
                setCategories(cats);
                setSystems(sys);
            } catch (error) {
                setApiError("Failed to load categories or related systems.");
            }
        }
        loadReferenceData();
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setValidationErrors({});
        setApiError("");

        // Field-level validation
        const errors: Record<string, string> = {};
        if (!summary.trim()) errors.summary = "Summary is required.";
        if (!description.trim()) errors.description = "Description is required.";
        if (!categoryId) errors.categoryId = "Please select a category.";
        if (!relatedSystemId) errors.relatedSystemId = "Please select a related system.";
        if (!requestedPriority) errors.requestedPriority = "Please select a priority.";

        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors);
            return;
        }

        setStatus("submitting");
        try {
            const newTicket = await createTicket({
                requesterId,
                summary,
                description,
                categoryId: Number(categoryId),
                relatedSystemId: Number(relatedSystemId),
                requestedPriority,
            });
            setCreatedTicketNumber(newTicket.ticketNumber);
            setStatus("success");
        } catch (error: any) {
            setApiError(error.message || "Failed to create ticket.");
            setStatus("error");
        }
    }

    // Success State
    if (status === "success") {
        return (
            <div className="alert mt-4 p-4 rounded" style={{ backgroundColor: "#EAF6EF", border: "1px solid #0B7A46" }}>
                <h4 style={{ color: "#006B3C" }}>Ticket Created Successfully!</h4>
                <p className="mb-0" style={{ color: "#0B7A46" }}>
                    Your official Ticket Number is: <strong>{createdTicketNumber}</strong>
                </p>
                <button
                    className="btn mt-3 text-white"
                    style={{ backgroundColor: "#006B3C" }}
                    onClick={() => {
                        setStatus("idle");
                        setSummary("");
                        setDescription("");
                        setCategoryId("");
                        setRelatedSystemId("");
                        setRequestedPriority("");
                    }}
                >
                    Create Another Ticket
                </button>
            </div>
        );
    }

    // Create Ticket Form
    return (
        <div className="card shadow-sm mt-4 border-0">
            <div className="card-body p-4" style={{ backgroundColor: "#F5F7F6" }}>
                <h4 className="mb-4" style={{ color: "#006B3C" }}>Create New Ticket</h4>

                {apiError && (
                    <div className="alert alert-danger">{apiError}</div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="row">
                        <div className="col-md-12 mb-3">
                            <label htmlFor="summary" className="form-label fw-bold" style={{ color: "#334D41" }}>
                                Summary <span className="text-danger">*</span>
                            </label>
                            <input
                                id="summary"
                                type="text"
                                className={`form-control ${validationErrors.summary ? "is-invalid" : ""}`}
                                value={summary}
                                onChange={(e) => setSummary(e.target.value)}
                                disabled={status === "submitting"}
                            />
                            {validationErrors.summary && <div className="invalid-feedback">{validationErrors.summary}</div>}
                        </div>

                        <div className="col-md-4 mb-3">
                            <label htmlFor="categoryId" className="form-label fw-bold" style={{ color: "#334D41" }}>
                                Category <span className="text-danger">*</span>
                            </label>
                            <select
                                id="categoryId"
                                className={`form-select ${validationErrors.categoryId ? "is-invalid" : ""}`}
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                disabled={status === "submitting"}
                            >
                                <option value="">Select Category...</option>
                                {categories.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            {validationErrors.categoryId && <div className="invalid-feedback">{validationErrors.categoryId}</div>}
                        </div>

                        <div className="col-md-4 mb-3">
                            <label htmlFor="relatedSystemId" className="form-label fw-bold" style={{ color: "#334D41" }}>
                                Related System <span className="text-danger">*</span>
                            </label>
                            <select
                                id="relatedSystemId"
                                className={`form-select ${validationErrors.relatedSystemId ? "is-invalid" : ""}`}
                                value={relatedSystemId}
                                onChange={(e) => setRelatedSystemId(e.target.value)}
                                disabled={status === "submitting"}
                            >
                                <option value="">Select System...</option>
                                {systems.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                            {validationErrors.relatedSystemId && <div className="invalid-feedback">{validationErrors.relatedSystemId}</div>}
                        </div>

                        <div className="col-md-4 mb-3">
                            <label htmlFor="requestedPriority" className="form-label fw-bold" style={{ color: "#334D41" }}>
                                Requested Priority <span className="text-danger">*</span>
                            </label>
                            <select
                                id="requestedPriority"
                                className={`form-select ${validationErrors.requestedPriority ? "is-invalid" : ""}`}
                                value={requestedPriority}
                                onChange={(e) => setRequestedPriority(e.target.value)}
                                disabled={status === "submitting"}
                            >
                                <option value="">Select Priority...</option>
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                            </select>
                            {validationErrors.requestedPriority && <div className="invalid-feedback">{validationErrors.requestedPriority}</div>}
                        </div>

                        <div className="col-md-12 mb-4">
                            <label htmlFor="description" className="form-label fw-bold" style={{ color: "#334D41" }}>
                                Description <span className="text-danger">*</span>
                            </label>
                            <textarea
                                id="description"
                                className={`form-control ${validationErrors.description ? "is-invalid" : ""}`}
                                rows={4}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                disabled={status === "submitting"}
                            ></textarea>
                            {validationErrors.description && <div className="invalid-feedback">{validationErrors.description}</div>}
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn text-white w-100 fw-bold py-2"
                        style={{ backgroundColor: "#006B3C" }}
                        disabled={status === "submitting"}
                    >
                        {status === "submitting" ? "Submitting..." : "Submit Ticket"}
                    </button>
                </form>
            </div>
        </div>
    );
}