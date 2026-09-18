const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

// ---------------------------------------------------------------------------
// 1. Core Fetch Wrapper (จัดการ Cookie & CSRF อัตโนมัติ)[cite: 7]
// ---------------------------------------------------------------------------
async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const url = endpoint.startsWith("http") ? endpoint : `${API_URL}${endpoint}`;
  const headers = new Headers(options.headers || {});

  // เพิ่ม CSRF Token สำหรับ Request ที่มีการเปลี่ยนแปลงข้อมูล[cite: 7]
  const method = options.method?.toUpperCase() || 'GET';
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    const csrfToken = localStorage.getItem('csrfToken');
    if (csrfToken) {
      headers.append('X-CSRF-Token', csrfToken);
    }
  }

  const finalOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // บังคับให้เบราว์เซอร์ส่ง Session Cookie ไปด้วยเสมอ[cite: 7]
  };

  const res = await fetch(url, finalOptions);

  if (!res.ok) {
    // ดัก Error ให้คืนค่าเป็น Object ตาม Standard Error Shape ของ Lab 3[cite: 7]
    const errorData = await res.json().catch(() => ({}));
    throw errorData;
  }
  return res;
}

// ---------------------------------------------------------------------------
// 2. Auth Endpoints (Lab 3)[cite: 7]
// ---------------------------------------------------------------------------
export async function login(credentials: any) {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials)
  });
  return res.json();
}

export async function logout() {
  const res = await apiFetch("/api/auth/logout", { method: "POST" });
  return res.json();
}

export async function getMe() {
  const res = await apiFetch("/api/auth/me");
  return res.json();
}

export async function changePassword(data: any) {
  const res = await apiFetch("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// 3. Lab 2 -> Lab 3 Updates (Requester & Core)
// ---------------------------------------------------------------------------
export interface Category { id: number; name: string; }
export interface SystemStatus { online: boolean; categories: Category[]; }
export interface RelatedSystem { id: number; name: string; }

export async function checkSystem(): Promise<SystemStatus> {
  const healthRes = await apiFetch(`/api/health`);
  const catRes = await apiFetch(`/api/categories`);
  const categories = await catRes.json();
  return { online: true, categories };
}

export async function getCategories(): Promise<Category[]> {
  const res = await apiFetch(`/api/categories`);
  return res.json();
}

export async function getRelatedSystems(): Promise<RelatedSystem[]> {
  const res = await apiFetch(`/api/related-systems`);
  return res.json();
}

export interface Requester {
  id: number;
  name: string;
  email: string;
  isActive?: boolean;
}

export async function getRequesters(): Promise<Requester[]> {
  try {
    const res = await apiFetch(`/api/requesters`);
    return res.json();
  } catch {
    return [];
  }
}

export async function createTicket(ticketData: any) {
  // ไม่ต้องส่ง requesterId ไปใน body แล้ว
  const res = await apiFetch(`/api/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ticketData),
  });
  return res.json();
}

// รองรับทั้ง getMyTickets(queryParams) และ getMyTickets(requesterId, queryParams)
export async function getMyTickets(arg1?: any, arg2?: any) {
  const queryParams = (typeof arg1 === "object" && arg1 !== null) ? arg1 : (arg2 || {});
  const url = new URL(`${API_URL}/api/tickets`);

  if (queryParams.page) url.searchParams.append("page", queryParams.page.toString());
  if (queryParams.search) url.searchParams.append("search", queryParams.search);
  if (queryParams.status) url.searchParams.append("status", queryParams.status);

  const res = await apiFetch(url.toString());
  return res.json();
}

// รองรับทั้ง getTicketDetail(id) และ getTicketDetail(id, requesterId)
export async function getTicketDetail(ticketId: string, _requesterId?: number) {
  const res = await apiFetch(`/api/tickets/${ticketId}`);
  return res.json();
}

// รองรับ softRemoveAttachment(ticketId, attachmentId, reason, _requesterId)
export async function softRemoveAttachment(
  ticketId: string,
  attachmentId: number,
  reason: string,
  _requesterId?: number
) {
  const res = await apiFetch(`/api/tickets/${ticketId}/attachments/${attachmentId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  return res.json();
}

// รองรับ uploadAttachment(ticketId, file, _requesterId)
export async function uploadAttachment(ticketId: string, file: File, _requesterId?: number) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch(`/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    body: formData, // fetch จัดการ header multipart ให้อัตโนมัติ
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// 4. Comment Endpoints (Lab 3)[cite: 7]
// ---------------------------------------------------------------------------
export async function createComment(ticketId: string, content: string) {
  const res = await apiFetch(`/api/tickets/${ticketId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  return res.json();
}

export async function indicateResolved(ticketId: string) {
  const res = await apiFetch(`/api/tickets/${ticketId}/resolved-indicator`, {
    method: "POST"
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// 5. IT Staff Ticket Queue & Ticket Operations (Lab 3)
// ---------------------------------------------------------------------------
export interface StaffTicketOwner {
  id: string;
  name: string;
  email?: string;
}

export interface StaffTicket {
  id: number | string;
  ticketNumber: string;
  createdAt: string;
  summary: string;
  description?: string;
  category: string;
  requestedPriority: string;
  itPriority: string;
  status: string;
  currentStatus?: string;
  owner: StaffTicketOwner | null;
  requester?: { id: string; name: string } | null;
  problemAppearsResolved?: boolean;
}

export interface StaffTicketsPagination {
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface StaffTicketsResponse {
  tickets: StaffTicket[];
  pagination: StaffTicketsPagination;
}

export interface StaffTicketQueryParams {
  search?: string;
  status?: string;
  category?: string;
  priority?: string;
  owner?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export async function getStaffTickets(params: StaffTicketQueryParams = {}): Promise<StaffTicketsResponse> {
  const url = new URL(`${API_URL}/api/staff/tickets`);
  if (params.search) url.searchParams.append("search", params.search);
  if (params.status) url.searchParams.append("status", params.status);
  if (params.category) url.searchParams.append("category", params.category);
  if (params.priority) url.searchParams.append("priority", params.priority);
  if (params.owner) url.searchParams.append("owner", params.owner);
  if (params.sort) url.searchParams.append("sort", params.sort);
  if (params.page !== undefined) url.searchParams.append("page", String(params.page));
  if (params.pageSize !== undefined) url.searchParams.append("pageSize", String(params.pageSize));

  const res = await apiFetch(url.toString());
  return res.json();
}

export async function claimStaffTicket(ticketId: string | number, ownerId: string | null) {
  const res = await apiFetch(`/api/staff/tickets/${ticketId}/owner`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerId }),
  });
  return res.json();
}