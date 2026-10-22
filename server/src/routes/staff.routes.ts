import { Router, Request, Response } from 'express';
import { getPrisma } from '../prisma.js';
import { requireRole } from '../middleware/auth';
import { Prisma } from '@prisma/client';
import { requireCurrentBusinessUser, currentViewer, assertBusinessUser } from '../services/action-access.js';
import { ticketIdentity } from '../services/action-validation.js';
import { workflowDetail } from '../services/workflow-state.js';
import { ApiError, sendApiError } from '../services/api-error.js';

import { parseRequesterFilters } from '../services/dashboard.js';
import { priorityWhere } from '../services/staff-dashboard.js';
const router = Router();

// Enforce IT_STAFF and ADMINISTRATOR role access for all routes in this router
router.use(requireCurrentBusinessUser, requireRole(['IT_STAFF', 'ADMINISTRATOR']));

// Valid status mappings (supporting UPPER_SNAKE and Title Case)
export const STATUS_MAP: Record<string, string[]> = {
  'new': ['New', 'NEW'],
  'open': ['Open', 'OPEN'],
  'in_progress': ['In Progress', 'IN_PROGRESS', 'in progress'],
  'in progress': ['In Progress', 'IN_PROGRESS', 'in progress'],
  'waiting_for_requester': ['Waiting for Requester', 'WAITING_FOR_REQUESTER', 'waiting for requester'],
  'waiting for requester': ['Waiting for Requester', 'WAITING_FOR_REQUESTER', 'waiting for requester'],
  'resolved': ['Resolved', 'RESOLVED'],
  'closed': ['Closed', 'CLOSED'],
  'reopened': ['Reopened', 'REOPENED'],
  'cancelled': ['Cancelled', 'CANCELLED'],
};

export { STATUS_CANONICAL, ALLOWED_STATUS_TRANSITIONS, isValidStatusTransition } from '../services/workflow-state.js';

// Valid priority mappings
export const PRIORITY_MAP: Record<string, string[]> = {
  'low': ['Low', 'LOW', 'low'],
  'medium': ['Medium', 'MEDIUM', 'medium'],
  'high': ['High', 'HIGH', 'high'],
};

// Valid sort options per API spec
const VALID_SORTS = [
  'createdAt', '-createdAt', 'updatedAt', '-updatedAt', 'resolvedAt', '-resolvedAt',
  'itPriority', '-itPriority',
  'status', '-status',
  'currentStatus', '-currentStatus',
  'ticketNumber', '-ticketNumber',
];

/**
 * GET /api/staff/users
 * Returns active IT Staff and Administrator users for assignee/owner dropdowns
 */
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const users = await prisma.user.findMany({
      where: {
        role: { in: ['IT_STAFF', 'ADMINISTRATOR'] },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json({ users });
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve staff users',
      },
    });
  }
});

/**
 * GET /api/staff/tickets
 * Shared ticket queue for IT Staff and Administrators
 */
