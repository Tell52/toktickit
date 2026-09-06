# Lab 2 REST API Contract

## 1. Reference Data & Context Endpoints

### 1.1 Retrieve Active Categories
*   **Endpoint:** `GET /api/categories`
*   **Description:** Retrieve active Categories[cite: 8].
*   **Response (200 OK):** JSON array of `{ "id": number, "name": string }`.

### 1.2 Retrieve Active Related Systems
*   **Endpoint:** `GET /api/related-systems`
*   **Description:** Retrieve active Related Systems[cite: 8].
*   **Response (200 OK):** JSON array of `{ "id": number, "name": string }`.

### 1.3 Retrieve Active Development Requesters
*   **Endpoint:** `GET /api/requesters`
*   **Description:** Retrieve active Development Requesters[cite: 8].
*   **Response (200 OK):** JSON array containing `id`, `name`, and `email` for active requesters only.

---

## 2. Ticket Endpoints

### 2.1 Create a Ticket
*   **Endpoint:** `POST /api/tickets`
*   **Description:** Create a Ticket[cite: 8].
*   **Request JSON Shape:** 
    ```json
    {
      "requesterId": 1,
      "summary": "Laptop battery drains quickly",
      "description": "Battery drains fast after update",
      "categoryId": 2,
      "relatedSystemId": 3,
      "requestedPriority": "MEDIUM"
    }
    ```
    *(Note: Based on the example payload `{ "requesterId": 1, "summary": "Laptop battery drains quickly", "requested Priority": "MEDIUM" }`[cite: 8])*
*   **Validation:** Inputs must not be empty.
*   **Responses:**
    *   **201 Created:** Resource created successfully[cite: 8]. Returns the saved Ticket including the official Ticket Number.
    *   **400 Bad Request:** Invalid input[cite: 8]. Returns field-level validation errors.

### 2.2 Retrieve the Selected Requester's Tickets
*   **Endpoint:** `GET /api/tickets`
*   **Description:** Retrieve the selected Requester's Tickets[cite: 8]. Support search, filtering, sorting, and pagination[cite: 8].
*   **Query Parameters:** `?requesterId=1&search=laptop&page=1&limit=10&status=Open`[cite: 8].
*   **Validation:** Must prevent one Requester from viewing another Requester's ticket[cite: 8].
*   **Responses:**
    *   **200 OK:** Successful retrieval[cite: 8]. Returns paginated JSON array of ticket summaries and pagination metadata.
    *   **403 Forbidden:** If ownership validation fails.

### 2.3 Retrieve One Owned Ticket Detail
*   **Endpoint:** `GET /api/tickets/:id?requesterId=:reqId`
*   **Description:** Retrieve one owned Ticket[cite: 8].
*   **Responses:**
    *   **200 OK:** Returns full ticket details including attachments.
    *   **403/404:** Ownership failure or missing resource[cite: 8].

---

## 3. Attachment Endpoints

### 3.1 Upload an Attachment
*   **Endpoint:** `POST /api/tickets/:id/attachments`
*   **Description:** Upload an Attachment[cite: 8].
*   **Validation:** 
    *   Maximum size: 5 MB per file[cite: 8].
    *   Allowed types: JPG/JPEG, PNG, WEBP, and PDF[cite: 8].
    *   Maximum active attachments: five per Ticket[cite: 8].
*   **Responses:**
    *   **201 Created:** Attachment uploaded and metadata saved.
    *   **400 Bad Request:** Unsupported file types or oversized uploads[cite: 8].

### 3.2 Retrieve Attachment Metadata & Download
*   **Endpoint:** `GET /api/tickets/:id/attachments/:attachmentId`
*   **Description:** Retrieve Attachment metadata[cite: 8] or Download an active Attachment[cite: 8].
*   **Validation:** Removed files must not be downloadable or previewed[cite: 8].
*   **Responses:**
    *   **200 OK:** File stream or metadata JSON.
    *   **403 Forbidden:** If attachment is soft-removed or belongs to another requester.

### 3.3 Soft-Remove an Attachment
*   **Endpoint:** `DELETE /api/tickets/:id/attachments/:attachmentId`
*   **Description:** Soft-remove an Attachment[cite: 8]. Removal must be implemented as soft removal[cite: 8].
*   **Request JSON Shape:** `{ "requesterId": 1, "reason": "Uploaded wrong file" }`
*   **Responses:**
    *   **200 OK:** Attachment successfully soft-removed.
    *   **400/403:** If removal reasons are missing or requester lacks permission.