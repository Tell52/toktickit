import { Router, Request, Response } from 'express';
import { getPrisma } from '../prisma.js';
import { requireRole } from '../middleware/auth';

const router = Router();

// Enforce IT_STAFF and ADMINISTRATOR role access for all routes in this router
router.use(requireRole(['IT_STAFF', 'ADMINISTRATOR']));

// Valid status mappings (supporting UPPER_SNAKE and Title Case)
const STATUS_MAP: Record<string, string[]> = {
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

// Valid priority mappings
const PRIORITY_MAP: Record<string, string[]> = {
  'low': ['Low', 'LOW', 'low'],
  'medium': ['Medium', 'MEDIUM', 'medium'],
  'high': ['High', 'HIGH', 'high'],
};

// Valid sort options per API spec
const VALID_SORTS = [
  'createdAt', '-createdAt',
  'itPriority', '-itPriority',
  'status', '-status',
  'currentStatus', '-currentStatus',
  'ticketNumber', '-ticketNumber',
];

/**
 * GET /api/staff/tickets
 * Shared ticket queue for IT Staff and Administrators
 */
router.get('/tickets', async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const whereConditions: any[] = [];

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

      // Check itPriority, or fallback to requestedPriority if itPriority is null
      whereConditions.push({
        OR: [
          { itPriority: { in: matchedPriorities } },
          {
            itPriority: null,
            requestedPriority: { in: matchedPriorities },
          },
        ],
      });
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

    const [tickets, totalCount] = await Promise.all([
      prisma.ticket.findMany({
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
      prisma.ticket.count({ where: whereClause }),
    ]);

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
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve ticket queue',
      },
    });
  }
});

/**
 * PATCH /api/staff/tickets/:id/owner
 * Claim or reassign ticket ownership (or release by passing null)
 */
router.patch('/tickets/:id/owner', async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const paramId = req.params.id;
    const numId = Number(paramId);

    const ticket = await prisma.ticket.findFirst({
      where: {
        OR: [
          ...(!isNaN(numId) ? [{ id: numId }] : []),
          { ticketNumber: paramId },
        ],
      },
    });

    if (!ticket) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Ticket not found',
        },
      });
    }

    const { ownerId } = req.body;

    if (ownerId !== null && ownerId !== undefined) {
      const targetUser = await prisma.user.findUnique({
        where: { id: String(ownerId) },
      });

      if (!targetUser || !targetUser.isActive || !['IT_STAFF', 'ADMINISTRATOR'].includes(targetUser.role)) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'ownerId must reference an active IT Staff or Administrator user',
          },
        });
      }
    }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        ownerId: ownerId === null ? null : ownerId,
      },
      include: {
        owner: {
          select: { id: true, name: true },
        },
      },
    });

    return res.status(200).json({
      ticketId: updated.ticketNumber,
      id: updated.id,
      owner: updated.owner ? { id: updated.owner.id, name: updated.owner.name } : null,
    });
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update ticket owner',
      },
    });
  }
});

export default router;
