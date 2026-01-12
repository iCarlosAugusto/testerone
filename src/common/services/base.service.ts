import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
    TenantContext,
    PaginationOptions,
    PaginatedResponse,
    PermissionConfig,
    DEFAULT_PERMISSIONS,
} from '../interfaces';
import { Role } from '@prisma/client';

/**
 * Abstract base service for multi-tenant CRUD operations
 * 
 * @template T - The Prisma model type (e.g., Project, Feedback)
 * @template CreateDto - DTO for creating records
 * @template UpdateDto - DTO for updating records
 * 
 * @example
 * ```typescript
 * @Injectable()
 * export class ProjectService extends BaseService<Project, CreateProjectDto, UpdateProjectDto> {
 *   constructor(prisma: PrismaService) {
 *     super(prisma, 'project', {
 *       create: [Role.FOUNDER],
 *       delete: [Role.FOUNDER],
 *     });
 *   }
 * }
 * ```
 */
export abstract class BaseService<T, CreateDto, UpdateDto> {
    protected readonly permissions: PermissionConfig;

    /**
     * @param prisma - Prisma service instance
     * @param modelName - Name of the Prisma model (lowercase, e.g., 'project', 'feedback')
     * @param permissions - Optional custom permissions, merged with defaults
     */
    constructor(
        protected readonly prisma: PrismaService,
        protected readonly modelName: string,
        permissions?: Partial<PermissionConfig>,
    ) {
        this.permissions = { ...DEFAULT_PERMISSIONS, ...permissions };
    }

    /**
     * Get the Prisma model delegate dynamically
     */
    protected get model() {
        return (this.prisma as any)[this.modelName];
    }

    /**
     * Check if the user's role has permission for the given action
     * @throws ForbiddenException if not authorized
     */
    protected checkPermission(
        context: TenantContext,
        action: keyof PermissionConfig,
    ): void {
        const allowedRoles = this.permissions[action];

        if (!allowedRoles || !allowedRoles.includes(context.role)) {
            throw new ForbiddenException(
                `Role ${context.role} is not authorized to ${action} ${this.modelName}`,
            );
        }
    }

    /**
     * Build the base where clause with tenant isolation
     */
    protected buildTenantWhere(context: TenantContext): { accountId: string } {
        return { accountId: context.tenantId };
    }

    /**
     * Find all records belonging to the tenant with pagination
     */
    async findAll(
        context: TenantContext,
        options: PaginationOptions = {},
    ): Promise<PaginatedResponse<T>> {
        this.checkPermission(context, 'findAll');

        const { skip = 0, take = 20, orderBy = { createdAt: 'desc' } } = options;

        const where = this.buildTenantWhere(context);

        const [data, total] = await Promise.all([
            this.model.findMany({
                where,
                skip,
                take,
                orderBy,
            }),
            this.model.count({ where }),
        ]);

        return {
            data,
            meta: {
                total,
                skip,
                take,
                hasMore: skip + take < total,
            },
        };
    }

    /**
     * Find a single record by ID, ensuring tenant ownership
     * @throws NotFoundException if not found or belongs to different tenant
     */
    async findOne(context: TenantContext, id: string): Promise<T> {
        this.checkPermission(context, 'findOne');

        const record = await this.model.findFirst({
            where: {
                id,
                ...this.buildTenantWhere(context),
            },
        });

        if (!record) {
            throw new NotFoundException(
                `${this.modelName} with ID ${id} not found`,
            );
        }

        return record;
    }

    /**
     * Create a new record with tenant ID automatically injected
     */
    async create(context: TenantContext, data: CreateDto): Promise<T> {
        this.checkPermission(context, 'create');

        return this.model.create({
            data: {
                ...data,
                accountId: context.tenantId,
                // Optionally track who created it
                // createdById: context.userId,
            },
        });
    }

    /**
     * Update a record by ID, ensuring tenant ownership
     * @throws NotFoundException if not found or belongs to different tenant
     */
    async update(
        context: TenantContext,
        id: string,
        data: UpdateDto,
    ): Promise<T> {
        this.checkPermission(context, 'update');

        // First verify ownership
        await this.findOne(context, id);

        return this.model.update({
            where: { id },
            data,
        });
    }

    /**
     * Delete a record by ID, ensuring tenant ownership
     * @throws NotFoundException if not found or belongs to different tenant
     */
    async delete(context: TenantContext, id: string): Promise<T> {
        this.checkPermission(context, 'delete');

        // First verify ownership
        await this.findOne(context, id);

        return this.model.delete({
            where: { id },
        });
    }

    /**
     * Soft delete a record (set deletedAt timestamp)
     * Requires the model to have a 'deletedAt' field
     */
    async softDelete(context: TenantContext, id: string): Promise<T> {
        this.checkPermission(context, 'delete');

        // First verify ownership
        await this.findOne(context, id);

        return this.model.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }
}