router.get('/tickets', async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    res.set('Cache-Control', 'no-store');
    const sharedKeys = ['statusGroup', 'updatedFrom', 'updatedBefore', 'resolvedFrom', 'resolvedBefore'];
    const sharedQuery = Object.fromEntries(sharedKeys.filter(key => req.query[key] !== undefined).map(key => [key, req.query[key]]));
    if (req.query.statusGroup !== undefined && req.query.status !== undefined) sharedQuery.status = req.query.status;
    const shared = parseRequesterFilters(sharedQuery);
    const whereConditions: any[] = [shared.where];

    // 1. Search (case-insensitive substring in ticketNumber or summary)
    if (typeof req.query.search === 'string' && req.query.search.trim() !== '') {
      const searchTerm = req.query.search.trim();
      whereConditions.push({
        OR: [
          { ticketNumber: { contains: searchTerm, mode: 'insensitive' } },
          { summary: { contains: searchTerm, mode: 'insensitive' } },
        ],
      });
    }

    // 2. Status filter
    if (typeof req.query.status === 'string' && req.query.status.trim() !== '') {
      const rawStatus = req.query.status.trim();
      const statusKey = rawStatus.toLowerCase();
      const matchedStatuses = STATUS_MAP[statusKey];

      if (!matchedStatuses) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid status filter value: '${rawStatus}'`,
          },
        });
      }

      whereConditions.push({
        currentStatus: { in: matchedStatuses },
      });
    }

    // 3. Category filter
    if (typeof req.query.category === 'string' && req.query.category.trim() !== '') {
      const rawCategory = req.query.category.trim();
      const numericId = Number(rawCategory);

      const categoryRecord = await prisma.category.findFirst({
        where: {
          OR: [
            { name: { equals: rawCategory, mode: 'insensitive' } },
            ...(!isNaN(numericId) && numericId > 0 ? [{ id: numericId }] : []),
          ],
        },
      });

      if (!categoryRecord) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid category filter value: '${rawCategory}'`,
          },
        });
      }

      whereConditions.push({ categoryId: categoryRecord.id });
    }

    // 4. Priority filter (filters on IT Priority)
    if (typeof req.query.priority === 'string' && req.query.priority.trim() !== '') {
      const rawPriority = req.query.priority.trim();
      const priorityKey = rawPriority.toLowerCase();
      const matchedPriorities = PRIORITY_MAP[priorityKey];

      if (!matchedPriorities) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid priority filter value: '${rawPriority}'`,
          },
        });
      }

      // Share the exact effective-priority predicate with dashboard counts.
      whereConditions.push(priorityWhere(priorityKey));
    }

    // 5. Owner filter ("me" | "unassigned" | userId)
    if (typeof req.query.owner === 'string' && req.query.owner.trim() !== '') {
      const rawOwner = req.query.owner.trim();
      const ownerLower = rawOwner.toLowerCase();

      if (ownerLower === 'me') {
        const currentUserId = req.session?.user?.id;
        whereConditions.push({ ownerId: currentUserId });
      } else if (ownerLower === 'unassigned') {
        whereConditions.push({ ownerId: null });
      } else {
        whereConditions.push({ ownerId: rawOwner });
      }
    }

    // 6. Sort
    let sortParam = '-createdAt';
    if (typeof req.query.sort === 'string' && req.query.sort.trim() !== '') {
      const rawSort = req.query.sort.trim();
      if (!VALID_SORTS.includes(rawSort)) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid sort value: '${rawSort}'. Allowed values: ${VALID_SORTS.join(', ')}`,
          },
        });
      }
      sortParam = rawSort;
    }

    let orderByClause: any = { createdAt: 'desc' };
    switch (sortParam) {
      case 'createdAt':
        orderByClause = { createdAt: 'asc' };
        break;
      case '-createdAt':
        orderByClause = { createdAt: 'desc' };
        break;
      case 'itPriority':
        orderByClause = { itPriority: 'asc' };
        break;
      case '-itPriority':
        orderByClause = { itPriority: 'desc' };
        break;
      case 'status':
      case 'currentStatus':
        orderByClause = { currentStatus: 'asc' };
        break;
      case '-status':
      case '-currentStatus':
        orderByClause = { currentStatus: 'desc' };
        break;
      case 'ticketNumber':
        orderByClause = { ticketNumber: 'asc' };
        break;
      case '-ticketNumber':
        orderByClause = { ticketNumber: 'desc' };
        break;
    }

    if (/^-?(updatedAt|resolvedAt)$/.test(sortParam)) {
      orderByClause = parseRequesterFilters({ sort: sortParam }).orderBy;
    }

    // 7. Pagination (default: page 1, pageSize 10, max 50)
    let page = 1;
    if (req.query.page !== undefined) {
      const parsedPage = parseInt(String(req.query.page), 10);
      if (!isNaN(parsedPage) && parsedPage > 0) {
        page = parsedPage;
      }
    }

    let pageSize = 10;
    const rawPageSize = req.query.pageSize !== undefined ? req.query.pageSize : req.query.limit;
    if (rawPageSize !== undefined) {
      const parsedSize = parseInt(String(rawPageSize), 10);
      if (!isNaN(parsedSize) && parsedSize > 0) {
        pageSize = Math.min(parsedSize, 50);
      }
    }

    const whereClause = whereConditions.length > 0 ? { AND: whereConditions } : {};
    const skip = (page - 1) * pageSize;

    const [tickets, totalCount] = await prisma.$transaction(async tx => {
      const viewer = await currentViewer(tx, req.session.user!.id);
      if (!['IT_STAFF', 'ADMINISTRATOR'].includes(viewer.role)) throw new ApiError(403, 'FORBIDDEN', 'Staff access required.');
      return Promise.all([
      tx.ticket.findMany({
        where: whereClause,
        include: {
          category: { select: { id: true, name: true } },
          relatedSystem: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true, email: true } },
          requester: { select: { id: true, name: true, email: true } },
        },
        orderBy: orderByClause,
        skip,
        take: pageSize,
      }),
      tx.ticket.count({ where: whereClause }),
    ]);
    }, { isolationLevel: 'RepeatableRead' });

    // Format response matching API Specification §4.1
    const formattedTickets = tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      createdAt: t.createdAt.toISOString(),
      summary: t.summary,
      description: t.description,
      category: t.category?.name || '',
      requestedPriority: t.requestedPriority,
      itPriority: t.itPriority ?? t.requestedPriority,
      status: t.currentStatus,
      currentStatus: t.currentStatus,
      owner: t.owner ? { id: t.owner.id, name: t.owner.name } : null,
      requester: t.requester ? { id: t.requester.id, name: t.requester.name } : null,
      problemAppearsResolved: t.problemAppearsResolved,
      version: t.version,
      resolutionCycle: t.resolutionCycle,
      resolvedAt: t.resolvedAt?.toISOString() ?? null,
      updatedAt: t.updatedAt.toISOString(),
    }));

    return res.status(200).json({
      tickets: formattedTickets,
      pagination: {
        page,
        pageSize,
        totalCount,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) return sendApiError(res, error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve ticket queue',
      },
    });
  }
});

