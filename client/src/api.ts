const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

// ---------------------------------------------------------------------------
// Lab 1 
// ---------------------------------------------------------------------------
export interface Category {
  id: number;
  name: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

export async function checkSystem(): Promise<SystemStatus> {
  const healthRes = await fetch(`${API_URL}/api/health`);
  if (!healthRes.ok) throw new Error("Unable to connect to TokTickIT API");

  const catRes = await fetch(`${API_URL}/api/categories`);
  if (!catRes.ok) throw new Error("Unable to load categories");

  const categories = await catRes.json();
  return { online: true, categories };
}

// ---------------------------------------------------------------------------
// Lab 2 - Issue 2 (Requester)
// ---------------------------------------------------------------------------
export interface Requester {
  id: number;
  name: string;
  email: string;
}

export async function getRequesters(): Promise<Requester[]> {
  const res = await fetch(`${API_URL}/api/requesters`);
  if (!res.ok) throw new Error("Failed to fetch requesters");
  return res.json();
}

// ---------------------------------------------------------------------------
// Lab 2 - Issue 3 (Create Ticket & Related Systems)
// ---------------------------------------------------------------------------
export interface RelatedSystem {
  id: number;
  name: string;
}

export async function getCategories(): Promise<Category[]> {
  const res = await fetch(`${API_URL}/api/categories`);
  if (!res.ok) throw new Error("Failed to fetch categories");
  return res.json();
}

export async function getRelatedSystems(): Promise<RelatedSystem[]> {
  const res = await fetch(`${API_URL}/api/related-systems`);
  if (!res.ok) throw new Error("Failed to fetch related systems");
  return res.json();
}

export async function createTicket(ticketData: any) {
  const res = await fetch(`${API_URL}/api/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ticketData),
  });

  if (!res.ok) throw new Error("Failed to create ticket");
  return res.json();
}

export async function getMyTickets(requesterId: number, queryParams: any = {}) {
  const url = new URL(`${API_URL}/api/tickets`);
  url.searchParams.append("requesterId", requesterId.toString());

  if (queryParams.page) url.searchParams.append("page", queryParams.page);
  if (queryParams.search) url.searchParams.append("search", queryParams.search);
  if (queryParams.status) url.searchParams.append("status", queryParams.status);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to load tickets");
  return res.json();
}