/**
 * Helper to look up a ticket by either numeric ID or ticketNumber
 */
async function findTicketByIdOrNumber(paramId: string) {
  const prisma = getPrisma();
  const numId = Number(paramId);

  return prisma.ticket.findFirst({
    where: {
      OR: [
        ...(!isNaN(numId) ? [{ id: numId }] : []),
        { ticketNumber: paramId },
      ],
    },
  });
}

/**
 * GET /api/staff/tickets/:id
 * Full Ticket detail including owner, IT Priority, status, Public Comments, Internal Notes, and Attachments
 */
router.get('/tickets/:id', async (req: Request, res: Response) => {
  try {
    const payload = await getPrisma().$transaction(async prisma => {
    assertBusinessUser(await currentViewer(prisma, req.session.user!.id), true);
    const ticket = await prisma.ticket.findFirst({
      where: ticketIdentity(req.params.id),
      include: {
        category: { select: { id: true, name: true } },
        relatedSystem: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
        requester: { select: { id: true, name: true, email: true } },
        attachments: {
          where: { isRemoved: false },
          select: {
            id: true,
            fileName: true,
            fileType: true,
            fileSize: true,
            fileUrl: true,
            createdAt: true,
          },
        },
        comments: {
          include: {
            author: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        notes: {
          include: {
            author: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');

    const formattedComments = (ticket.comments || []).map((c) => ({
      id: c.id,
      ticketId: ticket.ticketNumber,
      authorId: c.authorId,
      authorName: c.author?.name || 'Unknown',
      authorRole: c.author?.role || 'REQUESTER',
      content: c.content,
      createdAt: c.createdAt.toISOString(),
    }));

    const formattedNotes = (ticket.notes || []).map((n) => ({
      id: n.id,
      ticketId: ticket.ticketNumber,
      authorId: n.authorId,
      authorName: n.author?.name || 'Unknown',
      content: n.content,
      createdAt: n.createdAt.toISOString(),
    }));

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      summary: ticket.summary,
      description: ticket.description,
      category: ticket.category?.name || '',
      categoryDetails: ticket.category,
      relatedSystem: ticket.relatedSystem?.name || '',
      relatedSystemDetails: ticket.relatedSystem,
      requestedPriority: ticket.requestedPriority,
      itPriority: ticket.itPriority ?? ticket.requestedPriority,
      status: ticket.currentStatus,
      currentStatus: ticket.currentStatus,
      owner: ticket.owner ? { id: ticket.owner.id, name: ticket.owner.name, email: ticket.owner.email } : null,
      requester: ticket.requester ? { id: ticket.requester.id, name: ticket.requester.name, email: ticket.requester.email } : null,
      problemAppearsResolved: ticket.problemAppearsResolved,
      indicatedAt: ticket.indicatedAt ? ticket.indicatedAt.toISOString() : null,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      attachments: ticket.attachments,
      comments: formattedComments,
      notes: formattedNotes,
      internalNotesCount: formattedNotes.length,
      ...await workflowDetail(prisma, ticket),
    };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return res.status(200).json(payload);
  } catch (error) { return sendApiError(res, error); }
});

/**
 * POST /api/staff/tickets/:id/notes
 * Create an internal note (IT Staff & Administrator only, BR-16, AC-14)
 */
router.post('/tickets/:id/notes', async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const ticket = await findTicketByIdOrNumber(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Ticket not found',
        },
      });
    }

    const { content } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Note content cannot be empty or whitespace only',
        },
      });
    }

    const authorId = req.session?.user?.id;
    if (!authorId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    const author = await prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true, name: true },
    });

    const note = await prisma.note.create({
      data: {
        ticketId: ticket.id,
        authorId,
        content: content.trim(),
      },
    });

    return res.status(201).json({
      id: note.id,
      ticketId: ticket.ticketNumber,
      authorId: note.authorId,
      authorName: author?.name || req.session?.user?.name || 'Unknown',
      content: note.content,
      createdAt: note.createdAt.toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create internal note',
      },
    });
  }
});

/**
 * GET /api/staff/tickets/:id/notes
 * Retrieve all internal notes for a ticket (IT Staff & Administrator only, AC-04)
 */
router.get('/tickets/:id/notes', async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const ticket = await findTicketByIdOrNumber(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Ticket not found',
        },
      });
    }

    const notes = await prisma.note.findMany({
      where: { ticketId: ticket.id },
      include: {
        author: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return res.status(200).json({
      notes: notes.map((n) => ({
        id: n.id,
        authorId: n.authorId,
        authorName: n.author?.name || 'Unknown',
        content: n.content,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve internal notes',
      },
    });
  }
});

export default router;
